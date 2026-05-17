import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import keystatic from '@keystatic/astro';
import { fileURLToPath } from 'node:url';
import waveformIntegration from './src/integrations/waveform.mjs';

export default defineConfig({
  site: 'https://bluestudio.space',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // KeyStatic admin needs SSR for its API handlers. Existing pages opt back
  // into prerendering via `export const prerender = true;` at the top of each
  // route so the public site stays fully static.
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [sitemap(), waveformIntegration(), react(), keystatic()],
  devToolbar: { enabled: false },
  vite: {
    resolve: {
      alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  },
});
