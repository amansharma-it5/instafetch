import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import type { YouTubeExtractionProvider } from '../src/services/extraction/YouTubeExtractionProvider';
import { YtDlpProcessError } from '../src/services/extraction/yt-dlp-process';

const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=tracking';
const metadata = {
  title: 'Public demo video', uploader: 'Open channel', duration: 12,
  formats: [
    { url: 'https://rr1.googlevideo.com/video.mp4', ext: 'mp4', width: 1280, height: 720, vcodec: 'avc1.64001f', acodec: 'none' },
    { url: 'https://rr1.googlevideo.com/audio.m4a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2' },
  ],
};
function appFor(resolve: YouTubeExtractionProvider['resolve'], available = true) {
  return createApp({ youtubeProvider: { isAvailable: () => available, resolve } });
}

describe('POST /api/youtube/resolve', () => {
  it('returns application URLs and never provider URLs', async () => {
    const provider = vi.fn(async () => metadata);
    const response = await request(appFor(provider)).post('/api/youtube/resolve').send({ url });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ platform: 'youtube', sourceType: 'youtube_video', title: 'Public demo video', author: 'Open channel' });
    expect(response.body.data.items[0]).toMatchObject({ type: 'video', width: 1280, height: 720, hasAudio: true });
    expect(JSON.stringify(response.body)).not.toContain('googlevideo.com');
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', route: 'video' }));
  });
  it('rejects playlist-only links and malformed URLs', async () => {
    const provider = vi.fn(async () => metadata);
    const app = appFor(provider);
    const playlist = await request(app).post('/api/youtube/resolve').send({ url: 'https://www.youtube.com/playlist?list=PL1234567890' });
    expect(playlist.status).toBe(422);
    expect(playlist.body.error.code).toBe('PLAYLIST_NOT_SUPPORTED');
    const invalid = await request(app).post('/api/youtube/resolve').send({ url: 'https://example.com/watch?v=dQw4w9WgXcQ' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_YOUTUBE_URL');
    expect(provider).not.toHaveBeenCalled();
  });
  it('maps timeout and unavailable provider errors safely', async () => {
    const timeout = await request(appFor(async () => { throw new YtDlpProcessError('timeout', 'yt-dlp timed out'); })).post('/api/youtube/resolve').send({ url });
    expect(timeout.status).toBe(504);
    expect(timeout.body.error.code).toBe('EXTRACTION_TIMEOUT');
    const unavailable = await request(appFor(async () => metadata, false)).post('/api/youtube/resolve').send({ url });
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error.code).toBe('PROVIDER_UNAVAILABLE');
    const login = await request(appFor(async () => { throw new YtDlpProcessError('failed', 'Sign in to confirm your age'); })).post('/api/youtube/resolve').send({ url });
    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe('LOGIN_REQUIRED');
  });

  it('reports a missing required PO-token provider without exposing its loopback endpoint', async () => {
    const app = createApp({
      youtubeProvider: {
        isAvailable: () => false,
        availabilityErrorCode: () => 'TOKEN_PROVIDER_UNAVAILABLE',
        resolve: async () => metadata,
      },
    });
    const response = await request(app).post('/api/youtube/resolve').send({ url });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'TOKEN_PROVIDER_UNAVAILABLE',
        message: 'The YouTube token provider is unavailable',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('127.0.0.1');
  });
});
