export type PublicMediaErrorCode =
  | 'INVALID_URL'
  | 'PRIVATE_OR_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'NETWORK_FAILURE';

export interface PublicMediaError {
  code: PublicMediaErrorCode;
  message: string;
}
