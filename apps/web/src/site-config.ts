export const DEFAULT_SITE_URL = 'https://instafetch.pages.dev';

/**
 * Keep SEO origins predictable: only a bare HTTP(S) origin is accepted.
 * Invalid or missing build-time values fall back to the current Pages origin.
 */
export function normalizeSiteUrl(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate) return DEFAULT_SITE_URL;

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash) {
      return DEFAULT_SITE_URL;
    }
    return parsed.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

const buildSiteUrl = typeof import.meta.env === 'object' ? import.meta.env.VITE_SITE_URL : undefined;

export const SITE_URL = normalizeSiteUrl(buildSiteUrl);

/** Build an absolute URL for a static site asset from the configured origin. */
export function siteAssetUrl(path: string, siteUrl = SITE_URL): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${siteUrl}${normalizedPath}`;
}
