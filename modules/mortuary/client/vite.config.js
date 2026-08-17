import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.VITE_BACKEND_PORT || '3001';

  return {
    plugins: [react()],
    // In the unified platform this app is served at /mortuary/ — the base
    // makes all asset paths relative to that prefix in the production build.
    base: '/mortuary/',
    server: {
      port: 3001,
      host: '0.0.0.0',
      proxy: {
        '/api/mortuary': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
