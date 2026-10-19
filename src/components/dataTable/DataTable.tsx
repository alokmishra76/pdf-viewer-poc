import { useCallback, useId, useState, type KeyboardEvent } from 'react';
import { Button } from '../../widget';
import { BulkUpdateBar } from './BulkUpdateBar';
import { CellEditor } from './CellEditor';
import { ColumnConfigPanel } from './ColumnConfigPanel';
import { ColumnFilter } from './ColumnFilter';
import { FilterChips } from './FilterChips';
import { TablePager } from './TablePager';
import { TableToolbar } from './TableToolbar';
import {
  cellValue,
  createInitialTableState,
  fieldOf,
  formatValue,
  nextSort,
  pageSizeOptions,
  resolveFeatures,
  visibleColumns,
} from './tableUtils';
import type { CellEditorConfig, ColumnFilterConfig, DataTableProps, FilterValue, RowChanges, RowId, TableColumn, TableConfig } from './types';
import './dataTable.css';

/**
 * A reusable table: search, sorting, column filters with chips, show / hide /
 * reorder columns, row selection with bulk update, inline row edit, pagination.
 *
 * It is "controlled": it never fetches data or keeps the table state itself.
 * It shows `rows` and `state`, and reports every change through
 * `onStateChange`, so the parent decides where the state lives (useState,
 * Redux, the URL) and when to load data.
 */
