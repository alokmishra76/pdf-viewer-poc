/**
 * Page editing: move, swap, insert blank pages, duplicate, delete, rotate,
 * undo/redo, find blank pages, and save.
 *
 * The editor's state is the ordered list of pages ("tokens", see lib/pageList).
 * Each action builds a new list; `applyPageList` updates the viewer to match.
 * Undo and redo are just earlier or later lists.
 *
 * Saving sends the finished page order (page numbers of the version being
 * edited); the server builds the new PDF version.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { EditSaveError, saveDocumentEdits } from '../api/documents';
import { BLANK_PAGE_INK_THRESHOLD, inkRatio } from '../lib/pageEdits';
import { applyPageList, newTokenId, sameList, toServerEdits, type PageToken, type Rotation0 } from '../lib/pageList';
import type { DocumentSummary, PageEdits } from '../types';
import type { ViewerHandle } from '../viewer/ApryseViewer';

export interface BlankPageCandidate {
  tokenId: string;
  /** Small image of the page */
  preview: string;
  inkPercent: number;
}

export type BlankScanState =
  | { status: 'idle' }
  | { status: 'scanning'; done: number; total: number }
  | { status: 'done'; candidates: BlankPageCandidate[]; scanned: number; cancelled: boolean };

export type EditorMessage = { kind: 'success' | 'error' | 'conflict'; text: string } | null;

/** What the current page is, for the toolbar */
export type PageOrigin = { kind: 'original'; page: number } | { kind: 'copy'; page: number } | { kind: 'blank' };

interface Options {
  viewerRef: RefObject<ViewerHandle | null>;
  doc: DocumentSummary | null;
  /** True when the preview is showing a document */
  documentReady: boolean;
  /** Reloads the document so its pages can be changed (see useDocumentPreview) */
  prepareForEditing: (reload?: boolean) => Promise<boolean>;
  /** The open version's pages (what editing starts from) */
  getVersionPages: () => PageToken[];
  /** Records a successful save (cache + active document) */
  applySaved: (savedDoc: DocumentSummary, edits: PageEdits, newVersionPages: PageToken[]) => void;
  /** Lets the list show the new version */
  onDocumentSaved: (savedDoc: DocumentSummary) => void;
}

const THUMBNAIL_WIDTH = 160;
const MAX_HISTORY = 100;

