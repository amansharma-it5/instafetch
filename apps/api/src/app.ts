import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { createInstagramRouter } from './routes/instagram.js';
import { createMediaRouter } from './routes/media.js';
import { ApiError } from './services/errors.js';
import type { InstagramExtractionProvider } from './services/extraction/InstagramExtractionProvider.js';
import { InstagramProviderChain } from './services/extraction/provider-chain.js';
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
    response.status(200).json({ status: 'live' });
  });

  app.get('/health/ready', (_request, response) => {
    const instagramAvailable = provider.isAvailable();
    const ready = instagramAvailable && Boolean(tokenService);
    response.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
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

  app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const apiError = error instanceof ApiError
      ? error
      : error instanceof SyntaxError
        ? new ApiError('INVALID_INSTAGRAM_URL', 'Enter a valid JSON request body', 400)
      : new ApiError('INTERNAL_ERROR', 'The request could not be processed', 500);
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
