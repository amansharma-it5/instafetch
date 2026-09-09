import { describe, expect, it } from 'vitest';
import { DownloadTokenError, DownloadTokenService } from './download-tokens';

const secret = 'unit-test-download-token-secret-which-is-long-enough';

describe('DownloadTokenService', () => {
  it('issues and verifies a purpose-bound token without upstream data', () => {
    const service = new DownloadTokenService(secret, { now: () => 1_000, ttlMs: 5_000 });
    const token = service.issue('resolution-1', 'media-1', 'download');
    expect(token).not.toContain('cdn');
    expect(service.verify(token, 'download')).toMatchObject({ resolutionId: 'resolution-1', mediaId: 'media-1', purpose: 'download' });
    expect(() => service.verify(token, 'preview')).toThrowError(new DownloadTokenError('INVALID_TOKEN', 'The download token is invalid'));
  });

  it('rejects altered and expired tokens', () => {
    let now = 1_000;
    const service = new DownloadTokenService(secret, { now: () => now, ttlMs: 100 });
    const token = service.issue('resolution-1', 'media-1', 'preview');
    expect(() => service.verify(`${token.slice(0, -1)}x`, 'preview')).toThrowError(DownloadTokenError);
    now = 1_101;
    expect(() => service.verify(token, 'preview')).toThrowError(new DownloadTokenError('EXPIRED_TOKEN', 'The download token has expired'));
  });
});
