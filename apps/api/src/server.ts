import { createApp } from './app.js';
import { isFfmpegAvailable, isFfprobeAvailable } from './services/extraction/ffmpeg-process.js';
import { PotProviderSupervisor } from './services/extraction/pot-provider.js';
import { YtDlpYouTubeProvider } from './services/extraction/YtDlpYouTubeProvider.js';
import { MediaMaterializer } from './services/media/media-materializer.js';
import { ResolutionStore } from './services/store/resolution-store.js';
import { DownloadTokenService, isSecureDownloadTokenSecret } from './services/tokens/download-tokens.js';

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
const providerEnabled = process.env.NODE_ENV === 'production' || process.env.POT_PROVIDER_ENABLED === 'true';
const potProvider = new PotProviderSupervisor({ enabled: providerEnabled });

async function startServer(): Promise<void> {
  // In production the provider is a required local dependency. A startup
  // failure must keep the service out of Render's ready pool instead of
  // accepting YouTube requests that are guaranteed to fail later.
  await potProvider.start();
  const youtubeProvider = new YtDlpYouTubeProvider({
    potProvider,
    requirePotProvider: providerEnabled,
  });
  const app = createApp({
    store,
    materializer,
    tokenService,
    youtubeProvider,
    runtimeChecks: () => ({
      ffmpeg: isFfmpegAvailable(),
      ffprobe: isFfprobeAvailable(),
      potProvider: potProvider.isAvailable(),
    }),
  });
  const server = app.listen(port, '0.0.0.0', () => {
    process.stdout.write(`InstaFetch API listening on port ${port}\n`);
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => {
      void Promise.all([
        materializer.dispose(),
        potProvider.stop(),
      ]).finally(() => {
        store.dispose();
      });
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Server startup failed';
  process.stderr.write(`${message}\n`);
  store.dispose();
  void materializer.dispose();
  void potProvider.stop();
  process.exitCode = 1;
});
