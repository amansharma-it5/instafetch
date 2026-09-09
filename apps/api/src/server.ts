import { createApp } from './app.js';
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
const server = createApp({ store, materializer, tokenService }).listen(port, '0.0.0.0', () => {
  process.stdout.write(`InstaFetch API listening on port ${port}\n`);
});

function shutdown(): void {
  server.close(() => {
    void materializer.dispose();
    store.dispose();
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
