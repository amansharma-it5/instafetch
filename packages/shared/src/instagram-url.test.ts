import { describe, expect, it } from 'vitest';
import { parseInstagramUrl, safeParseInstagramUrl } from './instagram-url';

describe('Instagram URL validation', () => {
  it.each([
    ['https://instagram.com/p/ABC_123/', 'post'],
    ['https://www.instagram.com/reel/ABC-123/', 'reel'],
    ['https://www.instagram.com/reels/ABC-123/', 'reel'],
    ['https://www.instagram.com/tv/ABC-123/', 'tv'],
    ['https://www.instagram.com/stories/public.user/123456789/', 'story'],
  ] as const)('accepts %s as %s', (url, route) => {
    expect(parseInstagramUrl(url).route).toBe(route);
  });

  it('canonicalizes the host and removes query strings', () => {
    expect(parseInstagramUrl('https://instagram.com/p/ABC_123/?utm_source=test#fragment')).toMatchObject({
      canonicalUrl: 'https://www.instagram.com/p/ABC_123/',
      host: 'instagram.com',
      identifier: 'ABC_123',
    });
  });

  it.each([
    'http://www.instagram.com/p/ABC_123/',
    'https://example.com/p/ABC_123/',
    'https://www.instagram.com/explore/',
    'https://user:password@www.instagram.com/p/ABC_123/',
    'https://www.instagram.com:8443/p/ABC_123/',
    'https://www.instagram.com/stories/public.user/',
  ])('rejects unsupported or unsafe URL %s', (url) => {
    expect(safeParseInstagramUrl(url).success).toBe(false);
  });
});
