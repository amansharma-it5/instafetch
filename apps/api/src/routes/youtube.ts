import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { parseYouTubeUrl, YouTubeUrlError } from '@instafetch/shared';
import type { YouTubeExtractionProvider } from '../services/extraction/YouTubeExtractionProvider.js';
import { normalizeYouTubeMetadata, YouTubeMetadataError } from '../services/extraction/normalize-youtube.js';
import type { InternalMediaItem } from '../services/extraction/normalize-instagram.js';
import { YtDlpProcessError } from '../services/extraction/yt-dlp-process.js';
import { ApiError } from '../services/errors.js';
import { ResolutionStore } from '../services/store/resolution-store.js';
import type { DownloadTokenService } from '../services/tokens/download-tokens.js';

const resolveSchema = z.object({ url: z.string().trim().min(1).max(2048) }).strict();
const prepareSchema = z.object({ jobId: z.string().uuid(), optionId: z.string().uuid() }).strict();

export interface YouTubeRouteDependencies { provider: YouTubeExtractionProvider; store: ResolutionStore; tokenService?: DownloadTokenService; }

interface PublicYouTubeItem {
  id: string;
  type: 'video';
  width: number | null;
  height: number | null;
  extension: string;
  qualityLabel: string;
  thumbnail: null;
  previewUrl: string;
  downloadUrl?: string;
  durationSeconds: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  container: string;
}

interface PublicYouTubeOption {
  optionId: string;
  kind: 'video' | 'audio';
  format: string;
  resolution: number | null;
  width: number | null;
  height: number | null;
  container: string;
  videoCodec: string | null;
  audioCodec: string | null;
  fps: number | null;
  filesizeBytes: number | null;
  filesizeApproximate: boolean;
  sizeBytes: number | null;
  sizeKind: 'exact' | 'estimated' | 'unknown';
  qualityLabel: string;
  hasAudio: boolean;
  requiresMux: boolean;
  compatibilityLabel: string;
  bitrateKbps: number | null;
}

function message(code: ApiError['code']): string {
  switch (code) {
    case 'INVALID_YOUTUBE_URL': return 'Enter a valid public YouTube video or Shorts URL';
    case 'PLAYLIST_NOT_SUPPORTED': return 'Playlist links are not supported. Open one video at a time.';
    case 'PRIVATE_MEDIA': return 'This YouTube video is private or unavailable';
    case 'AGE_RESTRICTED': return 'Age-restricted YouTube videos are not available anonymously';
    case 'LIVE_NOT_AVAILABLE': return 'Live YouTube streams are not supported';
    case 'DRM_UNSUPPORTED': return 'DRM-protected media is not supported';
    case 'MEDIA_TOO_LONG': return 'Videos longer than 20 minutes are not supported';
    case 'MEDIA_TOO_LARGE': return 'This file exceeds the safe processing limit';
    case 'UNSUPPORTED_MEDIA': return 'No downloadable public video or audio format was exposed';
    case 'EXTRACTION_TIMEOUT': return 'YouTube media resolution timed out';
    case 'PROVIDER_UNAVAILABLE': return 'The YouTube extraction provider is unavailable';
    case 'TOKEN_PROVIDER_UNAVAILABLE': return 'The YouTube token provider is temporarily unavailable';
    case 'PROVIDER_CHALLENGE': return 'YouTube did not expose this media to the anonymous provider';
    case 'PROVIDER_MALFORMED_RESPONSE': return 'YouTube returned an unsupported media response';
    case 'RATE_LIMITED': return 'The service is temporarily rate limited';
    case 'MEDIA_NOT_FOUND': return 'This result has expired. Resolve the link again.';
    default: return 'The request could not be processed';
  }
}

