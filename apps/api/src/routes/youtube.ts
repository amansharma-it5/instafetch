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

const schema = z.object({ url: z.string().trim().min(1).max(2048) }).strict();

export interface YouTubeRouteDependencies { provider: YouTubeExtractionProvider; store: ResolutionStore; tokenService?: DownloadTokenService; }

interface PublicYouTubeItem { id: string; type: 'video'; width: number | null; height: number | null; extension: string; qualityLabel: string; thumbnail: null; previewUrl: string; downloadUrl: string; durationSeconds: number | null; hasAudio: boolean; hasVideo: boolean; container: string; }

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
    case 'UNSUPPORTED_MEDIA': return 'No downloadable public video format was exposed';
    case 'EXTRACTION_TIMEOUT': return 'YouTube media resolution timed out';
    case 'PROVIDER_UNAVAILABLE': return 'The YouTube extraction provider is unavailable';
    case 'PROVIDER_MALFORMED_RESPONSE': return 'YouTube returned an unsupported media response';
    case 'RATE_LIMITED': return 'The service is temporarily rate limited';
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
    const detail = error.message.toLowerCase();
    if (/rate.?limit|429|too many requests|temporarily blocked/.test(detail)) return new ApiError('RATE_LIMITED', message('RATE_LIMITED'), 429);
    if (/age.?restrict/.test(detail)) return new ApiError('AGE_RESTRICTED', message('AGE_RESTRICTED'), 422);
    if (/sign in|login|authentication/.test(detail)) return new ApiError('LOGIN_REQUIRED', 'This YouTube media requires login and is not available anonymously', 401);
    if (/private|members.?only/.test(detail)) return new ApiError('PRIVATE_MEDIA', message('PRIVATE_MEDIA'), 404);
    return new ApiError('EXTRACTION_FAILED', 'YouTube media could not be resolved', 502);
  }
  return new ApiError('EXTRACTION_FAILED', 'YouTube media could not be resolved', 502);
}

function publicItem(item: InternalMediaItem, resolutionId: string, tokenService: DownloadTokenService): PublicYouTubeItem {
  const preview = tokenService.issue(resolutionId, item.id, 'preview');
  const download = tokenService.issue(resolutionId, item.id, 'download');
  return { id: item.id, type: 'video', width: item.width, height: item.height, extension: item.extension, qualityLabel: item.qualityLabel, thumbnail: null, previewUrl: `/api/preview?token=${encodeURIComponent(preview)}`, downloadUrl: `/api/download?token=${encodeURIComponent(download)}`, durationSeconds: item.durationSeconds ?? null, hasAudio: item.hasAudio !== false, hasVideo: item.hasVideo !== false, container: item.container ?? item.extension };
}

export function createYouTubeRouter({ provider, store, tokenService }: YouTubeRouteDependencies): Router {
  const router = Router();
  router.post('/resolve', async (request: Request, response: Response) => {
    const body = schema.safeParse(request.body);
    if (!body.success) throw new ApiError('INVALID_YOUTUBE_URL', message('INVALID_YOUTUBE_URL'), 400);
    let validated;
    try { validated = parseYouTubeUrl(body.data.url); }
    catch (error) {
      if (error instanceof YouTubeUrlError && error.code === 'PLAYLIST_NOT_SUPPORTED') throw new ApiError('PLAYLIST_NOT_SUPPORTED', message('PLAYLIST_NOT_SUPPORTED'), 422);
      throw new ApiError('INVALID_YOUTUBE_URL', message('INVALID_YOUTUBE_URL'), 400);
    }
    if (!provider.isAvailable()) throw new ApiError('PROVIDER_UNAVAILABLE', message('PROVIDER_UNAVAILABLE'), 503);
    let metadata: Record<string, unknown>;
    try { metadata = await provider.resolve(validated); } catch (error) { throw providerError(error); }
    let normalized;
    try { normalized = normalizeYouTubeMetadata(metadata, validated.route); } catch (error) { throw providerError(error); }
    if (!tokenService) throw new ApiError('INTERNAL_ERROR', 'The request could not be processed', 500);
    const stored = store.put({ platform: 'youtube', canonicalUrl: validated.canonicalUrl, sourceType: normalized.sourceType, title: normalized.title, author: normalized.author, thumbnailUrl: normalized.thumbnailUrl, isCarousel: false, itemCount: 1, resolvedItemCount: 1, partial: false, warning: null, items: normalized.items });
    response.status(200).json({ success: true, data: { platform: 'youtube', sourceType: stored.sourceType, title: stored.title, author: stored.author, thumbnail: null, isCarousel: false, itemCount: 1, resolvedItemCount: 1, partial: false, warning: null, items: stored.items.map((item) => publicItem(item, stored.id, tokenService)) } });
  });
  return router;
}
