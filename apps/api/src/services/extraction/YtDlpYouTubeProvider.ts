import type { ValidatedYouTubeUrl } from '@instafetch/shared';
import { isYtDlpAvailable, runYtDlpMetadata, type YtDlpProcessOptions } from './yt-dlp-process.js';
import type { YouTubeExtractionProvider } from './YouTubeExtractionProvider.js';

export interface YtDlpYouTubeProviderOptions extends YtDlpProcessOptions {
  runMetadata?: (canonicalUrl: string, options?: YtDlpProcessOptions) => Promise<Record<string, unknown>>;
}

export class YtDlpYouTubeProvider implements YouTubeExtractionProvider {
  constructor(private readonly options: YtDlpYouTubeProviderOptions = {}) {}

  isAvailable(): boolean {
    return this.options.runMetadata ? true : isYtDlpAvailable(this.options.executable);
  }

  async resolve(url: ValidatedYouTubeUrl): Promise<Record<string, unknown>> {
    const runner = this.options.runMetadata ?? runYtDlpMetadata;
    return runner(url.canonicalUrl, this.options);
  }
}
