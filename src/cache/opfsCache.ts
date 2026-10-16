/**
 * Disk cache for downloaded PDFs, stored in the browser's Origin Private
 * File System (OPFS). Files are written by the download worker; this module
 * keeps the index (which files are complete), enforces the size limit, and
 * removes the least recently opened documents when space runs out.
 *
 * Saved page edits: after you save edits, the server has a new version of the
 * document. Instead of downloading it again (up to 1 GB), the cache records it
 * as "the file already on disk + these edits", and the viewer reapplies the
 * edits when opening it.
 */
import { config } from '../config';
import type { DocumentSummary, PageEdits, SavedEdits } from '../types';

interface CacheEntry {
  /** Name for this document version, e.g. DOC-1006__v3.pdf (the index key) */
  fileName: string;
  /** The file actually on disk. Differs from fileName when edits are layered on an older download. */
  storedFile?: string;
  documentId: string;
  version: number;
  /** Size of the stored file */
  sizeBytes: number;
  savedAt: number;
  lastOpenedAt: number;
  /** Edits to reapply to the stored file, oldest first */
  edits?: SavedEdits[];
}

type CacheIndex = Record<string, CacheEntry>;

export interface CachedDocument {
  file: File;
  /** Name of the file on disk (used for the service-worker URL) */
  storedFileName: string;
  /** Saved edits to reapply after opening, oldest first (empty for a plain download) */
  edits: SavedEdits[];
}

const INDEX_KEY = 'pdf-cache-index-v1';

const storedName = (entry: CacheEntry) => entry.storedFile ?? entry.fileName;

export function isCacheSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory && 'serviceWorker' in navigator;
}

/** File name encodes id + version, so a new version never reuses an old file. */
export function cacheFileName(doc: DocumentSummary): string {
  return `${doc.id}__v${doc.version}.pdf`.replace(/[^A-Za-z0-9._-]/g, '_');
}

function readIndex(): CacheIndex {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || '{}') as CacheIndex;
  } catch {
    return {};
  }
}

function writeIndex(index: CacheIndex): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

async function cacheDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(config.cacheDirName, { create: true });
}

async function removeFile(fileName: string): Promise<void> {
  try {
    const dir = await cacheDir();
    await dir.removeEntry(fileName);
  } catch {
    // already gone
  }
}

/** Is any remaining index entry still using this file on disk? */
function isFileReferenced(index: CacheIndex, fileName: string): boolean {
  return Object.values(index).some((entry) => storedName(entry) === fileName);
}

/** Returns the cached copy of this exact document version, or null. */
export async function getCachedDocument(doc: DocumentSummary): Promise<CachedDocument | null> {
  const key = cacheFileName(doc);
  const entry = readIndex()[key];
  if (!entry) return null;
  const stored = storedName(entry);
  try {
    const dir = await cacheDir();
    const file = await (await dir.getFileHandle(stored)).getFile();
    // A plain download must match the server's size; an edited copy must match what we stored
    const expectedSize = entry.edits?.length ? entry.sizeBytes : doc.sizeBytes;
    if (file.size !== expectedSize) return null;
    return { file, storedFileName: stored, edits: entry.edits ?? [] };
  } catch {
    // Index says cached but the file is gone (e.g. browser cleared storage)
    const index = readIndex();
    delete index[key];
    writeIndex(index);
    return null;
  }
}

export function isCached(doc: DocumentSummary): boolean {
  return !!readIndex()[cacheFileName(doc)];
}

export function markOpened(doc: DocumentSummary): void {
  const index = readIndex();
  const entry = index[cacheFileName(doc)];
  if (entry) {
    entry.lastOpenedAt = Date.now();
    writeIndex(index);
  }
}

/** Removes every cache entry for a document except `keepKey`, deleting files no longer used. */
function dropOtherVersions(index: CacheIndex, documentId: string, keepKey: string): string[] {
  const filesToCheck: string[] = [];
  for (const entry of Object.values(index)) {
    if (entry.documentId === documentId && entry.fileName !== keepKey) {
      delete index[entry.fileName];
      filesToCheck.push(storedName(entry));
    }
  }
  return filesToCheck.filter((name) => !isFileReferenced(index, name));
}

