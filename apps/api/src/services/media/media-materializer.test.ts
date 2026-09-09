import { Readable } from 'node:stream';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { MediaMaterializationError, MediaMaterializer, type RequestUpstream } from './media-materializer';

const roots: string[] = [];
const videoBytes = Buffer.concat([Buffer.from('0000ftypisom'), Buffer.alloc(32, 1)]);
const imageBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);

function root(): string {
  const value = join(tmpdir(), `instafetch-materializer-${randomUUID()}`);
  roots.push(value);
  return value;
}

function item(providerUrl: string, type: 'video' | 'photo' = 'video') {
  return {
    id: `media-${randomUUID()}`,
    type,
    width: 1080,
    height: 1920,
    extension: type === 'video' ? 'mp4' : 'jpg',
    qualityLabel: '1080x1920',
    filesize: null,
    providerUrl,
    thumbnailUrl: null,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('MediaMaterializer', () => {
  it('materializes genuine media, verifies its signature, and coalesces concurrent requests', async () => {
    let calls = 0;
    const requestUpstream: RequestUpstream = async () => {
      calls += 1;
      return { statusCode: 200, headers: { 'content-type': 'video/mp4' }, body: Readable.from(videoBytes) };
    };
    const materializer = new MediaMaterializer({ rootDir: root(), requestUpstream, allowedHosts: (host) => host === 'cdn.test' });
    const media = item('https://cdn.test/video.mp4');
    const [first, second] = await Promise.all([
      materializer.materialize('resolution-1', media, Date.now() + 60_000),
      materializer.materialize('resolution-1', media, Date.now() + 60_000),
    ]);
    expect(first.path).toBe(second.path);
    expect(first.contentType).toBe('video/mp4');
    expect(first.filename).toMatch(/^instafetch-media-/);
    expect(calls).toBe(1);
    await materializer.dispose();
  });

  it('rejects private or non-HTTPS redirects before fetching them', async () => {
    const requestUpstream: RequestUpstream = async () => ({
      statusCode: 302,
      headers: { location: 'https://127.0.0.1/private' },
      body: Readable.from([]),
    });
    const materializer = new MediaMaterializer({ rootDir: root(), requestUpstream, allowedHosts: () => true });
    await expect(materializer.materialize('resolution-1', item('https://cdn.test/redirect'), Date.now() + 60_000))
      .rejects.toThrowError(MediaMaterializationError);
    await expect(materializer.materialize('resolution-1', item('https://cdn.test/redirect'), Date.now() + 60_000))
      .rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
    await materializer.dispose();

    const insecureRedirect = new MediaMaterializer({
      rootDir: root(),
      requestUpstream: async () => ({ statusCode: 302, headers: { location: 'http://cdn.test/insecure' }, body: Readable.from([]) }),
      allowedHosts: () => true,
    });
    await expect(insecureRedirect.materialize('resolution-1', item('https://cdn.test/redirect'), Date.now() + 60_000))
      .rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
    await insecureRedirect.dispose();
  });

  it('rejects HTML and oversized upstream responses', async () => {
    const html = new MediaMaterializer({
      rootDir: root(),
      requestUpstream: async () => ({ statusCode: 200, headers: { 'content-type': 'text/html' }, body: Readable.from('<html>challenge</html>') }),
      allowedHosts: () => true,
    });
    await expect(html.materialize('resolution-1', item('https://cdn.test/login'), Date.now() + 60_000))
      .rejects.toMatchObject({ code: 'UPSTREAM_INVALID_CONTENT' });
    await html.dispose();

    const oversized = new MediaMaterializer({
      rootDir: root(),
      maxFileBytes: 8,
      requestUpstream: async () => ({ statusCode: 200, headers: {}, body: Readable.from(videoBytes) }),
      allowedHosts: () => true,
    });
    await expect(oversized.materialize('resolution-1', item('https://cdn.test/large'), Date.now() + 60_000))
      .rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' });
    await oversized.dispose();
  });

  it('supports image signatures and expires cached files', async () => {
    let now = 1_000;
    const materializer = new MediaMaterializer({
      rootDir: root(),
      now: () => now,
      requestUpstream: async () => ({ statusCode: 200, headers: {}, body: Readable.from(imageBytes) }),
      allowedHosts: () => true,
      ttlMs: 100,
    });
    const media = await materializer.materialize('resolution-1', item('https://cdn.test/photo.jpg', 'photo'), 1_100);
    expect(media.contentType).toBe('image/jpeg');
    expect(materializer.cachedCount()).toBe(1);
    now = 1_101;
    await materializer.cleanupExpired();
    expect(materializer.cachedCount()).toBe(0);
    await materializer.dispose();
  });

  it('enforces aggregate cache and per-resolution file limits', async () => {
    const totalLimited = new MediaMaterializer({
      rootDir: root(),
      maxTotalBytes: videoBytes.length,
      requestUpstream: async () => ({ statusCode: 200, headers: {}, body: Readable.from(videoBytes) }),
      allowedHosts: () => true,
    });
    await totalLimited.materialize('resolution-1', item('https://cdn.test/one'), Date.now() + 60_000);
    await expect(totalLimited.materialize('resolution-1', item('https://cdn.test/two'), Date.now() + 60_000))
      .rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' });
    await totalLimited.dispose();

    const filesLimited = new MediaMaterializer({
      rootDir: root(),
      maxFilesPerResolution: 1,
      requestUpstream: async () => ({ statusCode: 200, headers: {}, body: Readable.from(videoBytes) }),
      allowedHosts: () => true,
    });
    await filesLimited.materialize('resolution-1', item('https://cdn.test/one'), Date.now() + 60_000);
    await expect(filesLimited.materialize('resolution-1', item('https://cdn.test/two'), Date.now() + 60_000))
      .rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' });
    await filesLimited.dispose();
  });
});
