/**
 * Projects API: plain functions, one per endpoint. They know nothing about
 * Redux; the thunks call them and pass in the access token.
 */
import { apiRequest } from './http';

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Project {
  id: number;
  code: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  client: string;
  owner: { id: string; name: string; email: string };
  budget: number;
  spent: number;
  currency: string;
  progress: number;
  startDate: string;
  dueDate: string;
  tags: string[];
  teamSize: number;
  coverColor: string;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  nextPage: number | null;
  previousPage: number | null;
  from: number;
  to: number;
}

/** Query parameters of GET /api/projects */
export interface ProjectsQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  status?: string[];
  priority?: string[];
  ownerId?: string[];
  client?: string[];
  tags?: string[];
  budgetMin?: number;
  budgetMax?: number;
  progressMin?: number;
  progressMax?: number;
  startFrom?: string;
  startTo?: string;
  dueFrom?: string;
  dueTo?: string;
}

export interface ProjectsResponse {
  items: Project[];
  pagination: Pagination;
}

export interface CarouselCard {
  id: number;
  code: string;
  name: string;
  client: string;
  status: ProjectStatus;
  statusLabel: string;
  priority: ProjectPriority;
  owner: { id: string; name: string };
  progress: number;
  budget: number;
  spent: number;
  currency: string;
  budgetUsedPercent: number;
  dueDate: string;
  daysRemaining: number;
  isOverdue: boolean;
  teamSize: number;
  tags: string[];
  coverColor: string;
}

export interface CarouselResponse {
  items: CarouselCard[];
  pagination: Pagination;
}

interface CountedOption {
  value: string;
  label?: string;
  count: number;
}

export interface ProjectFilterOptions {
  statuses: Array<CountedOption & { label: string }>;
  priorities: Array<CountedOption & { label: string }>;
  owners: Array<{ id: string; name: string; count: number }>;
  clients: CountedOption[];
  tags: CountedOption[];
  budget: { min: number; max: number; currency: string };
}

/** Fields that can be changed with PATCH /api/projects/:id */
export type ProjectChanges = Partial<
  Pick<Project, 'name' | 'description' | 'status' | 'priority' | 'client' | 'budget' | 'spent' | 'progress' | 'startDate' | 'dueDate' | 'tags' | 'teamSize' | 'isFeatured'>
>;

/** GET /api/projects: one page of the table */
export function fetchProjects(query: ProjectsQuery, token: string, signal?: AbortSignal) {
  return apiRequest<ProjectsResponse>('/projects', { token, signal, query: { ...query } });
}

/** GET /api/projects/carousel: featured project cards */
export function fetchProjectCarousel(page: number, pageSize: number, token: string, signal?: AbortSignal) {
  return apiRequest<CarouselResponse>('/projects/carousel', { token, signal, query: { page, pageSize } });
}

/** GET /api/projects/filter-options: values for the filter dropdowns */
export function fetchProjectFilterOptions(token: string, signal?: AbortSignal) {
  return apiRequest<ProjectFilterOptions>('/projects/filter-options', { token, signal });
}

/** PATCH /api/projects/:id */
export async function updateProject(id: number, changes: ProjectChanges, token: string): Promise<Project> {
  const data = await apiRequest<{ project: Project }>(`/projects/${id}`, { method: 'PATCH', token, body: changes });
  return data.project;
}
