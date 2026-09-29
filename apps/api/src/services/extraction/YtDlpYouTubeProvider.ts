import type { ValidatedYouTubeUrl } from '@instafetch/shared';
import { isYtDlpAvailable, runYtDlpMetadata, YtDlpProcessError, type YtDlpProcessOptions } from './yt-dlp-process.js';
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
    try {
      return await runner(url.canonicalUrl, this.options);
    } catch (error) {
      if (!(error instanceof YtDlpProcessError)
        || error.kind !== 'failed'
        || this.options.youtubePlayerClient
        || !/(sign in|login|authentication|not a bot|confirm .*bot|bot)/i.test(error.message)) {
        throw error;
      }
      // YouTube's anonymous client policy can vary by egress network. The
      // android_vr client is a documented credential-free fallback; it does
      // not use cookies, PO tokens, browser profiles, or proxying.
      return runner(url.canonicalUrl, { ...this.options, youtubePlayerClient: 'android_vr' });
    }
  }
}
