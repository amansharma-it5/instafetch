import type { InstagramRoute } from '@instafetch/shared';
import { randomUUID } from 'node:crypto';

const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']);
const VIDEO_EXTENSIONS = new Set(['avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm']);
const AUDIO_EXTENSIONS = new Set(['aac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav']);

export type NormalizedMediaType = 'video' | 'photo';

export interface InternalMediaItem {
  id: string;
  type: NormalizedMediaType;
  width: number | null;
  height: number | null;
  extension: string;
  qualityLabel: string;
  filesize: number | null;
  providerUrl: string;
  audioProviderUrl?: string | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  thumbnailUrl: string | null;
  /** Platform-specific metadata used by the shared materializer. */
  platform?: 'instagram' | 'youtube';
  audioFilesize?: number | null;
  durationSeconds?: number | null;
  hasVideo?: boolean;
  hasAudio?: boolean;
  container?: string | null;
  sourceType?: string;
}

export interface NormalizedInstagramResult {
  sourceType: InstagramRoute;
  title: string | null;
  author: string | null;
  thumbnailUrl: string | null;
  isCarousel: boolean;
  /** Number of provider entries exposed for this result. */
  itemCount: number;
  /** Number of provider entries that yielded a genuine downloadable item. */
  resolvedItemCount: number;
  /** True when at least one carousel entry could not be normalized. */
  partial: boolean;
  warning: string | null;
  items: InternalMediaItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(...values: unknown[]): string | null {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function dimension(value: unknown): number | null {
  const number = numberValue(value);
  return number === null ? null : Math.round(number);
}

function isVideoFormat(format: Record<string, unknown>): boolean {
  const url = stringValue(format.url);
  if (!url) {
    return false;
  }
  const codec = typeof format.vcodec === 'string' ? format.vcodec.toLowerCase() : '';
  const extension = typeof format.ext === 'string' ? format.ext.toLowerCase() : '';
  return (codec.length > 0 && codec !== 'none') || VIDEO_EXTENSIONS.has(extension);
}

function codecValue(format: Record<string, unknown>, key: 'vcodec' | 'acodec'): string | null {
  const value = format[key];
  return typeof value === 'string' && value.trim().length > 0 && value.toLowerCase() !== 'none'
    ? value
    : null;
}

function isAudioFormat(format: Record<string, unknown>): boolean {
  const url = stringValue(format.url);
  if (!url) {
    return false;
  }
  const extension = typeof format.ext === 'string' ? format.ext.toLowerCase() : '';
  return Boolean(codecValue(format, 'acodec')) && !codecValue(format, 'vcodec')
    || AUDIO_EXTENSIONS.has(extension);
}

function isImageFormat(format: Record<string, unknown>): boolean {
  const url = stringValue(format.url);
  if (!url) {
    return false;
  }
  const extension = typeof format.ext === 'string' ? format.ext.toLowerCase() : '';
  return IMAGE_EXTENSIONS.has(extension);
}

function formatArea(format: Record<string, unknown>): number {
  return (dimension(format.width) ?? 0) * (dimension(format.height) ?? 0);
}

function compareVideoFormats(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const areaDifference = formatArea(right) - formatArea(left);
  if (areaDifference !== 0) {
    return areaDifference;
  }
  const heightDifference = (dimension(right.height) ?? 0) - (dimension(left.height) ?? 0);
  if (heightDifference !== 0) {
    return heightDifference;
  }
  const leftMp4 = typeof left.ext === 'string' && left.ext.toLowerCase() === 'mp4' ? 1 : 0;
  const rightMp4 = typeof right.ext === 'string' && right.ext.toLowerCase() === 'mp4' ? 1 : 0;
  return rightMp4 - leftMp4;
}

function compareImageFormats(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const areaDifference = formatArea(right) - formatArea(left);
  if (areaDifference !== 0) {
    return areaDifference;
  }
  return (dimension(right.height) ?? 0) - (dimension(left.height) ?? 0);
}

function itemFromFormat(
  format: Record<string, unknown>,
  type: NormalizedMediaType,
  audioFormat?: Record<string, unknown>,
): InternalMediaItem | null {
  const providerUrl = stringValue(format.url);
  if (!providerUrl) {
    return null;
  }
  const extension = stringValue(format.ext)?.toLowerCase() ?? (type === 'video' ? 'mp4' : 'jpg');
  const width = dimension(format.width);
  const height = dimension(format.height);
  return {
    id: randomUUID(),
    type,
    width,
    height,
    extension,
    qualityLabel: width !== null && height !== null ? `${width}x${height}` : 'unknown',
    filesize: numberValue(format.filesize) ?? numberValue(format.filesize_approx),
    providerUrl,
    audioProviderUrl: audioFormat ? stringValue(audioFormat.url) : null,
    videoCodec: codecValue(format, 'vcodec'),
    audioCodec: codecValue(audioFormat ?? format, 'acodec'),
    thumbnailUrl: stringValue(format.thumbnail),
    platform: 'instagram',
    audioFilesize: audioFormat ? numberValue(audioFormat.filesize) ?? numberValue(audioFormat.filesize_approx) : null,
    hasVideo: type === 'video',
    hasAudio: Boolean(codecValue(audioFormat ?? format, 'acodec')),
    container: extension,
  };
}

function compareAudioFormats(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const bitrateDifference = (numberValue(right.abr) ?? numberValue(right.tbr) ?? 0)
    - (numberValue(left.abr) ?? numberValue(left.tbr) ?? 0);
  if (bitrateDifference !== 0) {
    return bitrateDifference;
  }
  const leftM4a = typeof left.ext === 'string' && left.ext.toLowerCase() === 'm4a' ? 1 : 0;
  const rightM4a = typeof right.ext === 'string' && right.ext.toLowerCase() === 'm4a' ? 1 : 0;
  return rightM4a - leftM4a;
}

function normalizeEntry(entry: Record<string, unknown>): InternalMediaItem | null {
  const formats = records(entry.formats);
  const videoCandidates = formats.filter(isVideoFormat);
  if (isVideoFormat(entry)) {
    videoCandidates.push(entry);
  }
  const combinedFormat = videoCandidates
    .filter((format) => Boolean(codecValue(format, 'acodec')))
    .sort(compareVideoFormats)[0];
  if (combinedFormat) {
    return itemFromFormat(combinedFormat, 'video');
  }

  const videoFormat = videoCandidates.sort(compareVideoFormats)[0];
  if (videoFormat) {
    const audioFormat = formats.filter(isAudioFormat).sort(compareAudioFormats)[0];
    return itemFromFormat(videoFormat, 'video', audioFormat);
  }

  const imageFormat = formats.filter(isImageFormat).sort(compareImageFormats)[0] ?? (isImageFormat(entry) ? entry : undefined);
  return imageFormat ? itemFromFormat(imageFormat, 'photo') : null;
}

function entriesFromMetadata(metadata: Record<string, unknown>): { entries: Array<Record<string, unknown>>; itemCount: number; isCarousel: boolean } {
  if (Array.isArray(metadata.entries)) {
    return {
      entries: metadata.entries.map((entry) => isRecord(entry) ? entry : {}),
      itemCount: metadata.entries.length,
      isCarousel: true,
    };
  }
  return { entries: [metadata], itemCount: 1, isCarousel: false };
}

export function normalizeInstagramMetadata(
  metadata: Record<string, unknown>,
  sourceType: InstagramRoute,
): NormalizedInstagramResult {
  const { entries: rawEntries, itemCount, isCarousel } = entriesFromMetadata(metadata);
  const items = rawEntries.map(normalizeEntry).filter((item): item is InternalMediaItem => item !== null);
  if (items.length === 0) {
    throw new Error('Provider returned no downloadable media candidates');
  }

  const partial = isCarousel && items.length < itemCount;

  return {
    sourceType,
    title: stringValue(metadata.title),
    author: stringValue(metadata.uploader, metadata.channel, metadata.creator, metadata.uploader_id),
    thumbnailUrl: stringValue(metadata.thumbnail),
    isCarousel,
    itemCount,
    resolvedItemCount: items.length,
    partial,
    warning: partial ? 'Some carousel items were unavailable.' : null,
    items,
  };
}
