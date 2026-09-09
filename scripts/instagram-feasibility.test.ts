import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildYtDlpArgs,
  parseYtDlpJson,
  runYtDlp,
  summarizeMetadata,
} from './instagram-feasibility';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

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

describe('Instagram feasibility harness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds fixed metadata-only arguments with the canonical URL last', () => {
    expect(buildYtDlpArgs('https://www.instagram.com/p/ABC123/')).toEqual([
      '--ignore-config',
      '--dump-single-json',
      '--skip-download',
      '--no-warnings',
      '--no-cache-dir',
      '--no-call-home',
      '--',
      'https://www.instagram.com/p/ABC123/',
    ]);
  });

  it('parses and summarizes genuine playlist-shaped metadata without exposing URLs', () => {
    const report = summarizeMetadata({
      extractor_key: 'Instagram',
      _type: 'playlist',
      title: 'Public album',
      uploader: 'public.creator',
      entries: [
        { formats: [{ ext: 'mp4', vcodec: 'h264' }], thumbnails: [{ url: 'https://cdn.test/signed-a' }] },
        { formats: [{ ext: 'jpg', vcodec: 'none' }], thumbnail: 'https://cdn.test/signed-b' },
      ],
    });

    expect(report).toEqual({
      extractor: 'Instagram',
      mediaType: 'carousel/playlist',
      title: 'Public album',
      uploader: 'public.creator',
      thumbnailPresent: true,
      entryCount: 2,
      videoCandidateCount: 1,
      imageCandidateCount: 3,
    });
  });

  it('uses spawn with shell disabled and parses mocked JSON output', async () => {
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const resultPromise = runYtDlp('https://www.instagram.com/reel/ABC123/', {
      executable: 'yt-dlp.exe',
      timeoutMs: 100,
    });

    expect(spawn).toHaveBeenCalledWith(
      'yt-dlp.exe',
      expect.arrayContaining(['--ignore-config', '--dump-single-json', '--skip-download', '--']),
      expect.objectContaining({ shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }),
    );
    child.stdout.emit('data', JSON.stringify({ extractor: 'Instagram', id: 'ABC123', formats: [{ ext: 'mp4', vcodec: 'h264' }] }));
    child.emit('close', 0);

    await expect(resultPromise).resolves.toMatchObject({ extractor: 'Instagram', id: 'ABC123' });
  });

  it('rejects invalid JSON and terminates a process that exceeds the output bound', async () => {
    expect(() => parseYtDlpJson('{invalid')).toThrow('invalid JSON');

    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const resultPromise = runYtDlp('https://www.instagram.com/p/ABC123/', {
      maxOutputBytes: 8,
      timeoutMs: 100,
    });
    child.stdout.emit('data', '0123456789');

    await expect(resultPromise).rejects.toThrow('output exceeded 8 bytes');
    expect(child.kill).toHaveBeenCalled();
  });
});
