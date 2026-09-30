import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { PotProviderSupervisor } from './pot-provider';

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess & { kill: (signal?: NodeJS.Signals) => boolean };
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
    queueMicrotask(() => {
      child.exitCode = 0;
      child.emit('exit', 0, null);
    });
    return true;
  });
  return child;
}

describe('PotProviderSupervisor', () => {
  it('starts a loopback provider with shell execution disabled and reports its health', async () => {
    const child = fakeChild();
    const spawnImpl = vi.fn(() => child);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ version: '2.0.0' }), { status: 200 }));
    const supervisor = new PotProviderSupervisor({
      enabled: true,
      nodeExecutable: '/usr/bin/node',
      entrypoint: '/opt/bgutil/server/build/main.js',
      port: 4417,
      spawnImpl: spawnImpl as never,
      fetchImpl,
      startupTimeoutMs: 100,
      pingTimeoutMs: 10,
    });

    await supervisor.start();

    expect(supervisor.isAvailable()).toBe(true);
    expect(supervisor.baseUrl).toBe('http://127.0.0.1:4417');
    expect(spawnImpl).toHaveBeenCalledWith(
      '/usr/bin/node',
      ['/opt/bgutil/server/build/main.js', '--host', '127.0.0.1', '--port', '4417'],
      expect.objectContaining({ shell: false, stdio: ['ignore', 'ignore', 'ignore'] }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:4417/ping',
      expect.objectContaining({ method: 'GET' }),
    );

    await supervisor.stop();
    expect(supervisor.isAvailable()).toBe(false);
  });

  it('fails startup when the provider never answers its bounded readiness ping', async () => {
    const child = fakeChild();
    const supervisor = new PotProviderSupervisor({
      enabled: true,
      port: 4418,
      spawnImpl: vi.fn(() => child) as never,
      fetchImpl: vi.fn(async () => new Response('{}', { status: 503 })),
      startupTimeoutMs: 25,
      pingTimeoutMs: 5,
    });

    await expect(supervisor.start()).rejects.toThrow('PO token provider did not become ready');
    expect(supervisor.isAvailable()).toBe(false);
    expect(child.kill).toHaveBeenCalled();
  });

  it('treats the provider as available without spawning it when disabled', async () => {
    const spawnImpl = vi.fn();
    const supervisor = new PotProviderSupervisor({ enabled: false, spawnImpl: spawnImpl as never });

    await supervisor.start();

    expect(supervisor.isAvailable()).toBe(true);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('emits only sanitized lifecycle diagnostics when the provider becomes ready', async () => {
    const child = fakeChild();
    const diagnostics: string[] = [];
    const supervisor = new PotProviderSupervisor({
      enabled: true,
      spawnImpl: vi.fn(() => child) as never,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ version: '2.0.0' }), { status: 200 })),
      onDiagnostic: (diagnostic) => diagnostics.push(JSON.stringify(diagnostic)),
      startupTimeoutMs: 100,
      pingTimeoutMs: 10,
    });

    await supervisor.start();

    expect(diagnostics.some((entry) => entry.includes('pot_provider_launch_attempt'))).toBe(true);
    expect(diagnostics.some((entry) => entry.includes('POT_PROVIDER_READY'))).toBe(true);
    expect(diagnostics.join('\n')).not.toMatch(/token|url|path|cookie|secret/i);
    await supervisor.stop();
  });

  it('classifies a bounded readiness timeout without exposing command details', async () => {
    const child = fakeChild();
    const diagnostics: Array<Record<string, unknown>> = [];
    const supervisor = new PotProviderSupervisor({
      enabled: true,
      spawnImpl: vi.fn(() => child) as never,
      fetchImpl: vi.fn(async () => new Response('{}', { status: 503 })),
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      startupTimeoutMs: 10,
      pingTimeoutMs: 5,
    });

    await expect(supervisor.start()).rejects.toThrow('PO token provider did not become ready');

    expect(diagnostics).toContainEqual(expect.objectContaining({
      event: 'pot_provider_ping_timeout',
      category: 'POT_PING_TIMEOUT',
    }));
  });
});
