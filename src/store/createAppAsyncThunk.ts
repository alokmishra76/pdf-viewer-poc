import { createAsyncThunk } from '@reduxjs/toolkit';
import type { ApiErrorPayload } from '../api/http';
import type { AppDispatch, RootState } from './index';

/**
 * createAsyncThunk with the app's types filled in, so every thunk gets a typed
 * getState(), dispatch() and error payload without repeating them.
 */
export const createAppAsyncThunk = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  rejectValue: ApiErrorPayload;
}>();
