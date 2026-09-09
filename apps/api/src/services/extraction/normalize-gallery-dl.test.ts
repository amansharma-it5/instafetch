import { describe, expect, it } from 'vitest';
import { normalizeGalleryDlMetadata } from './normalize-gallery-dl';

describe('gallery-dl metadata normalization', () => {
  it('normalizes a genuine single photo record', () => {
    const result = normalizeGalleryDlMetadata([
      [1, {
        category: 'instagram',
        subcategory: 'post',
        post_id: 'PHOTO-1',
        filename: 'PHOTO-1.jpg',
        extension: 'jpg',
        width: 1440,
        height: 1800,
        url: 'https://cdn.test/photo.jpg',
        author: 'public.creator',
      }],
    ], 'post');

    expect(result).toMatchObject({ extractor_key: 'gallery-dl', uploader: 'public.creator' });
    expect(result.formats?.[0]).toMatchObject({
      url: 'https://cdn.test/photo.jpg',
      ext: 'jpg',
      width: 1440,
      height: 1800,
      vcodec: 'none',
    });
  });

  it('preserves order and deduplicates repeated carousel records', () => {
    const result = normalizeGalleryDlMetadata([
      [1, { filename: 'one.jpg', extension: 'jpg', url: 'https://cdn.test/one.jpg', width: 100, height: 100 }],
      [1, { filename: 'one-again.jpg', extension: 'jpg', url: 'https://cdn.test/one.jpg', width: 100, height: 100 }],
      [1, { filename: 'two.png', extension: 'png', url: 'https://cdn.test/two.png', width: 200, height: 100 }],
    ], 'post');

    expect(result._type).toBe('playlist');
    expect(result.entries?.map((entry) => (entry.formats as Array<Record<string, unknown>>)[0].url)).toEqual([
      'https://cdn.test/one.jpg',
      'https://cdn.test/two.png',
    ]);
  });

  it('rejects thumbnail and avatar-like records', () => {
    expect(() => normalizeGalleryDlMetadata([
      [1, { role: 'thumbnail', filename: 'thumb.jpg', extension: 'jpg', url: 'https://cdn.test/thumb.jpg' }],
      [1, { role: 'avatar', filename: 'avatar.jpg', extension: 'jpg', url: 'https://cdn.test/avatar.jpg' }],
    ], 'post')).toThrow('no genuine image metadata');
  });

  it('rejects valid JSON with no media records', () => {
    expect(() => normalizeGalleryDlMetadata({ category: 'instagram', title: 'No media' }, 'post'))
      .toThrow('no genuine image metadata');
  });

  it('marks successful media plus provider errors as a partial playlist', () => {
    const result = normalizeGalleryDlMetadata([
      [1, { filename: 'one.jpg', extension: 'jpg', url: 'https://cdn.test/one.jpg' }],
      [-1, { error: 'ExtractionError', message: 'one carousel item was unavailable' }],
    ], 'post');

    expect(result._type).toBe('playlist');
    expect(result.entries).toHaveLength(2);
    expect(result.entries?.[0]).toMatchObject({ formats: expect.any(Array) });
    expect(result.entries?.[1]).toEqual({});
  });
});
