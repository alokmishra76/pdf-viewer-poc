import type { usePageEditor } from '../hooks/usePageEditor';

type Editor = ReturnType<typeof usePageEditor>;

/** Side panel over the viewer: blank-page scan progress, then results to confirm. */
export function BlankPagesPanel({ editor }: { editor: Editor }) {
  const { scan, selectedBlank } = editor;
  if (scan.status === 'idle') return null;

  if (scan.status === 'scanning') {
    const percent = scan.total ? Math.floor((scan.done / scan.total) * 100) : 0;
    return (
      <aside className="blank-panel" aria-label="Blank page search">
        <h3>Finding blank pages</h3>
        <p className="blank-panel__note">
          Checked {scan.done.toLocaleString()} of {scan.total.toLocaleString()} pages
        </p>
        <div className="progress" role="progressbar" aria-label="Blank page search" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="progress__fill" style={{ transform: `scaleX(${percent / 100})` }} />
        </div>
        <button type="button" className="button button--secondary button--small" onClick={editor.cancelScan}>
          Stop
        </button>
      </aside>
    );
  }

  const { candidates, scanned, cancelled } = scan;
  // Pages may have been removed since the scan (e.g. after undo/redo); only show those still there
  const present = candidates.filter((c) => editor.positionOf(c.tokenId) > 0);
  const selectedCount = present.filter((c) => selectedBlank.has(c.tokenId)).length;

  return (
    <aside className="blank-panel" aria-label="Blank page results">
      <h3>
        {present.length === 0
          ? 'No blank pages found'
          : `${present.length} likely blank ${present.length === 1 ? 'page' : 'pages'}`}
      </h3>
      {cancelled && <p className="blank-panel__note">Stopped after checking {scanned.toLocaleString()} pages.</p>}
      {present.length > 0 && (
        <p className="blank-panel__note">
          Check each one before deleting: a page can be blank on purpose. Select a page to view it.
        </p>
      )}

      {present.length > 0 && (
        <ul className="blank-panel__grid">
          {present.map((candidate) => {
            const checked = selectedBlank.has(candidate.tokenId);
            const position = editor.positionOf(candidate.tokenId);
            return (
              <li key={candidate.tokenId} className={`blank-card${checked ? ' is-selected' : ''}`}>
                <button type="button" className="blank-card__preview" onClick={() => editor.goToPage(candidate.tokenId)}>
                  <img src={candidate.preview} alt={`Page ${position}`} />
                </button>
                <label className="blank-card__label">
                  <input type="checkbox" checked={checked} onChange={() => editor.toggleBlankSelection(candidate.tokenId)} />
                  Page {position.toLocaleString()}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="blank-panel__actions">
        {present.length > 0 && (
          <button
            type="button"
            className="button button--danger button--small"
            onClick={() => void editor.deleteSelectedBlankPages()}
            disabled={selectedCount === 0 || editor.busy !== null}
          >
            Delete {selectedCount} selected
          </button>
        )}
        <button type="button" className="button button--secondary button--small" onClick={editor.closeScanResults}>
          Close
        </button>
      </div>
    </aside>
  );
}
