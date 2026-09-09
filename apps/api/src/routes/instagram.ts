import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { parseInstagramUrl } from '@instafetch/shared';
import type { InstagramExtractionProvider } from '../services/extraction/InstagramExtractionProvider.js';
import { normalizeInstagramMetadata } from '../services/extraction/normalize-instagram.js';
import { GalleryDlProcessError } from '../services/extraction/gallery-dl-process.js';
import { YtDlpProcessError } from '../services/extraction/yt-dlp-process.js';
import { ApiError } from '../services/errors.js';
import { ResolutionStore } from '../services/store/resolution-store.js';
import type { DownloadTokenService } from '../services/tokens/download-tokens.js';

const resolveRequestSchema = z.object({ url: z.string().trim().min(1).max(2048) }).strict();

export interface InstagramRouteDependencies {
  provider: InstagramExtractionProvider;
  store: ResolutionStore;
  tokenService?: DownloadTokenService;
}

export interface PublicMediaItem {
  id: string;
  type: 'video' | 'photo';
  width: number | null;
  height: number | null;
  extension: string;
  qualityLabel: string;
  thumbnail: null;
  previewUrl: string;
  downloadUrl: string;
}

function messageForCode(code: ApiError['code']): string {
  switch (code) {
    case 'INVALID_INSTAGRAM_URL':
      return 'Enter a valid public Instagram URL';
    case 'PRIVATE_OR_UNAVAILABLE':
      return 'This Instagram media is private or unavailable';
    case 'LOGIN_REQUIRED':
      return 'Instagram requires login to access this media';
    case 'RATE_LIMITED':
      return 'The service is temporarily rate limited';
    case 'EXTRACTION_TIMEOUT':
      return 'Instagram media resolution timed out';
    case 'PROVIDER_UNAVAILABLE':
      return 'The Instagram extraction provider is unavailable';
    case 'PROVIDER_MALFORMED_RESPONSE':
      return 'The Instagram provider returned an unsupported response';
    case 'EXTRACTION_FAILED':
      return 'Instagram media could not be resolved';
    case 'INTERNAL_ERROR':
      return 'The request could not be processed';
    default:
      return 'The request could not be processed';
  }
}

function providerError(error: unknown): ApiError {
  if (error instanceof YtDlpProcessError || error instanceof GalleryDlProcessError) {
    if (error.kind === 'timeout') {
      return new ApiError('EXTRACTION_TIMEOUT', messageForCode('EXTRACTION_TIMEOUT'), 504);
    }
    if (error.kind === 'unavailable') {
      return new ApiError('PROVIDER_UNAVAILABLE', messageForCode('PROVIDER_UNAVAILABLE'), 503);
    }
    if (error.kind === 'malformed') {
      return new ApiError('PROVIDER_MALFORMED_RESPONSE', messageForCode('PROVIDER_MALFORMED_RESPONSE'), 502);
    }

    const detail = error.message.toLowerCase();
    if (/rate.?limit|too many requests|\b429\b|challenge_required|temporarily blocked/.test(detail)) {
      return new ApiError('RATE_LIMITED', messageForCode('RATE_LIMITED'), 429);
    }
    if (/login required|\blogin\b|log in|sign in|authentication|cookies?/.test(detail)) {
      return new ApiError('LOGIN_REQUIRED', messageForCode('LOGIN_REQUIRED'), 401);
    }
    if (/private|not available|does not exist|content unavailable|page isn't available/.test(detail)) {
      return new ApiError('PRIVATE_OR_UNAVAILABLE', messageForCode('PRIVATE_OR_UNAVAILABLE'), 404);
    }
  }

  return new ApiError('EXTRACTION_FAILED', messageForCode('EXTRACTION_FAILED'), 502);
}

function requestUrl(request: Request) {
  return resolveRequestSchema.safeParse(request.body);
}

function publicItem(item: {
  id: string;
  type: 'video' | 'photo';
  width: number | null;
  height: number | null;
  extension: string;
  qualityLabel: string;
  resolutionId: string;
  tokenService: DownloadTokenService;
}): PublicMediaItem {
  const previewToken = item.tokenService.issue(item.resolutionId, item.id, 'preview');
  const downloadToken = item.tokenService.issue(item.resolutionId, item.id, 'download');
  return {
    id: item.id,
    type: item.type,
    width: item.width,
    height: item.height,
    extension: item.extension,
    qualityLabel: item.qualityLabel,
    thumbnail: null,
    previewUrl: `/api/preview?token=${encodeURIComponent(previewToken)}`,
    downloadUrl: `/api/download?token=${encodeURIComponent(downloadToken)}`,
  };
}

export function createInstagramRouter({ provider, store, tokenService }: InstagramRouteDependencies): Router {
  const router = Router();

  router.post('/resolve', async (request: Request, response: Response) => {
    const body = requestUrl(request);
    if (!body.success) {
      throw new ApiError('INVALID_INSTAGRAM_URL', messageForCode('INVALID_INSTAGRAM_URL'), 400);
    }

    let validated;
    try {
      validated = parseInstagramUrl(body.data.url);
    } catch {
      throw new ApiError('INVALID_INSTAGRAM_URL', messageForCode('INVALID_INSTAGRAM_URL'), 400);
    }

    if (!provider.isAvailable()) {
      throw new ApiError('PROVIDER_UNAVAILABLE', messageForCode('PROVIDER_UNAVAILABLE'), 503);
    }

    let metadata: Record<string, unknown>;
    try {
      metadata = await provider.resolve(validated);
    } catch (error) {
      throw providerError(error);
    }

    let normalized;
    try {
      normalized = normalizeInstagramMetadata(metadata, validated.route);
    } catch {
      throw new ApiError('PROVIDER_MALFORMED_RESPONSE', messageForCode('PROVIDER_MALFORMED_RESPONSE'), 502);
    }

    const stored = store.put({
      canonicalUrl: validated.canonicalUrl,
      sourceType: normalized.sourceType,
      title: normalized.title,
      author: normalized.author,
      thumbnailUrl: normalized.thumbnailUrl,
      isCarousel: normalized.isCarousel,
      itemCount: normalized.itemCount,
      resolvedItemCount: normalized.resolvedItemCount,
      partial: normalized.partial,
      warning: normalized.warning,
      items: normalized.items,
    });

    if (!tokenService) {
      throw new ApiError('INTERNAL_ERROR', messageForCode('INTERNAL_ERROR'), 500);
    }

    response.status(200).json({
      success: true,
      data: {
        sourceType: stored.sourceType,
        title: stored.title,
        author: stored.author,
        thumbnail: null,
        isCarousel: stored.isCarousel,
        itemCount: stored.itemCount,
        resolvedItemCount: stored.resolvedItemCount,
        partial: stored.partial,
        warning: stored.warning,
        items: stored.items.map((item) => publicItem({
          ...item,
          resolutionId: stored.id,
          tokenService,
        })),
      },
    });
  });

  return router;
}
