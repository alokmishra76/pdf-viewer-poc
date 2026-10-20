/**
 * What the projects table looks like: its columns and what each can do.
 * The generic DataTable does the rest.
 */
import type { Project, ProjectFilterOptions } from '../api/projects';
import type { SelectOption, TableConfig } from '../components/dataTable';
import { formatDate, formatMoney, PRIORITY_LABELS, STATUS_LABELS } from './projectFormat';

const toOptions = (labels: Record<string, string>): SelectOption[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

const STATUS_OPTIONS = toOptions(STATUS_LABELS);
const PRIORITY_OPTIONS = toOptions(PRIORITY_LABELS);

/**
 * Owners, clients and tags come from GET /api/projects/filter-options, so the
 * config is built from them. Column ids match the API's sortBy names.
 */
export function buildProjectTableConfig(options: ProjectFilterOptions | null): TableConfig<Project> {
  const owners = options?.owners.map((o) => ({ value: o.id, label: o.name })) ?? [];
  const clients = options?.clients.map((c) => ({ value: c.value, label: c.value })) ?? [];
  const tags = options?.tags.map((t) => ({ value: t.value, label: t.value })) ?? [];

  return {
    id: 'projects',
    getRowId: (project) => project.id,
    pageSizeOptions: [10, 25, 50, 100],
    defaultSort: { columnId: 'updatedAt', direction: 'desc' },
    searchPlaceholder: 'Search by name, code, client or description…',
    emptyMessage: 'No projects match your search and filters.',
    columns: [
      { id: 'code', header: 'Code', sortable: true, width: 100 },
      {
        id: 'name',
        header: 'Name',
        sortable: true,
        hideable: false,
        editor: { type: 'text' },
        render: (p) => <span className="project-name">{p.name}</span>,
      },
      { id: 'client', header: 'Client', sortable: true, filter: { type: 'select', options: clients } },
      {
        id: 'owner',
        header: 'Owner',
        sortable: true,
        filter: { type: 'select', options: owners },
        render: (p) => p.owner.name,
      },
      {
        id: 'status',
        header: 'Status',
        sortable: true,
        filter: { type: 'select', options: STATUS_OPTIONS },
        editor: { type: 'select', options: STATUS_OPTIONS },
        bulkEditable: true,
        render: (p) => <span className={`badge badge--status-${p.status}`}>{STATUS_LABELS[p.status]}</span>,
      },
      {
        id: 'priority',
        header: 'Priority',
        sortable: true,
        filter: { type: 'select', options: PRIORITY_OPTIONS },
        editor: { type: 'select', options: PRIORITY_OPTIONS },
        bulkEditable: true,
        render: (p) => <span className={`badge badge--priority-${p.priority}`}>{PRIORITY_LABELS[p.priority]}</span>,
      },
      {
        id: 'progress',
        header: 'Progress',
        sortable: true,
        width: 150,
        filter: { type: 'numberRange', min: 0, max: 100 },
        editor: { type: 'number', min: 0, max: 100 },
        bulkEditable: true,
        render: (p) => (
          <span className="progress" aria-label={`${p.progress}% done`}>
            <span className="progress__track">
              <span className="progress__bar" style={{ width: `${p.progress}%` }} />
            </span>
            <span className="progress__value">{p.progress}%</span>
          </span>
        ),
      },
      {
        id: 'budget',
        header: 'Budget',
        sortable: true,
        align: 'right',
        filter: { type: 'numberRange', min: 0 },
        editor: { type: 'number', min: 0 },
        render: (p) => formatMoney(p.budget),
      },
      { id: 'spent', header: 'Spent', sortable: true, align: 'right', defaultHidden: true, render: (p) => formatMoney(p.spent) },
      {
        id: 'startDate',
        header: 'Start',
        sortable: true,
        defaultHidden: true,
        filter: { type: 'dateRange' },
        editor: { type: 'date' },
        render: (p) => formatDate(p.startDate),
      },
      {
        id: 'dueDate',
        header: 'Due',
        sortable: true,
        filter: { type: 'dateRange' },
        editor: { type: 'date' },
        bulkEditable: true,
        render: (p) => formatDate(p.dueDate),
      },
      {
        id: 'tags',
        header: 'Tags',
        filter: { type: 'select', options: tags },
        render: (p) => (
          <span className="tag-list">
            {p.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </span>
        ),
      },
      { id: 'teamSize', header: 'Team', sortable: true, align: 'right', defaultHidden: true },
      { id: 'updatedAt', header: 'Updated', sortable: true, defaultHidden: true, render: (p) => formatDate(p.updatedAt) },
    ],
  };
}
