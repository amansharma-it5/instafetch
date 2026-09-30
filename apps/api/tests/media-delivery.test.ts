import request from 'supertest';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { InstagramExtractionProvider } from '../src/services/extraction/InstagramExtractionProvider';
import type { YouTubeExtractionProvider } from '../src/services/extraction/YouTubeExtractionProvider';
import { MediaMaterializationError, MediaMaterializer } from '../src/services/media/media-materializer';
import { ResolutionStore } from '../src/services/store/resolution-store';
import { DownloadTokenService } from '../src/services/tokens/download-tokens';

const secret = 'api-test-download-token-secret-which-is-long-enough';
const reelUrl = 'https://www.instagram.com/reel/ABC123/';
const photoUrl = 'https://www.instagram.com/p/PHOTO123/';
const metadata = {
  title: 'A public reel',
  uploader: 'creator',
  formats: [{ url: 'https://cdn.test/video.mp4', ext: 'mp4', width: 1080, height: 1920, vcodec: 'h264' }],
};
const videoBytes = Buffer.concat([Buffer.from('0000ftypisom'), Buffer.alloc(32, 3)]);
const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);

function provider(): InstagramExtractionProvider {
  return { isAvailable: () => true, resolve: async () => metadata };
}

function photoProvider(): InstagramExtractionProvider {
  return {
    isAvailable: () => true,
    resolve: async () => ({
      formats: [{ url: 'https://cdn.test/photo.jpg', ext: 'jpg', width: 1440, height: 1800, vcodec: 'none' }],
    }),
  };
}

function testApp(options: { previewRateLimit?: number; downloadRateLimit?: number } = {}) {
  const store = new ResolutionStore();
  const materializer = new MediaMaterializer({
    requestUpstream: async () => ({ statusCode: 200, headers: { 'content-type': 'video/mp4' }, body: Readable.from(videoBytes) }),
    allowedHosts: (host) => host === 'cdn.test',
  });
  const tokenService = new DownloadTokenService(secret);
  return { app: createApp({ provider: provider(), store, materializer, tokenService, ...options }), store, materializer, tokenService };
}

