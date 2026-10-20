/** Thunks of the outreach page: load the grouped outreach, save one or many records. */
import * as outreachApi from '../api/outreach';
import type { OutreachChanges } from '../api/outreach';
import { toApiErrorPayload } from '../api/http';
import { createAppAsyncThunk } from '../store/createAppAsyncThunk';
import { withAccessToken } from '../store/withAccessToken';

/** Loads the open project's outreach, grouped by the current groupBy. */
export const fetchOutreach = createAppAsyncThunk('outreach/fetch', async (_: void, thunkApi) => {
  const { projectRef, groupBy } = thunkApi.getState().outreach;
  if (!projectRef) return thunkApi.rejectWithValue({ code: 'NO_PROJECT', message: 'No project selected.', status: 0 });
  try {
    return await withAccessToken(thunkApi, (token) => outreachApi.fetchProjectOutreach(projectRef, groupBy, token, thunkApi.signal));
  } catch (err) {
    return thunkApi.rejectWithValue(toApiErrorPayload(err));
  }
});

/** The project code to send in PATCH URLs (works whether the page was opened by id or code). */
const projectRefOf = (state: { outreach: { data: { project: { code: string } } | null; projectRef: string | null } }) =>
  state.outreach.data?.project.code ?? state.outreach.projectRef ?? '';

/** Saves one record, then reloads: a changed status / assignee can move it to another group. */
export const updateOutreachItem = createAppAsyncThunk(
  'outreach/updateItem',
  async ({ id, changes }: { id: number; changes: OutreachChanges }, thunkApi) => {
    try {
      const ref = projectRefOf(thunkApi.getState());
      const item = await withAccessToken(thunkApi, (token) => outreachApi.updateOutreach(ref, id, changes, token));
      await thunkApi.dispatch(fetchOutreach());
      return item;
    } catch (err) {
      return thunkApi.rejectWithValue(toApiErrorPayload(err));
    }
  }
);

/** Applies one change to many records (one PATCH each), then reloads. Fails if any of them failed. */
export const bulkUpdateOutreach = createAppAsyncThunk(
  'outreach/bulkUpdate',
  async ({ ids, changes }: { ids: number[]; changes: OutreachChanges }, thunkApi) => {
    const ref = projectRefOf(thunkApi.getState());
    const results = await Promise.allSettled(
      ids.map((id) => withAccessToken(thunkApi, (token) => outreachApi.updateOutreach(ref, id, changes, token)))
    );
    await thunkApi.dispatch(fetchOutreach());

    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length > 0) {
      return thunkApi.rejectWithValue({
        code: 'PARTIAL_FAILURE',
        status: 0,
        message: `Updated ${ids.length - failed.length} of ${ids.length}. ${failed.length} failed: ${toApiErrorPayload(failed[0].reason).message}`,
      });
    }
    return { updated: ids.length };
  }
);
