import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Task #103, 2026-07-22.
 *
 * `base: './'` -- the built assets are served from the Connector Service's
 * local API server at an arbitrary localhost port
 * (`CONNECTOR_MANAGER_PORT`, default 4200), not from a fixed known path,
 * so asset URLs must be relative rather than root-absolute.
 *
 * The dev server proxies `/api` and `/health` to the real Connector
 * Service (assumed running on 4200 locally per `connector/`'s own
 * default) so `npm run dev` here talks to a real, running Connector
 * process during UI development -- there is no separate mock backend for
 * this app; it is designed to only ever exist as a client of the local
 * API contract in `connector/src/api/local-api-server.ts`.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4200',
      '/health': 'http://127.0.0.1:4200',
    },
  },
  build: {
    outDir: 'dist',
  },
});
