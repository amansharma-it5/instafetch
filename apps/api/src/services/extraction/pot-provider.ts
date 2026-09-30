import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

const DEFAULT_PORT = 4416;
const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const DEFAULT_PING_TIMEOUT_MS = 500;

export interface PotProviderHealth {
  isAvailable(): boolean;
  baseUrl?: string;
}

export interface PotProviderSupervisorOptions {
  enabled?: boolean;
  nodeExecutable?: string;
  entrypoint?: string;
  host?: '127.0.0.1';
  port?: number;
  startupTimeoutMs?: number;
  pingTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof spawn;
}

function configuredPort(value: string | undefined): number {
  const port = Number.parseInt(value ?? '', 10);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : DEFAULT_PORT;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PotProviderSupervisor implements PotProviderHealth {
  private readonly enabled: boolean;
  private readonly nodeExecutable: string;
  private readonly entrypoint: string;
  private readonly host: '127.0.0.1';
  private readonly port: number;
  private readonly startupTimeoutMs: number;
  private readonly pingTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly spawnImpl: typeof spawn;
  private child?: ChildProcess;
  private available = false;

  constructor(options: PotProviderSupervisorOptions = {}) {
    this.enabled = options.enabled ?? process.env.NODE_ENV === 'production';
    this.nodeExecutable = options.nodeExecutable ?? (process.env.POT_PROVIDER_NODE_PATH?.trim() || process.execPath);
    this.entrypoint = options.entrypoint ?? (process.env.POT_PROVIDER_ENTRYPOINT?.trim() || '/opt/bgutil/server/build/main.js');
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port ?? configuredPort(process.env.POT_PROVIDER_PORT);
    this.startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    this.pingTimeoutMs = options.pingTimeoutMs ?? DEFAULT_PING_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.spawnImpl = options.spawnImpl ?? spawn;
    if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65_535) {
      throw new Error('POT_PROVIDER_PORT must be a valid TCP port');
    }
  }

  get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  isAvailable(): boolean {
    return !this.enabled || this.available;
  }

  async start(): Promise<void> {
    if (!this.enabled || this.available) return;
    if (this.child) throw new Error('PO token provider startup is already in progress');

    let child: ChildProcess;
    try {
      const spawnOptions: SpawnOptions = {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      };
      child = this.spawnImpl(this.nodeExecutable, [this.entrypoint, '--host', this.host, '--port', String(this.port)], spawnOptions);
    } catch {
      throw new Error('PO token provider could not be started');
    }
    this.child = child;
    child.once('exit', () => {
      this.available = false;
      this.child = undefined;
    });
    child.once('error', () => {
      this.available = false;
      this.child = undefined;
    });

    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      if (await this.ping()) {
        this.available = true;
        return;
      }
      await sleep(100);
    }

    await this.stop();
    throw new Error('PO token provider did not become ready');
  }

  async stop(): Promise<void> {
    this.available = false;
    const child = this.child;
    this.child = undefined;
    if (!child || child.killed || child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!child.killed && child.exitCode === null) child.kill('SIGKILL');
        resolve();
      }, 1_000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async ping(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.pingTimeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/ping`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return false;
      const body = await response.json() as { version?: unknown };
      return typeof body.version === 'string' && body.version.length > 0;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
