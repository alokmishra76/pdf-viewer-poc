/**
 * Download worker.
 *
 * Fetches the PDF from the API and writes each chunk straight to disk (OPFS)
 * as it arrives. The full file is never held in memory, and none of this work
 * runs on the main thread, so the UI stays responsive during a 1 GB download.
 *
 * Runs one download at a time. Starting a new one cancels the previous one.
 */
import type { DownloadErrorCode } from '../types';

export type WorkerRequest =
  | { type: 'download'; requestId: number; url: string; token: string; fileName: string; cacheDir: string; expectedSize: number }
  | { type: 'cancel'; requestId: number };

export type WorkerResponse =
  | { type: 'progress'; requestId: number; received: number; total: number }
  | { type: 'done'; requestId: number; size: number }
  | { type: 'cancelled'; requestId: number }
  | { type: 'error'; requestId: number; code: DownloadErrorCode; message: string };

/** Minimal typing for OPFS sync access handles (only available inside workers). */
interface SyncAccessHandle {
  write(buffer: ArrayBufferView, options?: { at?: number }): number;
  flush(): void;
  close(): void;
  truncate(size: number): void;
}

class DownloadError extends Error {
  constructor(
    public readonly code: DownloadErrorCode,
    message: string
  ) {
    super(message);
  }
}

interface ActiveDownload {
  requestId: number;
  controller: AbortController;
  finished: Promise<void>;
}

let active: ActiveDownload | null = null;

/** Fail the download if no data arrives for this long (a stalled connection). */
const STALL_TIMEOUT_MS = 20_000;

const post = (message: WorkerResponse) => self.postMessage(message);

function httpError(status: number): DownloadError {
  if (status === 401) return new DownloadError('UNAUTHORIZED', 'The server rejected the access token.');
  if (status === 404) return new DownloadError('NOT_FOUND', 'The server has no file for this document.');
  return new DownloadError('SERVER', `The server responded with an error (HTTP ${status}).`);
}

async function runDownload(request: Extract<WorkerRequest, { type: 'download' }>, controller: AbortController) {
  const { requestId, url, token, fileName, cacheDir, expectedSize } = request;

  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(cacheDir, { create: true });
  await dir.removeEntry(fileName).catch(() => undefined);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const createHandle = (fileHandle as unknown as { createSyncAccessHandle?: () => Promise<SyncAccessHandle> })
    .createSyncAccessHandle;
  if (!createHandle) {
    throw new DownloadError('UNSUPPORTED', 'This browser cannot write files to disk storage. Use a current Chrome, Edge, Firefox or Safari.');
  }
  const access = await createHandle.call(fileHandle);

  let received = 0;

  // Watchdog: restarted on every chunk; aborts if the connection goes silent
  let stalled = false;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const armWatchdog = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, STALL_TIMEOUT_MS);
  };
  const stalledError = () =>
    new DownloadError(
      'NETWORK',
      `The connection stopped responding after ${Math.round(received / 1024 / 1024)} MB. Check the network and try again.`
    );

  try {
    armWatchdog();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (err) {
      if (stalled) throw stalledError();
      if (controller.signal.aborted) throw err;
      throw new DownloadError('NETWORK', 'Could not connect to the server.');
    }
    if (!response.ok || !response.body) throw httpError(response.status);

    const total = Number(response.headers.get('Content-Length')) || expectedSize;
    const reader = response.body.getReader();
    let lastReport = 0;

    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (stalled) throw stalledError();
        if (controller.signal.aborted) throw err;
        throw new DownloadError(
          'NETWORK',
          `The connection dropped after ${Math.round(received / 1024 / 1024)} MB of ${Math.round(total / 1024 / 1024)} MB.`
        );
      }
      if (chunk.done) break;
      armWatchdog();

      try {
        access.write(chunk.value, { at: received });
      } catch (err) {
        if ((err as Error).name === 'QuotaExceededError') {
          throw new DownloadError('DISK_FULL', 'The browser ran out of storage space for this document.');
        }
        throw err;
      }
      received += chunk.value.byteLength;

      const now = performance.now();
      if (now - lastReport > 100) {
        lastReport = now;
        post({ type: 'progress', requestId, received, total });
      }
    }

    if (total && received !== total) {
      throw new DownloadError('INCOMPLETE', `The download ended early (${received} of ${total} bytes).`);
    }

    clearTimeout(stallTimer);
    access.flush();
    access.close();
    post({ type: 'progress', requestId, received, total });
    post({ type: 'done', requestId, size: received });
  } catch (err) {
    clearTimeout(stallTimer);
    try {
      access.close();
    } catch {
      // already closed
    }
    await dir.removeEntry(fileName).catch(() => undefined); // never leave half a file behind
    throw err;
  }
}

async function startDownload(request: Extract<WorkerRequest, { type: 'download' }>) {
  // Stop the previous download and wait until its file is cleaned up
  if (active) {
    active.controller.abort();
    await active.finished.catch(() => undefined);
  }

  const controller = new AbortController();
  const finished = runDownload(request, controller);
  const current: ActiveDownload = { requestId: request.requestId, controller, finished };
  active = current;

  try {
    await finished;
  } catch (err) {
    // Check DownloadError first: a stall also aborts the request, but it is an error, not a cancel
    if (err instanceof DownloadError) {
      post({ type: 'error', requestId: request.requestId, code: err.code, message: err.message });
    } else if (controller.signal.aborted) {
      post({ type: 'cancelled', requestId: request.requestId });
    } else {
      post({ type: 'error', requestId: request.requestId, code: 'NETWORK', message: (err as Error).message || 'Download failed.' });
    }
  } finally {
    if (active === current) active = null;
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'download') {
    void startDownload(message);
  } else if (message.type === 'cancel' && active?.requestId === message.requestId) {
    active.controller.abort();
  }
};
