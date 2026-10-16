import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { formatDate } from '../lib/format';
import type { DocumentSummary } from '../types';

interface Props {
  documents: DocumentSummary[];
  loading: boolean;
  error: string | null;
  activeId: string | null;
  downloadingId: string | null;
  downloadPercent: number | null;
  isCached: (doc: DocumentSummary) => boolean;
  onSelect: (doc: DocumentSummary) => void;
  onReload: () => void;
}

/** Height of the "paper stack" gauge, on a log scale so 8 MB and 1 GB are both readable. */
function useStackHeights(documents: DocumentSummary[]) {
  return useMemo(() => {
    const sizes = documents.map((d) => Math.log(d.sizeBytes));
    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    const map = new Map<string, number>();
    for (const doc of documents) {
      const ratio = max === min ? 1 : (Math.log(doc.sizeBytes) - min) / (max - min);
      map.set(doc.id, Math.round(6 + ratio * 34));
    }
    return map;
  }, [documents]);
}

export function DocumentList({
  documents,
  loading,
  error,
  activeId,
  downloadingId,
  downloadPercent,
  isCached,
  onSelect,
  onReload,
}: Props) {
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const stackHeights = useStackHeights(documents);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) =>
      [d.title, d.documentType, d.patient.name, d.patient.mrn, d.chaseId, d.id].some((v) => v.toLowerCase().includes(q))
    );
  }, [documents, query]);

  // Arrow keys move between documents; Enter or Space opens one
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLLIElement>('[role="option"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLLIElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
      items[next]?.focus();
    } else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
      event.preventDefault();
      onSelect(visible[index]);
    }
  };

  return (
    <div className="doc-list">
      <label className="doc-search">
        <span className="visually-hidden">Search documents</span>
        <input
          type="search"
          placeholder="Search title, patient, MRN, chase"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-autofocus
        />
      </label>

      {loading && (
        <ul className="doc-items" aria-busy="true" aria-label="Loading documents">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="doc-item doc-item--skeleton" aria-hidden="true">
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line--short" />
            </li>
          ))}
        </ul>
      )}

      {!loading && error && (
        <div className="list-message" role="alert">
          <p>{error}</p>
          <button type="button" className="button button--secondary" onClick={onReload}>
            Load documents again
          </button>
        </div>
      )}

      {!loading && !error && documents.length === 0 && (
        <div className="list-message">
          <p>No documents on the server yet. Run “npm run generate” in the pdf-mock-server folder, then load again.</p>
          <button type="button" className="button button--secondary" onClick={onReload}>
            Load documents again
          </button>
        </div>
      )}

      {!loading && !error && documents.length > 0 && visible.length === 0 && (
        <div className="list-message">
          <p>No documents match “{query}”.</p>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <ul className="doc-items" role="listbox" aria-label="Documents" ref={listRef} onKeyDown={onKeyDown}>
          {visible.map((doc) => {
            const active = doc.id === activeId;
            const downloading = doc.id === downloadingId;
            const cached = isCached(doc);
            return (
              <li
                key={doc.id}
                role="option"
                aria-selected={active}
                tabIndex={active || (!activeId && doc === visible[0]) ? 0 : -1}
                className={`doc-item${active ? ' is-active' : ''}`}
                onClick={() => onSelect(doc)}
              >
                <span
                  className="paper-stack"
                  style={{ height: stackHeights.get(doc.id) }}
                  title={`${doc.pageCount.toLocaleString()} pages`}
                  aria-hidden="true"
                />
                <span className="doc-item__body">
                  <span className="doc-item__title">{doc.title}</span>
                  <span className="doc-item__meta">
                    {doc.patient.name}, {doc.patient.mrn}
                  </span>
                  <span className="doc-item__meta doc-item__meta--pair">
                    <span>{doc.chaseId}</span>
                    <span>{formatDate(doc.dateOfService)}</span>
                  </span>
                </span>
                <span className="doc-item__side">
                  <span className="doc-item__size">{doc.sizeLabel}</span>
                  <span className="doc-item__pages">{doc.pageCount.toLocaleString()} pp</span>
                  {downloading && downloadPercent !== null ? (
                    <span className="status-tag status-tag--progress">{downloadPercent}%</span>
                  ) : cached ? (
                    <span className="status-tag status-tag--cached">On this device</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
