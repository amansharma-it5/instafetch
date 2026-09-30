import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { BgutilProviderSupervisor } from './bgutil-provider';

describe('BgutilProviderSupervisor', () => {
  it('rejects non-loopback provider endpoints', () => {
    expect(() => new BgutilProviderSupervisor({ providerUrl: 'http://example.test:4416' })).toThrow('fixed loopback endpoint');
  });

  it('does not spawn a provider when the bundled server is absent', async () => {
    const spawnImpl = (() => { throw new Error('should not spawn'); }) as never;
    const supervisor = new BgutilProviderSupervisor({ serverPath: 'C:/missing/bgutil.js', spawnImpl });
    await expect(supervisor.start()).resolves.toBe(false);
    expect(supervisor.isReady()).toBe(false);
  });

  it('terminates a provider that does not become ready before the startup deadline', async () => {
    const child = new EventEmitter() as ChildProcess & { killed: boolean; kill: (signal?: NodeJS.Signals) => boolean };
    child.killed = false;
    child.kill = () => { child.killed = true; return true; };
    const spawnImpl = (() => child) as unknown as (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
    const supervisor = new BgutilProviderSupervisor({
      serverPath: process.execPath,
      spawnImpl: spawnImpl as never,
      fetchImpl: (async () => ({ ok: false })) as typeof fetch,
      startupTimeoutMs: 5,
      pollIntervalMs: 1,
    });

    await expect(supervisor.start()).resolves.toBe(false);
    expect(child.killed).toBe(true);
    expect(supervisor.isReady()).toBe(false);
  });
});
