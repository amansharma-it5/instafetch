import { createApp } from './app.js';
import { BgutilProviderSupervisor } from './services/extraction/bgutil-provider.js';
import { MediaMaterializer } from './services/media/media-materializer.js';
import { ResolutionStore } from './services/store/resolution-store.js';
import { DownloadTokenService, isSecureDownloadTokenSecret } from './services/tokens/download-tokens.js';
import { YtDlpYouTubeProvider } from './services/extraction/YtDlpYouTubeProvider.js';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be a valid TCP port');
}

if (process.env.NODE_ENV === 'production' && !isSecureDownloadTokenSecret(process.env.DOWNLOAD_TOKEN_SECRET)) {
  throw new Error('DOWNLOAD_TOKEN_SECRET must be a unique random value of at least 32 characters in production');
}

const store = new ResolutionStore();
const materializer = new MediaMaterializer();
const configuredSecret = process.env.DOWNLOAD_TOKEN_SECRET?.trim();
const tokenService = isSecureDownloadTokenSecret(configuredSecret)
  ? new DownloadTokenService(configuredSecret)
  : undefined;
const potProvider = new BgutilProviderSupervisor();

async function start(): Promise<void> {
  await potProvider.start();
  const youtubeProvider = new YtDlpYouTubeProvider({
    youtubePotProviderUrl: potProvider.url(),
    requirePotProvider: process.env.NODE_ENV === 'production',
    isPotProviderAvailable: () => potProvider.isReady(),
  });
  const server = createApp({ store, materializer, tokenService, youtubeProvider }).listen(port, '0.0.0.0', () => {
    process.stdout.write(`InstaFetch API listening on port ${port}\n`);
  });

  async function shutdown(): Promise<void> {
    await potProvider.stop();
    server.close(() => {
      void materializer.dispose();
      store.dispose();
    });
  }

  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
}

void start();
