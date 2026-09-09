import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildGalleryDlArgs,
  isGalleryDlAvailable,
  parseGalleryDlJson,
  runGalleryDlMetadata,
} from './gallery-dl-process';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

interface FakeStream extends EventEmitter {
  setEncoding: (encoding: string) => void;
}

interface FakeChild extends EventEmitter {
  stdout: FakeStream;
  stderr: FakeStream;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
}

function fakeChild(): FakeChild {
  const stdout = new EventEmitter() as FakeStream;
  stdout.setEncoding = vi.fn();
  const stderr = new EventEmitter() as FakeStream;
  stderr.setEncoding = vi.fn();
  const child = new EventEmitter() as FakeChild;
  child.stdout = stdout;
  child.stderr = stderr;
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
    return true;
  });
  return child;
}

describe('gallery-dl process wrapper', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds fixed metadata-only arguments without authentication options', () => {
    expect(buildGalleryDlArgs('https://www.instagram.com/p/PHOTO/')).toEqual([
      '--config-ignore',
      '--no-input',
      '--dump-json',
      '--simulate',
      '--no-download',
      '--no-colors',
      '--',
      'https://www.instagram.com/p/PHOTO/',
    ]);
  });

  it('reports an explicitly missing configured executable', () => {
    expect(isGalleryDlAvailable('C:\\does-not-exist\\gallery-dl.exe')).toBe(false);
  });

  it('uses spawn with shell disabled and parses JSON output', async () => {
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const resultPromise = runGalleryDlMetadata('https://www.instagram.com/p/PHOTO/', {
      executable: 'gallery-dl.exe',
      timeoutMs: 100,
    });

    expect(spawn).toHaveBeenCalledWith(
      'gallery-dl.exe',
      expect.arrayContaining(['--config-ignore', '--no-input', '--dump-json', '--no-download', '--']),
      expect.objectContaining({ shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }),
    );
    child.stdout.emit('data', JSON.stringify([1, { url: 'https://cdn.test/photo.jpg', extension: 'jpg' }]));
    child.emit('close', 0);
    await expect(resultPromise).resolves.toEqual([1, { url: 'https://cdn.test/photo.jpg', extension: 'jpg' }]);
  });

  it('bounds output and terminates timed-out processes', async () => {
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const resultPromise = runGalleryDlMetadata('https://www.instagram.com/p/PHOTO/', {
      maxOutputBytes: 8,
      timeoutMs: 10_000,
    });
    child.stdout.emit('data', '0123456789');
    await expect(resultPromise).rejects.toThrow('output exceeded 8 bytes');
    expect(child.kill).toHaveBeenCalled();
  });

  it('rejects malformed JSON output', () => {
    expect(() => parseGalleryDlJson('{invalid')).toThrow('invalid JSON');
  });
});
