import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { normalizeSiteUrl } from './src/site-config';
import { robotsTxt, sitemapXml } from './src/site-assets';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = normalizeSiteUrl(env.VITE_SITE_URL);

  const siteMetadataPlugin: Plugin = {
    name: 'instafetch-site-metadata',
    transformIndexHtml(html: string) {
      return html.replaceAll('__INSTAFETCH_SITE_URL__', siteUrl);
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0];
        if (pathname === '/robots.txt') {
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.end(robotsTxt(siteUrl));
          return;
        }
        if (pathname === '/sitemap.xml') {
          response.setHeader('Content-Type', 'application/xml; charset=utf-8');
          response.end(sitemapXml(siteUrl));
          return;
        }
        next();
      });
    },
    generateBundle(_options: unknown, bundle: Record<string, { type: string; source?: string | Uint8Array }>) {
      const generated = {
        'robots.txt': robotsTxt(siteUrl),
        'sitemap.xml': sitemapXml(siteUrl),
      };
      Object.entries(generated).forEach(([fileName, source]) => {
        const asset = bundle[fileName];
        if (asset?.type === 'asset') {
          asset.source = source;
        } else {
          this.emitFile({ type: 'asset', fileName, source });
        }
      });
    },
  };

  return {
    plugins: [
      react(),
      siteMetadataPlugin,
    ],
    server: {
      port: 5173,
    },
  };
});
