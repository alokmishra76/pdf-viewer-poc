import { useEffect, useState } from 'react';
import { Button } from '../../widget';

interface TableToolbarProps {
  showSearch: boolean;
  search: string;
  searchPlaceholder: string;
  onSearchChange: (search: string) => void;
  showColumnsButton: boolean;
  columnsPanelOpen: boolean;
  columnsPanelId: string;
  onToggleColumnsPanel: () => void;
}

/** Waits this long after the last keystroke before searching, so we don't call the API per letter. */
const SEARCH_DELAY_MS = 300;

/** The row above the table: search box on the left, "Columns" button on the right. */
export function TableToolbar({
  showSearch,
  search,
  searchPlaceholder,
  onSearchChange,
  showColumnsButton,
  columnsPanelOpen,
  columnsPanelId,
  onToggleColumnsPanel,
}: TableToolbarProps) {
  const [text, setText] = useState(search);

  // Follow outside changes (e.g. "Clear all")
  useEffect(() => setText(search), [search]);

  useEffect(() => {
    if (text === search) return;
    const timer = window.setTimeout(() => onSearchChange(text), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text, search, onSearchChange]);

  if (!showSearch && !showColumnsButton) return null;

  return (
    <div className="dt-toolbar">
      {showSearch && (
        <input
          type="search"
          className="dt-toolbar__search"
          placeholder={searchPlaceholder}
          aria-label="Search the table"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {showColumnsButton && (
        <Button
          variant="secondary"
          size="sm"
          className="dt-toolbar__columns"
          aria-expanded={columnsPanelOpen}
          aria-controls={columnsPanelId}
          onClick={onToggleColumnsPanel}
          endIcon={<span className={`dt-chevron${columnsPanelOpen ? ' dt-chevron--open' : ''}`} />}
        >
          Columns
        </Button>
      )}
    </div>
  );
}
