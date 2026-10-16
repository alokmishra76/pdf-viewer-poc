/**
 * Apryse WebViewer, initialised ONCE and reused for every document.
 * Creating a WebViewer instance is the slowest step, so switching documents
 * only swaps the document, never the viewer.
 */
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import WebViewer, { type Core, type WebViewerInstance } from '@pdftron/webviewer';
import { config } from '../config';

export type Rotation = 90 | 180 | 270;

export interface ViewerHandle {
  /** Opens a document from a URL (served by our service worker) or a File. Resolves when page 1 can render. */
  open: (source: string | File, fileName: string) => Promise<void>;
  close: () => Promise<void>;

  /* Page editing. Only call these on a document opened from a File (see useDocumentPreview):
     on a page-by-page document Apryse would first read the entire file. */
  getPageCount: () => number;
  getCurrentPage: () => number;
  setCurrentPage: (page: number) => void;
  /** Rotates pages clockwise by the given amount (adds to their current rotation). */
  rotatePages: (pages: number[], degrees: Rotation) => Promise<void>;
  removePages: (pages: number[]) => Promise<void>;
  /** Renders a small image of one page, e.g. for blank-page detection. */
  renderThumbnail: (page: number, width: number) => Promise<HTMLCanvasElement>;
  /** Moves one page so it lands before `insertBefore` (both counted before the move). */
  movePage: (page: number, insertBefore: number) => Promise<void>;
  /** Inserts a blank page before `insertBefore` (use pageCount + 1 for the end). Size in PDF points. */
  insertBlankPage: (insertBefore: number, width: number, height: number) => Promise<void>;
  /** Size of a page as shown (rotation included), in PDF points. */
  getDisplayedPageSize: (page: number) => { width: number; height: number };
  /**
   * The "page library": the file on disk that the open document was built from.
   * Pages are copied from it for duplicates and to restore deleted pages.
   */
  setSourceFile: (file: File | null) => void;
  /** Copies base-file pages into the open document before `insertBefore`. */
  insertFromSource: (basePages: number[], insertBefore: number) => Promise<void>;
  /** Copies a page of the open document (as currently shown) before `insertBefore`. */
  copyPage: (page: number, insertBefore: number) => Promise<void>;
}

interface Props {
  ref?: Ref<ViewerHandle>;
  onReady?: () => void;
  onInitError?: (message: string) => void;
}

