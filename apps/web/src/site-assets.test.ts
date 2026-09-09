import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { CRAWLABLE_PATHS, robotsTxt, sitemapXml } from './site-assets';

describe('crawlable site assets', () => {
  const siteUrl = 'https://instafetch.example';

  it('generates robots.txt from the configured origin', () => {
    const content = robotsTxt(siteUrl);
    expect(content).toContain(`Sitemap: ${siteUrl}/sitemap.xml`);
    expect(content).toContain('Disallow: /api/');
    expect(content).not.toContain('__INSTAFETCH_SITE_URL__');
  });

  it('generates only intended public sitemap routes', () => {
    const content = sitemapXml(siteUrl);
    expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(content).not.toContain('/api/');
    expect(content).not.toContain('/preview');
    expect(content).not.toContain('/download');
    CRAWLABLE_PATHS.forEach((path) => {
      expect(content).toContain(`${siteUrl}${path === '/' ? '/' : path}`);
    });
    expect(content).not.toContain('__INSTAFETCH_SITE_URL__');
  });

  it('keeps the lightweight original branding assets available', () => {
    for (const asset of ['favicon.svg', 'social-preview.svg', 'social-preview.png', 'site.webmanifest']) {
      const path = new URL(`../public/${asset}`, import.meta.url);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(0);
    }
    const manifest = JSON.parse(readFileSync(new URL('../public/site.webmanifest', import.meta.url), 'utf8')) as { name?: string; icons?: unknown[] };
    expect(manifest.name).toBe('InstaFetch');
    expect(manifest.icons?.length).toBe(1);
  });
});
