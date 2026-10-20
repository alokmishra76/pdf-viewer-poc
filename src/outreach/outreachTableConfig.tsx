/**
 * The columns of every outreach group table. All groups share this config;
 * each group keeps its own page, sort, filters and selection.
 */
import type { OutreachItem } from '../api/outreach';
import type { SelectOption, TableConfig } from '../components/dataTable';
import { formatDate } from '../projects/projectFormat';

export const OUTREACH_STATUS_OPTIONS: SelectOption[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'awaiting_response', label: 'Awaiting response' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];
export const OUTREACH_CHANNEL_OPTIONS: SelectOption[] = [
  { value: 'phone', label: 'Phone' },
  { value: 'fax', label: 'Fax' },
  { value: 'email', label: 'Email' },
  { value: 'portal', label: 'Portal' },
  { value: 'mail', label: 'Mail' },
];
export const OUTREACH_OUTCOME_OPTIONS: SelectOption[] = [
  { value: 'records_received', label: 'Records received' },
  { value: 'callback_requested', label: 'Callback requested' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'wrong_contact', label: 'Wrong contact' },
  { value: 'refused', label: 'Refused' },
];
/** "No outcome" is stored as null; in the table it's the empty value. */
const NO_OUTCOME: SelectOption = { value: '', label: 'No outcome' };

const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
const toOptions = (values: string[]): SelectOption[] => values.map((v) => ({ value: v, label: v }));

/** "2026-11-03T09:00:00Z" -> "Nov 3, 2026, 9:00 AM" */
function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Filter options for provider, facility and assignee come from the loaded data.
 * Column ids that aren't plain fields (assignee, scheduledDate) use `value`.
 */
export function buildOutreachTableConfig(
  items: OutreachItem[],
  assignableUsers: Array<{ id: string; name: string }>,
  groupKey: string
): TableConfig<OutreachItem> {
  const assignees = assignableUsers.map((u) => ({ value: u.id, label: u.name }));

  return {
    id: `outreach-${groupKey}`,
    getRowId: (item) => item.id,
    pageSizeOptions: [5, 10, 25, 50],
    defaultPageSize: 10,
    defaultSort: { columnId: 'scheduledDate', direction: 'desc' },
    searchPlaceholder: 'Search provider, facility, notes or assignee…',
    emptyMessage: 'No outreach matches your search and filters.',
    columns: [
      { id: 'attempt', header: '#', sortable: true, width: 56, align: 'right', filter: { type: 'numberRange', min: 1 } },
      {
        id: 'provider',
        header: 'Provider',
        sortable: true,
        hideable: false,
        filter: { type: 'select', options: toOptions(unique(items.map((i) => i.provider))) },
        render: (i) => <span className="outreach-provider">{i.provider}</span>,
      },
      {
        id: 'facility',
        header: 'Facility',
        sortable: true,
        filter: { type: 'select', options: toOptions(unique(items.map((i) => i.facility))) },
      },
      { id: 'contactPhone', header: 'Phone', defaultHidden: true },
      {
        id: 'channel',
        header: 'Channel',
        sortable: true,
        filter: { type: 'select', options: OUTREACH_CHANNEL_OPTIONS },
        editor: { type: 'select', options: OUTREACH_CHANNEL_OPTIONS },
        bulkEditable: true,
        render: (i) => i.channelLabel,
      },
      {
        id: 'status',
        header: 'Status',
        sortable: true,
        filter: { type: 'select', options: OUTREACH_STATUS_OPTIONS },
        editor: { type: 'select', options: OUTREACH_STATUS_OPTIONS },
        bulkEditable: true,
        render: (i) => <span className={`badge badge--outreach-${i.status}`}>{i.statusLabel}</span>,
      },
      {
        id: 'outcome',
        header: 'Outcome',
        sortable: true,
        value: (i) => i.outcome ?? '',
        filter: { type: 'select', options: [...OUTREACH_OUTCOME_OPTIONS, NO_OUTCOME] },
        editor: { type: 'select', options: [NO_OUTCOME, ...OUTREACH_OUTCOME_OPTIONS] },
        bulkEditable: true,
        render: (i) => i.outcomeLabel ?? <span className="muted">—</span>,
      },
      {
        id: 'assignee',
        header: 'Assignee',
        sortable: true,
        value: (i) => i.assignee.id,
        filter: { type: 'select', options: assignees },
        editor: { type: 'select', options: assignees },
        bulkEditable: true,
        render: (i) => i.assignee.name,
      },
      {
        id: 'scheduledDate',
        header: 'Scheduled',
        sortable: true,
        // Sort, filter and edit by the calendar day; show the full date and time
        value: (i) => i.scheduledAt,
        filter: { type: 'dateRange' },
        editor: { type: 'date' },
        bulkEditable: true,
        render: (i) => formatDateTime(i.scheduledAt),
      },
      {
        id: 'completedAt',
        header: 'Completed',
        sortable: true,
        defaultHidden: true,
        filter: { type: 'dateRange' },
        render: (i) => formatDateTime(i.completedAt),
      },
      {
        id: 'notes',
        header: 'Notes',
        filter: { type: 'text' },
        editor: { type: 'text' },
        render: (i) => <span className="outreach-notes">{i.notes}</span>,
      },
      { id: 'updatedAt', header: 'Updated', sortable: true, defaultHidden: true, render: (i) => formatDate(i.updatedAt) },
    ],
  };
}

/** What the search box matches, including display names (not just ids). */
export const outreachSearchText = (i: OutreachItem) =>
  [i.provider, i.facility, i.notes, i.assignee.name, i.statusLabel, i.channelLabel, i.outcomeLabel ?? '', i.contactPhone].join(' ');
