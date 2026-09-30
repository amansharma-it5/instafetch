import { spawn, type SpawnOptions } from 'node:child_process';
import { isFfmpegAvailable, isFfprobeAvailable, resolveFfmpegExecutable, resolveFfprobeExecutable } from './yt-dlp-process.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 128 * 1024;

export type MediaProcessFailureKind = 'unavailable' | 'timeout' | 'failed' | 'malformed';

export class MediaProcessError extends Error {
  constructor(
    public readonly kind: MediaProcessFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'MediaProcessError';
  }
}

export interface MediaProcessOptions {
  executable?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  spawnImpl?: typeof spawn;
}

export interface ProbedMediaStreams {
  hasVideo: boolean;
  hasAudio: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redactProcessDetails(value: string): string {
  return value.replace(/https?:\/\/[^\s)]+/gi, '[redacted-url]').slice(0, 1_000);
}

function runProcess(command: string, args: string[], options: MediaProcessOptions): Promise<{ stdout: string; stderr: string }> {
  const executable = options.executable ?? command;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const spawnImpl = options.spawnImpl ?? spawn;

  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawnImpl>;
    try {
      const spawnOptions: SpawnOptions = {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      };
      child = spawnImpl(executable, args, spawnOptions);
    } catch (error) {
      reject(new MediaProcessError('unavailable', `media process could not be started: ${redactProcessDetails(errorMessage(error))}`));
      return;
    }

    if (!child.stdout || !child.stderr) {
      reject(new MediaProcessError('unavailable', 'media process did not expose bounded output streams'));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let outputExceeded = false;

    const terminate = () => {
      if (!child.killed) child.kill();
    };
    const finish = (error?: MediaProcessError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve({ stdout, stderr });
    };
    const append = (target: 'stdout' | 'stderr', chunk: string | Buffer) => {
      if (settled || outputExceeded) return;
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const nextSize = Buffer.byteLength(stdout, 'utf8')
        + Buffer.byteLength(stderr, 'utf8')
        + Buffer.byteLength(text, 'utf8');
      if (nextSize > maxOutputBytes) {
        outputExceeded = true;
        terminate();
        finish(new MediaProcessError('failed', `media process output exceeded ${maxOutputBytes} bytes`));
        return;
      }
      if (target === 'stdout') stdout += text;
      else stderr += text;
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string | Buffer) => append('stdout', chunk));
    child.stderr.on('data', (chunk: string | Buffer) => append('stderr', chunk));
    child.once('error', (error) => finish(new MediaProcessError('unavailable', `media process could not be started: ${redactProcessDetails(errorMessage(error))}`)));
    child.once('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        const detail = redactProcessDetails(stderr.trim());
        finish(new MediaProcessError('failed', `media process exited with code ${code ?? 'unknown'}${detail ? `: ${detail}` : ''}`));
        return;
      }
      finish();
    });
    const timer = setTimeout(() => {
      terminate();
      finish(new MediaProcessError('timeout', `media process timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

export function buildFfmpegRemuxArgs(videoPath: string, audioPath: string, outputPath: string): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-shortest',
    '-c', 'copy',
    '-movflags', '+faststart',
    '-f', 'mp4',
    outputPath,
  ];
}

export function buildFfmpegTranscodeArgs(videoPath: string, audioPath: string, outputPath: string): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-shortest',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-f', 'mp4',
    outputPath,
  ];
}

export function buildFfmpegAudioTranscodeArgs(audioPath: string, outputPath: string, bitrateKbps = 128): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', audioPath,
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', `${Math.max(32, Math.min(320, Math.round(bitrateKbps)))}k`,
    '-f', 'mp3',
    outputPath,
  ];
}

export async function runFfmpeg(args: string[], options: MediaProcessOptions = {}): Promise<void> {
  const executable = options.executable ?? resolveFfmpegExecutable();
  if (!isFfmpegAvailable(executable)) {
    throw new MediaProcessError('unavailable', 'ffmpeg is unavailable');
  }
  await runProcess(executable, args, options);
}

export async function runFfprobe(mediaPath: string, options: MediaProcessOptions = {}): Promise<ProbedMediaStreams> {
  const executable = options.executable ?? resolveFfprobeExecutable();
  if (!isFfprobeAvailable(executable)) {
    throw new MediaProcessError('unavailable', 'ffprobe is unavailable');
  }
  const result = await runProcess(executable, [
    '-v', 'error',
    '-show_entries', 'stream=codec_type',
    '-of', 'json',
    mediaPath,
  ], options);
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new MediaProcessError('malformed', 'ffprobe returned invalid stream metadata');
  }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { streams?: unknown }).streams)) {
    throw new MediaProcessError('malformed', 'ffprobe returned malformed stream metadata');
  }
  const streams = (parsed as { streams: Array<{ codec_type?: unknown }> }).streams;
  return {
    hasVideo: streams.some((stream) => stream.codec_type === 'video'),
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
  };
}

export {
  isFfmpegAvailable,
  isFfprobeAvailable,
  resolveFfmpegExecutable,
  resolveFfprobeExecutable,
};
