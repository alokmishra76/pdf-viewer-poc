import type { ProjectsQuery } from '../api/projects';
import type { FilterValue, TableState } from '../components/dataTable';

/** Table column id -> API query parameter(s) for its filter. */
const SELECT_PARAMS: Record<string, 'status' | 'priority' | 'ownerId' | 'client' | 'tags'> = {
  status: 'status',
  priority: 'priority',
  owner: 'ownerId',
  client: 'client',
  tags: 'tags',
};
const NUMBER_RANGE_PARAMS: Record<string, ['budgetMin' | 'progressMin', 'budgetMax' | 'progressMax']> = {
  budget: ['budgetMin', 'budgetMax'],
  progress: ['progressMin', 'progressMax'],
};
const DATE_RANGE_PARAMS: Record<string, ['startFrom' | 'dueFrom', 'startTo' | 'dueTo']> = {
  startDate: ['startFrom', 'startTo'],
  dueDate: ['dueFrom', 'dueTo'],
};

/**
 * Turns the table's state into the query for GET /api/projects.
 * Selection and column settings don't affect which rows load, so they're left out.
 */
export function toProjectsQuery(state: TableState): ProjectsQuery {
  const query: ProjectsQuery = {
    page: state.page,
    pageSize: state.pageSize,
    sortBy: state.sort?.columnId,
    sortOrder: state.sort?.direction,
    search: state.search.trim() || undefined,
  };

  for (const [columnId, filter] of Object.entries(state.filters) as Array<[string, FilterValue]>) {
    if (filter.type === 'select' && SELECT_PARAMS[columnId]) {
      query[SELECT_PARAMS[columnId]] = filter.values;
    } else if (filter.type === 'numberRange' && NUMBER_RANGE_PARAMS[columnId]) {
      const [minKey, maxKey] = NUMBER_RANGE_PARAMS[columnId];
      query[minKey] = filter.min;
      query[maxKey] = filter.max;
    } else if (filter.type === 'dateRange' && DATE_RANGE_PARAMS[columnId]) {
      const [fromKey, toKey] = DATE_RANGE_PARAMS[columnId];
      query[fromKey] = filter.from;
      query[toKey] = filter.to;
    }
  }
  return query;
}
