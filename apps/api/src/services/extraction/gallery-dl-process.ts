import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, readdirSync, type Dirent } from 'node:fs';
import { delimiter, join } from 'node:path';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 512 * 1024;

export type GalleryDlProcessFailureKind = 'unavailable' | 'timeout' | 'failed' | 'malformed';

export class GalleryDlProcessError extends Error {
  constructor(public readonly kind: GalleryDlProcessFailureKind, message: string) {
    super(message);
    this.name = 'GalleryDlProcessError';
  }
}

export interface GalleryDlProcessOptions {
  executable?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  spawnImpl?: typeof spawn;
}

export function redactGalleryUrls(value: string): string {
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
      if (existsSync(fullPath)) return fullPath;
    }
  }
  return undefined;
}

function findWinGetExecutable(): string | undefined {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return undefined;
  const root = join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  if (!existsSync(root)) return undefined;
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
      if (entry.isFile() && entry.name.toLowerCase() === 'gallery-dl.exe') return fullPath;
      if (entry.isDirectory()) pending.push(fullPath);
    }
  }
  return undefined;
}

function resolveExecutable(configuredPath?: string): string {
  return configuredPath?.trim()
    || process.env.GALLERY_DL_PATH?.trim()
    || findOnPath('gallery-dl')
    || findWinGetExecutable()
    || 'gallery-dl';
}

function available(configuredPath?: string): boolean {
  const configured = configuredPath?.trim() || process.env.GALLERY_DL_PATH?.trim();
  if (configured) return existsSync(configured) || Boolean(findOnPath(configured));
  return Boolean(findOnPath('gallery-dl') || findWinGetExecutable());
}

export function resolveGalleryDlExecutable(configuredPath?: string): string {
  return resolveExecutable(configuredPath);
}

export function isGalleryDlAvailable(configuredPath?: string): boolean {
  return available(configuredPath);
}

export function buildGalleryDlArgs(canonicalUrl: string): string[] {
  return [
    '--config-ignore',
    '--no-input',
    '--dump-json',
    '--simulate',
    '--no-download',
    '--no-colors',
    '--',
    canonicalUrl,
  ];
}

function parseJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) throw new GalleryDlProcessError('malformed', 'gallery-dl returned empty metadata');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    try {
      return lines.map((line) => JSON.parse(line) as unknown);
    } catch {
      throw new GalleryDlProcessError('malformed', 'gallery-dl returned invalid JSON metadata');
    }
  }
}

function runGalleryDl(canonicalUrl: string, options: GalleryDlProcessOptions): Promise<string> {
  const executable = options.executable ?? resolveExecutable();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const spawnImpl = options.spawnImpl ?? spawn;

  return new Promise((resolveOutput, rejectOutput) => {
    let child: ReturnType<typeof spawnImpl>;
    try {
      const spawnOptions: SpawnOptions = { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] };
      child = spawnImpl(executable, buildGalleryDlArgs(canonicalUrl), spawnOptions);
    } catch (error) {
      rejectOutput(new GalleryDlProcessError('unavailable', `gallery-dl could not be started: ${redactGalleryUrls(errorMessage(error))}`));
      return;
    }

    if (!child.stdout || !child.stderr) {
      rejectOutput(new GalleryDlProcessError('unavailable', 'gallery-dl did not expose bounded output streams'));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let outputExceeded = false;
    const timerState: { handle?: NodeJS.Timeout } = {};
    const terminate = () => { if (!child.killed) child.kill(); };
    const finish = (error?: Error, output?: string) => {
      if (settled) return;
      settled = true;
      if (timerState.handle) clearTimeout(timerState.handle);
      if (error) rejectOutput(error); else resolveOutput(output ?? '');
    };
    const append = (target: 'stdout' | 'stderr', chunk: string | Buffer) => {
      if (settled || outputExceeded) return;
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const nextSize = Buffer.byteLength(stdout, 'utf8') + Buffer.byteLength(stderr, 'utf8') + Buffer.byteLength(text, 'utf8');
      if (nextSize > maxOutputBytes) {
        outputExceeded = true;
        terminate();
        finish(new GalleryDlProcessError('failed', `gallery-dl output exceeded ${maxOutputBytes} bytes`));
        return;
      }
      if (target === 'stdout') stdout += text; else stderr += text;
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string | Buffer) => append('stdout', chunk));
    child.stderr.on('data', (chunk: string | Buffer) => append('stderr', chunk));
    child.once('error', (error) => finish(new GalleryDlProcessError('unavailable', `gallery-dl could not be started: ${redactGalleryUrls(errorMessage(error))}`)));
    child.once('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        const detail = redactGalleryUrls(stderr.trim()).slice(0, 1000);
        finish(new GalleryDlProcessError('failed', `gallery-dl exited with code ${code ?? 'unknown'}${detail ? `: ${detail}` : ''}`));
        return;
      }
      finish(undefined, stdout);
    });
    timerState.handle = setTimeout(() => {
      terminate();
      finish(new GalleryDlProcessError('timeout', `gallery-dl timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

export function parseGalleryDlJson(stdout: string): unknown {
  return parseJsonOutput(stdout);
}

export async function runGalleryDlMetadata(canonicalUrl: string, options: GalleryDlProcessOptions = {}): Promise<unknown> {
  return parseGalleryDlJson(await runGalleryDl(canonicalUrl, options));
}