/** Called by the download flow once the worker has fully written the file. */
export function registerDownloaded(doc: DocumentSummary, sizeBytes: number): void {
  const index = readIndex();
  const fileName = cacheFileName(doc);
  index[fileName] = {
    fileName,
    documentId: doc.id,
    version: doc.version,
    sizeBytes,
    savedAt: Date.now(),
    lastOpenedAt: Date.now(),
  };
  const unused = dropOtherVersions(index, doc.id, fileName);
  writeIndex(index);
  unused.forEach((name) => void removeFile(name));
}

/**
 * Called after page edits are saved. Records the new server version as "the
 * file already on disk + these edits", so it opens without a new download.
 * Returns false if the edited version wasn't cached (it will download normally).
 */
export function registerEdited(editedDoc: DocumentSummary, savedDoc: DocumentSummary, edits: PageEdits): boolean {
  const index = readIndex();
  const previous = index[cacheFileName(editedDoc)];
  if (!previous) return false;

  const key = cacheFileName(savedDoc);
  index[key] = {
    ...previous,
    fileName: key,
    storedFile: storedName(previous),
    version: savedDoc.version,
    lastOpenedAt: Date.now(),
    edits: [...(previous.edits ?? []), edits],
  };
  const unused = dropOtherVersions(index, savedDoc.id, key);
  writeIndex(index);
  unused.forEach((name) => void removeFile(name));
  return true;
}

export function cacheUsageBytes(): number {
  const seen = new Set<string>();
  let total = 0;
  for (const entry of Object.values(readIndex())) {
    if (seen.has(storedName(entry))) continue;
    seen.add(storedName(entry));
    total += entry.sizeBytes;
  }
  return total;
}

/**
 * Makes room for a new download of `bytesNeeded`. Evicts least recently
 * opened documents first. Returns false if it's impossible (file larger than
 * the limit, or the disk itself is full).
 */
export async function ensureSpace(bytesNeeded: number, keepFileName?: string): Promise<boolean> {
  if (bytesNeeded > config.cacheLimitBytes) return false;

  const index = readIndex();
  const entries = Object.values(index)
    .filter((entry) => entry.fileName !== keepFileName)
    .sort((a, b) => a.lastOpenedAt - b.lastOpenedAt);

  const evictOldest = async () => {
    const oldest = entries.shift();
    if (!oldest) return false;
    delete index[oldest.fileName];
    writeIndex(index);
    if (!isFileReferenced(index, storedName(oldest))) await removeFile(storedName(oldest));
    return true;
  };

  while (cacheUsageBytes() + bytesNeeded > config.cacheLimitBytes) {
    if (!(await evictOldest())) break;
  }

  // Also respect the browser's own storage quota for this site
  const freeBytes = (e: StorageEstimate) => (e.quota ?? Infinity) - (e.usage ?? 0);
  let estimate = await navigator.storage.estimate();
  while (freeBytes(estimate) < bytesNeeded * 1.05) {
    if (!(await evictOldest())) return false; // nothing left to evict: the disk is genuinely full
    estimate = await navigator.storage.estimate();
  }
  return true;
}

/**
 * Removes files that are not in the index: leftovers from downloads that
 * were cancelled or interrupted when the tab closed.
 */
export async function cleanUpPartialFiles(activeFileName?: string): Promise<void> {
  if (!isCacheSupported()) return;
  const index = readIndex();
  const dir = await cacheDir();
  const names: string[] = [];
  for await (const [name] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    names.push(name);
  }
  for (const name of names) {
    if (!isFileReferenced(index, name) && name !== activeFileName) await removeFile(name);
  }
}

/** Deletes every cached document (e.g. on logout, or from the demo button). */
export async function clearCache(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(config.cacheDirName, { recursive: true });
  } catch {
    // nothing to clear
  }
  writeIndex({});
}
