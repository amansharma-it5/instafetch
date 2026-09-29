import type { ValidatedYouTubeUrl } from '@instafetch/shared';

export interface YouTubeExtractionProvider {
  isAvailable(): boolean;
  resolve(url: ValidatedYouTubeUrl): Promise<Record<string, unknown>>;
}
