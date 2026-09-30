import type { YouTubeRoute } from '@instafetch/shared';
import { randomUUID } from 'node:crypto';
import type { InternalMediaItem } from './normalize-instagram.js';

const MAX_DURATION_SECONDS = 20 * 60;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_OPTIONS = 24;
const MAX_AUDIO_OPTIONS = 12;
const MP3_BITRATES = [128, 192, 320] as const;

export type YouTubeOptionKind = 'video' | 'audio' | 'mp3';
export type MediaSizeKind = 'exact' | 'estimated' | 'unknown';

export interface NormalizedYouTubeResult {
  sourceType: 'youtube_video' | 'youtube_short';
  title: string | null;
  author: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  previewItemId: string;
  items: InternalMediaItem[];
  isCarousel: false;
  itemCount: 1;
  resolvedItemCount: 1;
  partial: false;
  warning: null;
}

export class YouTubeMetadataError extends Error {
  constructor(public readonly code: 'MEDIA_TOO_LONG' | 'PRIVATE_MEDIA' | 'AGE_RESTRICTED' | 'LIVE_NOT_AVAILABLE' | 'DRM_UNSUPPORTED' | 'UNSUPPORTED_MEDIA' | 'FILE_TOO_LARGE', message: string) {
    super(message);
    this.name = 'YouTubeMetadataError';
  }
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function records(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(record) : []; }
function stringValue(...values: unknown[]): string | null { return values.find((v): v is string => typeof v === 'string' && v.trim().length > 0) ?? null; }
function numberValue(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
function dimension(value: unknown): number | null { const n = numberValue(value); return n === null ? null : Math.round(n); }
function codec(format: Record<string, unknown>, key: 'vcodec' | 'acodec'): string | null {
  const value = format[key];
  return typeof value === 'string' && value.trim().length > 0 && value.toLowerCase() !== 'none' ? value : null;
}
function bitrate(format: Record<string, unknown>, key: 'abr' | 'tbr'): number | null {
  const value = numberValue(format[key]);
  return value !== null && value > 0 ? value : null;
}
function isDirect(format: Record<string, unknown>): boolean {
  const protocol = String(format.protocol ?? '').toLowerCase();
  const url = String(format.url ?? '').toLowerCase();
  return !protocol.startsWith('m3u8') && !protocol.startsWith('m3u8_native') && !url.includes('.m3u8');
}
function isVideo(format: Record<string, unknown>): boolean {
  return isDirect(format) && Boolean(stringValue(format.url)) && Boolean(codec(format, 'vcodec'));
}
function isAudio(format: Record<string, unknown>): boolean {
  return isDirect(format) && Boolean(stringValue(format.url)) && Boolean(codec(format, 'acodec')) && !codec(format, 'vcodec');
}
function area(format: Record<string, unknown>): number { return (dimension(format.width) ?? 0) * (dimension(format.height) ?? 0); }
function height(format: Record<string, unknown>): number { return dimension(format.height) ?? 0; }
function compatibilityScore(format: Record<string, unknown>): number {
  const ext = String(format.ext ?? '').toLowerCase();
  const vcodec = String(format.vcodec ?? '').toLowerCase();
  const acodec = String(format.acodec ?? '').toLowerCase();
  return (ext === 'mp4' ? 100_000_000 : 0)
    + (vcodec.startsWith('avc') || vcodec.includes('h264') ? 10_000_000 : 0)
    + (acodec.startsWith('mp4a') || acodec.includes('aac') ? 1_000_000 : 0)
    + (codec(format, 'acodec') ? 100_000 : 0);
}
function compareVideo(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return (compatibilityScore(right) - compatibilityScore(left))
    || (area(right) - area(left))
    || ((bitrate(right, 'tbr') ?? 0) - (bitrate(left, 'tbr') ?? 0));
}
function compareAudio(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const preferred = (format: Record<string, unknown>) => String(format.ext ?? '').toLowerCase() === 'm4a' ? 1 : 0;
  return (preferred(right) - preferred(left))
    || ((bitrate(right, 'abr') ?? bitrate(right, 'tbr') ?? 0) - (bitrate(left, 'abr') ?? bitrate(left, 'tbr') ?? 0));
}

interface SizeResult { bytes: number | null; kind: MediaSizeKind; }

function sizeFor(format: Record<string, unknown>, durationSeconds: number | null, bitrateKey: 'abr' | 'tbr'): SizeResult {
  const exact = numberValue(format.filesize);
  if (exact !== null && exact > 0) return { bytes: Math.round(exact), kind: 'exact' };
  const approximate = numberValue(format.filesize_approx);
  if (approximate !== null && approximate > 0) return { bytes: Math.round(approximate), kind: 'estimated' };
  const kbps = bitrate(format, bitrateKey);
  if (kbps !== null && durationSeconds !== null && durationSeconds > 0) {
    return { bytes: Math.round((kbps * 1000 / 8) * durationSeconds), kind: 'estimated' };
  }
  return { bytes: null, kind: 'unknown' };
}

function combinedSize(video: SizeResult, audio?: SizeResult): SizeResult {
  if (!audio) return video;
  if (video.bytes === null || audio.bytes === null) return { bytes: null, kind: 'unknown' };
  return { bytes: video.bytes + audio.bytes, kind: video.kind === 'exact' && audio.kind === 'exact' ? 'exact' : 'estimated' };
}

function withinLimit(size: SizeResult): boolean { return size.bytes === null || size.bytes <= MAX_FILE_BYTES; }
function optionLabel(size: number): string { return `${size}p`; }
function compatibilityLabel(video: Record<string, unknown>, requiresMux: boolean): string {
  if (requiresMux) return 'High quality · prepared on download';
  const ext = String(video.ext ?? '').toLowerCase();
  const vcodec = String(video.vcodec ?? '').toLowerCase();
  return ext === 'mp4' && (vcodec.includes('avc') || vcodec.includes('h264'))
    ? 'MP4 · broadly compatible'
    : `${ext.toUpperCase() || 'Source'} · source format`;
}

function videoItem(video: Record<string, unknown>, audio: Record<string, unknown> | undefined, route: YouTubeRoute, durationSeconds: number | null): InternalMediaItem {
  const width = dimension(video.width);
  const heightValue = dimension(video.height);
  const videoSize = sizeFor(video, durationSeconds, 'tbr');
  const audioSize = audio ? sizeFor(audio, durationSeconds, 'abr') : undefined;
  const size = combinedSize(videoSize, audioSize);
  if (!withinLimit(size)) throw new YouTubeMetadataError('FILE_TOO_LARGE', 'The selected media exceeds the file limit');
  const extension = stringValue(video.ext)?.toLowerCase() ?? 'mp4';
  const requiresMux = Boolean(audio);
  return {
    id: randomUUID(), type: 'video', width, height: heightValue, extension,
    qualityLabel: heightValue ? optionLabel(heightValue) : 'Source quality',
    filesize: size.bytes, sizeKind: size.kind, providerUrl: stringValue(video.url)!,
    audioProviderUrl: audio ? stringValue(audio.url) : null,
    videoCodec: codec(video, 'vcodec'), audioCodec: codec(audio ?? video, 'acodec'),
    thumbnailUrl: stringValue(video.thumbnail), platform: 'youtube', audioFilesize: audioSize?.bytes ?? null,
    durationSeconds, hasVideo: true, hasAudio: Boolean(codec(video, 'acodec') || audio), container: extension,
    optionKind: 'video', fps: numberValue(video.fps), bitrateKbps: bitrate(video, 'tbr'), requiresMux,
    compatibilityLabel: compatibilityLabel(video, requiresMux), sourceFormatId: stringValue(video.format_id),
    sourceType: route === 'short' ? 'youtube_short' : 'youtube_video',
  };
}

function audioItem(audio: Record<string, unknown>, route: YouTubeRoute, durationSeconds: number | null): InternalMediaItem {
  const extension = stringValue(audio.ext)?.toLowerCase() ?? 'm4a';
  const size = sizeFor(audio, durationSeconds, 'abr');
  if (!withinLimit(size)) throw new YouTubeMetadataError('FILE_TOO_LARGE', 'The selected media exceeds the file limit');
  const audioBitrate = bitrate(audio, 'abr') ?? bitrate(audio, 'tbr');
  return {
    id: randomUUID(), type: 'video', width: null, height: null, extension,
    qualityLabel: audioBitrate ? `${extension.toUpperCase()} · ${Math.round(audioBitrate)} kbps` : `${extension.toUpperCase()} · original`,
    filesize: size.bytes, sizeKind: size.kind, providerUrl: stringValue(audio.url)!, audioProviderUrl: null,
    videoCodec: null, audioCodec: codec(audio, 'acodec'), thumbnailUrl: stringValue(audio.thumbnail), platform: 'youtube',
    audioFilesize: size.bytes, durationSeconds, hasVideo: false, hasAudio: true, container: extension,
    optionKind: 'audio', bitrateKbps: audioBitrate, requiresMux: false,
    compatibilityLabel: extension === 'm4a' ? 'Original audio · broadly compatible' : 'Original source audio',
    sourceFormatId: stringValue(audio.format_id), sourceType: route === 'short' ? 'youtube_short' : 'youtube_video',
  };
}

function mp3Item(audio: Record<string, unknown>, targetKbps: number, route: YouTubeRoute, durationSeconds: number | null): InternalMediaItem {
  const size: SizeResult = durationSeconds !== null && durationSeconds > 0
    ? { bytes: Math.round((targetKbps * 1000 / 8) * durationSeconds), kind: 'estimated' }
    : { bytes: null, kind: 'unknown' };
  if (!withinLimit(size)) throw new YouTubeMetadataError('FILE_TOO_LARGE', 'The selected media exceeds the file limit');
  return {
    id: randomUUID(), type: 'video', width: null, height: null, extension: 'mp3', qualityLabel: `MP3 · ${targetKbps} kbps`,
    filesize: size.bytes, sizeKind: size.kind, providerUrl: stringValue(audio.url)!, audioProviderUrl: null,
    videoCodec: null, audioCodec: 'mp3', thumbnailUrl: stringValue(audio.thumbnail), platform: 'youtube',
    audioFilesize: size.bytes, durationSeconds, hasVideo: false, hasAudio: true, container: 'mp3', optionKind: 'mp3',
    bitrateKbps: targetKbps, requiresMux: false, requiresTranscode: true,
    compatibilityLabel: 'Transcoded on download · source-dependent quality', sourceFormatId: stringValue(audio.format_id),
    sourceType: route === 'short' ? 'youtube_short' : 'youtube_video',
  };
}

function bestAudioFormats(audioFormats: Record<string, unknown>[]): Record<string, unknown>[] {
  const byExtension = new Map<string, Record<string, unknown>>();
  for (const format of audioFormats) {
    const key = String(format.ext ?? 'audio').toLowerCase();
    const current = byExtension.get(key);
    if (!current || compareAudio(current, format) > 0) byExtension.set(key, format);
  }
  return [...byExtension.values()].sort(compareAudio).slice(0, MAX_AUDIO_OPTIONS);
}
function mp3Targets(audio: Record<string, unknown>): number[] {
  const sourceKbps = bitrate(audio, 'abr') ?? bitrate(audio, 'tbr');
  return MP3_BITRATES.filter((target) => sourceKbps === null || target <= sourceKbps + 8);
}

export function normalizeYouTubeMetadata(metadata: Record<string, unknown>, route: YouTubeRoute): NormalizedYouTubeResult {
  const duration = numberValue(metadata.duration);
  if (duration !== null && duration > MAX_DURATION_SECONDS) throw new YouTubeMetadataError('MEDIA_TOO_LONG', 'YouTube videos over 20 minutes are not supported');
  if (metadata.is_live === true || (typeof metadata.live_status === 'string' && metadata.live_status !== 'not_live')) throw new YouTubeMetadataError('LIVE_NOT_AVAILABLE', 'Live streams are not supported');
  if (metadata.age_limit && Number(metadata.age_limit) > 0) throw new YouTubeMetadataError('AGE_RESTRICTED', 'Age-restricted media is not available anonymously');
  if (metadata.has_drm === true || metadata.drm === true) throw new YouTubeMetadataError('DRM_UNSUPPORTED', 'DRM-protected media is not supported');

  const formats = records(metadata.formats);
  const videoFormats = formats.filter(isVideo).concat(isVideo(metadata) ? [metadata] : []);
  const audioFormats = formats.filter(isAudio).sort(compareAudio);
  const bestAudio = audioFormats[0];
  const byHeight = new Map<number, Record<string, unknown>>();
  for (const format of videoFormats) {
    const currentHeight = height(format);
    if (currentHeight <= 0) continue;
    const current = byHeight.get(currentHeight);
    if (!current || compareVideo(current, format) > 0) byHeight.set(currentHeight, format);
  }

  const videoItems: InternalMediaItem[] = [];
  for (const format of [...byHeight.entries()].sort(([left], [right]) => left - right).slice(0, MAX_VIDEO_OPTIONS).map(([, value]) => value)) {
    const audio = codec(format, 'acodec') ? undefined : bestAudio;
    try { videoItems.push(videoItem(format, audio, route, duration)); } catch (error) {
      if (!(error instanceof YouTubeMetadataError) || error.code !== 'FILE_TOO_LARGE') throw error;
    }
  }

  const audioItems: InternalMediaItem[] = [];
  for (const format of bestAudioFormats(audioFormats)) {
    try { audioItems.push(audioItem(format, route, duration)); } catch (error) {
      if (!(error instanceof YouTubeMetadataError) || error.code !== 'FILE_TOO_LARGE') throw error;
    }
  }
  if (bestAudio) {
    for (const target of mp3Targets(bestAudio)) {
      try { audioItems.push(mp3Item(bestAudio, target, route, duration)); } catch (error) {
        if (!(error instanceof YouTubeMetadataError) || error.code !== 'FILE_TOO_LARGE') throw error;
      }
    }
  }

  const items = [...videoItems, ...audioItems];
  if (items.length === 0) throw new YouTubeMetadataError('UNSUPPORTED_MEDIA', 'No downloadable public media format was exposed');
  // Keep the single preview deliberately lightweight. The selected download
  // option is still materialized only after the user chooses it; previewing a
  // 1080p/4K source must not silently turn resolution into a large mux job.
  const previewCandidates = videoItems.filter((item) => item.height !== null && item.height <= 360 && item.hasAudio);
  const previewItem = [...previewCandidates].sort((left, right) => (left.height ?? 0) - (right.height ?? 0))[0] ?? [...videoItems].sort((left, right) => (left.height ?? 0) - (right.height ?? 0))[0] ?? audioItems[0];
  if (!previewItem) throw new YouTubeMetadataError('UNSUPPORTED_MEDIA', 'No previewable public media format was exposed');
  return {
    sourceType: route === 'short' ? 'youtube_short' : 'youtube_video', title: stringValue(metadata.title),
    author: stringValue(metadata.uploader, metadata.channel, metadata.creator), thumbnailUrl: stringValue(metadata.thumbnail, previewItem.thumbnailUrl),
    durationSeconds: duration, previewItemId: previewItem.id, items, isCarousel: false, itemCount: 1, resolvedItemCount: 1, partial: false, warning: null,
  };
}
