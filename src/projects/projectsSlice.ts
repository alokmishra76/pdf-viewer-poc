/**
 * Redux state of the projects page:
 *
 *   table         - what the user did in the table (page, sort, filters, selection, columns)
 *   list          - the rows of the current page, from the server
 *   carousel      - the featured cards and their page
 *   filterOptions - owners / clients / tags for the column filters
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CarouselCard, Pagination, Project, ProjectFilterOptions } from '../api/projects';
import { logout, sessionEnded } from '../auth/authSlice';
import { createInitialTableState } from '../components/dataTable/tableUtils';
import type { TableState } from '../components/dataTable/types';
import { buildProjectTableConfig } from './projectTableConfig';
import { fetchProjectCarousel, fetchProjectFilterOptions, fetchProjects, updateProject } from './projectsThunks';

type LoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface Loadable {
  status: LoadStatus;
  error: string | null;
  /** The request whose answer we're waiting for; older answers are ignored */
  requestId: string | null;
}

export interface ProjectsState {
  table: TableState;
  list: Loadable & { items: Project[]; pagination: Pagination | null };
  carousel: Loadable & { page: number; pageSize: number; items: CarouselCard[]; pagination: Pagination | null };
  filterOptions: Loadable & { data: ProjectFilterOptions | null };
}

const idle: Loadable = { status: 'idle', error: null, requestId: null };

const initialState: ProjectsState = {
  table: createInitialTableState(buildProjectTableConfig(null)),
  list: { ...idle, items: [], pagination: null },
  carousel: { ...idle, page: 1, pageSize: 4, items: [], pagination: null },
  filterOptions: { ...idle, data: null },
};

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    /** The DataTable reports only what changed, e.g. { page: 2 } */
    tableStateChanged(state, action: PayloadAction<Partial<TableState>>) {
      Object.assign(state.table, action.payload);
    },
    tableReset(state) {
      state.table = initialState.table;
    },
    carouselPageChanged(state, action: PayloadAction<number>) {
      state.carousel.page = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      /* ---------- table rows ---------- */
      .addCase(fetchProjects.pending, (state, action) => {
        state.list.status = 'loading';
        state.list.error = null;
        state.list.requestId = action.meta.requestId;
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        if (state.list.requestId !== action.meta.requestId) return;
        state.list.status = 'succeeded';
        state.list.items = action.payload.items;
        state.list.pagination = action.payload.pagination;
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        // Cancelled requests (the user changed page again) are not errors
        if (state.list.requestId !== action.meta.requestId || action.meta.aborted) return;
        state.list.status = 'failed';
        state.list.error = action.payload?.message ?? 'Could not load projects.';
      })

      /* ---------- one row saved ---------- */
      .addCase(updateProject.fulfilled, (state, action) => {
        const index = state.list.items.findIndex((p) => p.id === action.payload.id);
        if (index >= 0) state.list.items[index] = action.payload;
      })

      /* ---------- carousel ---------- */
      .addCase(fetchProjectCarousel.pending, (state, action) => {
        state.carousel.status = 'loading';
        state.carousel.error = null;
        state.carousel.requestId = action.meta.requestId;
      })
      .addCase(fetchProjectCarousel.fulfilled, (state, action) => {
        if (state.carousel.requestId !== action.meta.requestId) return;
        state.carousel.status = 'succeeded';
        state.carousel.items = action.payload.items;
        state.carousel.pagination = action.payload.pagination;
      })
      .addCase(fetchProjectCarousel.rejected, (state, action) => {
        if (state.carousel.requestId !== action.meta.requestId || action.meta.aborted) return;
        state.carousel.status = 'failed';
        state.carousel.error = action.payload?.message ?? 'Could not load featured projects.';
      })

      /* ---------- filter options ---------- */
      .addCase(fetchProjectFilterOptions.pending, (state, action) => {
        state.filterOptions.status = 'loading';
        state.filterOptions.requestId = action.meta.requestId;
      })
      .addCase(fetchProjectFilterOptions.fulfilled, (state, action) => {
        if (state.filterOptions.requestId !== action.meta.requestId) return;
        state.filterOptions.status = 'succeeded';
        state.filterOptions.data = action.payload;
      })
      .addCase(fetchProjectFilterOptions.rejected, (state, action) => {
        if (state.filterOptions.requestId !== action.meta.requestId || action.meta.aborted) return;
        state.filterOptions.status = 'failed';
        state.filterOptions.error = action.payload?.message ?? 'Could not load filter options.';
      })

      /* ---------- signed out: forget the previous user's data ---------- */
      .addCase(sessionEnded, () => initialState)
      .addCase(logout.fulfilled, () => initialState);
  },
});

export const { tableStateChanged, tableReset, carouselPageChanged } = projectsSlice.actions;
export const projectsReducer = projectsSlice.reducer;

/* ---------- selectors ---------- */

type StateWithProjects = { projects: ProjectsState };

export const selectProjectsTable = (state: StateWithProjects) => state.projects.table;
export const selectProjectsList = (state: StateWithProjects) => state.projects.list;
export const selectProjectCarousel = (state: StateWithProjects) => state.projects.carousel;
export const selectProjectFilterOptions = (state: StateWithProjects) => state.projects.filterOptions;
