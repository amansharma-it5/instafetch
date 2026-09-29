import { SITE_URL, siteAssetUrl } from "./site-config";
import { translate, type Locale } from "./i18n";

export type MetadataPath =
  "/" | "/privacy" | "/terms" | "/disclaimer" | "/contact";

function normalizePath(path: string): MetadataPath {
  const value = path.replace(/\/+$/, "") || "/";
  return value === "/privacy" ||
    value === "/terms" ||
    value === "/disclaimer" ||
    value === "/contact"
    ? value
    : "/";
}

export function canonicalUrlForPath(path: string, siteUrl = SITE_URL): string {
  const normalized = normalizePath(path);
  return `${siteUrl}${normalized === "/" ? "/" : normalized}`;
}

export function metadataForPath(path: string, locale: Locale = "en") {
  const normalized = normalizePath(path);
  const key = normalized === "/" ? "meta.home" : `meta.${normalized.slice(1)}`;
  return {
    title: translate(locale, `${key}.title`),
    description: translate(locale, `${key}.description`),
  };
}

function ensureMeta(
  selector: string,
  attributes: Record<string, string>,
  content: string,
) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) =>
    element?.setAttribute(name, value),
  );
  element.setAttribute("content", content);
}

function ensureLink(selector: string, rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(selector);
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
}

export function applyPageMetadata(path: string, locale: Locale) {
  const metadata = metadataForPath(path, locale);
  const url = canonicalUrlForPath(path);
  document.title = metadata.title;
  ensureMeta(
    'meta[name="description"]',
    { name: "description" },
    metadata.description,
  );
  ensureMeta('meta[name="robots"]', { name: "robots" }, "index, follow");
  ensureMeta('meta[property="og:type"]', { property: "og:type" }, "website");
  ensureMeta('meta[property="og:url"]', { property: "og:url" }, url);
  ensureMeta(
    'meta[property="og:title"]',
    { property: "og:title" },
    metadata.title,
  );
  ensureMeta(
    'meta[property="og:description"]',
    { property: "og:description" },
    metadata.description,
  );
  ensureMeta(
    'meta[property="og:site_name"]',
    { property: "og:site_name" },
    "InstaFetch",
  );
  ensureMeta(
    'meta[property="og:image"]',
    { property: "og:image" },
    siteAssetUrl("/social-preview.png"),
  );
  ensureMeta(
    'meta[property="og:image:alt"]',
    { property: "og:image:alt" },
    "InstaFetch public Instagram and YouTube downloader",
  );
  ensureMeta('meta[name="twitter:card"]', { name: "twitter:card" }, "summary");
  ensureMeta(
    'meta[name="twitter:title"]',
    { name: "twitter:title" },
    metadata.title,
  );
  ensureMeta(
    'meta[name="twitter:description"]',
    { name: "twitter:description" },
    metadata.description,
  );
  ensureMeta(
    'meta[name="twitter:image"]',
    { name: "twitter:image" },
    siteAssetUrl("/social-preview.png"),
  );
  ensureMeta(
    'meta[name="twitter:image:alt"]',
    { name: "twitter:image:alt" },
    "InstaFetch public Instagram and YouTube downloader",
  );
  ensureLink('link[rel="canonical"]', "canonical", url);
}
