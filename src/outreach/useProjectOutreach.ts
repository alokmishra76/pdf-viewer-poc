import { useCallback, useEffect } from 'react';
import type { OutreachGroupBy } from '../api/outreach';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { allGroupsToggled, groupByChanged, groupToggled, outreachPageOpened, selectOutreach } from './outreachSlice';
import { fetchOutreach } from './outreachThunks';

/** The outreach page: loads the project's outreach, and controls grouping and which groups are open. */
export function useProjectOutreach(projectRef: string) {
  const dispatch = useAppDispatch();
  const outreach = useAppSelector(selectOutreach);
  const { groupBy } = outreach;
  // The store may still hold the previous project for one render
  const isThisProject = outreach.projectRef?.toLowerCase() === projectRef.toLowerCase();

  useEffect(() => {
    dispatch(outreachPageOpened(projectRef));
  }, [dispatch, projectRef]);

  // Load whenever the project or the grouping changes; a newer load cancels an older one
  useEffect(() => {
    if (!isThisProject) return;
    const request = dispatch(fetchOutreach());
    return () => request.abort();
  }, [dispatch, isThisProject, projectRef, groupBy]);

  const data = isThisProject ? outreach.data : null;

  return {
    project: data?.project ?? null,
    groups: data?.groups ?? [],
    totalItems: data?.totalItems ?? 0,
    groupBy,
    groupByOptions: data?.groupByOptions ?? [],
    openGroups: outreach.openGroups,
    loading: outreach.status === 'loading' || !isThisProject,
    error: outreach.status === 'failed' ? outreach.error : null,
    notFound: outreach.status === 'failed' && outreach.errorCode === 'NOT_FOUND',
    setGroupBy: useCallback((value: OutreachGroupBy) => dispatch(groupByChanged(value)), [dispatch]),
    toggleGroup: useCallback((key: string) => dispatch(groupToggled(key)), [dispatch]),
    expandAll: useCallback(() => dispatch(allGroupsToggled(true)), [dispatch]),
    collapseAll: useCallback(() => dispatch(allGroupsToggled(false)), [dispatch]),
    retry: useCallback(() => dispatch(fetchOutreach()), [dispatch]),
  };
}
