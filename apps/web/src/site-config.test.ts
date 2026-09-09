import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_URL, normalizeSiteUrl, siteAssetUrl } from './site-config';

describe('site URL configuration', () => {
  it('uses a bare configured origin for SEO metadata', () => {
    expect(normalizeSiteUrl('https://instafetch.example/')).toBe('https://instafetch.example');
  });

  it('falls back safely when the value is missing or not an origin', () => {
    expect(normalizeSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl('https://instafetch.example/path')).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl('javascript:alert(1)')).toBe(DEFAULT_SITE_URL);
  });

  it('builds asset URLs from the configured site origin', () => {
    expect(siteAssetUrl('/social-preview.svg', 'https://instafetch.example')).toBe(
      'https://instafetch.example/social-preview.svg',
    );
    expect(siteAssetUrl('site.webmanifest', 'https://instafetch.example')).toBe(
      'https://instafetch.example/site.webmanifest',
    );
  });
});
