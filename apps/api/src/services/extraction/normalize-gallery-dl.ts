import { randomUUID } from 'node:crypto';
import type { InstagramRoute } from '@instafetch/shared';
import type { GalleryDlProcessError } from './gallery-dl-process.js';

const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']);

export interface GalleryDlMediaRecord {
  url: string;
  extension: string;
  width: number | null;
  height: number | null;
  filesize: number | null;
  thumbnail: string | null;
  title: string | null;
  author: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(...values: unknown[]): string | null {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null;
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value);
  }
  return null;
}

function extensionFromRecord(record: Record<string, unknown>, url: string): string | null {
  const explicit = stringValue(record.extension, record.ext, record.image_extension)?.toLowerCase().replace(/^\./, '');
  if (explicit && IMAGE_EXTENSIONS.has(explicit)) return explicit;
  const filename = stringValue(record.filename, record.name);
  const filenameExtension = filename?.split('.').pop()?.toLowerCase();
  if (filenameExtension && IMAGE_EXTENSIONS.has(filenameExtension)) return filenameExtension;
  try {
    const pathExtension = new URL(url).pathname.split('.').pop()?.toLowerCase();
    return pathExtension && IMAGE_EXTENSIONS.has(pathExtension) ? pathExtension : null;
  } catch {
    return null;
  }
}

function isRejectedAsset(record: Record<string, unknown>): boolean {
  const role = stringValue(record.role, record.kind, record.asset_type, record.media_type)?.toLowerCase();
  if (role && /thumbnail|avatar|profile|opengraph|open_graph/.test(role)) return true;
  return record.is_thumbnail === true || record.thumbnail === true || record.avatar === true;
}

function directMediaRecord(record: Record<string, unknown>): GalleryDlMediaRecord | null {
  if (isRejectedAsset(record)) return null;
  const url = stringValue(record.url, record.image_url, record.media_url, record.download_url);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const extension = extensionFromRecord(record, url);
  if (!extension) return null;
  return {
    url,
    extension,
    width: numberValue(record.width, record.image_width, record.width_px),
    height: numberValue(record.height, record.image_height, record.height_px),
    filesize: numberValue(record.filesize, record.size),
    thumbnail: stringValue(record.thumbnail_url, record.preview_url),
    title: stringValue(record.title, record.caption),
    author: stringValue(record.uploader, record.author, record.username, record.user),
  };
}

function walk(value: unknown, output: GalleryDlMediaRecord[], errors: string[]): void {
  if (Array.isArray(value)) {
    if (value.length === 2 && typeof value[0] === 'number' && isRecord(value[1])) {
      walk(value[1], output, errors);
      return;
    }
    for (const child of value) walk(child, output, errors);
    return;
  }
  if (!isRecord(value)) return;
  const error = stringValue(value.error, value.exception);
  if (error || typeof value.message === 'string' && !directMediaRecord(value)) {
    const message = stringValue(value.message, error);
    if (message) errors.push(message);
  }
  const media = directMediaRecord(value);
  if (media) {
    output.push(media);
    return;
  }
  for (const child of Object.values(value)) walk(child, output, errors);
}

export interface NormalizedGalleryMetadata {
  extractor_key: 'gallery-dl';
  title?: string;
  uploader?: string;
  formats?: Array<Record<string, unknown>>;
  entries?: Array<Record<string, unknown>>;
  _type?: 'playlist';
}

export function normalizeGalleryDlMetadata(value: unknown, _sourceType: InstagramRoute): NormalizedGalleryMetadata {
  const records: GalleryDlMediaRecord[] = [];
  const errors: string[] = [];
  walk(value, records, errors);
  const unique = records.filter((record, index) => records.findIndex((candidate) => candidate.url === record.url) === index);
  if (unique.length === 0) {
    const detail = errors[0] ?? 'gallery-dl returned no genuine image metadata';
    throw new Error(detail);
  }

  const formats = (record: GalleryDlMediaRecord) => [{
    url: record.url,
    ext: record.extension,
    width: record.width,
    height: record.height,
    filesize: record.filesize,
    vcodec: 'none',
    thumbnail: record.thumbnail,
  }];
  const first = unique[0];
  const metadata: NormalizedGalleryMetadata = {
    extractor_key: 'gallery-dl',
    title: first.title ?? undefined,
    uploader: first.author ?? undefined,
  };
  if (unique.length === 1 && errors.length === 0) {
    metadata.formats = formats(first);
  } else {
    metadata._type = 'playlist';
    metadata.entries = [
      ...unique.map((record) => ({ formats: formats(record), title: record.title, uploader: record.author })),
      ...errors.map(() => ({})),
    ];
  }
  return metadata;
}

export function galleryDlErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export function isGalleryDlProcessError(value: unknown): value is GalleryDlProcessError {
  return value instanceof Error && value.name === 'GalleryDlProcessError';
}

export function createGalleryMediaId(): string {
  return randomUUID();
}
