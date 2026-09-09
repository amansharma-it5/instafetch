import { describe, expect, it, vi } from 'vitest';
import { parseInstagramUrl } from '@instafetch/shared';
import { GalleryDlProcessError } from './gallery-dl-process';
import { GalleryDlInstagramProvider } from './GalleryDlInstagramProvider';

const post = parseInstagramUrl('https://www.instagram.com/p/PHOTO123/');

describe('GalleryDlInstagramProvider', () => {
  it('normalizes a valid single-photo JSON event', async () => {
    const provider = new GalleryDlInstagramProvider({
      runMetadata: vi.fn(async () => [[1, {
        category: 'instagram',
        filename: 'PHOTO123.jpg',
        extension: 'jpg',
        width: 1440,
        height: 1800,
        url: 'https://cdn.test/photo.jpg',
      }]]),
    });

    const result = await provider.resolve(post);
    expect(result).toMatchObject({ extractor_key: 'gallery-dl' });
    expect(result.formats).toEqual([expect.objectContaining({
      ext: 'jpg',
      width: 1440,
      height: 1800,
      vcodec: 'none',
    })]);
  });

  it('preserves multiple gallery image records for carousel normalization', async () => {
    const provider = new GalleryDlInstagramProvider({
      runMetadata: vi.fn(async () => [
        [1, { filename: 'one.jpg', extension: 'jpg', url: 'https://cdn.test/one.jpg' }],
        [1, { filename: 'two.jpg', extension: 'jpg', url: 'https://cdn.test/two.jpg' }],
      ]),
    });

    const result = await provider.resolve(post);
    expect(result._type).toBe('playlist');
    expect(result.entries).toHaveLength(2);
  });

  it('normalizes malformed gallery output as a provider error', async () => {
    const provider = new GalleryDlInstagramProvider({ runMetadata: vi.fn(async () => ({ category: 'instagram' })) });
    await expect(provider.resolve(post)).rejects.toMatchObject({
      name: 'GalleryDlProcessError',
      kind: 'malformed',
    });
  });

  it('preserves process errors such as login requirements', async () => {
    const provider = new GalleryDlInstagramProvider({
      runMetadata: vi.fn(async () => { throw new GalleryDlProcessError('failed', 'HTTP redirect to login page'); }),
    });
    await expect(provider.resolve(post)).rejects.toMatchObject({ kind: 'failed', message: 'HTTP redirect to login page' });
  });
});
