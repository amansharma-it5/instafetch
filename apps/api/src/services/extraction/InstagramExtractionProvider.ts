import type { ValidatedInstagramUrl } from '@instafetch/shared';

export interface InstagramExtractionProvider {
  isAvailable(): boolean;
  resolve(url: ValidatedInstagramUrl): Promise<Record<string, unknown>>;
}