function providerError(error: unknown): ApiError {
  if (error instanceof YouTubeMetadataError) {
    const code = error.code === 'FILE_TOO_LARGE' ? 'MEDIA_TOO_LARGE' : error.code;
    return new ApiError(code, message(code), error.code === 'MEDIA_TOO_LONG' || error.code === 'FILE_TOO_LARGE' ? 413 : 422);
  }
  if (error instanceof YtDlpProcessError) {
    if (error.kind === 'timeout') return new ApiError('EXTRACTION_TIMEOUT', message('EXTRACTION_TIMEOUT'), 504);
    if (error.kind === 'unavailable') return new ApiError('PROVIDER_UNAVAILABLE', message('PROVIDER_UNAVAILABLE'), 503);
    if (error.kind === 'malformed') return new ApiError('PROVIDER_MALFORMED_RESPONSE', message('PROVIDER_MALFORMED_RESPONSE'), 502);
    if (error.code === 'TOKEN_PROVIDER_UNAVAILABLE') return new ApiError('TOKEN_PROVIDER_UNAVAILABLE', message('TOKEN_PROVIDER_UNAVAILABLE'), 503);
    if (error.code === 'PROVIDER_CHALLENGE') return new ApiError('PROVIDER_CHALLENGE', message('PROVIDER_CHALLENGE'), 422);
    const detail = error.message.toLowerCase();
    if (/rate.?limit|429|too many requests|temporarily blocked/.test(detail)) return new ApiError('RATE_LIMITED', message('RATE_LIMITED'), 429);
    if (/age.?restrict/.test(detail)) return new ApiError('AGE_RESTRICTED', message('AGE_RESTRICTED'), 422);
    if (/sign in|login|authentication/.test(detail)) return new ApiError('LOGIN_REQUIRED', 'This YouTube media requires login and is not available anonymously', 401);
    if (/private|members.?only/.test(detail)) return new ApiError('PRIVATE_MEDIA', message('PRIVATE_MEDIA'), 404);
    return new ApiError('EXTRACTION_FAILED', 'YouTube media could not be resolved', 502);
  }
  return new ApiError('EXTRACTION_FAILED', 'YouTube media could not be resolved', 502);
}

function publicOption(item: InternalMediaItem): PublicYouTubeOption {
  const kind = item.optionKind === 'video' ? 'video' : 'audio';
  return {
    optionId: item.id,
    kind,
    format: item.extension,
    resolution: item.height,
    width: item.width,
    height: item.height,
    container: item.container ?? item.extension,
    videoCodec: item.videoCodec ?? null,
    audioCodec: item.audioCodec ?? null,
    fps: item.fps ?? null,
    filesizeBytes: item.filesize ?? null,
    filesizeApproximate: item.sizeKind === 'estimated',
    sizeBytes: item.filesize ?? null,
    sizeKind: item.sizeKind ?? (item.filesize === null ? 'unknown' : 'exact'),
    qualityLabel: item.qualityLabel,
    hasAudio: item.hasAudio === true,
    requiresMux: item.requiresMux === true,
    compatibilityLabel: item.compatibilityLabel ?? 'Prepared on download',
    bitrateKbps: item.bitrateKbps ?? null,
  };
}

function publicPreview(item: InternalMediaItem, resolutionId: string, tokenService: DownloadTokenService): PublicYouTubeItem {
  const preview = tokenService.issue(resolutionId, item.id, 'preview');
  return {
    id: item.id,
    type: 'video',
    width: item.width,
    height: item.height,
    extension: item.extension,
    qualityLabel: item.qualityLabel,
    thumbnail: null,
    previewUrl: `/api/preview?token=${encodeURIComponent(preview)}`,
    durationSeconds: item.durationSeconds ?? null,
    hasAudio: item.hasAudio === true,
    hasVideo: item.hasVideo !== false,
    container: item.container ?? item.extension,
  };
}

