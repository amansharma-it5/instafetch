import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { normalizeSiteUrl } from './src/site-config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = normalizeSiteUrl(env.VITE_SITE_URL);

  return {
    plugins: [
      react(),
      {
        name: 'instafetch-site-metadata',
        transformIndexHtml(html: string) {
          return html.replaceAll('__INSTAFETCH_SITE_URL__', siteUrl);
        },
      },
    ],
    server: {
      port: 5173,
    },
  };
});
