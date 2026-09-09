import { createHmac, timingSafeEqual } from 'node:crypto';

export type DownloadTokenPurpose = 'preview' | 'download';

export interface DownloadTokenPayload {
  resolutionId: string;
  mediaId: string;
  purpose: DownloadTokenPurpose;
  issuedAt: number;
  expiresAt: number;
  tokenVersion: 1;
}

export type TokenFailureCode = 'INVALID_TOKEN' | 'EXPIRED_TOKEN';

export class DownloadTokenError extends Error {
  constructor(public readonly code: TokenFailureCode, message: string) {
    super(message);
    this.name = 'DownloadTokenError';
  }
}

function base64Url(value: Buffer): string {
  return value.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64');
}

function signingInput(payload: string): Buffer {
  return Buffer.from(payload, 'utf8');
}

export interface DownloadTokenServiceOptions {
  ttlMs?: number;
  now?: () => number;
}

export class DownloadTokenService {
  private readonly secret: Buffer;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(secret: string | undefined = process.env.DOWNLOAD_TOKEN_SECRET, options: DownloadTokenServiceOptions = {}) {
    if (!secret || secret.trim().length < 32) {
      throw new Error('DOWNLOAD_TOKEN_SECRET must contain at least 32 characters');
    }
    this.secret = Buffer.from(secret, 'utf8');
    this.ttlMs = options.ttlMs ?? 5 * 60_000;
    this.now = options.now ?? Date.now;
  }

  issue(resolutionId: string, mediaId: string, purpose: DownloadTokenPurpose): string {
    const issuedAt = this.now();
    const payload: DownloadTokenPayload = {
      resolutionId,
      mediaId,
      purpose,
      issuedAt,
      expiresAt: issuedAt + this.ttlMs,
      tokenVersion: 1,
    };
    const encodedPayload = base64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
    const signature = base64Url(createHmac('sha256', this.secret).update(signingInput(encodedPayload)).digest());
    return `${encodedPayload}.${signature}`;
  }

  verify(token: string, purpose: DownloadTokenPurpose): DownloadTokenPayload {
    try {
      if (!token || token.length > 2048) {
        throw new DownloadTokenError('INVALID_TOKEN', 'The download token is invalid');
      }
      const parts = token.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new DownloadTokenError('INVALID_TOKEN', 'The download token is invalid');
      }
      const expected = createHmac('sha256', this.secret).update(signingInput(parts[0])).digest();
      const received = fromBase64Url(parts[1]);
      if (received.length !== expected.length || !timingSafeEqual(expected, received)) {
        throw new DownloadTokenError('INVALID_TOKEN', 'The download token is invalid');
      }
      const payload = JSON.parse(fromBase64Url(parts[0]).toString('utf8')) as Partial<DownloadTokenPayload>;
      if (
        payload.tokenVersion !== 1
        || typeof payload.resolutionId !== 'string'
        || typeof payload.mediaId !== 'string'
        || payload.purpose !== purpose
        || typeof payload.issuedAt !== 'number'
        || !Number.isFinite(payload.issuedAt)
        || typeof payload.expiresAt !== 'number'
        || !Number.isFinite(payload.expiresAt)
      ) {
        throw new DownloadTokenError('INVALID_TOKEN', 'The download token is invalid');
      }
      const expiresAt = payload.expiresAt;
      if (expiresAt <= this.now()) {
        throw new DownloadTokenError('EXPIRED_TOKEN', 'The download token has expired');
      }
      return payload as DownloadTokenPayload;
    } catch (error) {
      if (error instanceof DownloadTokenError) {
        throw error;
      }
      throw new DownloadTokenError('INVALID_TOKEN', 'The download token is invalid');
    }
  }
}
