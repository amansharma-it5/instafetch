import { createApp } from './app.js';
import { MediaMaterializer } from './services/media/media-materializer.js';
import { ResolutionStore } from './services/store/resolution-store.js';
import { DownloadTokenService } from './services/tokens/download-tokens.js';

const port = Number(process.env.PORT ?? 3001);

const store = new ResolutionStore();
const materializer = new MediaMaterializer();
const tokenService = process.env.DOWNLOAD_TOKEN_SECRET ? new DownloadTokenService(process.env.DOWNLOAD_TOKEN_SECRET) : undefined;
const server = createApp({ store, materializer, tokenService }).listen(port, () => {
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