export function createYouTubeRouter({ provider, store, tokenService }: YouTubeRouteDependencies): Router {
  const router = Router();

  router.post('/resolve', async (request: Request, response: Response) => {
    const body = resolveSchema.safeParse(request.body);
    if (!body.success) throw new ApiError('INVALID_YOUTUBE_URL', message('INVALID_YOUTUBE_URL'), 400);
    let validated;
    try { validated = parseYouTubeUrl(body.data.url); }
    catch (error) {
      if (error instanceof YouTubeUrlError && error.code === 'PLAYLIST_NOT_SUPPORTED') throw new ApiError('PLAYLIST_NOT_SUPPORTED', message('PLAYLIST_NOT_SUPPORTED'), 422);
      throw new ApiError('INVALID_YOUTUBE_URL', message('INVALID_YOUTUBE_URL'), 400);
    }
    if (!provider.isAvailable()) {
      const code = provider.availabilityErrorCode?.() ?? 'PROVIDER_UNAVAILABLE';
      throw new ApiError(code, message(code), 503);
    }
    let metadata: Record<string, unknown>;
    try { metadata = await provider.resolve(validated); } catch (error) { throw providerError(error); }
    let normalized;
    try { normalized = normalizeYouTubeMetadata(metadata, validated.route); } catch (error) { throw providerError(error); }
    if (!tokenService) throw new ApiError('INTERNAL_ERROR', 'The request could not be processed', 500);
    const stored = store.put({
      platform: 'youtube', canonicalUrl: validated.canonicalUrl, sourceType: normalized.sourceType,
      title: normalized.title, author: normalized.author, thumbnailUrl: normalized.thumbnailUrl,
      isCarousel: false, itemCount: 1, resolvedItemCount: 1, partial: false, warning: null, items: normalized.items,
    });
    const previewItem = stored.items.find((item) => item.id === normalized.previewItemId) ?? stored.items[0];
    if (!previewItem) throw new ApiError('PROVIDER_MALFORMED_RESPONSE', message('PROVIDER_MALFORMED_RESPONSE'), 502);
    const thumbnailToken = stored.thumbnailUrl ? tokenService.issue(stored.id, `thumbnail-${stored.id}`, 'thumbnail') : null;
    const preview = publicPreview(previewItem, stored.id, tokenService);
    const options = stored.items.map(publicOption);
    response.status(200).json({
      success: true,
      data: {
        platform: 'youtube', sourceType: stored.sourceType, title: stored.title, author: stored.author,
        thumbnail: thumbnailToken ? `/api/thumbnail?token=${encodeURIComponent(thumbnailToken)}` : null,
        durationSeconds: normalized.durationSeconds, jobId: stored.id, previewUrl: preview.previewUrl, previewOptionId: preview.id,
        downloadOptions: options.filter((option) => option.kind === 'video'),
        audioOptions: options.filter((option) => option.kind === 'audio'),
        isCarousel: false, itemCount: 1, resolvedItemCount: 1, partial: false, warning: null, items: [preview],
      },
    });
  });

  router.post('/prepare', async (request: Request, response: Response) => {
    const body = prepareSchema.safeParse(request.body);
    if (!body.success || !tokenService) throw new ApiError('INVALID_TOKEN', 'The media token is invalid', 401);
    const resolution = store.get(body.data.jobId);
    if (!resolution || resolution.platform !== 'youtube') throw new ApiError('MEDIA_NOT_FOUND', message('MEDIA_NOT_FOUND'), 404);
    const item = resolution.items.find((candidate) => candidate.id === body.data.optionId && candidate.platform === 'youtube' && Boolean(candidate.optionKind));
    if (!item) throw new ApiError('MEDIA_NOT_FOUND', message('MEDIA_NOT_FOUND'), 404);
    const download = tokenService.issue(resolution.id, item.id, 'download');
    response.status(200).json({ success: true, data: { optionId: item.id, downloadUrl: `/api/download?token=${encodeURIComponent(download)}`, extension: item.extension, kind: item.optionKind === 'video' ? 'video' : 'audio' } });
  });

  return router;
}
