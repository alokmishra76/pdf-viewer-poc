import { useCallback, useEffect, useMemo } from 'react';
import type { Project, ProjectChanges } from '../api/projects';
import type { DataTableProps } from '../components/dataTable';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { buildProjectTableConfig } from './projectTableConfig';
import { selectProjectFilterOptions, selectProjectsList, selectProjectsTable, tableStateChanged } from './projectsSlice';
import { bulkUpdateProjects, fetchProjectFilterOptions, fetchProjects, updateProject } from './projectsThunks';
import { toProjectsQuery } from './toProjectsQuery';

/** Rejected thunks give a plain { message }; the DataTable shows the message of a thrown Error. */
const toError = (err: unknown) => new Error((err as { message?: string })?.message ?? 'Something went wrong.');

/**
 * Everything the projects table needs, ready to spread onto <DataTable {...table} />.
 * Loads a page whenever the page, sort, search or filters change.
 */
export function useProjectsTable(): DataTableProps<Project> {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectProjectsTable);
  const list = useAppSelector(selectProjectsList);
  const filterOptions = useAppSelector(selectProjectFilterOptions);

  // Owners / clients / tags for the column filters, loaded once
  useEffect(() => {
    if (filterOptions.status === 'idle') dispatch(fetchProjectFilterOptions());
  }, [dispatch, filterOptions.status]);

  const config = useMemo(() => buildProjectTableConfig(filterOptions.data), [filterOptions.data]);

  // Reload only when something that changes the rows changes (not selection or column settings).
  // A newer request cancels the one still running, so a slow answer can't overwrite a newer one.
  const query = toProjectsQuery(state);
  const queryKey = JSON.stringify(query);
  useEffect(() => {
    const request = dispatch(fetchProjects(JSON.parse(queryKey)));
    return () => request.abort();
  }, [dispatch, queryKey]);

  const onStateChange = useCallback((changes: Parameters<DataTableProps<Project>['onStateChange']>[0]) => {
    dispatch(tableStateChanged(changes));
  }, [dispatch]);

  const onRowUpdate = useCallback(
    async (row: Project, changes: Record<string, unknown>) => {
      try {
        await dispatch(updateProject({ id: row.id, changes: changes as ProjectChanges })).unwrap();
      } catch (err) {
        throw toError(err);
      }
    },
    [dispatch]
  );

  const onBulkUpdate = useCallback(
    async (ids: Array<string | number>, changes: Record<string, unknown>) => {
      try {
        await dispatch(bulkUpdateProjects({ ids: ids.map(Number), changes: changes as ProjectChanges })).unwrap();
      } catch (err) {
        throw toError(err);
      }
    },
    [dispatch]
  );

  return {
    config,
    rows: list.items,
    pagination: list.pagination ?? undefined,
    loading: list.status === 'loading',
    error: list.status === 'failed' ? list.error : null,
    state,
    onStateChange,
    onRowUpdate,
    onBulkUpdate,
  };
}