export function DataTable<Row>({
  config,
  rows,
  pagination,
  loading = false,
  error = null,
  state,
  onStateChange,
  onRowUpdate,
  onBulkUpdate,
}: DataTableProps<Row>) {
  const features = resolveFeatures(config as TableConfig<unknown>);
  const columns = visibleColumns(config.columns, state);
  const columnsPanelId = useId();
  const [columnsPanelOpen, setColumnsPanelOpen] = useState(false);

  // Inline row edit: only one row at a time. This is temporary UI state, so it stays inside the table.
  const [editing, setEditing] = useState<{ id: RowId; draft: RowChanges } | null>(null);
  const [savingRow, setSavingRow] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const canEditRows = features.rowEdit && Boolean(onRowUpdate) && config.columns.some((c) => c.editor);
  const bulkColumns = config.columns.filter(
    (c): c is TableColumn<Row> & { editor: CellEditorConfig } => Boolean(c.bulkEditable && c.editor)
  );
  const canBulkUpdate = features.bulkEdit && Boolean(onBulkUpdate) && bulkColumns.length > 0;

  /* ---------------- selection ---------------- */

  const selected = new Set(state.selectedIds);
  const pageIds = rows.map(config.getRowId);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = !allOnPageSelected && pageIds.some((id) => selected.has(id));

  const toggleRow = (id: RowId) =>
    onStateChange({ selectedIds: selected.has(id) ? state.selectedIds.filter((s) => s !== id) : [...state.selectedIds, id] });

  const togglePage = () =>
    onStateChange({
      selectedIds: allOnPageSelected
        ? state.selectedIds.filter((id) => !pageIds.includes(id))
        : [...state.selectedIds, ...pageIds.filter((id) => !selected.has(id))],
    });

  /* ---------------- search, sort, filters ---------------- */

  // Anything that changes which rows match goes back to page 1
  const setSearch = useCallback((search: string) => onStateChange({ search, page: 1 }), [onStateChange]);

  const setFilter = (columnId: string, value: FilterValue | undefined) => {
    const { [columnId]: _removed, ...rest } = state.filters;
    onStateChange({ filters: value ? { ...rest, [columnId]: value } : rest, page: 1 });
  };

  const resetColumns = () => {
    const initial = createInitialTableState(config);
    onStateChange({ columnOrder: initial.columnOrder, hiddenColumns: initial.hiddenColumns });
  };

  /* ---------------- row edit ---------------- */

  const startEdit = (row: Row) => {
    const draft: RowChanges = {};
    for (const column of config.columns) if (column.editor) draft[fieldOf(column)] = cellValue(row, column);
    setEditing({ id: config.getRowId(row), draft });
    setRowError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setRowError(null);
  };

  const saveEdit = async (row: Row) => {
    if (!editing || !onRowUpdate) return;
    // Send only the fields that actually changed
    const changes: RowChanges = {};
    for (const [field, value] of Object.entries(editing.draft)) {
      if (value !== (row as Record<string, unknown>)[field]) changes[field] = value;
    }
    if (Object.keys(changes).length === 0) return cancelEdit();

    setSavingRow(true);
    setRowError(null);
    try {
      await onRowUpdate(row, changes);
      setEditing(null);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not save the changes.');
    } finally {
      setSavingRow(false);
    }
  };

  const onEditKeyDown = (event: KeyboardEvent, row: Row) => {
    if (event.key === 'Escape') cancelEdit();
    if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') saveEdit(row);
  };

  /* ---------------- render ---------------- */

  const columnCount = columns.length + (features.selection ? 1 : 0) + (canEditRows ? 1 : 0);

  return (
    <div className={`dt${loading ? ' dt--loading' : ''}`}>
      <TableToolbar
        showSearch={features.search}
        search={state.search}
        searchPlaceholder={config.searchPlaceholder ?? 'Search…'}
        onSearchChange={setSearch}
        showColumnsButton={features.columnConfig}
        columnsPanelOpen={columnsPanelOpen}
        columnsPanelId={columnsPanelId}
        onToggleColumnsPanel={() => setColumnsPanelOpen((open) => !open)}
      />

      {features.columnConfig && columnsPanelOpen && (
        <ColumnConfigPanel
          id={columnsPanelId}
          columns={config.columns}
          columnOrder={state.columnOrder}
          hiddenColumns={state.hiddenColumns}
          onChange={onStateChange}
          onReset={resetColumns}
        />
      )}

      <FilterChips
        columns={config.columns}
        filters={features.columnFilters ? state.filters : {}}
        search={features.search ? state.search : ''}
        onRemoveFilter={(columnId) => setFilter(columnId, undefined)}
        onClearSearch={() => setSearch('')}
        onClearAll={() => onStateChange({ filters: {}, search: '', page: 1 })}
      />

      {features.selection && state.selectedIds.length > 0 && (
        <BulkUpdateBar
          selectedCount={state.selectedIds.length}
          columns={bulkColumns}
          canUpdate={canBulkUpdate}
          onApply={async (changes) => {
            await onBulkUpdate?.(state.selectedIds, changes);
            onStateChange({ selectedIds: [] });
          }}
          onClearSelection={() => onStateChange({ selectedIds: [] })}
        />
      )}

      <div className="dt__scroll">
        <table className="dt__table" aria-busy={loading || undefined}>
          <thead>
            <tr>
              {features.selection && (
                <th className="dt__select" scope="col">
                  <input
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    checked={allOnPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someOnPageSelected;
                    }}
                    disabled={rows.length === 0}
                    onChange={togglePage}
                  />
                </th>
              )}

              {columns.map((column) => {
                const sortable = features.sorting && column.sortable;
                const sorted = state.sort?.columnId === column.id ? state.sort.direction : null;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    style={{ width: column.width, textAlign: column.align }}
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                  >
                    <div className={`dt__th${column.align === 'right' ? ' dt__th--right' : ''}`}>
                      {sortable ? (
                        <button
                          type="button"
                          className="dt__sort"
                          onClick={() => onStateChange({ sort: nextSort(state.sort, column.id), page: 1 })}
                        >
                          {column.header}
                          <span className={`dt__sort-icon${sorted ? ` dt__sort-icon--${sorted}` : ''}`} aria-hidden="true" />
                        </button>
                      ) : (
                        <span>{column.header}</span>
                      )}
                      {features.columnFilters && column.filter && (
                        <ColumnFilter
                          column={column as TableColumn<Row> & { filter: ColumnFilterConfig }}
                          value={state.filters[column.id]}
                          onApply={(value) => setFilter(column.id, value)}
                        />
                      )}
                    </div>
                  </th>
                );
              })}

              {canEditRows && (
                <th className="dt__actions" scope="col">
                  <span className="dt__visually-hidden">Actions</span>
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {error ? (
              <tr>
                <td colSpan={columnCount} className="dt__message dt__message--error" role="alert">
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="dt__message">
                  {loading ? 'Loading…' : (config.emptyMessage ?? 'No results.')}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = config.getRowId(row);
                const isEditing = editing?.id === id;
                const isSelected = selected.has(id);

                return (
                  <tr
                    key={id}
                    className={[isSelected && 'dt__row--selected', isEditing && 'dt__row--editing'].filter(Boolean).join(' ') || undefined}
                    onKeyDown={isEditing ? (e) => onEditKeyDown(e, row) : undefined}
                  >
                    {features.selection && (
                      <td className="dt__select">
                        <input type="checkbox" aria-label={`Select row ${id}`} checked={isSelected} onChange={() => toggleRow(id)} />
                      </td>
                    )}

                    {columns.map((column, index) => (
                      <td key={column.id} style={{ textAlign: column.align }}>
                        {isEditing && column.editor ? (
                          <CellEditor
                            editor={column.editor}
                            label={column.header}
                            autoFocus={index === columns.findIndex((c) => c.editor)}
                            value={editing.draft[fieldOf(column)]}
                            onChange={(value) =>
                              setEditing((current) => current && { ...current, draft: { ...current.draft, [fieldOf(column)]: value } })
                            }
                          />
                        ) : column.render ? (
                          column.render(row)
                        ) : (
                          formatValue(cellValue(row, column))
                        )}
                      </td>
                    ))}

                    {canEditRows && (
                      <td className="dt__actions">
                        {isEditing ? (
                          <div className="dt__row-actions">
                            <Button size="sm" loading={savingRow} onClick={() => saveEdit(row)}>
                              Save
                            </Button>
                            <Button variant="secondary" size="sm" disabled={savingRow} onClick={cancelEdit}>
                              Cancel
                            </Button>
                            {rowError && (
                              <span className="dt__row-error" role="alert">
                                {rowError}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" disabled={Boolean(editing)} onClick={() => startEdit(row)}>
                            Edit
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {loading && rows.length > 0 && (
          <div className="dt__overlay" aria-hidden="true">
            <span className="ui-spinner" />
          </div>
        )}
      </div>

      {features.pagination && pagination && (
        <TablePager
          page={state.page}
          pageSize={state.pageSize}
          pageSizeOptions={pageSizeOptions(config as TableConfig<unknown>)}
          pagination={pagination}
          disabled={loading}
          onPageChange={(page) => onStateChange({ page })}
          onPageSizeChange={(pageSize) => onStateChange({ pageSize, page: 1 })}
        />
      )}
    </div>
  );
}

export default DataTable;
