/**
 * Thunks: every API call of the projects page. Each one gets the access token
 * through withAccessToken (which renews it if it expired) and turns errors into
 * a plain { code, message, status } payload.
 */
import * as projectsApi from '../api/projects';
import type { ProjectChanges, ProjectsQuery } from '../api/projects';
import { toApiErrorPayload } from '../api/http';
import { createAppAsyncThunk } from '../store/createAppAsyncThunk';
import { withAccessToken } from '../store/withAccessToken';
import { toProjectsQuery } from './toProjectsQuery';

/** One page of the table. Pass the AbortSignal-aware promise's abort() to cancel an outdated request. */
export const fetchProjects = createAppAsyncThunk(
  'projects/fetchProjects',
  async (query: ProjectsQuery, thunkApi) => {
    try {
      return await withAccessToken(thunkApi, (token) => projectsApi.fetchProjects(query, token, thunkApi.signal));
    } catch (err) {
      return thunkApi.rejectWithValue(toApiErrorPayload(err));
    }
  }
);

/** One page of the featured-projects carousel. */
export const fetchProjectCarousel = createAppAsyncThunk(
  'projects/fetchCarousel',
  async (page: number, thunkApi) => {
    const { pageSize } = thunkApi.getState().projects.carousel;
    try {
      return await withAccessToken(thunkApi, (token) => projectsApi.fetchProjectCarousel(page, pageSize, token, thunkApi.signal));
    } catch (err) {
      return thunkApi.rejectWithValue(toApiErrorPayload(err));
    }
  }
);

/** Owners, clients, tags and counts for the column filters. */
export const fetchProjectFilterOptions = createAppAsyncThunk(
  'projects/fetchFilterOptions',
  async (_: void, thunkApi) => {
    try {
      return await withAccessToken(thunkApi, (token) => projectsApi.fetchProjectFilterOptions(token, thunkApi.signal));
    } catch (err) {
      return thunkApi.rejectWithValue(toApiErrorPayload(err));
    }
  }
);

/** Reloads everything an edit can change: the table page, the carousel, the filter counts. */
export const refreshProjects = createAppAsyncThunk('projects/refresh', async (_: void, { dispatch, getState }) => {
  const { table, carousel } = getState().projects;
  await Promise.all([
    dispatch(fetchProjects(toProjectsQuery(table))),
    dispatch(fetchProjectCarousel(carousel.page)),
    dispatch(fetchProjectFilterOptions()),
  ]);
});

/** Saves one edited row. The row is replaced in the table straight away (see projectsSlice). */
export const updateProject = createAppAsyncThunk(
  'projects/updateProject',
  async ({ id, changes }: { id: number; changes: ProjectChanges }, thunkApi) => {
    try {
      const project = await withAccessToken(thunkApi, (token) => projectsApi.updateProject(id, changes, token));
      // The carousel and the filter counts may show this project too
      thunkApi.dispatch(fetchProjectCarousel(thunkApi.getState().projects.carousel.page));
      thunkApi.dispatch(fetchProjectFilterOptions());
      return project;
    } catch (err) {
      return thunkApi.rejectWithValue(toApiErrorPayload(err));
    }
  }
);

/**
 * Applies the same change to many projects. The API has no bulk endpoint, so
 * it sends one PATCH per project, then reloads. Fails if any of them failed.
 */
export const bulkUpdateProjects = createAppAsyncThunk(
  'projects/bulkUpdate',
  async ({ ids, changes }: { ids: number[]; changes: ProjectChanges }, thunkApi) => {
    const results = await Promise.allSettled(
      ids.map((id) => withAccessToken(thunkApi, (token) => projectsApi.updateProject(id, changes, token)))
    );
    await thunkApi.dispatch(refreshProjects());

    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length > 0) {
      const reason = toApiErrorPayload(failed[0].reason).message;
      return thunkApi.rejectWithValue({
        code: 'PARTIAL_FAILURE',
        status: 0,
        message: `Updated ${ids.length - failed.length} of ${ids.length}. ${failed.length} failed: ${reason}`,
      });
    }
    return { updated: ids.length };
  }
);
