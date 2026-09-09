import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import type { InstagramExtractionProvider } from '../src/services/extraction/InstagramExtractionProvider';
import { YtDlpProcessError } from '../src/services/extraction/yt-dlp-process';
import { GalleryDlProcessError } from '../src/services/extraction/gallery-dl-process';
import { InstagramProviderChain } from '../src/services/extraction/provider-chain';
import { ResolutionStore } from '../src/services/store/resolution-store';

const reelUrl = 'https://www.instagram.com/reel/ABC123/';
const reelMetadata = {
  extractor_key: 'Instagram',
  title: 'A public reel',
  uploader: 'public.creator',
  thumbnail: 'https://cdn.test/thumbnail-signed.jpg',
  formats: [
    { url: 'https://cdn.test/video-360.mp4', ext: 'mp4', width: 360, height: 640, vcodec: 'h264' },
    { url: 'https://cdn.test/video-1080.mp4', ext: 'mp4', width: 1080, height: 1920, vcodec: 'h264', filesize: 4_000 },
    { url: 'https://cdn.test/audio.m4a', ext: 'm4a', vcodec: 'none' },
  ],
};

function providerFor(resolve: InstagramExtractionProvider['resolve'], available = true): InstagramExtractionProvider {
  return {
    isAvailable: () => available,
    resolve,
  };
}

function appFor(resolve: InstagramExtractionProvider['resolve'], available = true, options: { resolveRateLimit?: number } = {}) {
  return createApp({ provider: providerFor(resolve, available), ...options });
}

