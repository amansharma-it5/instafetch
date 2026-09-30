import type { YouTubeRoute } from '@instafetch/shared';
import { randomUUID } from 'node:crypto';
import type { InternalMediaItem, NormalizedMediaType } from './normalize-instagram.js';

const VIDEO_EXTENSIONS = new Set(['avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm']);
const AUDIO_EXTENSIONS = new Set(['aac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'webm']);
const MAX_DURATION_SECONDS = 20 * 60;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_PREFERRED_HEIGHT = 720;

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
  return typeof value === 'string' && value !== 'none' ? value : null;
}
function isDirect(format: Record<string, unknown>): boolean {
  const protocol = String(format.protocol ?? '').toLowerCase();
  const url = String(format.url ?? '').toLowerCase();
  return !protocol.startsWith('m3u8') && !protocol.startsWith('m3u8_native') && !url.includes('.m3u8');
}
function isVideo(format: Record<string, unknown>): boolean {
  return isDirect(format) && Boolean(stringValue(format.url)) && (Boolean(codec(format, 'vcodec')) || (!codec(format, 'acodec') && VIDEO_EXTENSIONS.has(String(format.ext ?? '').toLowerCase())));
}
function isAudio(format: Record<string, unknown>): boolean {
  return isDirect(format) && Boolean(stringValue(format.url)) && (Boolean(codec(format, 'acodec')) && !codec(format, 'vcodec') || AUDIO_EXTENSIONS.has(String(format.ext ?? '').toLowerCase()));
}
function area(format: Record<string, unknown>): number { return (dimension(format.width) ?? 0) * (dimension(format.height) ?? 0); }
function height(format: Record<string, unknown>): number { return dimension(format.height) ?? 0; }
function mp4H264Score(format: Record<string, unknown>): number {
  const ext = String(format.ext ?? '').toLowerCase();
  const vcodec = String(format.vcodec ?? '').toLowerCase();
  const acodec = String(format.acodec ?? '').toLowerCase();
  return (ext === 'mp4' ? 100000000 : 0) + (vcodec.startsWith('avc') || vcodec.includes('h264') ? 10000000 : 0) + (acodec.startsWith('mp4a') || acodec.includes('aac') ? 1000000 : 0);
}
function compareVideo(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return (mp4H264Score(right) - mp4H264Score(left)) || (area(right) - area(left)) || ((numberValue(right.tbr) ?? 0) - (numberValue(left.tbr) ?? 0));
}
function compareAudio(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const preferred = (format: Record<string, unknown>) => String(format.ext ?? '').toLowerCase() === 'm4a' ? 1 : 0;
  return (preferred(right) - preferred(left)) || ((numberValue(right.abr) ?? numberValue(right.tbr) ?? 0) - (numberValue(left.abr) ?? numberValue(left.tbr) ?? 0));
}
function estimatedSize(format: Record<string, unknown>): number | null {
  return numberValue(format.filesize) ?? numberValue(format.filesize_approx);
}
function fitsLimit(video: Record<string, unknown>, audio?: Record<string, unknown>): boolean {
  const videoSize = estimatedSize(video);
  const audioSize = audio ? estimatedSize(audio) : null;
  return videoSize === null && audioSize === null ? true : (videoSize ?? 0) + (audioSize ?? 0) <= MAX_FILE_BYTES;
}
function item(video: Record<string, unknown>, audio: Record<string, unknown> | undefined, route: YouTubeRoute, durationSeconds: number | null): InternalMediaItem {
  const width = dimension(video.width);
  const height = dimension(video.height);
  const filesize = numberValue(video.filesize) ?? numberValue(video.filesize_approx);
  const audioFilesize = audio ? numberValue(audio.filesize) ?? numberValue(audio.filesize_approx) : null;
  if ((filesize ?? 0) + (audioFilesize ?? 0) > MAX_FILE_BYTES) throw new YouTubeMetadataError('FILE_TOO_LARGE', 'The selected media exceeds the file limit');
  const extension = stringValue(video.ext)?.toLowerCase() ?? 'mp4';
  return {
    id: randomUUID(), type: 'video' as NormalizedMediaType, width, height,
    extension, qualityLabel: width !== null && height !== null ? `${width}x${height}` : 'unknown',
    filesize, audioFilesize, providerUrl: stringValue(video.url)!, audioProviderUrl: audio ? stringValue(audio.url) : null,
    videoCodec: codec(video, 'vcodec'), audioCodec: codec(audio ?? video, 'acodec'), thumbnailUrl: stringValue(video.thumbnail),
    platform: 'youtube', durationSeconds, sourceType: route === 'short' ? 'youtube_short' : 'youtube_video',
    hasVideo: true, hasAudio: Boolean(codec(video, 'acodec') || audio), container: extension,
  };
}

export function normalizeYouTubeMetadata(metadata: Record<string, unknown>, route: YouTubeRoute): { sourceType: 'youtube_video' | 'youtube_short'; title: string | null; author: string | null; thumbnailUrl: string | null; items: InternalMediaItem[]; isCarousel: false; itemCount: 1; resolvedItemCount: 1; partial: false; warning: null } {
  const duration = numberValue(metadata.duration);
  if (duration !== null && duration > MAX_DURATION_SECONDS) throw new YouTubeMetadataError('MEDIA_TOO_LONG', 'YouTube videos over 20 minutes are not supported');
  if (metadata.is_live === true || (typeof metadata.live_status === 'string' && metadata.live_status !== 'not_live')) throw new YouTubeMetadataError('LIVE_NOT_AVAILABLE', 'Live streams are not supported');
  if (metadata.age_limit && Number(metadata.age_limit) > 0) throw new YouTubeMetadataError('AGE_RESTRICTED', 'Age-restricted media is not available anonymously');
  if (metadata.has_drm === true || metadata.drm === true) throw new YouTubeMetadataError('DRM_UNSUPPORTED', 'DRM-protected media is not supported');
  const formats = records(metadata.formats);
  const videos = formats.filter(isVideo).concat(isVideo(metadata) ? [metadata] : []).sort(compareVideo);
  const audioFormats = formats.filter(isAudio).sort(compareAudio);
  const bestAudio = audioFormats[0];
  const preferredVideos = videos.filter((format) => height(format) > 0 && height(format) <= MAX_PREFERRED_HEIGHT);
  const candidates = (preferredVideos.length > 0 ? preferredVideos : videos).sort(compareVideo);
  const combined = candidates.find((format) => Boolean(codec(format, 'acodec')) && fitsLimit(format));
  const selectedVideo = combined ?? candidates.find((format) => fitsLimit(format, bestAudio)) ?? candidates[0];
  if (!selectedVideo) throw new YouTubeMetadataError('UNSUPPORTED_MEDIA', 'No downloadable video format was exposed');
  const audio = combined ? undefined : bestAudio;
  if (!combined && !audio) throw new YouTubeMetadataError('UNSUPPORTED_MEDIA', 'No downloadable audio format was exposed');
  const media = item(selectedVideo, audio, route, duration);
  return { sourceType: media.sourceType as 'youtube_video' | 'youtube_short', title: stringValue(metadata.title), author: stringValue(metadata.uploader, metadata.channel, metadata.creator), thumbnailUrl: stringValue(metadata.thumbnail), items: [media], isCarousel: false, itemCount: 1, resolvedItemCount: 1, partial: false, warning: null };
}
