import { Button } from '../../widget';
import { describeFilter, isFilterEmpty } from './tableUtils';
import type { FilterValue, TableColumn } from './types';

interface FilterChipsProps<Row> {
  columns: TableColumn<Row>[];
  filters: Record<string, FilterValue>;
  search: string;
  onRemoveFilter: (columnId: string) => void;
  onClearSearch: () => void;
  onClearAll: () => void;
}

/** One chip per active filter (and the search), each with × to remove it. */
export function FilterChips<Row>({ columns, filters, search, onRemoveFilter, onClearSearch, onClearAll }: FilterChipsProps<Row>) {
  const active = columns.filter((c) => !isFilterEmpty(filters[c.id]));
  if (active.length === 0 && !search) return null;

  return (
    <div className="dt-chips" aria-label="Active filters">
      {search && (
        <span className="dt-chip">
          Search: “{search}”
          <button type="button" className="dt-chip__remove" onClick={onClearSearch} aria-label="Remove search">
            ×
          </button>
        </span>
      )}
      {active.map((column) => (
        <span key={column.id} className="dt-chip">
          {describeFilter(column, filters[column.id])}
          <button
            type="button"
            className="dt-chip__remove"
            onClick={() => onRemoveFilter(column.id)}
            aria-label={`Remove ${column.header} filter`}
          >
            ×
          </button>
        </span>
      ))}
      <Button variant="link" size="sm" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}
