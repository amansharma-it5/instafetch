export const CRAWLABLE_PATHS = [
  '/',
  '/privacy',
  '/terms',
  '/disclaimer',
  '/contact',
] as const;

function trimTrailingSlash(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '');
}

export function robotsTxt(siteUrl: string): string {
  const origin = trimTrailingSlash(siteUrl);
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /preview',
    'Disallow: /download',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function sitemapXml(siteUrl: string): string {
  const origin = trimTrailingSlash(siteUrl);
  const urls = CRAWLABLE_PATHS
    .map((path) => `  <url><loc>${origin}${path === '/' ? '/' : path}</loc></url>`)
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');
}