export function ApryseViewer({ ref, onReady, onInitError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<Promise<WebViewerInstance> | null>(null);
  const readyRef = useRef<WebViewerInstance | null>(null);
  const sourceFileRef = useRef<File | null>(null);
  const sourceDocRef = useRef<Promise<Core.Document> | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || instanceRef.current) return;

    instanceRef.current = WebViewer(
      {
        path: config.webViewerPath,
        licenseKey: config.apryseLicenseKey,
        enableFilePicker: false,
        enableAnnotations: false, // preview only: skips annotation parsing on every page
        fullAPI: false,
      },
      element
    ).then((instance) => {
      const { UI } = instance;
      // Features a read-only preview does not need. Print and Download are off
      // because both would pull the entire 1 GB file into memory.
      UI.disableFeatures([
        UI.Feature.FilePicker,
        UI.Feature.Annotations,
        UI.Feature.NotesPanel,
        UI.Feature.Print,
        UI.Feature.Download,
        UI.Feature.Redaction,
        UI.Feature.ContentEdit,
        UI.Feature.MultiTab,
      ]);
      // Page edits must go through our own toolbar so they can be tracked and saved,
      // so hide Apryse's built-in page controls in the thumbnails panel.
      UI.disableFeatures([UI.Feature.ThumbnailReordering, UI.Feature.ThumbnailMerging]);
      UI.disableElements([
        'thumbnailControl',
        'thumbnailsControlDelete',
        'thumbnailsControlRotateClockwise',
        'thumbnailsControlRotateCounterClockwise',
        'thumbnailsControlInsert',
        'thumbnailsControlReplace',
        'thumbnailsControlExtract',
        'documentControl',
        'pageManipulationOverlay',
        'pageManipulationOverlayButton',
        'multiPageManipulationControls',
        'pageAdditionalControls',
        'deletePage',
        'rotatePageClockwise',
        'rotatePageCounterClockwise',
      ]);
      UI.setFitMode(UI.FitMode.FitWidth);
      readyRef.current = instance;
      // Development only: lets automated tests reach the viewer from the browser console
      if (import.meta.env.DEV) (window as unknown as { __apryse?: WebViewerInstance }).__apryse = instance;
      onReady?.();
      return instance;
    });

    instanceRef.current.catch((err: unknown) => {
      onInitError?.(err instanceof Error ? err.message : 'The document viewer could not start.');
    });
    // The viewer lives as long as the modal; it is intentionally never re-created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    async open(source, fileName) {
      const instance = await instanceRef.current!;
      const { documentViewer } = instance.Core;

      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          documentViewer.removeEventListener('documentLoaded', onLoaded);
          instance.UI.removeEventListener(instance.UI.Events.LOAD_ERROR, onError);
        };
        const onLoaded = () => {
          cleanup();
          resolve();
        };
        const onError = (event: unknown) => {
          cleanup();
          const detail = event instanceof CustomEvent ? event.detail : event instanceof Error ? event.message : event;
          reject(new Error(typeof detail === 'string' && detail ? detail : 'The viewer could not open this PDF.'));
        };
        documentViewer.addEventListener('documentLoaded', onLoaded);
        instance.UI.addEventListener(instance.UI.Events.LOAD_ERROR, onError);

        instance.UI.loadDocument(source, { filename: fileName, extension: 'pdf' }).catch(onError);
      });
    },

    async close() {
      const instance = await instanceRef.current;
      if (instance?.Core.documentViewer.getDocument()) await instance.UI.closeDocument();
    },

    getPageCount() {
      return readyRef.current?.Core.documentViewer.getPageCount() ?? 0;
    },

    getCurrentPage() {
      return readyRef.current?.Core.documentViewer.getCurrentPage() ?? 1;
    },

    setCurrentPage(page) {
      const viewer = readyRef.current?.Core.documentViewer;
      if (viewer && page >= 1 && page <= viewer.getPageCount()) viewer.setCurrentPage(page, false);
    },

    async rotatePages(pages, degrees) {
      const instance = readyRef.current;
      const doc = instance?.Core.documentViewer.getDocument();
      if (!instance || !doc || pages.length === 0) return;
      const { PageRotation } = instance.Core;
      const rotation = degrees === 90 ? PageRotation.E_90 : degrees === 180 ? PageRotation.E_180 : PageRotation.E_270;
      await doc.rotatePages(pages, rotation);
    },

    async removePages(pages) {
      const doc = readyRef.current?.Core.documentViewer.getDocument();
      if (doc && pages.length > 0) await doc.removePages(pages);
    },

    async movePage(page, insertBefore) {
      const doc = readyRef.current?.Core.documentViewer.getDocument();
      if (doc) await doc.movePages([page], insertBefore);
    },

    async insertBlankPage(insertBefore, width, height) {
      const doc = readyRef.current?.Core.documentViewer.getDocument();
      if (doc) await doc.insertBlankPages([insertBefore], width, height);
    },

    getDisplayedPageSize(page) {
      const doc = readyRef.current?.Core.documentViewer.getDocument();
      if (!doc) return { width: 612, height: 792 };
      const info = doc.getPageInfo(page);
      const raw = doc.getPageRotation(page);
      const degrees = raw <= 3 ? raw * 90 : raw; // some versions report 0-3, others degrees
      const turned = degrees === 90 || degrees === 270;
      return turned ? { width: info.height, height: info.width } : { width: info.width, height: info.height };
    },

    setSourceFile(file) {
      if (file !== sourceFileRef.current) sourceDocRef.current = null;
      sourceFileRef.current = file;
    },

    async insertFromSource(basePages, insertBefore) {
      const instance = readyRef.current;
      const doc = instance?.Core.documentViewer.getDocument();
      if (!instance || !doc || basePages.length === 0) return;
      if (!sourceFileRef.current) throw new Error('The original pages are not available.');
      // Opened once, on first use: about 6 s for a 1 GB file, without loading it into memory
      sourceDocRef.current ??= instance.Core.createDocument(sourceFileRef.current, { extension: 'pdf' });
      const source = await sourceDocRef.current;
      await doc.insertPages(source, basePages, insertBefore);
    },

    async copyPage(page, insertBefore) {
      const instance = readyRef.current;
      const doc = instance?.Core.documentViewer.getDocument();
      if (!instance || !doc) return;
      // Extract just this page (a few hundred KB) instead of opening the whole file again
      const bytes = await doc.extractPages([page]);
      const single = await instance.Core.createDocument(bytes, { extension: 'pdf' });
      await doc.insertPages(single, [1], insertBefore);
    },

    renderThumbnail(page, width) {
      const doc = readyRef.current?.Core.documentViewer.getDocument();
      if (!doc) return Promise.reject(new Error('No document is open.'));
      return new Promise((resolve) => {
        doc.loadCanvas({
          pageNumber: page,
          width,
          drawComplete: (canvas) => resolve(canvas as unknown as HTMLCanvasElement),
        });
      });
    },
  }));

  return <div ref={containerRef} className="viewer-host" />;
}
