export type ApiErrorCode =
  | 'INVALID_INSTAGRAM_URL'
  | 'PRIVATE_OR_UNAVAILABLE'
  | 'LOGIN_REQUIRED'
  | 'RATE_LIMITED'
  | 'SERVER_BUSY'
  | 'EXTRACTION_TIMEOUT'
  | 'EXTRACTION_FAILED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_MALFORMED_RESPONSE'
  | 'INVALID_TOKEN'
  | 'EXPIRED_TOKEN'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_UNAVAILABLE'
  | 'MEDIA_TOO_LARGE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_INVALID_CONTENT'
  | 'DOWNLOAD_FAILED'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
