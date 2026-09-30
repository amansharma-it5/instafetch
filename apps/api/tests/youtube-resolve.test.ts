import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import type { YouTubeExtractionProvider } from '../src/services/extraction/YouTubeExtractionProvider';
import { YtDlpProcessError } from '../src/services/extraction/yt-dlp-process';
import { ResolutionStore } from '../src/services/store/resolution-store';

const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=tracking';
const metadata = {
  title: 'Public demo video', uploader: 'Open channel', duration: 12,
  formats: [
    { url: 'https://rr1.googlevideo.com/video.mp4', ext: 'mp4', width: 1280, height: 720, vcodec: 'avc1.64001f', acodec: 'none' },
    { url: 'https://rr1.googlevideo.com/audio.m4a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2' },
  ],
};
function appFor(resolve: YouTubeExtractionProvider['resolve'], available = true, store?: ResolutionStore) {
  return createApp({ youtubeProvider: { isAvailable: () => available, resolve }, store });
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
  it('returns multiple source-backed options and prepares only the selected option', async () => {
    const provider = vi.fn(async () => ({ ...metadata, formats: [
      { url: 'https://rr1.googlevideo.com/video-360.mp4', ext: 'mp4', width: 640, height: 360, vcodec: 'avc1', acodec: 'none', filesize: 4_000 },
      { url: 'https://rr1.googlevideo.com/video-720.mp4', ext: 'mp4', width: 1280, height: 720, vcodec: 'avc1', acodec: 'none', filesize: 9_000 },
      { url: 'https://rr1.googlevideo.com/video-1080.mp4', ext: 'mp4', width: 1920, height: 1080, vcodec: 'avc1', acodec: 'none', filesize_approx: 18_000 },
      { url: 'https://rr1.googlevideo.com/audio.m4a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 192, filesize: 3_000 },
    ] }));
    const app = appFor(provider);
    const resolved = await request(app).post('/api/youtube/resolve').send({ url });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.downloadOptions.map((option: { resolution: number }) => option.resolution)).toEqual([360, 720, 1080]);
    expect(resolved.body.data.audioOptions.some((option: { format: string }) => option.format === 'm4a')).toBe(true);
    expect(resolved.body.data.audioOptions.some((option: { format: string }) => option.format === 'mp3')).toBe(true);
    expect(resolved.body.data.items[0].downloadUrl).toBeUndefined();
    expect(JSON.stringify(resolved.body)).not.toContain('googlevideo.com');

    const selected = resolved.body.data.downloadOptions.find((option: { resolution: number }) => option.resolution === 1080);
    const prepared = await request(app).post('/api/youtube/prepare').send({ jobId: resolved.body.data.jobId, optionId: selected.optionId });
    expect(prepared.status).toBe(200);
    expect(prepared.body.data.downloadUrl).toMatch(/^\/api\/download\?token=/);
    expect(JSON.stringify(prepared.body)).not.toContain('googlevideo.com');

    const invalid = await request(app).post('/api/youtube/prepare').send({ jobId: resolved.body.data.jobId, optionId: '00000000-0000-0000-0000-000000000000' });
    expect(invalid.status).toBe(404);
    expect(invalid.body.error.code).toBe('MEDIA_NOT_FOUND');

    const malformed = await request(app).post('/api/youtube/prepare').send({ jobId: resolved.body.data.jobId, optionId: 'not-an-option-id' });
    expect(malformed.status).toBe(401);
    expect(malformed.body.error.code).toBe('INVALID_TOKEN');
  });
  it('rejects preparation after the short-lived resolution job expires', async () => {
    let now = 1_000;
    const store = new ResolutionStore({ ttlMs: 10, now: () => now });
    const app = appFor(async () => metadata, true, store);
    const resolved = await request(app).post('/api/youtube/resolve').send({ url });
    now = 1_011;
    const expired = await request(app).post('/api/youtube/prepare').send({
      jobId: resolved.body.data.jobId,
      optionId: resolved.body.data.downloadOptions[0].optionId,
    });
    expect(expired.status).toBe(404);
    expect(expired.body.error.code).toBe('MEDIA_NOT_FOUND');
    store.dispose();
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

  it('surfaces PO-token outages and provider challenges without raw extractor details', async () => {
    const tokenUnavailable = await request(appFor(async () => {
      throw new YtDlpProcessError('failed', 'Error reaching POST /get_pot');
    })).post('/api/youtube/resolve').send({ url });
    expect(tokenUnavailable.status).toBe(503);
    expect(tokenUnavailable.body.error.code).toBe('TOKEN_PROVIDER_UNAVAILABLE');
    expect(JSON.stringify(tokenUnavailable.body)).not.toContain('/get_pot');

    const challenge = await request(appFor(async () => {
      throw new YtDlpProcessError('failed', 'YouTube challenge response', 'PROVIDER_CHALLENGE');
    })).post('/api/youtube/resolve').send({ url });
    expect(challenge.status).toBe(422);
    expect(challenge.body.error.code).toBe('PROVIDER_CHALLENGE');
  });
});
