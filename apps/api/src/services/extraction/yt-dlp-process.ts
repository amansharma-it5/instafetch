import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, readdirSync, type Dirent } from 'node:fs';
import { delimiter, join } from 'node:path';

const DEFAULT_TIMEOUT_MS = 30_000;
// Some public Shorts expose a larger format inventory than ordinary videos;
// keep the metadata pipe bounded without rejecting valid inventories.
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export type YtDlpProcessFailureKind = 'unavailable' | 'timeout' | 'failed' | 'malformed';

export type YtDlpFailureCode =
  | 'PROVIDER_CHALLENGE'
  | 'TOKEN_PROVIDER_UNAVAILABLE'
  | 'LOGIN_REQUIRED'
  | 'PRIVATE_MEDIA'
  | 'AGE_RESTRICTED'
  | 'DRM_UNSUPPORTED'
  | 'MEDIA_TOO_LONG'
  | 'FILE_TOO_LARGE'
  | 'EXTRACTION_TIMEOUT'
  | 'EXTRACTION_FAILED';

export function classifyYtDlpFailure(value: string): YtDlpFailureCode {
  const detail = value.toLowerCase();
  if (/bgutil|po token|pot provider|botguard|webpo|\/get_pot|\/ping/.test(detail)) {
    if (/provider|bgutil|po token|pot provider|\/get_pot|\/ping|server is not available|could not be generated/.test(detail)) {
      return 'TOKEN_PROVIDER_UNAVAILABLE';
    }
    return 'PROVIDER_CHALLENGE';
  }
  if (/age.?restrict|confirm your age|age.?gate/.test(detail)) return 'AGE_RESTRICTED';
  if (/drm|encrypted|protected content/.test(detail)) return 'DRM_UNSUPPORTED';
  if (/private|members.?only|video unavailable|content unavailable|not available/.test(detail)) return 'PRIVATE_MEDIA';
  if (/sign in|login|authentication|cookies?/.test(detail)) return 'LOGIN_REQUIRED';
  if (/longer than|duration|file too large|exceeds.*size|too large/.test(detail)) return 'MEDIA_TOO_LONG';
  if (/not a bot|confirm .*bot|bot detected|challenge_required|temporarily blocked|http error 403|forbidden/.test(detail)) return 'PROVIDER_CHALLENGE';
  return 'EXTRACTION_FAILED';
}

export class YtDlpProcessError extends Error {
  constructor(
    public readonly kind: YtDlpProcessFailureKind,
    message: string,
    public readonly code: YtDlpFailureCode = kind === 'timeout'
      ? 'EXTRACTION_TIMEOUT'
      : kind === 'failed'
        ? classifyYtDlpFailure(message)
        : 'EXTRACTION_FAILED',
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
  /** Fixed anonymous YouTube clients; never user-controlled. */
  youtubePlayerClient?: 'mweb' | 'android_vr';
  /** Loopback-only PO token provider base URL for the mweb attempt. */
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

function redactSecrets(value: string): string {
  return redactUrls(value)
    .replace(/((?:po[_-]?token|visitor[_-]?data|signature|sparams|token|key)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/([?&](?:pot|po_token|visitor_data|signature|sparams|token|key)=)[^&\s]+/gi, '$1[redacted]');
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
  const port = Number.parseInt(parsed.port || '80', 10);
  if (parsed.protocol !== 'http:'
    || parsed.hostname !== '127.0.0.1'
    || !Number.isInteger(port)
    || port < 1
    || port > 65_535
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
    '--js-runtimes', 'node',
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
    } catch {
      rejectOutput(new YtDlpProcessError('unavailable', 'yt-dlp could not be started'));
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
    child.once('error', (_error) => {
      finish(new YtDlpProcessError('unavailable', 'yt-dlp could not be started'));
    });
    child.once('close', (code) => {
      if (settled) {
        return;
      }
      if (code !== 0) {
        const failureCode = classifyYtDlpFailure(redactSecrets(stderr));
        finish(new YtDlpProcessError('failed', `yt-dlp exited with code ${code ?? 'unknown'}`, failureCode));
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
