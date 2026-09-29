import { describe, expect, it, vi } from 'vitest';
import { YtDlpYouTubeProvider } from './YtDlpYouTubeProvider';
import { YtDlpProcessError } from './yt-dlp-process';

describe('YtDlpYouTubeProvider', () => {
  it('passes only the validated canonical URL to the metadata runner', async () => {
    const runMetadata = vi.fn(async () => ({ id: 'dQw4w9WgXcQ' }));
    const provider = new YtDlpYouTubeProvider({ runMetadata });
    const url = { platform: 'youtube' as const, canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', host: 'www.youtube.com', route: 'video' as const, identifier: 'dQw4w9WgXcQ' };
    await provider.resolve(url);
    expect(runMetadata).toHaveBeenCalledWith(url.canonicalUrl, expect.any(Object));
    expect(provider.isAvailable()).toBe(true);
  });

  it('uses the fixed anonymous android_vr fallback after a bot/login response', async () => {
    const runMetadata = vi.fn()
      .mockRejectedValueOnce(new YtDlpProcessError('failed', "Sign in to confirm you're not a bot"))
      .mockResolvedValueOnce({ id: 'dQw4w9WgXcQ' });
    const provider = new YtDlpYouTubeProvider({ runMetadata });
    const url = { platform: 'youtube' as const, canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', host: 'www.youtube.com', route: 'video' as const, identifier: 'dQw4w9WgXcQ' };

    await provider.resolve(url);

    expect(runMetadata).toHaveBeenNthCalledWith(1, url.canonicalUrl, expect.not.objectContaining({ youtubePlayerClient: expect.anything() }));
    expect(runMetadata).toHaveBeenNthCalledWith(2, url.canonicalUrl, expect.objectContaining({ youtubePlayerClient: 'android_vr' }));
  });

  it('does not retry timeouts with another client', async () => {
    const error = new YtDlpProcessError('timeout', 'yt-dlp timed out');
    const runMetadata = vi.fn().mockRejectedValue(error);
    const provider = new YtDlpYouTubeProvider({ runMetadata });
    const url = { platform: 'youtube' as const, canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', host: 'www.youtube.com', route: 'video' as const, identifier: 'dQw4w9WgXcQ' };

    await expect(provider.resolve(url)).rejects.toBe(error);
    expect(runMetadata).toHaveBeenCalledTimes(1);
  });
});
