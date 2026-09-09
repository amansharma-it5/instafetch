import { describe, expect, it, vi } from 'vitest';
import { parseInstagramUrl } from '@instafetch/shared';
import { GalleryDlProcessError } from './gallery-dl-process';
import type { InstagramExtractionProvider } from './InstagramExtractionProvider';
import { InstagramProviderChain } from './provider-chain';
import { YtDlpProcessError } from './yt-dlp-process';

const reel = parseInstagramUrl('https://www.instagram.com/reel/REEL123/');
const post = parseInstagramUrl('https://www.instagram.com/p/POST123/');

function provider(resolve: InstagramExtractionProvider['resolve'], available = true): InstagramExtractionProvider {
  return { isAvailable: () => available, resolve };
}

describe('Instagram provider chain', () => {
  it('does not invoke gallery fallback after a successful yt-dlp result', async () => {
    const primary = vi.fn(async () => ({ formats: [{ url: 'https://cdn.test/video.mp4', ext: 'mp4', vcodec: 'h264' }] }));
    const fallback = vi.fn(async () => ({ formats: [{ url: 'https://cdn.test/photo.jpg', ext: 'jpg' }] }));
    const chain = new InstagramProviderChain({ primary: provider(primary), photoFallback: provider(fallback) });

    await expect(chain.resolve(reel)).resolves.toMatchObject({ formats: expect.any(Array) });
    expect(primary).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back for a photo post when yt-dlp reports no media formats', async () => {
    const primary = vi.fn(async () => { throw new YtDlpProcessError('failed', 'No video formats found'); });
    const fallback = vi.fn(async () => ({ formats: [{ url: 'https://cdn.test/photo.jpg', ext: 'jpg', vcodec: 'none' }] }));
    const chain = new InstagramProviderChain({ primary: provider(primary), photoFallback: provider(fallback) });

    await expect(chain.resolve(post)).resolves.toMatchObject({ formats: expect.any(Array) });
    expect(primary).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('does not invoke gallery fallback for a Reel failure', async () => {
    const primary = vi.fn(async () => { throw new YtDlpProcessError('failed', 'No video formats found'); });
    const fallback = vi.fn(async () => ({ formats: [{ url: 'https://cdn.test/photo.jpg', ext: 'jpg' }] }));
    const chain = new InstagramProviderChain({ primary: provider(primary), photoFallback: provider(fallback) });

    await expect(chain.resolve(reel)).rejects.toBeInstanceOf(YtDlpProcessError);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('returns the gallery provider error without exposing provider internals', async () => {
    const primary = vi.fn(async () => { throw new YtDlpProcessError('failed', 'No image formats found'); });
    const fallback = vi.fn(async () => { throw new GalleryDlProcessError('failed', 'HTTP redirect to login page'); });
    const chain = new InstagramProviderChain({ primary: provider(primary), photoFallback: provider(fallback) });

    await expect(chain.resolve(post)).rejects.toMatchObject({ kind: 'failed', message: 'HTTP redirect to login page' });
  });
});
