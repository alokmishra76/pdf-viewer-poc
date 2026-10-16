/** Front-end settings, read from .env (see .env.example). */
export const config = {
  /** Relative on purpose: requests go to this app's own origin and Vite proxies them (no CORS). */
  apiBase: '/api',
  apiToken: import.meta.env.VITE_API_TOKEN || 'demo-token',
  apryseLicenseKey: import.meta.env.VITE_APRYSE_LICENSE_KEY || undefined,
  webViewerPath: '/lib/webviewer',
  cacheLimitBytes: Number(import.meta.env.VITE_CACHE_LIMIT_MB || 3072) * 1024 * 1024,
  serviceWorkerUrl: '/pdf-cache-sw.js',
  localPdfPrefix: '/local-pdf/',
  cacheDirName: 'pdf-cache',
} as const;
