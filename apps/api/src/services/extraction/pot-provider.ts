import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

const DEFAULT_PORT = 4416;
const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const DEFAULT_PING_TIMEOUT_MS = 500;

export interface PotProviderHealth {
  isAvailable(): boolean;
  baseUrl?: string;
}

export type PotProviderDiagnosticEvent =
  | 'pot_provider_launch_attempt'
  | 'pot_provider_process_started'
  | 'pot_provider_process_exit'
  | 'pot_provider_ping_ok'
  | 'pot_provider_ping_timeout'
  | 'pot_provider_restart_attempt';

export type PotProviderDiagnostic = {
  event: PotProviderDiagnosticEvent;
  category?: 'POT_NODE_UNAVAILABLE' | 'POT_SPAWN_FAILED' | 'POT_PROCESS_EXITED' | 'POT_PORT_CONFLICT' | 'POT_PING_TIMEOUT' | 'POT_PROVIDER_READY';
  elapsedMs?: number;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
};

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
  onDiagnostic?: (diagnostic: PotProviderDiagnostic) => void;
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
  private readonly onDiagnostic: (diagnostic: PotProviderDiagnostic) => void;
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
    this.onDiagnostic = options.onDiagnostic ?? (() => undefined);
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

    const startedAt = Date.now();
    this.emit({ event: 'pot_provider_launch_attempt' });
    let child: ChildProcess;
    let processFailed = false;
    try {
      const spawnOptions: SpawnOptions = {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      };
      child = this.spawnImpl(this.nodeExecutable, [this.entrypoint, '--host', this.host, '--port', String(this.port)], spawnOptions);
    } catch (error) {
      this.emit({ event: 'pot_provider_process_exit', category: this.categoryForError(error) });
      throw new Error('PO token provider could not be started');
    }
    this.child = child;
    this.emit({ event: 'pot_provider_process_started' });
    child.once('exit', () => {
      this.available = false;
      this.child = undefined;
      this.emit({
        event: 'pot_provider_process_exit',
        category: 'POT_PROCESS_EXITED',
        elapsedMs: Date.now() - startedAt,
        exitCode: child.exitCode,
        signal: child.signalCode,
      });
    });
    child.once('error', (error) => {
      this.available = false;
      this.child = undefined;
      processFailed = true;
      this.emit({ event: 'pot_provider_process_exit', category: this.categoryForError(error), elapsedMs: Date.now() - startedAt });
    });

    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      if (processFailed || child.exitCode !== null || child.signalCode !== null) break;
      if (await this.ping()) {
        this.available = true;
        this.emit({ event: 'pot_provider_ping_ok', category: 'POT_PROVIDER_READY', elapsedMs: Date.now() - startedAt });
        return;
      }
      await sleep(100);
    }

    const timedOut = !processFailed && child.exitCode === null && child.signalCode === null;
    if (timedOut) {
      this.emit({ event: 'pot_provider_ping_timeout', category: 'POT_PING_TIMEOUT', elapsedMs: Date.now() - startedAt });
    }
    await this.stop();
    throw new Error('PO token provider did not become ready');
  }

  private emit(diagnostic: PotProviderDiagnostic): void {
    try {
      this.onDiagnostic(diagnostic);
    } catch {
      // Diagnostics must never affect provider availability or API startup.
    }
  }

  private categoryForError(error: unknown): PotProviderDiagnostic['category'] {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'ENOENT') return 'POT_NODE_UNAVAILABLE';
    if (code === 'EADDRINUSE') return 'POT_PORT_CONFLICT';
    return 'POT_SPAWN_FAILED';
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
