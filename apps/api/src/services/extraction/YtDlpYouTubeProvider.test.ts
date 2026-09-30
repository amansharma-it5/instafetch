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
      .mockRejectedValueOnce(new YtDlpProcessError('failed', "Sign in to confirm you're not a bot"))
      .mockResolvedValueOnce({ id: 'dQw4w9WgXcQ' });
    const provider = new YtDlpYouTubeProvider({ runMetadata });
    const url = { platform: 'youtube' as const, canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', host: 'www.youtube.com', route: 'video' as const, identifier: 'dQw4w9WgXcQ' };

    await provider.resolve(url);

    expect(runMetadata).toHaveBeenNthCalledWith(1, url.canonicalUrl, expect.not.objectContaining({ youtubePlayerClient: expect.anything() }));
    expect(runMetadata).toHaveBeenNthCalledWith(2, url.canonicalUrl, expect.objectContaining({ youtubePlayerClient: 'mweb' }));
    expect(runMetadata).toHaveBeenNthCalledWith(3, url.canonicalUrl, expect.objectContaining({ youtubePlayerClient: 'android_vr' }));
  });

  it('uses the local PO-token provider for the mweb attempt', async () => {
    const runMetadata = vi.fn()
      .mockRejectedValueOnce(new YtDlpProcessError('failed', "Sign in to confirm you're not a bot"))
      .mockResolvedValueOnce({ id: 'dQw4w9WgXcQ' });
    const provider = new YtDlpYouTubeProvider({
      runMetadata,
      potProvider: { isAvailable: () => true, baseUrl: 'http://127.0.0.1:4416' },
      requirePotProvider: true,
    });
    const url = { platform: 'youtube' as const, canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', host: 'www.youtube.com', route: 'video' as const, identifier: 'dQw4w9WgXcQ' };

    await provider.resolve(url);

    expect(runMetadata).toHaveBeenNthCalledWith(2, url.canonicalUrl, expect.objectContaining({
      youtubePlayerClient: 'mweb',
      youtubePotProviderUrl: 'http://127.0.0.1:4416',
    }));
    expect(provider.isAvailable()).toBe(true);
  });

  it('uses the provider when the default client returns only HLS formats', async () => {
    const runMetadata = vi.fn()
      .mockResolvedValueOnce({ formats: [{ protocol: 'm3u8_native', url: 'https://cdn.test/playlist.m3u8', vcodec: 'avc1', acodec: 'none' }] })
      .mockResolvedValueOnce({ formats: [{ protocol: 'https', url: 'https://cdn.test/video.mp4', vcodec: 'avc1', acodec: 'none' }, { protocol: 'https', url: 'https://cdn.test/audio.m4a', vcodec: 'none', acodec: 'mp4a' }] });
    const provider = new YtDlpYouTubeProvider({
      runMetadata,
      potProvider: { isAvailable: () => true, baseUrl: 'http://127.0.0.1:4416' },
      requirePotProvider: true,
    });
    const url = { platform: 'youtube' as const, canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', host: 'www.youtube.com', route: 'video' as const, identifier: 'dQw4w9WgXcQ' };

    const metadata = await provider.resolve(url);

    expect(metadata.formats).toHaveLength(2);
    expect(runMetadata).toHaveBeenNthCalledWith(2, url.canonicalUrl, expect.objectContaining({ youtubePlayerClient: 'mweb' }));
  });

  it('does not hide a local PO-token provider outage behind android_vr', async () => {
    const providerError = new YtDlpProcessError('failed', 'Error reaching POST /get_pot');
    const runMetadata = vi.fn()
      .mockRejectedValueOnce(new YtDlpProcessError('failed', "Sign in to confirm you're not a bot"))
      .mockRejectedValueOnce(providerError);
    const provider = new YtDlpYouTubeProvider({
      runMetadata,
      potProvider: { isAvailable: () => true, baseUrl: 'http://127.0.0.1:4416' },
      requirePotProvider: true,
    });
    const url = { platform: 'youtube' as const, canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', host: 'www.youtube.com', route: 'video' as const, identifier: 'dQw4w9WgXcQ' };

    await expect(provider.resolve(url)).rejects.toBe(providerError);
    expect(runMetadata).toHaveBeenCalledTimes(2);
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
