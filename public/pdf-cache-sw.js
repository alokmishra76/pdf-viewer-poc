/**
 * PDF cache service worker.
 *
 * Serves PDFs that were downloaded into the browser's private disk storage
 * (OPFS) at local URLs like /local-pdf/DOC-1006__v1.pdf. It answers HTTP
 * Range requests by slicing the file on disk, so Apryse reads only the bytes
 * it needs for the visible pages instead of loading the whole file.
 *
 * Plain JavaScript on purpose: service workers are served as-is from /public.
 */
const URL_PREFIX = '/local-pdf/';
const CACHE_DIR = 'pdf-cache';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(URL_PREFIX)) return;
  const fileName = decodeURIComponent(url.pathname.slice(URL_PREFIX.length));
  event.respondWith(serveFile(event.request, fileName));
});

/* ---------- "bytes read from disk" statistics for the demo ---------- */
const bytesServed = new Map();
let reportTimer = null;

function recordBytes(fileName, count) {
  bytesServed.set(fileName, (bytesServed.get(fileName) || 0) + count);
  if (reportTimer) return;
  reportTimer = setTimeout(async () => {
    reportTimer = null;
    const stats = Object.fromEntries(bytesServed);
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: 'pdf-sw-stats', stats }));
  }, 250);
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'pdf-sw-reset-stats') {
    bytesServed.delete(event.data.fileName);
  }
});

/* ---------------------------- file serving ---------------------------- */
async function getCachedFile(fileName) {
  if (!fileName || fileName.includes('/') || fileName.includes('..')) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(CACHE_DIR);
    const handle = await dir.getFileHandle(fileName);
    return await handle.getFile(); // disk-backed: not loaded into memory
  } catch {
    return null;
  }
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec((header || '').split(',')[0].trim());
  if (!match) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (!suffix) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

async function serveFile(request, fileName) {
  const file = await getCachedFile(fileName);
  if (!file) {
    return new Response('This document is not in the local cache.', { status: 404 });
  }

  const size = file.size;
  const baseHeaders = {
    'Content-Type': 'application/pdf',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers: { ...baseHeaders, 'Content-Length': String(size) } });
  }

  const range = parseRange(request.headers.get('Range'), size);
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` } });
  }
  if (!range) {
    recordBytes(fileName, size);
    return new Response(file, { status: 200, headers: { ...baseHeaders, 'Content-Length': String(size) } });
  }

  const { start, end } = range;
  const length = end - start + 1;
  recordBytes(fileName, length);
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: {
      ...baseHeaders,
      'Content-Length': String(length),
      'Content-Range': `bytes ${start}-${end}/${size}`,
    },
  });
}
