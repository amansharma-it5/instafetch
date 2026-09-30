import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { createInstagramRouter } from './routes/instagram.js';
import { createYouTubeRouter } from './routes/youtube.js';
import { createMediaRouter } from './routes/media.js';
import { ApiError } from './services/errors.js';
import type { InstagramExtractionProvider } from './services/extraction/InstagramExtractionProvider.js';
import type { YouTubeExtractionProvider } from './services/extraction/YouTubeExtractionProvider.js';
import { InstagramProviderChain } from './services/extraction/provider-chain.js';
import { YtDlpYouTubeProvider } from './services/extraction/YtDlpYouTubeProvider.js';
import { isFfmpegAvailable, isFfprobeAvailable } from './services/extraction/ffmpeg-process.js';
import { MediaMaterializer } from './services/media/media-materializer.js';
import { ResolutionStore } from './services/store/resolution-store.js';
import { DownloadTokenService, isSecureDownloadTokenSecret } from './services/tokens/download-tokens.js';

const logger = pino({
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.url', '*.token', '*.providerUrl', '*.audioProviderUrl'],
});

const requestIdPattern = /^[A-Za-z0-9._-]{1,64}$/;

function requestId(request: express.Request): string {
  const candidate = request.header('x-request-id');
  return candidate && requestIdPattern.test(candidate) ? candidate : randomUUID();
}

function isPayloadTooLarge(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { type?: unknown; status?: unknown; statusCode?: unknown };
  return candidate.type === 'entity.too.large' || candidate.status === 413 || candidate.statusCode === 413;
}

export function parseAllowedOrigins(configured: string | undefined, isProduction: boolean): Set<string> {
  const values = configured?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  if (isProduction && values.length === 0) {
    throw new Error('WEB_ORIGIN must be configured in production');
  }
  if (values.includes('*')) {
    throw new Error('Wildcard CORS origins are not allowed');
  }

  const normalized = values.map((origin) => {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('WEB_ORIGIN must contain valid HTTP(S) origins');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash) {
      throw new Error('WEB_ORIGIN must contain valid HTTP(S) origins');
    }
    return parsed.origin;
  });
  return new Set(normalized);
}

function allowedOrigins(): Set<string> {
  const isProduction = process.env.NODE_ENV === 'production';
  const configured = isProduction
    ? process.env.WEB_ORIGIN?.trim()
    : process.env.WEB_ORIGIN?.trim() || process.env.CORS_ORIGIN?.trim() || 'http://localhost:5173';
  return parseAllowedOrigins(configured, isProduction);
}

