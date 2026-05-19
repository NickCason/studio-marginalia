import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import keystatic from '@keystatic/astro';
import { fileURLToPath } from 'node:url';
import waveformIntegration from './src/integrations/waveform.mjs';

export default defineConfig({
  site: 'https://bluestudio.space',
  // 'ignore' (not 'always') so the SSR layer doesn't 308-redirect KeyStatic's
  // API routes (e.g. /api/keystatic/github/oauth/callback) into a 404.
  // Prerendered public pages still resolve under either form because they're
  // served as static index.html files by the CDN.
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  // KeyStatic admin needs SSR for its API handlers. Existing pages opt back
  // into prerendering via `export const prerender = true;` at the top of each
  // route so the public site stays fully static.
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [
    sitemap({ filter: (page) => !page.includes('/preview/') }),
    waveformIntegration(),
    react(),
    keystatic(),
  ],
  devToolbar: { enabled: false },
  vite: {
    resolve: {
      alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // The OG route (`src/pages/og/[...slug].png.ts`) uses @resvg/resvg-js,
    // which ships a native .node binary. The route is prerendered, so the
    // worker never executes it — but Rollup still walks its import graph
    // and chokes on the binary. Mark it external for the SSR build to keep
    // it out of the worker bundle.
    ssr: {
      external: ['@resvg/resvg-js'],
    },
    build: {
      rollupOptions: {
        external: ['@resvg/resvg-js'],
      },
    },
  },
});