describe('POST /api/instagram/resolve', () => {
  it('returns safe metadata for a valid Reel and keeps provider URLs server-side', async () => {
    const provider = vi.fn(async () => reelMetadata);
    const response = await request(appFor(provider)).post('/api/instagram/resolve').send({ url: reelUrl });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      sourceType: 'reel',
      title: 'A public reel',
      author: 'public.creator',
      thumbnail: null,
      isCarousel: false,
      itemCount: 1,
      resolvedItemCount: 1,
      partial: false,
      warning: null,
    });
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      type: 'video',
      width: 1080,
      height: 1920,
      extension: 'mp4',
      qualityLabel: '1080x1920',
      thumbnail: null,
    });
    expect(JSON.stringify(response.body)).not.toContain('cdn.test');
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({
      canonicalUrl: reelUrl,
      route: 'reel',
    }));
  });

  it('strips tracking query parameters before provider invocation and stores the canonical URL', async () => {
    const provider = vi.fn(async () => reelMetadata);
    const store = new ResolutionStore();
    const app = createApp({ provider: providerFor(provider), store });
    const response = await request(app).post('/api/instagram/resolve').send({
      url: `${reelUrl}?utm_source=copy&stkn=private-value`,
    });

    expect(response.status).toBe(200);
    const mediaId = response.body.data.items[0].id as string;
    const stored = store.getByMediaId(mediaId);
    expect(stored?.resolution.canonicalUrl).toBe(reelUrl);
    expect(JSON.stringify(response.body)).not.toContain('private-value');
    store.dispose();
  });

  it('rejects invalid Instagram URLs and malformed request bodies', async () => {
    const provider = vi.fn(async () => reelMetadata);
    const app = appFor(provider);

    const invalidUrl = await request(app).post('/api/instagram/resolve').send({ url: 'https://example.com/video' });
    expect(invalidUrl.status).toBe(400);
    expect(invalidUrl.body).toEqual({
      success: false,
      error: { code: 'INVALID_INSTAGRAM_URL', message: 'Enter a valid public Instagram URL' },
    });

    const malformed = await request(app)
      .post('/api/instagram/resolve')
      .set('Content-Type', 'application/json')
      .send('{"url":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_INSTAGRAM_URL');
    expect(provider).not.toHaveBeenCalled();
  });

  it('returns provider unavailable when yt-dlp cannot be found', async () => {
    const response = await request(appFor(async () => reelMetadata, false))
      .post('/api/instagram/resolve')
      .send({ url: reelUrl });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it.each([
    ['timeout', 'EXTRACTION_TIMEOUT', 504, 'yt-dlp timed out after 30000ms'],
    ['private', 'PRIVATE_OR_UNAVAILABLE', 404, 'requested content is not available'],
    ['login', 'LOGIN_REQUIRED', 401, 'login required'],
    ['rate limit', 'RATE_LIMITED', 429, 'HTTP Error 429: too many requests'],
    ['generic extraction failure', 'EXTRACTION_FAILED', 502, 'unexpected extractor failure'],
  ] as const)('normalizes %s provider errors', async (_label, code, status, message) => {
    const kind = code === 'EXTRACTION_TIMEOUT' ? 'timeout' : 'failed';
    const provider = async () => {
      throw new YtDlpProcessError(kind, message);
    };
    const response = await request(appFor(provider)).post('/api/instagram/resolve').send({ url: reelUrl });

    expect(response.status).toBe(status);
    expect(response.body).toEqual({
      success: false,
      error: { code, message: expect.any(String) },
    });
    expect(JSON.stringify(response.body)).not.toContain('429');
  });

  it('returns malformed-response for invalid provider JSON or no genuine media candidates', async () => {
    const malformedProvider = async () => {
      throw new YtDlpProcessError('malformed', 'yt-dlp returned invalid JSON metadata');
    };
    const malformed = await request(appFor(malformedProvider)).post('/api/instagram/resolve').send({ url: reelUrl });
    expect(malformed.status).toBe(502);
    expect(malformed.body.error.code).toBe('PROVIDER_MALFORMED_RESPONSE');

    const emptyProvider = async () => ({ thumbnail: 'https://cdn.test/preview.jpg' });
    const empty = await request(appFor(emptyProvider)).post('/api/instagram/resolve').send({ url: reelUrl });
    expect(empty.status).toBe(502);
    expect(empty.body.error.code).toBe('PROVIDER_MALFORMED_RESPONSE');
  });

  it('normalizes every entry in a mixed carousel', async () => {
    const provider = async () => ({
      _type: 'playlist',
      title: 'Mixed album',
      entries: [
        { formats: [{ url: 'https://cdn.test/one.mp4', ext: 'mp4', width: 1080, height: 1920, vcodec: 'h264' }] },
        { formats: [{ url: 'https://cdn.test/two.jpg', ext: 'jpg', width: 1080, height: 1080, vcodec: 'none' }] },
      ],
    });
    const response = await request(appFor(provider)).post('/api/instagram/resolve').send({
      url: 'https://www.instagram.com/p/ALBUM123/',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.isCarousel).toBe(true);
    expect(response.body.data).toMatchObject({ itemCount: 2, resolvedItemCount: 2, partial: false, warning: null });
    expect(response.body.data.items.map((item: { type: string }) => item.type)).toEqual(['video', 'photo']);
    expect(JSON.stringify(response.body)).not.toContain('cdn.test');
  });

  it('returns an explicit partial state when a carousel entry has no genuine media', async () => {
    const provider = async () => ({
      entries: [
        { formats: [{ url: 'https://cdn.test/one.jpg', ext: 'jpg', width: 1080, height: 1080, vcodec: 'none' }] },
        { thumbnail: 'https://cdn.test/thumbnail.jpg' },
        { formats: [{ url: 'https://cdn.test/three.mp4', ext: 'mp4', width: 720, height: 1280, vcodec: 'h264' }] },
      ],
    });
    const response = await request(appFor(provider)).post('/api/instagram/resolve').send({
      url: 'https://www.instagram.com/p/PARTIAL123/',
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      isCarousel: true,
      itemCount: 3,
      resolvedItemCount: 2,
      partial: true,
      warning: 'Some carousel items were unavailable.',
    });
    expect(response.body.data.items).toHaveLength(2);
    expect(JSON.stringify(response.body)).not.toContain('cdn.test');
  });

  it('enforces a stricter resolver rate limit with the consistent error contract', async () => {
    const app = appFor(async () => reelMetadata, true, { resolveRateLimit: 1 });
    const first = await request(app).post('/api/instagram/resolve').send({ url: reelUrl });
    const second = await request(app).post('/api/instagram/resolve').send({ url: reelUrl });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
    });
  });

  it('uses the gallery provider chain for a yt-dlp image-only failure', async () => {
    const primary = providerFor(async () => {
      throw new YtDlpProcessError('failed', 'No video formats found');
    });
    const fallback = providerFor(async () => ({
      extractor_key: 'gallery-dl',
      formats: [{ url: 'https://cdn.test/photo.jpg', ext: 'jpg', width: 1440, height: 1800, vcodec: 'none' }],
    }));
    const response = await request(createApp({
      provider: new InstagramProviderChain({ primary, photoFallback: fallback }),
    })).post('/api/instagram/resolve').send({ url: 'https://www.instagram.com/p/PHOTO123/' });

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({ type: 'photo', width: 1440, height: 1800, extension: 'jpg' });
    expect(JSON.stringify(response.body)).not.toContain('cdn.test');
  });

  it('maps anonymous gallery login requirements to the existing safe error contract', async () => {
    const primary = providerFor(async () => {
      throw new YtDlpProcessError('failed', 'No video formats found');
    });
    const fallback = providerFor(async () => {
      throw new GalleryDlProcessError('failed', 'HTTP redirect to login page');
    });
    const response = await request(createApp({
      provider: new InstagramProviderChain({ primary, photoFallback: fallback }),
    })).post('/api/instagram/resolve').send({ url: 'https://www.instagram.com/p/PHOTO123/' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'LOGIN_REQUIRED', message: 'Instagram requires login to access this media' },
    });
  });

  it('maps anonymous gallery rate-limit errors to the existing safe error contract', async () => {
    const primary = providerFor(async () => {
      throw new YtDlpProcessError('failed', 'No image formats found');
    });
    const fallback = providerFor(async () => {
      throw new GalleryDlProcessError('failed', 'HTTP Error 429: too many requests');
    });
    const response = await request(createApp({
      provider: new InstagramProviderChain({ primary, photoFallback: fallback }),
    })).post('/api/instagram/resolve').send({ url: 'https://www.instagram.com/p/PHOTO123/' });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });
});
