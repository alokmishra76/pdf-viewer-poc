import { useCallback, useMemo } from 'react';
import type { OutreachChanges, OutreachGroup, OutreachItem } from '../api/outreach';
import { applyClientTableState, type DataTableProps, type RowChanges, type RowId, type TableState } from '../components/dataTable';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { buildOutreachTableConfig, outreachSearchText } from './outreachTableConfig';
import { groupTableChanged, newTable, selectOutreach, selectOutreachTable } from './outreachSlice';
import { bulkUpdateOutreach, updateOutreachItem } from './outreachThunks';

/**
 * Table column values -> PATCH fields. Columns that aren't plain fields are renamed
 * (assignee -> assigneeId), and the date editor's day keeps the original time.
 */
export function toOutreachChanges(changes: RowChanges, row?: OutreachItem): OutreachChanges {
  const result: OutreachChanges = {};
  for (const [key, value] of Object.entries(changes)) {
    switch (key) {
      case 'status':
      case 'channel':
      case 'notes':
        (result as Record<string, unknown>)[key] = value;
        break;
      case 'outcome':
        result.outcome = value === '' ? null : (value as OutreachChanges['outcome']);
        break;
      case 'assignee':
        result.assigneeId = String(value);
        break;
      case 'scheduledDate':
        if (value) result.scheduledAt = `${String(value).slice(0, 10)}${row ? row.scheduledAt.slice(10) : 'T09:00:00.000Z'}`;
        break;
    }
  }
  return result;
}

const toError = (err: unknown) => new Error((err as { message?: string })?.message ?? 'Something went wrong.');

/**
 * Everything one group's table needs. All outreach is already loaded, so search,
 * filters, sorting and paging run in the browser (applyClientTableState).
 */
export function useOutreachGroupTable(group: OutreachGroup): DataTableProps<OutreachItem> {
  const dispatch = useAppDispatch();
  const outreach = useAppSelector(selectOutreach);
  const storedState = useAppSelector((state) => selectOutreachTable(state, group.key));

  // Filter dropdowns list every provider / facility of the project, not just this group's
  const allItems = useMemo(() => outreach.data?.groups.flatMap((g) => g.items) ?? [], [outreach.data]);
  const config = useMemo(
    () => buildOutreachTableConfig(allItems, outreach.data?.assignableUsers ?? [], group.key),
    [allItems, outreach.data?.assignableUsers, group.key]
  );

  // Every loaded group gets a table state in the store; this covers the moment before that
  const state: TableState = useMemo(() => storedState ?? newTable(outreach.columns), [storedState, outreach.columns]);
  const { rows, pagination } = useMemo(
    () => applyClientTableState(group.items, config, state, { getSearchText: outreachSearchText }),
    [group.items, config, state]
  );
  // If rows left this group (after an edit), stay on the last page that still exists
  const page = Math.min(state.page, Math.max(pagination.totalPages, 1));

  const onStateChange = useCallback(
    (changes: Partial<TableState>) => dispatch(groupTableChanged({ groupKey: group.key, changes })),
    [dispatch, group.key]
  );

  const onRowUpdate = useCallback(
    async (row: OutreachItem, changes: RowChanges) => {
      try {
        await dispatch(updateOutreachItem({ id: row.id, changes: toOutreachChanges(changes, row) })).unwrap();
      } catch (err) {
        throw toError(err);
      }
    },
    [dispatch]
  );

  const onBulkUpdate = useCallback(
    async (ids: RowId[], changes: RowChanges) => {
      try {
        await dispatch(bulkUpdateOutreach({ ids: ids.map(Number), changes: toOutreachChanges(changes) })).unwrap();
      } catch (err) {
        throw toError(err);
      }
    },
    [dispatch]
  );

  return {
    config,
    rows,
    pagination,
    loading: outreach.status === 'loading',
    state: { ...state, page },
    onStateChange,
    onRowUpdate,
    onBulkUpdate,
  };
}
