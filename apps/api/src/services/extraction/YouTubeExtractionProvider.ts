import type { ValidatedYouTubeUrl } from '@instafetch/shared';

export interface YouTubeExtractionProvider {
  isAvailable(): boolean;
  availabilityErrorCode?(): 'TOKEN_PROVIDER_UNAVAILABLE' | null;
  resolve(url: ValidatedYouTubeUrl): Promise<Record<string, unknown>>;
}
