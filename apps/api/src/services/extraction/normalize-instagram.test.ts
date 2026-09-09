import { describe, expect, it } from 'vitest';
import { normalizeInstagramMetadata } from './normalize-instagram';

describe('Instagram metadata normalization', () => {
  it('selects the highest-resolution video and prefers MP4 at equal quality', () => {
    const result = normalizeInstagramMetadata({
      title: 'Test reel',
      uploader: 'creator',
      formats: [
        { url: 'https://cdn.test/video-low.mov', ext: 'mov', width: 720, height: 1280, vcodec: 'h264' },
        { url: 'https://cdn.test/video-high.mov', ext: 'mov', width: 1080, height: 1920, vcodec: 'h264' },
        { url: 'https://cdn.test/video-high.mp4', ext: 'mp4', width: 1080, height: 1920, vcodec: 'h264', filesize: 1000 },
        { url: 'https://cdn.test/audio.m4a', ext: 'm4a', vcodec: 'none' },
      ],
    }, 'reel');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      type: 'video',
      width: 1080,
      height: 1920,
      extension: 'mp4',
      qualityLabel: '1080x1920',
      filesize: 1000,
      providerUrl: 'https://cdn.test/video-high.mp4',
    });
  });

  it('normalizes a genuine image format without treating thumbnails as images', () => {
    const result = normalizeInstagramMetadata({
      thumbnail: 'https://cdn.test/preview-only.jpg',
      formats: [{ url: 'https://cdn.test/photo.jpg', ext: 'jpg', width: 1440, height: 1800, vcodec: 'none' }],
    }, 'post');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      type: 'photo',
      width: 1440,
      height: 1800,
      extension: 'jpg',
      providerUrl: 'https://cdn.test/photo.jpg',
    });
    expect(result.partial).toBe(false);
    expect(result.itemCount).toBe(1);
    expect(result.resolvedItemCount).toBe(1);
  });

  it('normalizes a direct top-level video candidate when yt-dlp has no formats array', () => {
    const result = normalizeInstagramMetadata({
      url: 'https://cdn.test/direct-video.mp4',
      ext: 'mp4',
      width: 1080,
      height: 1920,
      vcodec: 'h264',
    }, 'post');

    expect(result.items[0]).toMatchObject({
      type: 'video',
      extension: 'mp4',
      qualityLabel: '1080x1920',
      providerUrl: 'https://cdn.test/direct-video.mp4',
    });
  });

  it('selects the highest-resolution genuine image candidate', () => {
    const result = normalizeInstagramMetadata({
      formats: [
        { url: 'https://cdn.test/photo-small.jpg', ext: 'jpg', width: 640, height: 800, vcodec: 'none' },
        { url: 'https://cdn.test/photo-large.webp', ext: 'webp', width: 1440, height: 1800, vcodec: 'none' },
      ],
    }, 'post');

    expect(result.items[0]).toMatchObject({
      type: 'photo',
      width: 1440,
      height: 1800,
      extension: 'webp',
      providerUrl: 'https://cdn.test/photo-large.webp',
    });
  });

  it('rejects metadata that contains only video thumbnails', () => {
    expect(() => normalizeInstagramMetadata({
      thumbnail: 'https://cdn.test/preview.jpg',
      thumbnails: [{ url: 'https://cdn.test/preview-large.jpg' }],
    }, 'post')).toThrow('no downloadable media candidates');
  });

  it('preserves every supported mixed carousel entry independently', () => {
    const result = normalizeInstagramMetadata({
      _type: 'playlist',
      entries: [
        { formats: [{ url: 'https://cdn.test/one.mp4', ext: 'mp4', width: 1080, height: 1920, vcodec: 'h264' }] },
        { formats: [{ url: 'https://cdn.test/two.jpg', ext: 'jpg', width: 1080, height: 1080, vcodec: 'none' }] },
      ],
    }, 'post');

    expect(result.isCarousel).toBe(true);
    expect(result.items.map((item) => item.type)).toEqual(['video', 'photo']);
    expect(result.itemCount).toBe(2);
    expect(result.resolvedItemCount).toBe(2);
    expect(result.partial).toBe(false);
  });

  it('preserves order and reports a partial carousel when an entry has no genuine media', () => {
    const result = normalizeInstagramMetadata({
      entries: [
        { formats: [{ url: 'https://cdn.test/first.jpg', ext: 'jpg', width: 100, height: 100, vcodec: 'none' }] },
        { thumbnail: 'https://cdn.test/thumbnail.jpg' },
        { formats: [{ url: 'https://cdn.test/last.mp4', ext: 'mp4', width: 720, height: 1280, vcodec: 'h264' }] },
      ],
    }, 'post');

    expect(result.items.map((item) => item.providerUrl)).toEqual([
      'https://cdn.test/first.jpg',
      'https://cdn.test/last.mp4',
    ]);
    expect(result.itemCount).toBe(3);
    expect(result.resolvedItemCount).toBe(2);
    expect(result.partial).toBe(true);
    expect(result.warning).toBe('Some carousel items were unavailable.');
  });

  it('normalizes a video-only carousel with every entry in provider order', () => {
    const result = normalizeInstagramMetadata({
      _type: 'playlist',
      entries: [
        { formats: [{ url: 'https://cdn.test/one.webm', ext: 'webm', width: 720, height: 1280, vcodec: 'vp9' }] },
        { formats: [{ url: 'https://cdn.test/two.mp4', ext: 'mp4', width: 1080, height: 1080, vcodec: 'h264' }] },
      ],
    }, 'post');

    expect(result.items.map((item) => item.type)).toEqual(['video', 'video']);
    expect(result.items.map((item) => item.extension)).toEqual(['webm', 'mp4']);
  });

  it('normalizes a photo-only carousel with every entry in provider order', () => {
    const result = normalizeInstagramMetadata({
      entries: [
        { formats: [{ url: 'https://cdn.test/one.jpg', ext: 'jpg', width: 1080, height: 1080, vcodec: 'none' }] },
        { formats: [{ url: 'https://cdn.test/two.png', ext: 'png', width: 1350, height: 900, vcodec: 'none' }] },
      ],
    }, 'post');

    expect(result.items.map((item) => item.type)).toEqual(['photo', 'photo']);
    expect(result.items.map((item) => item.providerUrl)).toEqual([
      'https://cdn.test/one.jpg',
      'https://cdn.test/two.png',
    ]);
  });
});
