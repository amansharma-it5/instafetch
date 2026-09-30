import { describe, expect, it } from 'vitest';
import { normalizeYouTubeMetadata } from './normalize-youtube';

const base = {
  title: 'Public demo', uploader: 'Open media channel', duration: 42,
  formats: [
    { url: 'https://rr1.googlevideo.com/video.mp4', ext: 'mp4', width: 1280, height: 720, vcodec: 'avc1.64001f', acodec: 'none', filesize: 10_000 },
    { url: 'https://rr1.googlevideo.com/audio.m4a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, filesize: 3_000 },
  ],
};

describe('normalizeYouTubeMetadata', () => {
  it('selects separate H264 video and AAC audio and keeps safe metadata', () => {
    const result = normalizeYouTubeMetadata(base, 'video');
    expect(result.sourceType).toBe('youtube_video');
    expect(result.items[0]).toMatchObject({ extension: 'mp4', hasAudio: true, videoCodec: 'avc1.64001f', audioCodec: 'mp4a.40.2', durationSeconds: 42 });
    expect(result.items[0].providerUrl).toContain('googlevideo.com');
  });
  it('prefers a combined MP4 audio/video format over a larger webm-only candidate', () => {
    const result = normalizeYouTubeMetadata({ ...base, formats: [
      { url: 'https://rr1.googlevideo.com/video.webm', ext: 'webm', width: 1920, height: 1080, vcodec: 'vp9', acodec: 'opus' },
      ...base.formats,
      { url: 'https://rr1.googlevideo.com/combined.mp4', ext: 'mp4', width: 1280, height: 720, vcodec: 'avc1.64001f', acodec: 'mp4a.40.2' },
    ] }, 'short');
    expect(result.sourceType).toBe('youtube_short');
    expect(result.items[0]).toMatchObject({ extension: 'mp4', hasAudio: true, audioProviderUrl: null });
  });
  it('prefers a reasonable 720p candidate over a larger 1080p stream', () => {
    const result = normalizeYouTubeMetadata({ ...base, formats: [
      { url: 'https://rr1.googlevideo.com/video-1080.mp4', ext: 'mp4', width: 1920, height: 1080, vcodec: 'avc1.64001f', acodec: 'none', filesize: 90_000_000 },
      { url: 'https://rr1.googlevideo.com/video-720.webm', ext: 'webm', width: 1280, height: 720, vcodec: 'vp9', acodec: 'none', filesize: 12_000_000 },
      { url: 'https://rr1.googlevideo.com/audio.m4a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, filesize: 3_000_000 },
    ] }, 'video');
    expect(result.items[0]).toMatchObject({ height: 720, extension: 'webm', hasAudio: true });
  });
  it('ignores HLS manifest formats and selects a direct media URL', () => {
    const result = normalizeYouTubeMetadata({ ...base, formats: [
      { url: 'https://rr1.googlevideo.com/manifest.m3u8', protocol: 'm3u8_native', ext: 'mp4', width: 1920, height: 1080, vcodec: 'avc1', acodec: 'mp4a.40.2' },
      ...base.formats,
    ] }, 'video');
    expect(result.items[0].providerUrl).not.toContain('.m3u8');
    expect(result.items[0].audioProviderUrl).toContain('audio.m4a');
  });
  it('returns a deduplicated source-derived quality matrix without capping at 720p', () => {
    const result = normalizeYouTubeMetadata({ ...base, duration: 120, formats: [
      { url: 'https://rr1.googlevideo.com/360.mp4', ext: 'mp4', width: 640, height: 360, vcodec: 'avc1', acodec: 'none', tbr: 700 },
      { url: 'https://rr1.googlevideo.com/720.webm', ext: 'webm', width: 1280, height: 720, vcodec: 'vp9', acodec: 'none', tbr: 2_000 },
      { url: 'https://rr1.googlevideo.com/720-duplicate.webm', ext: 'webm', width: 1280, height: 720, vcodec: 'vp9', acodec: 'none', tbr: 1_600 },
      { url: 'https://rr1.googlevideo.com/1080.mp4', ext: 'mp4', width: 1920, height: 1080, vcodec: 'avc1', acodec: 'none', tbr: 4_000 },
      { url: 'https://rr1.googlevideo.com/2160.webm', ext: 'webm', width: 3840, height: 2160, vcodec: 'vp9', acodec: 'none', tbr: 4_000 },
      { url: 'https://rr1.googlevideo.com/audio.m4a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 192, filesize_approx: 2_880_000 },
    ] }, 'video');
    const videos = result.items.filter((item) => item.optionKind === 'video');
    expect(videos.map((item) => item.height)).toEqual([360, 720, 1080, 2160]);
    expect(videos.filter((item) => item.height === 720)).toHaveLength(1);
    expect(videos.find((item) => item.height === 1080)).toMatchObject({ requiresMux: true, sizeKind: 'estimated', hasAudio: true });
    expect(result.items.some((item) => item.optionKind === 'audio' && item.extension === 'm4a')).toBe(true);
    expect(result.items.some((item) => item.optionKind === 'mp3' && item.bitrateKbps === 192)).toBe(true);
    expect(result.items.some((item) => item.optionKind === 'mp3' && item.bitrateKbps === 320)).toBe(false);
  });
  it('omits an oversized video option while retaining safe audio metadata', () => {
    const result = normalizeYouTubeMetadata({ ...base, formats: [
      { url: 'https://rr1.googlevideo.com/large.mp4', ext: 'mp4', width: 1920, height: 1080, vcodec: 'avc1', acodec: 'none', filesize: 101 * 1024 * 1024 },
      { url: 'https://rr1.googlevideo.com/audio.m4a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, filesize: 3_000_000 },
    ] }, 'video');
    expect(result.items.some((item) => item.optionKind === 'video')).toBe(false);
    expect(result.items.some((item) => item.optionKind === 'audio')).toBe(true);
  });
  it.each([
    ['duration', { duration: 1201 }, 'MEDIA_TOO_LONG'],
    ['live', { is_live: true }, 'LIVE_NOT_AVAILABLE'],
    ['age', { age_limit: 18 }, 'AGE_RESTRICTED'],
    ['drm', { has_drm: true }, 'DRM_UNSUPPORTED'],
    ['empty', { formats: [] }, 'UNSUPPORTED_MEDIA'],
  ] as const)('rejects %s media safely', (_label, extra, code) => {
    expect(() => normalizeYouTubeMetadata({ ...base, ...extra }, 'video')).toThrowError(expect.objectContaining({ code }));
  });
});
