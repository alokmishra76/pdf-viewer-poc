/**
 * Main-thread wrapper around the download worker: turns its messages into a
 * promise with progress callbacks, and supports cancelling.
 */
import { config } from '../config';
import type { DownloadErrorCode } from '../types';
import type { WorkerRequest, WorkerResponse } from '../workers/downloadWorker';

export class DownloadFailedError extends Error {
  constructor(
    public readonly code: DownloadErrorCode,
    message: string
  ) {
    super(message);
  }
}

export class DownloadCancelledError extends Error {
  constructor() {
    super('Download cancelled');
  }
}

interface Pending {
  onProgress: (received: number, total: number) => void;
  resolve: (size: number) => void;
  reject: (err: Error) => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/downloadWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const entry = pending.get(message.requestId);
    if (!entry) return;
    switch (message.type) {
      case 'progress':
        entry.onProgress(message.received, message.total);
        break;
      case 'done':
        pending.delete(message.requestId);
        entry.resolve(message.size);
        break;
      case 'cancelled':
        pending.delete(message.requestId);
        entry.reject(new DownloadCancelledError());
        break;
      case 'error':
        pending.delete(message.requestId);
        entry.reject(new DownloadFailedError(message.code, message.message));
        break;
    }
  };
  return worker;
}

export interface DownloadHandle {
  promise: Promise<number>;
  cancel: () => void;
}

/** Starts streaming `url` into the OPFS cache file `fileName`. */
export function downloadToCache(
  url: string,
  fileName: string,
  expectedSize: number,
  onProgress: (received: number, total: number) => void
): DownloadHandle {
  const requestId = nextRequestId++;
  const promise = new Promise<number>((resolve, reject) => {
    pending.set(requestId, { onProgress, resolve, reject });
  });
  const message: WorkerRequest = {
    type: 'download',
    requestId,
    url: new URL(url, window.location.origin).toString(),
    token: config.apiToken,
    fileName,
    cacheDir: config.cacheDirName,
    expectedSize,
  };
  getWorker().postMessage(message);

  return {
    promise,
    cancel: () => getWorker().postMessage({ type: 'cancel', requestId } satisfies WorkerRequest),
  };
}
