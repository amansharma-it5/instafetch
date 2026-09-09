import type { ValidatedInstagramUrl } from '@instafetch/shared';
import { GalleryDlProcessError, isGalleryDlAvailable, runGalleryDlMetadata, type GalleryDlProcessOptions } from './gallery-dl-process.js';
import { normalizeGalleryDlMetadata } from './normalize-gallery-dl.js';
import type { InstagramExtractionProvider } from './InstagramExtractionProvider.js';

export interface GalleryDlInstagramProviderOptions extends GalleryDlProcessOptions {
  runMetadata?: (canonicalUrl: string, options?: GalleryDlProcessOptions) => Promise<unknown>;
}

export class GalleryDlInstagramProvider implements InstagramExtractionProvider {
  constructor(private readonly options: GalleryDlInstagramProviderOptions = {}) {}

  isAvailable(): boolean {
    return this.options.runMetadata ? true : isGalleryDlAvailable(this.options.executable);
  }

  async resolve(url: ValidatedInstagramUrl): Promise<Record<string, unknown>> {
    const runner = this.options.runMetadata ?? runGalleryDlMetadata;
    let metadata: unknown;
    try {
      metadata = await runner(url.canonicalUrl, this.options);
    } catch (error) {
      if (error instanceof GalleryDlProcessError) throw error;
      throw new GalleryDlProcessError('failed', 'gallery-dl metadata extraction failed');
    }
    try {
      return normalizeGalleryDlMetadata(metadata, url.route) as unknown as Record<string, unknown>;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'gallery-dl returned malformed metadata';
      if (/login|authentication|cookie|challenge/i.test(detail)) {
        throw new GalleryDlProcessError('failed', detail.slice(0, 500));
      }
      throw new GalleryDlProcessError('malformed', detail.slice(0, 500));
    }
  }
}