describe('media delivery endpoints', () => {
  it('returns opaque preview/download URLs and streams genuine materialized bytes', async () => {
    const services = testApp();
    const resolved = await request(services.app).post('/api/instagram/resolve').send({ url: reelUrl });
    const item = resolved.body.data.items[0] as { previewUrl: string; downloadUrl: string };
    expect(resolved.status).toBe(200);
    expect(item.previewUrl).toMatch(/^\/api\/preview\?token=/);
    expect(item.downloadUrl).toMatch(/^\/api\/download\?token=/);
    expect(JSON.stringify(resolved.body)).not.toContain('cdn.test');

    const download = await request(services.app).get(item.downloadUrl);
    expect(download.status).toBe(200);
    expect(download.headers['cache-control']).toBe('no-store');
    expect(download.headers['content-type']).toContain('video/mp4');
    expect(download.headers['content-disposition']).toContain('attachment; filename="instafetch-');
    expect(download.body.equals(videoBytes)).toBe(true);

    const preview = await request(services.app).get(item.previewUrl);
    expect(preview.status).toBe(200);
    expect(preview.headers['cache-control']).toBe('no-store');
    expect(preview.headers['content-type']).toContain('video/mp4');
    expect(preview.headers['content-disposition']).toContain('inline; filename="instafetch-');
    expect(JSON.stringify(preview.headers)).not.toContain('cdn.test');
    await services.materializer.dispose();
    services.store.dispose();
  });

  it('supports byte ranges and rejects invalid, expired, wrong-purpose, and unknown tokens', async () => {
    const services = testApp();
    const resolved = await request(services.app).post('/api/instagram/resolve').send({ url: reelUrl });
    const item = resolved.body.data.items[0] as { downloadUrl: string; previewUrl: string };
    const partial = await request(services.app).get(item.downloadUrl).set('Range', 'bytes=0-7');
    expect(partial.status).toBe(206);
    expect(partial.headers['content-range']).toBe(`bytes 0-7/${videoBytes.length}`);
    expect(partial.body.equals(videoBytes.subarray(0, 8))).toBe(true);

    const wrongPurpose = await request(services.app).get(item.previewUrl.replace('/preview?', '/download?'));
    expect(wrongPurpose.status).toBe(401);
    expect(wrongPurpose.body.error.code).toBe('INVALID_TOKEN');

    const altered = await request(services.app).get(`${item.downloadUrl.slice(0, -2)}xx`);
    expect(altered.status).toBe(401);
    expect(altered.body.error.code).toBe('INVALID_TOKEN');

    const missing = services.tokenService.issue('missing-resolution', 'missing-media', 'download');
    const unknown = await request(services.app).get(`/api/download?token=${encodeURIComponent(missing)}`);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('MEDIA_NOT_FOUND');

    let now = 1_000;
    const expiring = new DownloadTokenService(secret, { now: () => now, ttlMs: 10 });
    const expiredToken = expiring.issue('missing-resolution', 'missing-media', 'download');
    now = 1_011;
    const expiredApp = createApp({ provider: provider(), tokenService: expiring });
    const expired = await request(expiredApp).get(`/api/download?token=${encodeURIComponent(expiredToken)}`);
    expect(expired.status).toBe(410);
    expect(expired.body.error.code).toBe('EXPIRED_TOKEN');

    await services.materializer.dispose();
    services.store.dispose();
  });

  it('applies independent preview and download rate limits', async () => {
    const services = testApp({ previewRateLimit: 1, downloadRateLimit: 1 });
    const resolved = await request(services.app).post('/api/instagram/resolve').send({ url: reelUrl });
    const item = resolved.body.data.items[0] as { downloadUrl: string; previewUrl: string };
    expect((await request(services.app).get(item.previewUrl)).status).toBe(200);
    expect((await request(services.app).get(item.previewUrl)).status).toBe(429);
    expect((await request(services.app).get(item.downloadUrl)).status).toBe(200);
    expect((await request(services.app).get(item.downloadUrl)).status).toBe(429);
    await services.materializer.dispose();
    services.store.dispose();
  });

  it('normalizes exhausted materialization capacity to SERVER_BUSY', async () => {
    const store = new ResolutionStore();
    const tokenService = new DownloadTokenService(secret);
    const busyMaterializer = {
      materialize: async () => { throw new MediaMaterializationError('SERVER_BUSY', 'internal capacity detail'); },
    } as unknown as MediaMaterializer;
    const app = createApp({ provider: provider(), store, tokenService, materializer: busyMaterializer });
    const resolved = await request(app).post('/api/instagram/resolve').send({ url: reelUrl });
    const download = await request(app).get(resolved.body.data.items[0].downloadUrl);
    expect(download.status).toBe(503);
    expect(download.body).toEqual({ success: false, error: { code: 'SERVER_BUSY', message: 'The media service is busy. Try again shortly.' } });
    expect(JSON.stringify(download.body)).not.toContain('internal capacity detail');
    store.dispose();
  });

  it('keeps upstream and filesystem details out of delivery errors', async () => {
    const store = new ResolutionStore();
    const materializer = new MediaMaterializer({
      requestUpstream: async () => ({ statusCode: 502, headers: {}, body: Readable.from([]) }),
      allowedHosts: (host) => host === 'cdn.test',
    });
    const tokenService = new DownloadTokenService(secret);
    const app = createApp({ provider: provider(), store, materializer, tokenService });
    const resolved = await request(app).post('/api/instagram/resolve').send({ url: reelUrl });
    const downloadUrl = resolved.body.data.items[0].downloadUrl as string;
    const failed = await request(app).get(downloadUrl);
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe('DOWNLOAD_FAILED');
    expect(JSON.stringify(failed.body)).not.toContain('cdn.test');
    expect(JSON.stringify(failed.body)).not.toContain('media-');
    await materializer.dispose();
    store.dispose();
  });

  it('streams a normalized gallery image through the existing preview/download pipeline', async () => {
    const store = new ResolutionStore();
    const materializer = new MediaMaterializer({
      requestUpstream: async () => ({ statusCode: 200, headers: { 'content-type': 'image/jpeg' }, body: Readable.from(imageBytes) }),
      allowedHosts: (host) => host === 'cdn.test',
    });
    const tokenService = new DownloadTokenService(secret);
    const app = createApp({ provider: photoProvider(), store, materializer, tokenService });
    const resolved = await request(app).post('/api/instagram/resolve').send({ url: photoUrl });
    const item = resolved.body.data.items[0] as { previewUrl: string; downloadUrl: string; type: string };

    expect(resolved.status).toBe(200);
    expect(item.type).toBe('photo');
    const preview = await request(app).get(item.previewUrl);
    const download = await request(app).get(item.downloadUrl);
    expect(preview.status).toBe(200);
    expect(download.status).toBe(200);
    expect(preview.body.equals(imageBytes)).toBe(true);
    expect(download.body.equals(imageBytes)).toBe(true);
    expect(preview.headers['content-type']).toContain('image/jpeg');
    expect(JSON.stringify(resolved.body)).not.toContain('cdn.test');
    await materializer.dispose();
    store.dispose();
  });

  it('re-resolves one expired YouTube option without invalidating the whole result', async () => {
    let providerCalls = 0;
    let upstreamCalls = 0;
    const youtubeProvider: YouTubeExtractionProvider = {
      isAvailable: () => true,
      resolve: async () => ({
        title: 'Retryable public video',
        duration: 12,
        formats: [{
          url: `https://cdn.test/video-${++providerCalls}.mp4`, ext: 'mp4', width: 640, height: 360,
          vcodec: 'avc1', acodec: 'mp4a.40.2', filesize: videoBytes.length,
        }],
      }),
    };
    const store = new ResolutionStore();
    const materializer = new MediaMaterializer({
      requestUpstream: async () => ({
        statusCode: ++upstreamCalls === 1 ? 403 : 200,
        headers: {},
        body: Readable.from(videoBytes),
      }),
      allowedHosts: (host) => host === 'cdn.test',
      probeMedia: async () => ({ hasVideo: true, hasAudio: true }),
    });
    const tokenService = new DownloadTokenService(secret);
    const app = createApp({ provider: provider(), youtubeProvider, store, materializer, tokenService });
    const resolved = await request(app).post('/api/youtube/resolve').send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    const option = resolved.body.data.downloadOptions[0] as { optionId: string };
    const prepared = await request(app).post('/api/youtube/prepare').send({ jobId: resolved.body.data.jobId, optionId: option.optionId });
    const download = await request(app).get(prepared.body.data.downloadUrl);
    expect(download.status).toBe(200);
    expect(download.body.equals(videoBytes)).toBe(true);
    expect(providerCalls).toBe(2);
    expect(upstreamCalls).toBe(2);
    await materializer.dispose();
    store.dispose();
  });
});
