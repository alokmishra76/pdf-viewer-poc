import type { ReactNode } from 'react';

/* ================================================================== */
/* CONFIG: describes a table. Written once per table, never changes.  */
/* ================================================================== */

export type RowId = string | number;

export interface SelectOption {
  value: string;
  label: string;
}

/** How a column can be filtered (the funnel button in its header). */
export type ColumnFilterConfig =
  | { type: 'text'; placeholder?: string }
  | { type: 'select'; options: SelectOption[]; /** Allow picking several values. Default: true */ multiple?: boolean }
  | { type: 'numberRange'; min?: number; max?: number }
  | { type: 'dateRange' };

/** How a cell is edited when its row is in edit mode (and in bulk update). */
export type CellEditorConfig =
  | { type: 'text' }
  | { type: 'number'; min?: number; max?: number }
  | { type: 'select'; options: SelectOption[] }
  | { type: 'date' };

export interface TableColumn<Row> {
  /** Unique id. Used as the key for sorting, filters and column order. */
  id: string;
  /** Header text */
  header: string;
  /** Property of the row holding this column's value. Default: same as `id`. */
  field?: keyof Row & string;
  /**
   * The column's value when it isn't a plain property, e.g. (row) => row.assignee.id.
   * Used for editing, and for client-side sorting / filtering (applyClientTableState).
   * Default: row[field].
   */
  value?: (row: Row) => unknown;
  /** Custom cell content. Default: the field value as text. */
  render?: (row: Row) => ReactNode;
  width?: number | string;
  align?: 'left' | 'center' | 'right';

  /** Click the header to sort. Default: false */
  sortable?: boolean;
  /** Filter button in the header. Default: none */
  filter?: ColumnFilterConfig;
  /** Editable when the row is edited. Default: read-only */
  editor?: CellEditorConfig;
  /** Can be set for all selected rows at once (needs `editor`). Default: false */
  bulkEditable?: boolean;

  /** Can be hidden from the Columns panel. Default: true */
  hideable?: boolean;
  /** Hidden until the user turns it on. Default: false */
  defaultHidden?: boolean;
}

/** Turn whole features on or off. Everything defaults to on. */
export interface TableFeatures {
  search: boolean;
  sorting: boolean;
  pagination: boolean;
  selection: boolean;
  rowEdit: boolean;
  bulkEdit: boolean;
  columnFilters: boolean;
  columnConfig: boolean;
}

export interface TableConfig<Row> {
  /** Unique table id, e.g. 'projects'. Lets each table keep its own state. */
  id: string;
  columns: TableColumn<Row>[];
  /** Returns the unique id of a row */
  getRowId: (row: Row) => RowId;
  features?: Partial<TableFeatures>;

  /** Default: [10, 25, 50, 100] */
  pageSizeOptions?: number[];
  /** Default: the first page size option */
  defaultPageSize?: number;
  /** Default: unsorted */
  defaultSort?: TableSort | null;

  /** Default: 'Search…' */
  searchPlaceholder?: string;
  /** Default: 'No results.' */
  emptyMessage?: string;
}

/* ================================================================== */
/* STATE: what the user has done. Changes all the time.               */
/* Kept OUTSIDE the table (local state, Redux, URL...), so it is a     */
/* plain object that is easy to store and serialize.                   */
/* ================================================================== */

export type SortDirection = 'asc' | 'desc';

export interface TableSort {
  columnId: string;
  direction: SortDirection;
}

/** The value of one column filter. */
export type FilterValue =
  | { type: 'text'; value: string }
  | { type: 'select'; values: string[] }
  | { type: 'numberRange'; min?: number; max?: number }
  | { type: 'dateRange'; from?: string; to?: string };

export interface TableState {
  page: number;
  pageSize: number;
  sort: TableSort | null;
  search: string;
  /** Active filters by column id */
  filters: Record<string, FilterValue>;
  /** Checked rows. Kept across pages. */
  selectedIds: RowId[];
  /** Column ids in display order */
  columnOrder: string[];
  /** Column ids the user has hidden */
  hiddenColumns: string[];
}

/* ================================================================== */
/* DATA: comes from the server for the current page.                  */
/* ================================================================== */

/** Same shape the API returns in `pagination`. */
export interface TablePagination {
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  from?: number;
  to?: number;
}

/** Field values to change, keyed by the column's field, e.g. { status: 'active', progress: 40 } */
export type RowChanges = Record<string, unknown>;

/* ================================================================== */
/* COMPONENT PROPS                                                     */
/* ================================================================== */

export interface DataTableProps<Row> {
  config: TableConfig<Row>;
  /** Rows of the current page */
  rows: Row[];
  pagination?: TablePagination;
  loading?: boolean;
  error?: string | null;

  /** Current state (see createInitialTableState) */
  state: TableState;
  /** Called with only the parts that changed, e.g. { page: 2 } or { sort, page: 1 } */
  onStateChange: (changes: Partial<TableState>) => void;

  /** Save one edited row. Throw (or reject) to show an error and keep the row in edit mode. */
  onRowUpdate?: (row: Row, changes: RowChanges) => void | Promise<void>;
  /** Apply the same change to every selected row. */
  onBulkUpdate?: (ids: RowId[], changes: RowChanges) => void | Promise<void>;
}