export interface AppOptions {
  provider?: InstagramExtractionProvider;
  youtubeProvider?: YouTubeExtractionProvider;
  store?: ResolutionStore;
  materializer?: MediaMaterializer;
  tokenService?: DownloadTokenService;
  globalRateLimit?: number;
  resolveRateLimit?: number;
  youtubeResolveRateLimit?: number;
  previewRateLimit?: number;
  downloadRateLimit?: number;
  /** Backwards-compatible override for both media routes. */
  mediaRateLimit?: number;
  runtimeChecks?: () => { ffmpeg: boolean; ffprobe: boolean; potProvider: boolean };
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const origins = allowedOrigins();
  const provider = options.provider ?? new InstagramProviderChain();
  const youtubeProvider = options.youtubeProvider ?? new YtDlpYouTubeProvider();
  const store = options.store ?? new ResolutionStore();
  const materializer = options.materializer ?? new MediaMaterializer();
  const tokenService = options.tokenService ?? createDefaultTokenService();
  const runtimeChecks = options.runtimeChecks ?? (() => ({
    ffmpeg: isFfmpegAvailable(),
    ffprobe: isFfprobeAvailable(),
    potProvider: true,
  }));
  const rateLimitHandler = (_request: express.Request, response: express.Response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Try again later.',
      },
    });
  };

  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const id = requestId(request);
    const startedAt = process.hrtime.bigint();
    response.setHeader('X-Request-Id', id);
    response.once('finish', () => {
      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      if (process.env.NODE_ENV === 'production') {
        logger.info({ requestId: id, route: request.path, status: response.statusCode, latencyMs: Math.round(latencyMs * 100) / 100 }, 'request complete');
      }
    });
    next();
  });
  // Render terminates TLS at one known proxy hop. Trusting exactly one hop keeps
  // forwarded HTTPS and client IP headers useful without trusting arbitrary proxies.
  app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
  // The browser receives media from this API on a different local origin than Vite.
  // Keep the default Helmet protections while allowing those token-gated media responses.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || origins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin is not allowed'));
      },
    }),
  );
  app.use(express.json({ limit: '8kb' }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: options.globalRateLimit ?? 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: rateLimitHandler,
    }),
  );

  app.get('/health/live', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json({ status: 'live' });
  });

  app.get('/health/ready', (_request, response) => {
    const instagramAvailable = provider.isAvailable();
    const youtubeAvailable = youtubeProvider.isAvailable();
    const dependencies = runtimeChecks();
    const ready = instagramAvailable
      && youtubeAvailable
      && dependencies.ffmpeg
      && dependencies.ffprobe
      && dependencies.potProvider
      && Boolean(tokenService);
    response.setHeader('Cache-Control', 'no-store');
    response.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      providers: {
        instagram: instagramAvailable,
        youtube: youtubeAvailable,
        ffmpeg: dependencies.ffmpeg,
        ffprobe: dependencies.ffprobe,
        potProvider: dependencies.potProvider,
      },
    });
  });

  // Resolution records, tokens, and temporary media must never be cached by
  // browsers or shared intermediaries.
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use(
    '/api/instagram',
    rateLimit({
      windowMs: 60_000,
      limit: options.resolveRateLimit ?? 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: rateLimitHandler,
    }),
    createInstagramRouter({ provider, store, tokenService }),
  );

  app.use(
    '/api/youtube',
    rateLimit({
      windowMs: 60_000,
      limit: options.youtubeResolveRateLimit ?? 5,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: rateLimitHandler,
    }),
    createYouTubeRouter({ provider: youtubeProvider, store, tokenService }),
  );

  const mediaLimit = options.mediaRateLimit;
  const previewRateLimiter = rateLimit({
    windowMs: 60_000,
    limit: options.previewRateLimit ?? mediaLimit ?? 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: rateLimitHandler,
  });
  const downloadRateLimiter = rateLimit({
    windowMs: 60_000,
    limit: options.downloadRateLimit ?? mediaLimit ?? 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: rateLimitHandler,
  });
  app.use('/api', createMediaRouter({ store, materializer, tokenService, previewRateLimiter, downloadRateLimiter }));

  // Keep unknown API paths on the same safe JSON contract as known failures.
  app.use((_request, _response, next) => {
    next(new ApiError('INTERNAL_ERROR', 'The request could not be processed', 404));
  });

  app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const apiError = error instanceof ApiError
      ? error
      : isPayloadTooLarge(error)
        ? new ApiError('INTERNAL_ERROR', 'The request payload is too large', 413)
      : error instanceof SyntaxError
        ? new ApiError('INVALID_INSTAGRAM_URL', 'Enter a valid JSON request body', 400)
      : new ApiError('INTERNAL_ERROR', 'The request could not be processed', 500);
    response.setHeader('Cache-Control', 'no-store');
    logger.warn({ requestId: response.getHeader('X-Request-Id'), route: request.path, status: apiError.statusCode, code: apiError.code }, 'request rejected');
    response.status(apiError.statusCode).json({
      success: false,
      error: {
        code: apiError.code,
        message: apiError.message,
      },
    });
  });

  return app;
}

function createDefaultTokenService(): DownloadTokenService | undefined {
  const configured = process.env.DOWNLOAD_TOKEN_SECRET?.trim();
  if (isSecureDownloadTokenSecret(configured)) {
    return new DownloadTokenService(configured);
  }
  if (process.env.NODE_ENV === 'test') {
    return new DownloadTokenService('test-only-download-token-secret-32-chars');
  }
  return undefined;
}
