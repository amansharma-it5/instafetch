import { describe, expect, it } from 'vitest';
import { parseYouTubeUrl, safeParseYouTubeUrl } from './youtube-url';

describe('YouTube URL validation', () => {
  it('canonicalizes watch URLs and strips tracking/list parameters', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&utm_source=test').canonicalUrl)
      .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
  it('accepts short links and Shorts', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?si=abc').route).toBe('video');
    expect(parseYouTubeUrl('https://m.youtube.com/shorts/dQw4w9WgXcQ').route).toBe('short');
  });
  it('rejects playlist-only links with a dedicated code', () => {
    const result = safeParseYouTubeUrl('https://www.youtube.com/playlist?list=PL1234567890');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PLAYLIST_NOT_SUPPORTED');
    const watchPlaylist = safeParseYouTubeUrl('https://www.youtube.com/watch?list=PL1234567890');
    expect(watchPlaylist.success).toBe(false);
    if (!watchPlaylist.success) expect(watchPlaylist.error.code).toBe('PLAYLIST_NOT_SUPPORTED');
  });
  it.each([
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&v=other',
    'https://youtube-nocookie.com/watch?v=dQw4w9WgXcQ',
    'https://googlevideo.com/video.mp4',
    'javascript:alert(1)',
  ])('rejects unsafe or malformed input: %s', (url) => {
    expect(safeParseYouTubeUrl(url).success).toBe(false);
  });
});
