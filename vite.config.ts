import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteMetaPlugin } from './plugins/site-meta';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const siteUrl = (env.VITE_SITE_URL || 'https://stellaris.app').replace(/\/+$/, '');
  const siteName = env.VITE_SITE_NAME || 'Stellaris';

  return {
    plugins: [
      react(),
      tailwindcss(),
      siteMetaPlugin({ siteUrl, siteName }),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'icon-maskable.svg',
          'samples/input.jpg',
          'samples/output.png',
        ],
        manifest: {
          name: `${siteName} — Star Annotator`,
          short_name: siteName,
          description:
            'Identify constellations, stars, and deep-sky objects in your night-sky photos through astrometric plate solving.',
          lang: 'en',
          dir: 'ltr',
          theme_color: '#0b0e16',
          background_color: '#0b0e16',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'any',
          start_url: '/',
          scope: '/',
          categories: ['photo', 'utilities', 'productivity', 'education'],
          icons: [
            { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
            {
              src: 'icon-maskable.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,jpg,webp,woff2}'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
    /**
     * SSR / prerender config. `scripts/prerender.mjs` imports the built server
     * bundle from `dist/server/entry-server.js` to generate per-language static
     * HTML at build time.
     */
    ssr: {
      noExternal: ['react-i18next', 'i18next'],
    },
  };
});
