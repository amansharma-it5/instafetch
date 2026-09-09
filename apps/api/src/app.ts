import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pino from 'pino';
import { createInstagramRouter } from './routes/instagram.js';
import { createMediaRouter } from './routes/media.js';
import { ApiError } from './services/errors.js';
import type { InstagramExtractionProvider } from './services/extraction/InstagramExtractionProvider.js';
import { InstagramProviderChain } from './services/extraction/provider-chain.js';
import { MediaMaterializer } from './services/media/media-materializer.js';
import { ResolutionStore } from './services/store/resolution-store.js';
import { DownloadTokenService } from './services/tokens/download-tokens.js';

const logger = pino({
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.url'],
});

function allowedOrigins(): Set<string> {
  return new Set(
    (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export interface AppOptions {
  provider?: InstagramExtractionProvider;
  store?: ResolutionStore;
  materializer?: MediaMaterializer;
  tokenService?: DownloadTokenService;
  globalRateLimit?: number;
  resolveRateLimit?: number;
  mediaRateLimit?: number;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const origins = allowedOrigins();
  const provider = options.provider ?? new InstagramProviderChain();
  const store = options.store ?? new ResolutionStore();
  const materializer = options.materializer ?? new MediaMaterializer();
  const tokenService = options.tokenService ?? createDefaultTokenService();
  const rateLimitHandler = (_request: express.Request, response: express.Response) => {
    response.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Try again later.',
      },
    });
  };

  app.disable('x-powered-by');
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
    response.status(200).json({ status: 'live' });
  });

  app.get('/health/ready', (_request, response) => {
    const instagramAvailable = provider.isAvailable();
    response.status(instagramAvailable ? 200 : 503).json({
      status: instagramAvailable ? 'ready' : 'not_ready',
      providers: {
        instagram: instagramAvailable,
      },
    });
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
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: options.mediaRateLimit ?? 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: rateLimitHandler,
    }),
    createMediaRouter({ store, materializer, tokenService }),
  );

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const apiError = error instanceof ApiError
      ? error
      : error instanceof SyntaxError
        ? new ApiError('INVALID_INSTAGRAM_URL', 'Enter a valid JSON request body', 400)
      : new ApiError('INTERNAL_ERROR', 'The request could not be processed', 500);
    logger.warn({ code: apiError.code }, 'request rejected');
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
  if (configured && configured.length >= 32) {
    return new DownloadTokenService(configured);
  }
  if (process.env.NODE_ENV === 'test') {
    return new DownloadTokenService('test-only-download-token-secret-32-chars');
  }
  return undefined;
}
