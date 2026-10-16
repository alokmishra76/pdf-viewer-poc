import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDocuments, fetchNetworkProfiles } from '../api/documents';
import { cacheUsageBytes, cleanUpPartialFiles, clearCache, isCached } from '../cache/opfsCache';
import { config } from '../config';
import { useDocumentPreview } from '../hooks/useDocumentPreview';
import { usePageEditor } from '../hooks/usePageEditor';
import { formatBytes } from '../lib/format';
import type { DocumentSummary, NetworkProfile } from '../types';
import { ApryseViewer, type ViewerHandle } from '../viewer/ApryseViewer';
import { BlankPagesPanel } from './BlankPagesPanel';
import { DocumentList } from './DocumentList';
import { PageEditToolbar } from './PageEditToolbar';
import { PreviewPane } from './PreviewPane';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function DocumentModal({ open, onClose }: Props) {
  const viewerRef = useRef<ViewerHandle | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<NetworkProfile[]>([]);
  const [networkProfile, setNetworkProfile] = useState('office');
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const preview = useDocumentPreview(viewerRef, networkProfile);

  const editor = usePageEditor({
    viewerRef,
    doc: preview.activeDoc,
    documentReady: preview.state.status === 'ready',
    prepareForEditing: preview.prepareForEditing,
    getVersionPages: preview.getVersionPages,
    applySaved: preview.applySaved,
    // Show the new version (page count, size) in the list
    onDocumentSaved: (saved) => setDocuments((docs) => docs.map((d) => (d.id === saved.id ? saved : d))),
  });

  /** Unsaved page changes are lost when leaving the document; ask first. */
  const confirmLeaveEdits = () =>
    !editor.hasUnsavedChanges || window.confirm('You have unsaved page changes. Leave this document and discard them?');

  const selectDocument = (doc: DocumentSummary) => {
    if (doc.id === preview.activeDoc?.id && preview.state.status === 'ready') return;
    if (!confirmLeaveEdits()) return;
    editor.reset();
    void preview.open(doc);
  };

  /** After a save conflict: fetch the newest version and open it */
  const reloadLatest = async () => {
    const current = preview.activeDoc;
    editor.reset();
    try {
      const docs = await fetchDocuments();
      setDocuments(docs);
      const latest = docs.find((d) => d.id === current?.id);
      if (latest) await preview.open(latest);
    } catch (err) {
      setListError((err as Error).message);
    }
  };

  /** Leave edit mode: reopen normally (fast, page by page when possible) */
  const finishEditing = () => {
    const doc = preview.activeDoc;
    editor.reset();
    if (doc) void preview.open(doc);
  };

  const loadList = useCallback(async (signal?: AbortSignal) => {
    setListLoading(true);
    setListError(null);
    try {
      setDocuments(await fetchDocuments(signal));
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setListError((err as Error).message);
    } finally {
      if (!signal?.aborted) setListLoading(false);
    }
  }, []);

  // Load the list and the demo network profiles once
  useEffect(() => {
    const controller = new AbortController();
    void loadList(controller.signal);
    fetchNetworkProfiles(controller.signal)
      .then((data) => {
        setProfiles(data.profiles);
        setNetworkProfile(data.default);
      })
      .catch(() => undefined);
    void cleanUpPartialFiles();
    return () => controller.abort();
  }, [loadList]);

  // Escape closes; focus moves into the dialog when it opens
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onClearCache = async () => {
    if (!confirmLeaveEdits()) return;
    editor.reset();
    setClearing(true);
    await preview.reset();
    await clearCache();
    setClearing(false);
  };

  const { state, activeDoc } = preview;
  const downloadPercent =
    state.status === 'downloading' && state.total ? Math.floor((state.received / state.total) * 100) : null;
  // cacheRevision changes whenever the cache does, so this re-reads the usage
  const usage = preview.cacheRevision >= 0 ? cacheUsageBytes() : 0;

  return (
    <div className="modal-backdrop" hidden={!open}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={dialogRef}>
        <header className="modal-header">
          <h1 id="modal-title">Chase documents</h1>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close documents">
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="modal-body">
          <aside className="modal-sidebar">
            <DocumentList
              documents={documents}
              loading={listLoading}
              error={listError}
              activeId={activeDoc?.id ?? null}
              downloadingId={state.status === 'downloading' ? activeDoc?.id ?? null : null}
              downloadPercent={downloadPercent}
              isCached={isCached}
              onSelect={selectDocument}
              onReload={() => void loadList()}
            />

            <div className="sidebar-footer">
              <label className="field">
                <span>Simulated network</span>
                <select value={networkProfile} onChange={(e) => setNetworkProfile(e.target.value)}>
                  {(profiles.length ? profiles : [{ name: 'office', label: 'Office network (100 Mbps)' }]).map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="cache-usage">
                <span>
                  Saved on this device: {formatBytes(usage)} of {formatBytes(config.cacheLimitBytes)}
                </span>
                <button type="button" className="text-button" onClick={onClearCache} disabled={clearing || usage === 0}>
                  {clearing ? 'Clearing' : 'Clear saved documents'}
                </button>
              </div>
            </div>
          </aside>

          <PreviewPane
            doc={activeDoc}
            state={state}
            diskReadBytes={preview.diskReadBytes}
            viewerError={viewerError}
            onCancel={preview.cancel}
            onRetry={preview.retry}
            toolbar={<PageEditToolbar editor={editor} onReloadLatest={() => void reloadLatest()} onDone={finishEditing} />}
            sidePanel={<BlankPagesPanel editor={editor} />}
          >
            <ApryseViewer ref={viewerRef} onInitError={setViewerError} />
          </PreviewPane>
        </div>
      </div>
    </div>
  );
}
