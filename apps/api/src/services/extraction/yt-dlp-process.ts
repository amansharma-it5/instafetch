import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, readdirSync, type Dirent } from 'node:fs';
import { delimiter, join } from 'node:path';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 512 * 1024;

export type YtDlpProcessFailureKind = 'unavailable' | 'timeout' | 'failed' | 'malformed';

export class YtDlpProcessError extends Error {
  constructor(
    public readonly kind: YtDlpProcessFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'YtDlpProcessError';
  }
}

export interface YtDlpProcessOptions {
  executable?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  spawnImpl?: typeof spawn;
  /** Fixed anonymous YouTube client strategy; never user-controlled. */
  youtubePlayerClient?: 'mweb' | 'android_vr';
  /** Fixed loopback-only BgUtils provider endpoint; never user-controlled. */
  youtubePotProviderUrl?: string;
}

export interface YtDlpMetadata {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function redactUrls(value: string): string {
  return value.replace(/https?:\/\/[^\s)]+/gi, '[redacted-url]');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findOnPath(fileName: string): string | undefined {
  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const candidates = process.platform === 'win32' && !fileName.toLowerCase().endsWith('.exe')
    ? [fileName, `${fileName}.exe`]
    : [fileName];

  for (const pathEntry of pathEntries) {
    for (const candidate of candidates) {
      const fullPath = join(pathEntry, candidate);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return undefined;
}

function findWinGetExecutable(fileName: string): string | undefined {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return undefined;
  }

  const root = join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  if (!existsSync(root)) {
    return undefined;
  }

  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
        return fullPath;
      }
      if (entry.isDirectory()) {
        pending.push(fullPath);
      }
    }
  }
  return undefined;
}

function resolveToolExecutable(fileName: string, environmentName: string): string {
  return process.env[environmentName]?.trim()
    || findOnPath(fileName)
    || findWinGetExecutable(`${fileName}.exe`)
    || fileName;
}

function isToolAvailable(fileName: string, configuredPath?: string): boolean {
  const configured = configuredPath?.trim();
  if (configured) {
    return existsSync(configured) || Boolean(findOnPath(configured));
  }
  return Boolean(findOnPath(fileName) || findWinGetExecutable(`${fileName}.exe`));
}

export function resolveYtDlpExecutable(): string {
  return resolveToolExecutable('yt-dlp', 'YTDLP_PATH');
}

export function resolveFfmpegExecutable(): string {
  return resolveToolExecutable('ffmpeg', 'FFMPEG_PATH');
}

export function resolveFfprobeExecutable(): string {
  return resolveToolExecutable('ffprobe', 'FFPROBE_PATH');
}

export function isYtDlpAvailable(configuredPath = process.env.YTDLP_PATH?.trim()): boolean {
  return isToolAvailable('yt-dlp', configuredPath);
}

export function isFfmpegAvailable(configuredPath = process.env.FFMPEG_PATH?.trim()): boolean {
  return isToolAvailable('ffmpeg', configuredPath);
}

export function isFfprobeAvailable(configuredPath = process.env.FFPROBE_PATH?.trim()): boolean {
  return isToolAvailable('ffprobe', configuredPath);
}

function assertLoopbackPotProviderUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('YouTube PO token provider URL is invalid');
  }
  if (parsed.protocol !== 'http:'
    || parsed.hostname !== '127.0.0.1'
    || parsed.port !== '4416'
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash) {
    throw new Error('YouTube PO token provider URL must use the fixed loopback endpoint');
  }
  return parsed.origin;
}

export function buildYtDlpArgs(canonicalUrl: string, options: Pick<YtDlpProcessOptions, 'youtubePlayerClient' | 'youtubePotProviderUrl'> = {}): string[] {
  const args = [
    '--ignore-config',
    '--dump-single-json',
    '--skip-download',
    '--no-warnings',
    '--no-cache-dir',
    '--no-call-home',
  ];
  if (options.youtubePlayerClient) {
    args.push('--extractor-args', `youtube:player_client=${options.youtubePlayerClient}`);
  }
  if (options.youtubePotProviderUrl) {
    args.push('--extractor-args', `youtubepot-bgutilhttp:base_url=${assertLoopbackPotProviderUrl(options.youtubePotProviderUrl)}`);
  }
  args.push('--', canonicalUrl);
  return args;
}

function spawnYtDlp(canonicalUrl: string, options: YtDlpProcessOptions): Promise<string> {
  const executable = options.executable ?? resolveYtDlpExecutable();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const spawnImpl = options.spawnImpl ?? spawn;

  return new Promise((resolveOutput, rejectOutput) => {
    let child: ReturnType<typeof spawnImpl>;
    try {
      const spawnOptions: SpawnOptions = {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      };
      child = spawnImpl(executable, buildYtDlpArgs(canonicalUrl, options), spawnOptions);
    } catch (error) {
      rejectOutput(new YtDlpProcessError('unavailable', `yt-dlp could not be started: ${redactUrls(errorMessage(error))}`));
      return;
    }

    if (!child.stdout || !child.stderr) {
      rejectOutput(new YtDlpProcessError('unavailable', 'yt-dlp did not expose bounded output streams'));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let outputExceeded = false;
    const timerState: { handle?: NodeJS.Timeout } = {};

    const terminate = () => {
      if (!child.killed) {
        child.kill();
      }
    };

    const finish = (error?: Error, output?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timerState.handle) {
        clearTimeout(timerState.handle);
      }
      if (error) {
        rejectOutput(error);
      } else {
        resolveOutput(output ?? '');
      }
    };

    const append = (target: 'stdout' | 'stderr', chunk: string | Buffer) => {
      if (settled || outputExceeded) {
        return;
      }
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const nextSize = Buffer.byteLength(stdout, 'utf8')
        + Buffer.byteLength(stderr, 'utf8')
        + Buffer.byteLength(text, 'utf8');
      if (nextSize > maxOutputBytes) {
        outputExceeded = true;
        terminate();
        finish(new YtDlpProcessError('failed', `yt-dlp output exceeded ${maxOutputBytes} bytes`));
        return;
      }
      if (target === 'stdout') {
        stdout += text;
      } else {
        stderr += text;
      }
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string | Buffer) => append('stdout', chunk));
    child.stderr.on('data', (chunk: string | Buffer) => append('stderr', chunk));
    child.once('error', (error) => {
      finish(new YtDlpProcessError('unavailable', `yt-dlp could not be started: ${redactUrls(errorMessage(error))}`));
    });
    child.once('close', (code) => {
      if (settled) {
        return;
      }
      if (code !== 0) {
        const detail = redactUrls(stderr.trim()).slice(0, 1000);
        finish(new YtDlpProcessError('failed', `yt-dlp exited with code ${code ?? 'unknown'}${detail ? `: ${detail}` : ''}`));
        return;
      }
      finish(undefined, stdout);
    });

    timerState.handle = setTimeout(() => {
      terminate();
      finish(new YtDlpProcessError('timeout', `yt-dlp timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

export function parseYtDlpJson(stdout: string): YtDlpMetadata {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new YtDlpProcessError('malformed', 'yt-dlp returned empty metadata');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new YtDlpProcessError('malformed', 'yt-dlp returned invalid JSON metadata');
  }

  if (!isRecord(parsed)) {
    throw new YtDlpProcessError('malformed', 'yt-dlp metadata JSON was not an object');
  }
  return parsed;
}

export async function runYtDlpMetadata(canonicalUrl: string, options: YtDlpProcessOptions = {}): Promise<YtDlpMetadata> {
  return parseYtDlpJson(await spawnYtDlp(canonicalUrl, options));
}
