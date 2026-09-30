import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';

export const BGUTIL_PROVIDER_URL = 'http://127.0.0.1:4416';
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 250;

export interface BgutilProviderOptions {
  serverPath?: string;
  executable?: string;
  providerUrl?: string;
  startupTimeoutMs?: number;
  pollIntervalMs?: number;
  spawnImpl?: typeof spawn;
  fetchImpl?: typeof fetch;
}

function isFixedLoopbackUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:'
      && parsed.hostname === '127.0.0.1'
      && parsed.port === '4416'
      && parsed.pathname === '/'
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}

export function resolveBgutilProviderPath(): string | undefined {
  const configured = process.env.BGUTIL_SERVER_PATH?.trim();
  if (configured) return configured;
  const bundled = '/opt/bgutil/server/build/main.js';
  return existsSync(bundled) ? bundled : undefined;
}

export class BgutilProviderSupervisor {
  private child: ChildProcess | undefined;
  private ready = false;
  private readonly serverPath?: string;
  private readonly executable: string;
  private readonly providerUrl: string;
  private readonly startupTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly spawnImpl: typeof spawn;
  private readonly fetchImpl: typeof fetch;

  constructor(options: BgutilProviderOptions = {}) {
    this.serverPath = options.serverPath ?? resolveBgutilProviderPath();
    this.executable = options.executable ?? process.execPath;
    this.providerUrl = options.providerUrl ?? BGUTIL_PROVIDER_URL;
    this.startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.spawnImpl = options.spawnImpl ?? spawn;
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (!isFixedLoopbackUrl(this.providerUrl)) {
      throw new Error('BGUTIL provider must use the fixed loopback endpoint');
    }
  }

  url(): string { return this.providerUrl; }

  isReady(): boolean { return this.ready; }

  async start(): Promise<boolean> {
    if (!this.serverPath || !existsSync(this.serverPath)) return false;
    const spawnOptions: SpawnOptions = {
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
    };
    try {
      this.child = this.spawnImpl(this.executable, [this.serverPath, '--host', '127.0.0.1', '--port', '4416'], spawnOptions);
    } catch {
      this.ready = false;
      return false;
    }
    this.child.once('exit', () => { this.ready = false; });
    const startedAt = Date.now();
    while (Date.now() - startedAt < this.startupTimeoutMs) {
      if (await this.check()) return true;
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    await this.stop();
    return false;
  }

  async check(): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(1_000, this.pollIntervalMs * 4));
    try {
      const response = await this.fetchImpl(`${this.providerUrl}/ping`, { signal: controller.signal });
      this.ready = response.ok;
      return this.ready;
    } catch {
      this.ready = false;
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    this.ready = false;
    if (!child || child.killed) return;
    child.kill('SIGTERM');
  }
}
