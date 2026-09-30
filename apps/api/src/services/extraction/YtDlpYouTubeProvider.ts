import type { ValidatedYouTubeUrl } from '@instafetch/shared';
import { isYtDlpAvailable, runYtDlpMetadata, YtDlpProcessError, type YtDlpProcessOptions } from './yt-dlp-process.js';
import type { YouTubeExtractionProvider } from './YouTubeExtractionProvider.js';

export interface YtDlpYouTubeProviderOptions extends YtDlpProcessOptions {
  runMetadata?: (canonicalUrl: string, options?: YtDlpProcessOptions) => Promise<Record<string, unknown>>;
  requirePotProvider?: boolean;
  isPotProviderAvailable?: () => boolean;
  isYtDlpExecutableAvailable?: () => boolean;
}

export class YtDlpYouTubeProvider implements YouTubeExtractionProvider {
  constructor(private readonly options: YtDlpYouTubeProviderOptions = {}) {}

  isAvailable(): boolean {
    if (this.options.runMetadata) return true;
    if (!(this.options.isYtDlpExecutableAvailable?.() ?? isYtDlpAvailable(this.options.executable))) return false;
    return !this.options.requirePotProvider || this.options.isPotProviderAvailable?.() === true;
  }

  availabilityErrorCode(): 'TOKEN_PROVIDER_UNAVAILABLE' | null {
    if (this.options.runMetadata || !this.options.requirePotProvider || !(this.options.isYtDlpExecutableAvailable?.() ?? isYtDlpAvailable(this.options.executable))) {
      return null;
    }
    return this.options.isPotProviderAvailable?.() !== true
      ? 'TOKEN_PROVIDER_UNAVAILABLE'
      : null;
  }

  async resolve(url: ValidatedYouTubeUrl): Promise<Record<string, unknown>> {
    const runner = this.options.runMetadata ?? runYtDlpMetadata;
    const defaultOptions: YtDlpProcessOptions = {
      ...this.options,
      youtubePlayerClient: undefined,
      youtubePotProviderUrl: undefined,
    };
    try {
      return await runner(url.canonicalUrl, defaultOptions);
    } catch (error) {
      if (!(error instanceof YtDlpProcessError)
        || error.kind !== 'failed'
        || this.options.youtubePlayerClient
        || !/(sign in|login|authentication|not a bot|confirm .*bot|bot|po.?token)/i.test(error.message)) {
        throw error;
      }
      const providerUrl = this.options.youtubePotProviderUrl;
      if (providerUrl) {
        try {
          return await runner(url.canonicalUrl, {
            ...this.options,
            youtubePlayerClient: 'mweb',
            youtubePotProviderUrl: providerUrl,
          });
        } catch (providerError) {
          if (!(providerError instanceof YtDlpProcessError)
            || providerError.kind !== 'failed'
            || !/(sign in|login|authentication|not a bot|confirm .*bot|bot|po.?token)/i.test(providerError.message)) {
            throw providerError;
          }
        }
      }
      // YouTube's anonymous client policy can vary by egress network. The
      // android_vr client is a bounded credential-free fallback; it does not
      // use cookies, browser profiles, or proxying.
      return runner(url.canonicalUrl, {
        ...this.options,
        youtubePlayerClient: 'android_vr',
        youtubePotProviderUrl: undefined,
      });
    }
  }
}
