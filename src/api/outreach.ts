/** Outreach API: a project's outreach, grouped, and updating one record. */
import { apiRequest } from './http';
import type { ProjectPriority, ProjectStatus } from './projects';

export type OutreachStatus = 'scheduled' | 'in_progress' | 'awaiting_response' | 'completed' | 'failed';
export type OutreachChannel = 'phone' | 'fax' | 'email' | 'portal' | 'mail';
export type OutreachOutcome = 'records_received' | 'callback_requested' | 'no_answer' | 'wrong_contact' | 'refused';
export type OutreachGroupBy = 'status' | 'channel' | 'outcome' | 'provider' | 'facility' | 'assignee' | 'attempt' | 'date';

export interface OutreachItem {
  id: number;
  projectId: number;
  provider: string;
  facility: string;
  contactPhone: string;
  channel: OutreachChannel;
  channelLabel: string;
  status: OutreachStatus;
  statusLabel: string;
  outcome: OutreachOutcome | null;
  outcomeLabel: string | null;
  attempt: number;
  assignee: { id: string; name: string };
  scheduledAt: string;
  completedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachGroup {
  key: string;
  label: string;
  count: number;
  items: OutreachItem[];
}

export interface OutreachProject {
  id: number;
  code: string;
  name: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  client: string;
  progress: number;
  startDate: string;
  dueDate: string;
  owner: { id: string; name: string };
}

export interface ProjectOutreachResponse {
  project: OutreachProject;
  groupBy: OutreachGroupBy;
  groupByOptions: Array<{ value: OutreachGroupBy; label: string }>;
  assignableUsers: Array<{ id: string; name: string }>;
  sortOrder: 'asc' | 'desc';
  totalItems: number;
  totalGroups: number;
  groups: OutreachGroup[];
}

/** Fields PATCH accepts */
export interface OutreachChanges {
  status?: OutreachStatus;
  outcome?: OutreachOutcome | null;
  channel?: OutreachChannel;
  assigneeId?: string;
  scheduledAt?: string;
  notes?: string;
}

/** GET /api/projects/:projectRef/outreach?groupBy=... */
export function fetchProjectOutreach(projectRef: string, groupBy: OutreachGroupBy, token: string, signal?: AbortSignal) {
  return apiRequest<ProjectOutreachResponse>(`/projects/${encodeURIComponent(projectRef)}/outreach`, {
    token,
    signal,
    query: { groupBy },
  });
}

/** PATCH /api/projects/:projectRef/outreach/:id */
export async function updateOutreach(projectRef: string, id: number, changes: OutreachChanges, token: string): Promise<OutreachItem> {
  const data = await apiRequest<{ outreach: OutreachItem }>(`/projects/${encodeURIComponent(projectRef)}/outreach/${id}`, {
    method: 'PATCH',
    token,
    body: changes,
  });
  return data.outreach;
}
