/**
 * The whole "click a document → see it" flow:
 *
 *   1. Cancel whatever was downloading for the previous selection.
 *   2. If the document is already on disk (OPFS cache), open it immediately.
 *   3. Otherwise make room in the cache, then stream the API response to disk
 *      in a worker, reporting progress, speed and time remaining.
 *   4. Check whether the file is web-optimized (linearized):
 *        yes -> open through the service-worker URL; Apryse reads only the
 *               byte ranges it needs from disk (fast, low memory)
 *        no  -> hand Apryse the disk-backed File; it must load all of it
 *               either way, and this path is about twice as fast as ranges
 *   5. If the cached copy carries saved page edits, open it from the File and
 *      rebuild the latest version's page order (Apryse can only change pages
 *      of a fully loaded file).
 *
 * It also remembers the open version's pages as a page list (`getVersionPages`),
 * which the page editor starts from.
 *
 * Every step checks that the user hasn't selected something else meanwhile,
 * so a slow old request can never overwrite the current preview.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { documentContentUrl } from '../api/documents';
import {
  cacheFileName,
  ensureSpace,
  getCachedDocument,
  markOpened,
  registerDownloaded,
  registerEdited,
  type CachedDocument,
} from '../cache/opfsCache';
import { downloadToCache, DownloadCancelledError, DownloadFailedError, type DownloadHandle } from '../download/downloadClient';
import { applyPageList, composeChain, identityTokens, type PageToken } from '../lib/pageList';
import { isLinearized } from '../lib/pdfInfo';
import { ensurePdfServiceWorker, localPdfUrl, onDiskReadStats, resetDiskReadStats } from '../sw/pdfServiceWorker';
import type { DocumentSummary, FullLoadReason, LoadMode, PageEdits, PreviewState } from '../types';
import type { ViewerHandle } from '../viewer/ApryseViewer';

export function useDocumentPreview(viewerRef: RefObject<ViewerHandle | null>, networkProfile: string) {
  const [activeDoc, setActiveDoc] = useState<DocumentSummary | null>(null);
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const [diskReadBytes, setDiskReadBytes] = useState(0);
  const [cacheRevision, setCacheRevision] = useState(0);

  const selectionRef = useRef(0);
  const downloadRef = useRef<DownloadHandle | null>(null);
  const activeFileRef = useRef<string | null>(null);
  const activeDocRef = useRef<DocumentSummary | null>(null);
  const versionPagesRef = useRef<PageToken[]>([]);
  const stateRef = useRef<PreviewState>(state);
  stateRef.current = state;
  activeDocRef.current = activeDoc;

  // "Bytes read from disk" for the open document, reported by the service worker
  useEffect(
    () =>
      onDiskReadStats((stats) => {
        const file = activeFileRef.current;
        if (file && stats[file] !== undefined) setDiskReadBytes(stats[file]);
      }),
    []
  );

  /**
   * Opens a cached document in the viewer. Returns false if the user selected
   * something else meanwhile or opening failed (state is already updated).
   */
  const openCached = useCallback(
    async (
      cached: CachedDocument,
      doc: DocumentSummary,
      options: { isCurrent: () => boolean; fromCache: boolean; downloadMs: number | null; forEditing: boolean; keepPage?: number }
    ) => {
      const { isCurrent, fromCache, downloadMs, forEditing, keepPage } = options;
      activeFileRef.current = cached.storedFileName;

      const swReady = await ensurePdfServiceWorker();
      const linearized = await isLinearized(cached.file);
      let fullReason: FullLoadReason | undefined;
      if (forEditing) fullReason = 'editing';
      else if (cached.edits.length > 0) fullReason = 'includes-edits';
      else if (!linearized) fullReason = 'not-optimized';
      else if (!swReady) fullReason = 'no-service-worker';
      const loadMode: LoadMode = fullReason ? 'full' : 'on-demand';
      if (!isCurrent()) return false;

      setState({ status: 'opening', fromCache, loadMode, purpose: forEditing ? 'editing' : 'view' });
      resetDiskReadStats(cached.storedFileName);
      const openStarted = performance.now();

      try {
        const viewer = viewerRef.current!;
        const source = loadMode === 'on-demand' ? localPdfUrl(cached.storedFileName) : cached.file;
        viewer.setSourceFile(cached.file); // the "page library" for duplicates and restored pages
        await viewer.open(source, doc.fileName);
        const basePageCount = viewer.getPageCount();
        const versionPages = composeChain(basePageCount, cached.edits);
        if (cached.edits.length > 0) await applyPageList(viewer, identityTokens(basePageCount), versionPages);
        versionPagesRef.current = versionPages;
        if (keepPage) viewer.setCurrentPage(Math.min(keepPage, viewer.getPageCount()));
      } catch (err) {
        if (!isCurrent()) return false;
        setState({ status: 'error', code: 'VIEWER', message: (err as Error).message });
        return false;
      }
      if (!isCurrent()) return false;
      setState({ status: 'ready', fromCache, loadMode, fullReason, downloadMs, openMs: performance.now() - openStarted });
      return true;
    },
    [viewerRef]
  );

  const open = useCallback(
    async (doc: DocumentSummary) => {
      const token = ++selectionRef.current;
      const isCurrent = () => token === selectionRef.current;

      downloadRef.current?.cancel();
      downloadRef.current = null;
      setActiveDoc(doc);
      setDiskReadBytes(0);

      const fileName = cacheFileName(doc);
      activeFileRef.current = fileName;
      await viewerRef.current?.close().catch(() => undefined);

      await ensurePdfServiceWorker();
      let cached = await getCachedDocument(doc);
      const fromCache = !!cached;
      let downloadMs: number | null = null;
      if (!isCurrent()) return;

      if (!cached) {
        const hasSpace = await ensureSpace(doc.sizeBytes, fileName);
        if (!isCurrent()) return;
        if (!hasSpace) {
          setState({
            status: 'error',
            code: 'DISK_FULL',
            message: `There isn't enough free storage to keep a ${doc.sizeLabel} document. Clear cached documents or raise VITE_CACHE_LIMIT_MB.`,
          });
          return;
        }

        setState({ status: 'downloading', received: 0, total: doc.sizeBytes, bytesPerSecond: null });
        const started = performance.now();
        let lastBytes = 0;
        let lastTime = started;
        let smoothedSpeed: number | null = null;

        const handle = downloadToCache(documentContentUrl(doc, networkProfile), fileName, doc.sizeBytes, (received, total) => {
          if (!isCurrent()) return;
          const now = performance.now();
          const elapsed = (now - lastTime) / 1000;
          if (elapsed > 0.2) {
            const instant = (received - lastBytes) / elapsed;
            smoothedSpeed = smoothedSpeed === null ? instant : smoothedSpeed * 0.75 + instant * 0.25;
            lastBytes = received;
            lastTime = now;
          }
          setState({
            status: 'downloading',
            received,
            total,
            bytesPerSecond: now - started > 1000 ? smoothedSpeed : null,
          });
        });
        downloadRef.current = handle;

        try {
          const size = await handle.promise;
          registerDownloaded(doc, size); // cached even if the user already moved on
          setCacheRevision((r) => r + 1);
        } catch (err) {
          if (!isCurrent()) return;
          if (err instanceof DownloadCancelledError) {
            setState({ status: 'cancelled' });
          } else if (err instanceof DownloadFailedError) {
            setState({ status: 'error', code: err.code, message: err.message });
          } else {
            setState({ status: 'error', code: 'NETWORK', message: (err as Error).message });
          }
          return;
        } finally {
          if (downloadRef.current === handle) downloadRef.current = null;
        }
        if (!isCurrent()) return;
        downloadMs = performance.now() - started;
        cached = await getCachedDocument(doc);
      }

      if (!cached) {
        setState({ status: 'error', code: 'VIEWER', message: 'The downloaded file could not be read from disk storage.' });
        return;
      }
      markOpened(doc);
      await openCached(cached, doc, { isCurrent, fromCache, downloadMs, forEditing: false });
    },
    [viewerRef, networkProfile, openCached]
  );

  /**
   * Makes the open document editable. Apryse can only change pages of a fully
   * loaded file, so a page-by-page document is reopened from the file on disk
   * (about 4 s for 1 GB). Already fully loaded documents are ready at once,
   * unless `reload` is set (used to discard unsaved changes).
   */
  const prepareForEditing = useCallback(
    async (reload = false): Promise<boolean> => {
      const doc = activeDocRef.current;
      const current = stateRef.current;
      if (!doc || current.status !== 'ready') return false;
      if (!reload && current.loadMode === 'full') {
        setState({ ...current, fullReason: current.fullReason === 'not-optimized' ? 'not-optimized' : 'editing' });
        return true;
      }

      const cached = await getCachedDocument(doc);
      if (!cached) return false;
      const token = ++selectionRef.current;
      const keepPage = viewerRef.current?.getCurrentPage();
      return openCached(cached, doc, {
        isCurrent: () => token === selectionRef.current,
        fromCache: true,
        downloadMs: null,
        forEditing: true,
        keepPage,
      });
    },
    [viewerRef, openCached]
  );

  /**
   * Called after edits were saved on the server. The viewer already shows the
   * edited pages; the cache records the new version as "file on disk + edits",
   * so nothing is downloaded again.
   */
  const applySaved = useCallback((savedDoc: DocumentSummary, edits: PageEdits, newVersionPages: PageToken[]) => {
    const edited = activeDocRef.current;
    if (edited) registerEdited(edited, savedDoc, edits);
    versionPagesRef.current = newVersionPages;
    setActiveDoc(savedDoc);
    setCacheRevision((r) => r + 1);
  }, []);

  /** The open version's pages, as a page list (what the editor starts from) */
  const getVersionPages = useCallback(() => versionPagesRef.current.map((t) => ({ ...t })), []);

  const cancel = useCallback(() => downloadRef.current?.cancel(), []);

  const retry = useCallback(() => {
    if (activeDoc) void open(activeDoc);
  }, [activeDoc, open]);

  /** Forget the current selection (used when the cache is cleared). */
  const reset = useCallback(async () => {
    selectionRef.current++;
    downloadRef.current?.cancel();
    downloadRef.current = null;
    activeFileRef.current = null;
    setActiveDoc(null);
    setState({ status: 'idle' });
    await viewerRef.current?.close().catch(() => undefined);
    setCacheRevision((r) => r + 1);
  }, [viewerRef]);

  // Stop any download when the modal unmounts
  useEffect(
    () => () => {
      selectionRef.current++;
      downloadRef.current?.cancel();
    },
    []
  );

  return {
    activeDoc,
    state,
    diskReadBytes,
    cacheRevision,
    open,
    cancel,
    retry,
    reset,
    prepareForEditing,
    applySaved,
    getVersionPages,
  };
}
