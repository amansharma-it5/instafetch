import { describe, expect, it, vi } from 'vitest';
import { YtDlpYouTubeProvider } from './YtDlpYouTubeProvider';
import { YtDlpProcessError } from './yt-dlp-process';

describe('YtDlpYouTubeProvider', () => {
  it('passes only the validated canonical URL to the metadata runner', async () => {
    const runMetadata = vi.fn(async () => ({ id: 'dQw4w9WgXcQ' }));
    const provider = new YtDlpYouTubeProvider({ runMetadata });
    const url = { platform: 'youtube' as const, canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', host: 'www.youtube.com', route: 'video' as const, identifier: 'dQw4w9WgXcQ' };
    await provider.resolve(url);
    expect(runMetadata).toHaveBeenCalledWith(url.canonicalUrl, expect.objectContaining({
      youtubePlayerClient: undefined,
      youtubePotProviderUrl: undefined,
    }));
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
    expect(runMetadata).toHaveBeenNthCalledWith(1, url.canonicalUrl, expect.objectContaining({ youtubePotProviderUrl: undefined }));
    expect(runMetadata).toHaveBeenNthCalledWith(2, url.canonicalUrl, expect.objectContaining({ youtubePlayerClient: 'android_vr' }));
    expect(runMetadata).toHaveBeenNthCalledWith(2, url.canonicalUrl, expect.objectContaining({ youtubePotProviderUrl: undefined }));
  });

  it('tries the loopback PO-token mweb strategy before android_vr', async () => {
    const runMetadata = vi.fn()
      .mockRejectedValueOnce(new YtDlpProcessError('failed', "Sign in to confirm you're not a bot"))
      .mockResolvedValueOnce({ id: 'dQw4w9WgXcQ' });
    const provider = new YtDlpYouTubeProvider({
      runMetadata,
      youtubePotProviderUrl: 'http://127.0.0.1:4416',
      requirePotProvider: true,
      isPotProviderAvailable: () => true,
    });
    const url = { platform: 'youtube' as const, canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', host: 'www.youtube.com', route: 'video' as const, identifier: 'dQw4w9WgXcQ' };

    await provider.resolve(url);

    expect(runMetadata).toHaveBeenNthCalledWith(2, url.canonicalUrl, expect.objectContaining({
      youtubePlayerClient: 'mweb',
      youtubePotProviderUrl: 'http://127.0.0.1:4416',
    }));
    expect(runMetadata).toHaveBeenCalledTimes(2);
  });

  it('reports a required PO-token provider as unavailable without exposing its endpoint', () => {
    const provider = new YtDlpYouTubeProvider({
      runMetadata: undefined,
      requirePotProvider: true,
      isPotProviderAvailable: () => false,
      isYtDlpExecutableAvailable: () => true,
    });
    expect(provider.isAvailable()).toBe(false);
    expect(provider.availabilityErrorCode?.()).toBe('TOKEN_PROVIDER_UNAVAILABLE');
    expect(JSON.stringify(provider)).not.toContain('127.0.0.1');
  });

  it('does not misclassify a missing yt-dlp executable as a token-provider failure', () => {
    const provider = new YtDlpYouTubeProvider({
      executable: 'C:/missing/yt-dlp.exe',
      requirePotProvider: true,
      isPotProviderAvailable: () => false,
      isYtDlpExecutableAvailable: () => false,
    });
    expect(provider.isAvailable()).toBe(false);
    expect(provider.availabilityErrorCode?.()).toBeNull();
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
