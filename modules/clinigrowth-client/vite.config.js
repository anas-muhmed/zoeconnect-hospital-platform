/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || 'http://localhost:5000';

  return {
    plugins: [
      react(),
    ],
    // Mounted at /clinigrowth (correct spelling, matching ZoeConnect's own
    // existing naming for this module) rather than this repo's original
    // /cinigrowth typo.
    base: '/clinigrowth/',
    server: {
      host: true,
      port: 5174,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
    },
  };
});

