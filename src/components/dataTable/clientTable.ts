/**
 * Client-side mode: when all rows are already loaded, this does what the server
 * does for the projects table: search, column filters, sorting and paging.
 *
 *   const { rows, pagination } = applyClientTableState(allRows, config, state);
 *   <DataTable rows={rows} pagination={pagination} ... />
 */
import { cellValue, formatValue } from './tableUtils';
import type { FilterValue, TableColumn, TableConfig, TablePagination, TableState } from './types';

interface ClientTableOptions<Row> {
  /** Text the search box matches against. Default: every column's value as text. */
  getSearchText?: (row: Row) => string;
}

const asText = (value: unknown) => (Array.isArray(value) ? value.join(' ') : formatValue(value)).toLowerCase();

function matchesFilter(value: unknown, filter: FilterValue): boolean {
  switch (filter.type) {
    case 'text':
      return asText(value).includes(filter.value.trim().toLowerCase());
    case 'select': {
      const values = Array.isArray(value) ? value.map(String) : [String(value ?? '')];
      return values.some((v) => filter.values.includes(v));
    }
    case 'numberRange': {
      const n = Number(value);
      return (filter.min === undefined || n >= filter.min) && (filter.max === undefined || n <= filter.max);
    }
    case 'dateRange': {
      // Compare calendar days, so a date-time value matches its own day
      const day = String(value ?? '').slice(0, 10);
      if (!day) return false;
      return (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to);
    }
  }
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

/** Compares two cell values; `direction` is 1 (asc) or -1 (desc). Empty values go last either way. */
function compareValues(a: unknown, b: unknown, direction: 1 | -1): number {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) === isEmpty(b) ? 0 : isEmpty(a) ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * direction;
}

export function applyClientTableState<Row>(
  allRows: Row[],
  config: TableConfig<Row>,
  state: TableState,
  { getSearchText }: ClientTableOptions<Row> = {}
): { rows: Row[]; pagination: TablePagination; matchingRows: Row[] } {
  const columnsById = new Map(config.columns.map((c) => [c.id, c] as [string, TableColumn<Row>]));

  // 1. Search
  const search = state.search.trim().toLowerCase();
  let rows = search
    ? allRows.filter((row) =>
        (getSearchText ? getSearchText(row).toLowerCase() : config.columns.map((c) => asText(cellValue(row, c))).join(' ')).includes(search)
      )
    : allRows;

  // 2. Column filters
  for (const [columnId, filter] of Object.entries(state.filters)) {
    const column = columnsById.get(columnId);
    if (column) rows = rows.filter((row) => matchesFilter(cellValue(row, column), filter));
  }

  // 3. Sort (a copy, so the original order is kept)
  const sortColumn = state.sort ? columnsById.get(state.sort.columnId) : undefined;
  if (sortColumn && state.sort) {
    const direction = state.sort.direction === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => compareValues(cellValue(a, sortColumn), cellValue(b, sortColumn), direction));
  }

  // 4. Page
  const totalItems = rows.length;
  const totalPages = Math.ceil(totalItems / state.pageSize);
  const page = Math.min(state.page, Math.max(totalPages, 1));
  const start = (page - 1) * state.pageSize;
  const pageRows = rows.slice(start, start + state.pageSize);

  return {
    rows: pageRows,
    matchingRows: rows,
    pagination: {
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
      from: totalItems === 0 ? 0 : start + 1,
      to: start + pageRows.length,
    },
  };
}
