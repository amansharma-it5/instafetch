import type { ValidatedInstagramUrl } from '@instafetch/shared';
import { GalleryDlInstagramProvider } from './GalleryDlInstagramProvider.js';
import { GalleryDlProcessError } from './gallery-dl-process.js';
import type { InstagramExtractionProvider } from './InstagramExtractionProvider.js';
import { YtDlpInstagramProvider } from './YtDlpInstagramProvider.js';
import { YtDlpProcessError } from './yt-dlp-process.js';

export interface InstagramProviderChainOptions {
  primary?: InstagramExtractionProvider;
  photoFallback?: InstagramExtractionProvider;
}

function canUsePhotoFallback(error: unknown): boolean {
  if (!(error instanceof YtDlpProcessError) || error.kind !== 'failed') return false;
  return /no (?:video|image) formats? found|no downloadable (?:media|formats)|no media candidates/i.test(error.message);
}

export class InstagramProviderChain implements InstagramExtractionProvider {
  private readonly primary: InstagramExtractionProvider;
  private readonly photoFallback: InstagramExtractionProvider;

  constructor(options: InstagramProviderChainOptions = {}) {
    this.primary = options.primary ?? new YtDlpInstagramProvider();
    this.photoFallback = options.photoFallback ?? new GalleryDlInstagramProvider();
  }

  isAvailable(): boolean {
    return this.primary.isAvailable() || this.photoFallback.isAvailable();
  }

  async resolve(url: ValidatedInstagramUrl): Promise<Record<string, unknown>> {
    if (url.route !== 'post') return this.primary.resolve(url);

    if (!this.primary.isAvailable()) {
      if (this.photoFallback.isAvailable()) return this.photoFallback.resolve(url);
      throw new YtDlpProcessError('unavailable', 'yt-dlp is unavailable');
    }

    try {
      return await this.primary.resolve(url);
    } catch (error) {
      if (!canUsePhotoFallback(error) || !this.photoFallback.isAvailable()) throw error;
      try {
        return await this.photoFallback.resolve(url);
      } catch (fallbackError) {
        if (fallbackError instanceof GalleryDlProcessError) throw fallbackError;
        throw fallbackError;
      }
    }
  }
}
