import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../services/errors.js';
import { MediaMaterializationError, MediaMaterializer, type MaterializedMedia } from '../services/media/media-materializer.js';
import { ResolutionStore } from '../services/store/resolution-store.js';
import { DownloadTokenError, DownloadTokenService, type DownloadTokenPurpose } from '../services/tokens/download-tokens.js';

const tokenQuery = z.object({ token: z.string().min(1).max(2048) }).strict();

export interface MediaRouteDependencies {
  store: ResolutionStore;
  materializer: MediaMaterializer;
  tokenService?: DownloadTokenService;
}

function messageForCode(code: ApiError['code']): string {
  switch (code) {
    case 'INVALID_TOKEN': return 'The media token is invalid';
    case 'EXPIRED_TOKEN': return 'The media token has expired';
    case 'MEDIA_NOT_FOUND': return 'The requested media is no longer available';
    case 'MEDIA_UNAVAILABLE': return 'The media is no longer available';
    case 'MEDIA_TOO_LARGE': return 'The media is too large to process';
    case 'UPSTREAM_TIMEOUT': return 'The media provider timed out';
    case 'UPSTREAM_INVALID_CONTENT': return 'The provider returned invalid media';
    case 'DOWNLOAD_FAILED': return 'The media could not be downloaded';
    default: return 'The request could not be processed';
  }
}

function mediaError(error: unknown): ApiError {
  if (error instanceof DownloadTokenError) {
    return new ApiError(error.code, messageForCode(error.code), error.code === 'EXPIRED_TOKEN' ? 410 : 401);
  }
  if (error instanceof MediaMaterializationError) {
    const status = error.code === 'MEDIA_TOO_LARGE' ? 413
      : error.code === 'MEDIA_UNAVAILABLE' ? 404
        : error.code === 'UPSTREAM_TIMEOUT' ? 504 : 502;
    return new ApiError(error.code, messageForCode(error.code), status);
  }
  return new ApiError('DOWNLOAD_FAILED', messageForCode('DOWNLOAD_FAILED'), 502);
}

function tokenFromRequest(request: Request, purpose: DownloadTokenPurpose, service?: DownloadTokenService) {
  if (!service) throw new ApiError('INTERNAL_ERROR', 'The request could not be processed', 500);
  const parsed = tokenQuery.safeParse(request.query);
  if (!parsed.success) throw new ApiError('INVALID_TOKEN', messageForCode('INVALID_TOKEN'), 401);
  try {
    return service.verify(parsed.data.token, purpose);
  } catch (error) {
    throw mediaError(error);
  }
}

function getMedia(
  token: ReturnType<DownloadTokenService['verify']>,
  store: ResolutionStore,
) {
  const resolution = store.get(token.resolutionId);
  if (!resolution) throw new ApiError('MEDIA_NOT_FOUND', messageForCode('MEDIA_NOT_FOUND'), 404);
  const item = resolution.items.find((candidate) => candidate.id === token.mediaId);
  if (!item) throw new ApiError('MEDIA_NOT_FOUND', messageForCode('MEDIA_NOT_FOUND'), 404);
  return { resolution, item };
}

function rangeFor(request: Request, length: number): { start: number; end: number } | null {
  const header = request.headers.range;
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]) || 0);
  const end = match[2] ? Number(match[2]) : length - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= length) return null;
  return { start, end: Math.min(end, length - 1) };
}

async function streamMedia(request: Request, response: Response, media: MaterializedMedia, attachment: boolean): Promise<void> {
  let length: number;
  try { length = await stat(media.path).then((result) => result.size); } catch {
    throw new ApiError('MEDIA_UNAVAILABLE', messageForCode('MEDIA_UNAVAILABLE'), 404);
  }
  const range = rangeFor(request, length);
  response.setHeader('Content-Type', media.contentType);
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Disposition', `${attachment ? 'attachment' : 'inline'}; filename="${media.filename}"`);
  if (range) {
    response.status(206);
    response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${length}`);
    response.setHeader('Content-Length', String(range.end - range.start + 1));
  } else {
    response.setHeader('Content-Length', String(length));
  }
  const stream = createReadStream(media.path, range ? { start: range.start, end: range.end } : undefined);
  stream.once('error', () => {
    if (!response.headersSent) response.status(502).json({ success: false, error: { code: 'DOWNLOAD_FAILED', message: messageForCode('DOWNLOAD_FAILED') } });
    else response.destroy();
  });
  stream.pipe(response);
}

export function createMediaRouter({ store, materializer, tokenService }: MediaRouteDependencies): Router {
  const router = Router();

  const handle = (purpose: DownloadTokenPurpose, attachment: boolean) => async (request: Request, response: Response, next: NextFunction) => {
    try {
      const token = tokenFromRequest(request, purpose, tokenService);
      const { resolution, item } = getMedia(token, store);
      const materialized = await materializer.materialize(resolution.id, item, resolution.expiresAt);
      // Video thumbnails are not fetched from a second upstream URL in Phase 3A;
      // preview safely falls back to the verified media stream itself.
      await streamMedia(request, response, materialized, attachment);
    } catch (error) {
      next(error instanceof ApiError ? error : mediaError(error));
    }
  };

  router.get('/download', handle('download', true));
  router.get('/preview', handle('preview', false));
  return router;
}
