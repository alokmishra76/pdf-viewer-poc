/**
 * Plain helper functions for the table: no React, so the same logic can be
 * reused later by a hook, a Redux reducer or a thunk.
 */
import type { FilterValue, TableColumn, TableConfig, TableFeatures, TableSort, TableState } from './types';

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

export function resolveFeatures(config: TableConfig<unknown>): TableFeatures {
  return {
    search: true,
    sorting: true,
    pagination: true,
    selection: true,
    rowEdit: true,
    bulkEdit: true,
    columnFilters: true,
    columnConfig: true,
    ...config.features,
  };
}

export function pageSizeOptions(config: TableConfig<unknown>): number[] {
  return config.pageSizeOptions?.length ? config.pageSizeOptions : DEFAULT_PAGE_SIZES;
}

/** The starting state for a table: first page, default sort, no filters, all default columns. */
export function createInitialTableState<Row>(config: TableConfig<Row>): TableState {
  return {
    page: 1,
    pageSize: config.defaultPageSize ?? pageSizeOptions(config as TableConfig<unknown>)[0],
    sort: config.defaultSort ?? null,
    search: '',
    filters: {},
    selectedIds: [],
    columnOrder: config.columns.map((c) => c.id),
    hiddenColumns: config.columns.filter((c) => c.defaultHidden).map((c) => c.id),
  };
}

/** Columns in the user's order, including any added to the config later. */
export function orderedColumns<Row>(columns: TableColumn<Row>[], columnOrder: string[]): TableColumn<Row>[] {
  const byId = new Map(columns.map((c) => [c.id, c]));
  const ordered = columnOrder.map((id) => byId.get(id)).filter((c): c is TableColumn<Row> => Boolean(c));
  const missing = columns.filter((c) => !columnOrder.includes(c.id));
  return [...ordered, ...missing];
}

export function visibleColumns<Row>(columns: TableColumn<Row>[], state: TableState): TableColumn<Row>[] {
  return orderedColumns(columns, state.columnOrder).filter((c) => !state.hiddenColumns.includes(c.id));
}

export function fieldOf<Row>(column: TableColumn<Row>): string {
  return column.field ?? column.id;
}

export function cellValue<Row>(row: Row, column: TableColumn<Row>): unknown {
  return column.value ? column.value(row) : (row as Record<string, unknown>)[fieldOf(column)];
}

/** Default text for a cell with no custom render. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

/** Header click: unsorted → ascending → descending → unsorted. */
export function nextSort(current: TableSort | null, columnId: string): TableSort | null {
  if (!current || current.columnId !== columnId) return { columnId, direction: 'asc' };
  if (current.direction === 'asc') return { columnId, direction: 'desc' };
  return null;
}

/** A filter with nothing filled in counts as no filter. */
export function isFilterEmpty(filter: FilterValue | undefined): boolean {
  if (!filter) return true;
  switch (filter.type) {
    case 'text':
      return filter.value.trim() === '';
    case 'select':
      return filter.values.length === 0;
    case 'numberRange':
      return filter.min === undefined && filter.max === undefined;
    case 'dateRange':
      return !filter.from && !filter.to;
  }
}

/** Short text for a filter chip, e.g. "Status: Active, On hold" or "Budget: 1,000 – 5,000". */
export function describeFilter<Row>(column: TableColumn<Row>, filter: FilterValue): string {
  const range = (from?: string | number, to?: string | number) => {
    const f = typeof from === 'number' ? from.toLocaleString() : from;
    const t = typeof to === 'number' ? to.toLocaleString() : to;
    if (f !== undefined && f !== '' && t !== undefined && t !== '') return `${f} – ${t}`;
    if (f !== undefined && f !== '') return `from ${f}`;
    return `up to ${t}`;
  };

  switch (filter.type) {
    case 'text':
      return `${column.header} contains “${filter.value}”`;
    case 'select': {
      const options = column.filter?.type === 'select' ? column.filter.options : [];
      const labels = filter.values.map((v) => options.find((o) => o.value === v)?.label ?? v);
      return `${column.header}: ${labels.join(', ')}`;
    }
    case 'numberRange':
      return `${column.header}: ${range(filter.min, filter.max)}`;
    case 'dateRange':
      return `${column.header}: ${range(filter.from, filter.to)}`;
  }
}

/** Moves `id` so it sits where `targetId` is. Used by drag and drop and the ↑ / ↓ buttons. */
export function moveColumn(order: string[], id: string, targetId: string): string[] {
  if (id === targetId) return order;
  const without = order.filter((c) => c !== id);
  const targetIndex = without.indexOf(targetId);
  const insertAt = order.indexOf(id) < order.indexOf(targetId) ? targetIndex + 1 : targetIndex;
  without.splice(insertAt, 0, id);
  return without;
}