export function usePageEditor({
  viewerRef,
  doc,
  documentReady,
  prepareForEditing,
  getVersionPages,
  applySaved,
  onDocumentSaved,
}: Options) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<null | 'preparing' | 'working' | 'saving'>(null);
  const [revision, setRevision] = useState(0); // bumps whenever the page list changes
  const [currentPage, setCurrentPage] = useState(1);
  const [scan, setScan] = useState<BlankScanState>({ status: 'idle' });
  const [selectedBlank, setSelectedBlank] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<EditorMessage>(null);

  /** Pages as currently shown in the viewer */
  const pages = useRef<PageToken[]>([]);
  /** Pages of the saved version being edited (unsaved changes = difference from this) */
  const baseline = useRef<PageToken[]>([]);
  const past = useRef<PageToken[][]>([]);
  const future = useRef<PageToken[][]>([]);
  const scanToken = useRef(0);
  const cancelRequested = useRef(false);

  const bump = () => setRevision((r) => r + 1);

  /** Leaves edit mode and forgets everything (no reload) */
  const reset = useCallback(() => {
    scanToken.current++;
    setEditing(false);
    setBusy(null);
    setScan({ status: 'idle' });
    setSelectedBlank(new Set());
    setMessage(null);
    pages.current = [];
    baseline.current = [];
    past.current = [];
    future.current = [];
    bump();
  }, []);

  // A different document was selected: start over
  useEffect(() => {
    reset();
  }, [doc?.id, reset]);

  // Keep the "Page N" label in sync while editing
  useEffect(() => {
    if (!editing) return;
    const timer = setInterval(() => setCurrentPage(viewerRef.current?.getCurrentPage() ?? 1), 300);
    return () => clearInterval(timer);
  }, [editing, viewerRef]);

  const startTracking = useCallback(() => {
    const versionPages = getVersionPages();
    pages.current = versionPages;
    baseline.current = versionPages.map((t) => ({ ...t }));
    past.current = [];
    future.current = [];
    bump();
  }, [getVersionPages]);

  const startEditing = useCallback(async () => {
    if (!documentReady || editing) return editing;
    setBusy('preparing');
    setMessage(null);
    const ok = await prepareForEditing();
    setBusy(null);
    if (!ok) {
      setMessage({ kind: 'error', text: 'The document could not be prepared for editing.' });
      return false;
    }
    startTracking();
    setEditing(true);
    setCurrentPage(viewerRef.current?.getCurrentPage() ?? 1);
    return true;
  }, [documentReady, editing, prepareForEditing, startTracking, viewerRef]);

  /**
   * Shows `next` in the viewer. `history` controls undo: a normal change is
   * recorded; undo/redo move between the stacks themselves.
   */
  const show = useCallback(
    async (next: PageToken[], options: { history: 'record' | 'none'; focusPage?: number }) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      setBusy('working');
      setMessage(null);
      try {
        const previous = pages.current;
        pages.current = await applyPageList(viewer, previous, next);
        if (options.history === 'record') {
          past.current = [...past.current.slice(-(MAX_HISTORY - 1)), previous];
          future.current = [];
        }
        if (options.focusPage) viewer.setCurrentPage(Math.min(options.focusPage, pages.current.length));
      } catch (err) {
        setMessage({ kind: 'error', text: `That change could not be made: ${(err as Error).message}` });
      } finally {
        setBusy(null);
        bump();
      }
    },
    [viewerRef]
  );

  /** Index (0-based) of the page the viewer is on */
  const currentIndex = () => Math.max(0, (viewerRef.current?.getCurrentPage() ?? 1) - 1);

  const canChange = () => editing && busy === null && pages.current.length > 0;

  const rotateCurrentPage = useCallback(
    async (direction: 'left' | 'right') => {
      if (!canChange()) return;
      const i = currentIndex();
      const step = direction === 'right' ? 90 : 270;
      const next = pages.current.map((t, k) => (k === i ? { ...t, rotate: (((t.rotate + step) % 360) as Rotation0) } : t));
      await show(next, { history: 'record', focusPage: i + 1 });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, busy, show]
  );

  /** Deletes pages by token id */
  const deletePages = useCallback(
    async (ids: string[]) => {
      if (!canChange()) return;
      const remove = new Set(ids);
      const next = pages.current.filter((t) => !remove.has(t.id));
      if (next.length === 0) {
        setMessage({ kind: 'error', text: 'A document must keep at least one page.' });
        return;
      }
      await show(next, { history: 'record', focusPage: currentIndex() + 1 });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, busy, show]
  );

  const deleteCurrentPage = useCallback(async () => {
    const token = pages.current[currentIndex()];
    if (token) await deletePages([token.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deletePages]);

  /** Moves the current page so it becomes page `position` (1-based) */
  const moveCurrentPageTo = useCallback(
    async (position: number) => {
      if (!canChange()) return;
      const count = pages.current.length;
      if (!Number.isInteger(position) || position < 1 || position > count) {
        setMessage({ kind: 'error', text: `Enter a page position between 1 and ${count}.` });
        return;
      }
      const i = currentIndex();
      if (position - 1 === i) return;
      const next = [...pages.current];
      const [token] = next.splice(i, 1);
      next.splice(position - 1, 0, token);
      await show(next, { history: 'record', focusPage: position });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, busy, show]
  );

  /** Swaps the current page with page `position` (1-based) */
  const swapCurrentPageWith = useCallback(
    async (position: number) => {
      if (!canChange()) return;
      const count = pages.current.length;
      if (!Number.isInteger(position) || position < 1 || position > count) {
        setMessage({ kind: 'error', text: `Enter a page position between 1 and ${count}.` });
        return;
      }
      const i = currentIndex();
      const j = position - 1;
      if (i === j) return;
      const next = [...pages.current];
      [next[i], next[j]] = [next[j], next[i]];
      await show(next, { history: 'record', focusPage: position });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, busy, show]
  );

  /** Inserts a blank page the same size and orientation as the current page */
  const insertBlankPage = useCallback(
    async (where: 'before' | 'after') => {
      if (!canChange()) return;
      const i = currentIndex();
      const size = viewerRef.current!.getDisplayedPageSize(i + 1);
      const blank: PageToken = {
        id: newTokenId('n'),
        ref: { kind: 'blank', width: Math.round(size.width), height: Math.round(size.height) },
        rotate: 0,
      };
      const at = where === 'before' ? i : i + 1;
      const next = [...pages.current];
      next.splice(at, 0, blank);
      await show(next, { history: 'record', focusPage: at + 1 });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, busy, show, viewerRef]
  );

  /** Inserts a copy of the current page right after it */
  const duplicateCurrentPage = useCallback(async () => {
    if (!canChange()) return;
    const i = currentIndex();
    const copy: PageToken = { ...pages.current[i], id: newTokenId('c') };
    const next = [...pages.current];
    next.splice(i + 1, 0, copy);
    await show(next, { history: 'record', focusPage: i + 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, busy, show]);

  const undo = useCallback(async () => {
    if (!canChange() || past.current.length === 0) return;
    const previous = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    future.current = [pages.current, ...future.current];
    await show(previous, { history: 'none' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, busy, show]);

  const redo = useCallback(async () => {
    if (!canChange() || future.current.length === 0) return;
    const [next, ...rest] = future.current;
    future.current = rest;
    past.current = [...past.current, pages.current];
    await show(next, { history: 'none' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, busy, show]);

  /* ----------------------------- blank pages ----------------------------- */

  const findBlankPages = useCallback(async () => {
    if (!(await startEditing())) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const token = ++scanToken.current;
    cancelRequested.current = false;
    const scanned = [...pages.current];
    const candidates: BlankPageCandidate[] = [];
    let lastUpdate = 0;
    setBusy('working');
    setScan({ status: 'scanning', done: 0, total: scanned.length });

    let done = 0;
    for (let page = 1; page <= scanned.length; page++) {
      if (token !== scanToken.current) return; // document changed: drop the scan entirely
      if (cancelRequested.current) break; // user stopped it: keep the results so far
      const pageToken = scanned[page - 1];
      // Blank pages the user inserted on purpose are not suggestions
      if (pageToken.ref.kind !== 'blank') {
        let canvas: HTMLCanvasElement;
        try {
          canvas = await viewer.renderThumbnail(page, THUMBNAIL_WIDTH);
        } catch (err) {
          if (token !== scanToken.current) return;
          setMessage({ kind: 'error', text: `The scan stopped at page ${page}: ${(err as Error).message}` });
          break;
        }
        const ratio = inkRatio(canvas);
        if (ratio < BLANK_PAGE_INK_THRESHOLD) {
          candidates.push({
            tokenId: pageToken.id,
            preview: canvas.toDataURL('image/jpeg', 0.7),
            inkPercent: Math.round(ratio * 10000) / 100,
          });
        }
      }
      done = page;
      if (performance.now() - lastUpdate > 150) {
        lastUpdate = performance.now();
        setScan({ status: 'scanning', done: page, total: scanned.length });
      }
    }

    if (token !== scanToken.current) return;
    setScan({ status: 'done', candidates, scanned: done, cancelled: done < scanned.length });
    setSelectedBlank(new Set(candidates.map((c) => c.tokenId)));
    setBusy(null);
  }, [startEditing, viewerRef]);

  const cancelScan = useCallback(() => {
    cancelRequested.current = true;
  }, []);

  const closeScanResults = useCallback(() => setScan({ status: 'idle' }), []);

  const toggleBlankSelection = useCallback((tokenId: string) => {
    setSelectedBlank((previous) => {
      const next = new Set(previous);
      if (next.has(tokenId)) next.delete(tokenId);
      else next.add(tokenId);
      return next;
    });
  }, []);

  const deleteSelectedBlankPages = useCallback(async () => {
    await deletePages([...selectedBlank]);
    setScan({ status: 'idle' });
    setSelectedBlank(new Set());
  }, [deletePages, selectedBlank]);

  /** Current position (1-based) of a page, or 0 if it was removed */
  const positionOf = useCallback((tokenId: string) => pages.current.findIndex((t) => t.id === tokenId) + 1, []);

  const goToPage = useCallback((tokenId: string) => {
    const position = positionOf(tokenId);
    if (position > 0) viewerRef.current?.setCurrentPage(position);
  }, [positionOf, viewerRef]);

  /* -------------------------------- save -------------------------------- */

  const hasUnsavedChanges = editing && !sameList(pages.current, baseline.current);

  const save = useCallback(async () => {
    if (!doc || !hasUnsavedChanges || busy) return;
    let edits: PageEdits;
    try {
      edits = toServerEdits(pages.current, baseline.current);
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
      return;
    }

    setBusy('saving');
    setMessage(null);
    try {
      const saved = await saveDocumentEdits(doc, edits);
      const newVersionPages = pages.current.map((t) => ({ ...t }));
      applySaved(saved, edits, newVersionPages);
      onDocumentSaved(saved);
      baseline.current = newVersionPages.map((t) => ({ ...t })); // the saved version is the new starting point
      past.current = [];
      future.current = [];
      setMessage({ kind: 'success', text: `Saved as version ${saved.version} (${saved.pageCount.toLocaleString()} pages).` });
    } catch (err) {
      if (err instanceof EditSaveError && err.code === 'VERSION_CONFLICT') {
        setMessage({ kind: 'conflict', text: `${err.message} Your changes were not saved.` });
      } else {
        setMessage({ kind: 'error', text: (err as Error).message });
      }
    } finally {
      setBusy(null);
      bump();
    }
  }, [doc, hasUnsavedChanges, busy, applySaved, onDocumentSaved]);

  /** Throws away unsaved changes by reloading the saved version */
  const discard = useCallback(async () => {
    setBusy('preparing');
    setScan({ status: 'idle' });
    const ok = await prepareForEditing(true);
    setBusy(null);
    if (ok) startTracking();
    setMessage(null);
  }, [prepareForEditing, startTracking]);

  /* ----------------------- description for the toolbar ----------------------- */

  const pageCount = pages.current.length;
  const currentToken = pages.current[currentPage - 1];
  let origin: PageOrigin | null = null;
  if (currentToken) {
    if (currentToken.ref.kind === 'blank') origin = { kind: 'blank' };
    else {
      const base = currentToken.ref.base;
      const exact = baseline.current.findIndex((t) => t.id === currentToken.id);
      if (exact >= 0) origin = { kind: 'original', page: exact + 1 };
      else {
        const source = baseline.current.findIndex((t) => t.ref.kind === 'base' && t.ref.base === base);
        origin = { kind: 'copy', page: source + 1 };
      }
    }
  }

  return {
    editing,
    busy,
    revision,
    changeCount: hasUnsavedChanges ? Math.max(past.current.length, 1) : 0,
    hasUnsavedChanges,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    currentPage,
    pageCount,
    origin,
    scan,
    selectedBlank,
    message,
    startEditing,
    rotateCurrentPage,
    deleteCurrentPage,
    moveCurrentPageTo,
    swapCurrentPageWith,
    insertBlankPage,
    duplicateCurrentPage,
    undo,
    redo,
    findBlankPages,
    cancelScan,
    closeScanResults,
    toggleBlankSelection,
    deleteSelectedBlankPages,
    positionOf,
    goToPage,
    save,
    discard,
    reset,
    clearMessage: () => setMessage(null),
  };
}
