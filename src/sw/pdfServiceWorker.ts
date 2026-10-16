/**
 * Registers the PDF cache service worker and reports "bytes read from disk"
 * statistics that it sends back (used in the preview's status line).
 */
import { config } from '../config';

let readyPromise: Promise<boolean> | null = null;
const statsListeners = new Set<(stats: Record<string, number>) => void>();

/**
 * Resolves true once the service worker controls this page, so requests to
 * /local-pdf/* are answered from disk. Resolves false if that isn't possible
 * (e.g. after a hard refresh with Shift+Reload, which bypasses service workers).
 */
export function ensurePdfServiceWorker(): Promise<boolean> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    if (!('serviceWorker' in navigator)) return false;

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'pdf-sw-stats') {
        statsListeners.forEach((listener) => listener(event.data.stats));
      }
    });

    await navigator.serviceWorker.register(config.serviceWorkerUrl, { scope: '/' });
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return true;

    // First visit: wait briefly for clients.claim() to take control of this page
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(!!navigator.serviceWorker.controller), 3000);
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(timer);
          resolve(true);
        },
        { once: true }
      );
    });
  })();
  return readyPromise;
}

export function onDiskReadStats(listener: (stats: Record<string, number>) => void): () => void {
  statsListeners.add(listener);
  return () => statsListeners.delete(listener);
}

export function resetDiskReadStats(fileName: string): void {
  navigator.serviceWorker.controller?.postMessage({ type: 'pdf-sw-reset-stats', fileName });
}

export function localPdfUrl(fileName: string): string {
  return `${config.localPdfPrefix}${encodeURIComponent(fileName)}`;
}
