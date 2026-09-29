import { describe, expect, it, vi } from 'vitest';
import { YtDlpYouTubeProvider } from './YtDlpYouTubeProvider';

describe('YtDlpYouTubeProvider', () => {
  it('passes only the validated canonical URL to the metadata runner', async () => {
    const runMetadata = vi.fn(async () => ({ id: 'dQw4w9WgXcQ' }));
    const provider = new YtDlpYouTubeProvider({ runMetadata });
    const url = { platform: 'youtube' as const, canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', host: 'www.youtube.com', route: 'video' as const, identifier: 'dQw4w9WgXcQ' };
    await provider.resolve(url);
    expect(runMetadata).toHaveBeenCalledWith(url.canonicalUrl, expect.any(Object));
    expect(provider.isAvailable()).toBe(true);
  });
});
