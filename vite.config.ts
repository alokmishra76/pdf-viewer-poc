import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * CORS FIX
 * --------
 * The browser only ever calls its own origin (e.g. http://localhost:5173/api/...).
 * The Vite dev server forwards those requests to the mock API server behind
 * the scenes. Server-to-server calls are not subject to CORS, so the browser
 * never sees a cross-origin request and no CORS error can happen, whatever
 * port your front end runs on.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiTarget = env.API_TARGET || 'http://localhost:4000';

  const proxy: Record<string, ProxyOptions> = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
      configure: (proxyServer) => {
        // If the API server's connection breaks mid-download, break the browser's
        // connection too. Without this the proxy leaves the browser waiting forever.
        proxyServer.on('proxyRes', (proxyRes, _req, res) => {
          proxyRes.on('close', () => {
            if (!proxyRes.complete) res.destroy();
          });
        });
      },
    },
  };

  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
  };
});
