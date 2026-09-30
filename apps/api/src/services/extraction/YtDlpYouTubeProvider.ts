import type { ValidatedYouTubeUrl } from '@instafetch/shared';
import { isYtDlpAvailable, runYtDlpMetadata, YtDlpProcessError, type YtDlpProcessOptions } from './yt-dlp-process.js';
import type { PotProviderHealth } from './pot-provider.js';
import type { YouTubeExtractionProvider } from './YouTubeExtractionProvider.js';

export interface YtDlpYouTubeProviderOptions extends YtDlpProcessOptions {
  runMetadata?: (canonicalUrl: string, options?: YtDlpProcessOptions) => Promise<Record<string, unknown>>;
  potProvider?: PotProviderHealth;
  requirePotProvider?: boolean;
  maxResolveTimeMs?: number;
}

function directMediaFormats(metadata: Record<string, unknown>): Record<string, unknown>[] | null {
  if (!Array.isArray(metadata.formats)) return null;
  return metadata.formats.filter((format): format is Record<string, unknown> => {
    if (!format || typeof format !== 'object' || Array.isArray(format)) return false;
    const candidate = format as Record<string, unknown>;
    const protocol = String(candidate.protocol ?? '').toLowerCase();
    return typeof candidate.url === 'string'
      && !protocol.startsWith('m3u8')
      && !candidate.url.includes('.m3u8');
  });
}

export class YtDlpYouTubeProvider implements YouTubeExtractionProvider {
  constructor(private readonly options: YtDlpYouTubeProviderOptions = {}) {}

  isAvailable(): boolean {
    const ytDlpAvailable = this.options.runMetadata ? true : isYtDlpAvailable(this.options.executable);
    return ytDlpAvailable && (!this.options.requirePotProvider || Boolean(this.options.potProvider?.isAvailable()));
  }

  availabilityErrorCode(): 'TOKEN_PROVIDER_UNAVAILABLE' | null {
    if (this.options.runMetadata || !this.options.requirePotProvider || !isYtDlpAvailable(this.options.executable)) {
      return null;
    }
    return this.options.potProvider?.isAvailable() === true ? null : 'TOKEN_PROVIDER_UNAVAILABLE';
  }

  async resolve(url: ValidatedYouTubeUrl): Promise<Record<string, unknown>> {
    const runner = this.options.runMetadata ?? runYtDlpMetadata;
    const startedAt = Date.now();
    const run = (options: YtDlpProcessOptions = this.options): Promise<Record<string, unknown>> => {
      const totalBudget = this.options.maxResolveTimeMs ?? 45_000;
      const elapsed = Date.now() - startedAt;
      const remaining = totalBudget - elapsed;
      if (remaining <= 0) throw new YtDlpProcessError('timeout', 'yt-dlp resolution timed out');
      return runner(url.canonicalUrl, {
        ...this.options,
        ...options,
        timeoutMs: Math.min(options.timeoutMs ?? this.options.timeoutMs ?? 30_000, remaining),
      });
    };
    const providerFallback = async (): Promise<Record<string, unknown>> => {
      try {
        return await run({
          youtubePlayerClient: 'mweb',
          youtubePotProviderUrl: this.options.potProvider?.baseUrl,
        });
      } catch (mwebError) {
        if (!this.shouldTryAndroidFallback(mwebError)) throw mwebError;
        return run({ youtubePlayerClient: 'android_vr' });
      }
    };
    try {
      const metadata = await run();
      if (!this.shouldTryMwebMetadata(metadata)) return metadata;
      return providerFallback();
    } catch (error) {
      if (!this.shouldTryMweb(error)) throw error;
      return providerFallback();
    }
  }

  private shouldTryMwebMetadata(metadata: Record<string, unknown>): boolean {
    if (!Array.isArray(metadata.formats) || metadata.formats.length === 0) return false;
    const formats = directMediaFormats(metadata);
    if (!formats || formats.length === 0) return true;
    const hasVideo = formats.some((format) => typeof format.vcodec === 'string' && format.vcodec !== 'none');
    const hasAudio = formats.some((format) => typeof format.acodec === 'string' && format.acodec !== 'none');
    return !hasVideo || !hasAudio;
  }

  private shouldTryMweb(error: unknown): boolean {
    if (!(error instanceof YtDlpProcessError) || error.kind !== 'failed' || this.options.youtubePlayerClient) {
      return false;
    }
    return error.code === 'PROVIDER_CHALLENGE'
      || error.code === 'EXTRACTION_FAILED'
      || error.code === 'LOGIN_REQUIRED'
      || /sign in|login|authentication|not a bot|confirm .*bot|bot|no (?:video|audio) formats?/i.test(error.message);
  }

  private shouldTryAndroidFallback(error: unknown): boolean {
    if (!(error instanceof YtDlpProcessError) || error.kind !== 'failed') return false;
    if (error.code === 'TOKEN_PROVIDER_UNAVAILABLE' || error.code === 'AGE_RESTRICTED' || error.code === 'PRIVATE_MEDIA') {
      return false;
    }
    return error.code === 'PROVIDER_CHALLENGE'
      || error.code === 'LOGIN_REQUIRED'
      || /sign in|login|authentication|not a bot|confirm .*bot|bot/i.test(error.message);
  }
}
