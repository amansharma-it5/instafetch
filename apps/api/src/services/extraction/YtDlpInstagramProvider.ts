import type { ValidatedInstagramUrl } from '@instafetch/shared';
import { isYtDlpAvailable, runYtDlpMetadata, type YtDlpProcessOptions } from './yt-dlp-process.js';
import type { InstagramExtractionProvider } from './InstagramExtractionProvider.js';

export interface YtDlpInstagramProviderOptions extends YtDlpProcessOptions {
  runMetadata?: (canonicalUrl: string, options?: YtDlpProcessOptions) => Promise<Record<string, unknown>>;
}

export class YtDlpInstagramProvider implements InstagramExtractionProvider {
  constructor(private readonly options: YtDlpInstagramProviderOptions = {}) {}

  isAvailable(): boolean {
    return this.options.runMetadata ? true : isYtDlpAvailable(this.options.executable);
  }

  async resolve(url: ValidatedInstagramUrl): Promise<Record<string, unknown>> {
    const runner = this.options.runMetadata ?? runYtDlpMetadata;
    return runner(url.canonicalUrl, this.options);
  }
}
