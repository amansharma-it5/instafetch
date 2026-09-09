import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_URL, normalizeSiteUrl } from './site-config';

describe('site URL configuration', () => {
  it('uses a bare configured origin for SEO metadata', () => {
    expect(normalizeSiteUrl('https://instafetch.example/')).toBe('https://instafetch.example');
  });

  it('falls back safely when the value is missing or not an origin', () => {
    expect(normalizeSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl('https://instafetch.example/path')).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl('javascript:alert(1)')).toBe(DEFAULT_SITE_URL);
  });
});
