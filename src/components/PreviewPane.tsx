import type { ReactNode } from 'react';
import { formatBytes, formatDate, formatDuration, formatSpeed } from '../lib/format';
import type { DocumentSummary, PreviewState } from '../types';

interface Props {
  doc: DocumentSummary | null;
  state: PreviewState;
  diskReadBytes: number;
  viewerError: string | null;
  onCancel: () => void;
  onRetry: () => void;
  /** Edit toolbar shown above the viewer when a document is open */
  toolbar?: ReactNode;
  /** Panel shown over the right side of the viewer (blank-page results) */
  sidePanel?: ReactNode;
  children: ReactNode; // the viewer, always mounted underneath
}

const ERROR_TITLES: Record<string, string> = {
  NETWORK: 'The download was interrupted',
  UNAUTHORIZED: 'Access was denied',
  NOT_FOUND: 'This document isn’t available',
  SERVER: 'The server had a problem',
  INCOMPLETE: 'The download was incomplete',
  DISK_FULL: 'Not enough storage space',
  UNSUPPORTED: 'This browser isn’t supported',
  VIEWER: 'The document couldn’t be opened',
};

function FullLoadNote({ reason, version }: { reason?: string; version: number }) {
  switch (reason) {
    case 'editing':
      return <span className="preview-status__disk">Loaded in full for page editing</span>;
    case 'includes-edits':
      return <span className="preview-status__disk">Version {version}, with your saved page changes</span>;
    case 'no-service-worker':
      return <span className="preview-status__warn">Loaded in full (local file server not active)</span>;
    default:
      return <span className="preview-status__warn">Not web-optimized, so the whole file was loaded</span>;
  }
}

function StatusLine({ state, doc, diskReadBytes }: { state: PreviewState; doc: DocumentSummary; diskReadBytes: number }) {
  if (state.status !== 'ready') return null;
  const how = state.fromCache
    ? `Opened from this device in ${formatDuration(state.openMs)}`
    : `Downloaded in ${formatDuration(state.downloadMs ?? 0)}, opened in ${formatDuration(state.openMs)}`;
  return (
    <p className="preview-status">
      <span>{how}</span>
      {state.loadMode === 'on-demand' ? (
        <span className="preview-status__disk">
          {diskReadBytes > 0
            ? `Pages load on demand: read ${formatBytes(diskReadBytes)} of ${doc.sizeLabel} so far`
            : 'Pages load on demand'}
        </span>
      ) : (
        <FullLoadNote reason={state.fullReason} version={doc.version} />
      )}
    </p>
  );
}

function Overlay({ doc, state, viewerError, onCancel, onRetry }: Omit<Props, 'children' | 'diskReadBytes'>) {
  if (viewerError) {
    return (
      <div className="overlay" role="alert">
        <h3>The document viewer didn’t start</h3>
        <p>{viewerError}</p>
        <p className="overlay__hint">Check that “npm install” copied WebViewer into public/lib/webviewer, then reload the page.</p>
      </div>
    );
  }

  if (!doc || state.status === 'idle') {
    return (
      <div className="overlay overlay--quiet">
        <p>Select a document to preview it.</p>
      </div>
    );
  }

  switch (state.status) {
    case 'downloading': {
      const percent = state.total ? Math.floor((state.received / state.total) * 100) : 0;
      const remaining =
        state.bytesPerSecond && state.bytesPerSecond > 0
          ? ((state.total - state.received) / state.bytesPerSecond) * 1000
          : null;
      return (
        <div className="overlay">
          <h3>Downloading {doc.sizeLabel}</h3>
          <div
            className="progress"
            role="progressbar"
            aria-label={`Downloading ${doc.title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="progress__fill" style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
          <dl className="progress-facts">
            <div>
              <dt>Received</dt>
              <dd>
                {formatBytes(state.received)} of {formatBytes(state.total)}
              </dd>
            </div>
            <div>
              <dt>Speed</dt>
              <dd>{state.bytesPerSecond ? formatSpeed(state.bytesPerSecond) : 'Measuring'}</dd>
            </div>
            <div>
              <dt>Time left</dt>
              <dd>{remaining !== null ? formatDuration(remaining) : 'Estimating'}</dd>
            </div>
          </dl>
          <p className="overlay__hint">
            The file is saved to this device as it arrives, so it opens instantly next time. You can pick another document at any time.
          </p>
          <button type="button" className="button button--secondary" onClick={onCancel}>
            Cancel download
          </button>
        </div>
      );
    }
    case 'opening':
      return (
        <div className="overlay">
          <div className="spinner" aria-hidden="true" />
          <p>
            {state.purpose === 'editing'
              ? 'Preparing pages for editing'
              : state.fromCache
                ? 'Opening from this device'
                : 'Opening document'}
          </p>
          {state.purpose === 'editing' && doc.sizeBytes > 100 * 1024 * 1024 && (
            <p className="overlay__hint">
              Changing pages needs the whole {doc.sizeLabel} file loaded. This takes a few seconds for very large documents.
            </p>
          )}
          {state.purpose !== 'editing' && state.loadMode === 'full' && doc.sizeBytes > 100 * 1024 * 1024 && (
            <p className="overlay__hint">
              This file isn’t web-optimized, so the viewer has to load all {doc.sizeLabel} before showing the first page.
              Web-optimized files open in about a second.
            </p>
          )}
        </div>
      );
    case 'cancelled':
      return (
        <div className="overlay">
          <h3>Download cancelled</h3>
          <p>Nothing was saved to this device.</p>
          <button type="button" className="button" onClick={onRetry}>
            Download again
          </button>
        </div>
      );
    case 'error':
      return (
        <div className="overlay" role="alert">
          <h3>{ERROR_TITLES[state.code] ?? 'Something went wrong'}</h3>
          <p>{state.message}</p>
          <button type="button" className="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      );
    default:
      return null;
  }
}

export function PreviewPane({ doc, state, diskReadBytes, viewerError, onCancel, onRetry, toolbar, sidePanel, children }: Props) {
  const showOverlay = viewerError !== null || state.status !== 'ready';
  return (
    <section className="preview" aria-label="Document preview">
      {doc && (
        <header className="preview-header">
          <div className="preview-header__main">
            <h2>{doc.title}</h2>
            <StatusLine state={state} doc={doc} diskReadBytes={diskReadBytes} />
          </div>
          <dl className="preview-facts">
            <div>
              <dt>Patient</dt>
              <dd>{doc.patient.name}</dd>
            </div>
            <div>
              <dt>MRN</dt>
              <dd>{doc.patient.mrn}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{doc.provider}</dd>
            </div>
            <div>
              <dt>Service date</dt>
              <dd>{formatDate(doc.dateOfService)}</dd>
            </div>
            <div>
              <dt>Pages</dt>
              <dd>{doc.pageCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{doc.sizeLabel}</dd>
            </div>
          </dl>
        </header>
      )}
      {doc && state.status === 'ready' && !viewerError && toolbar}
      <div className="preview-body">
        {children}
        {state.status === 'ready' && sidePanel}
        {showOverlay && (
          <Overlay doc={doc} state={state} viewerError={viewerError} onCancel={onCancel} onRetry={onRetry} />
        )}
      </div>
    </section>
  );
}
