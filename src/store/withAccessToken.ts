import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';
import { HttpError } from '../api/http';
import { renewSession, sessionEnded, type AuthState } from '../auth/authSlice';

interface ThunkApi {
  getState: () => { auth: AuthState };
  dispatch: ThunkDispatch<{ auth: AuthState }, unknown, UnknownAction>;
}

/**
 * Runs an API call with the current access token. If the server says the token
 * has expired, it renews the session once and retries. If the session has ended,
 * it signs the user out (AuthGate then shows the login page).
 *
 *   const data = await withAccessToken(thunkApi, (token) => api.fetchProjects(query, token));
 */
export async function withAccessToken<T>({ getState, dispatch }: ThunkApi, call: (token: string) => Promise<T>): Promise<T> {
  const token = getState().auth.accessToken;
  if (!token) {
    dispatch(sessionEnded());
    throw new HttpError('Please sign in again.', 'AUTH_REQUIRED', 401);
  }

  try {
    return await call(token);
  } catch (err) {
    if (!(err instanceof HttpError) || err.status !== 401) throw err;

    if (err.code === 'TOKEN_EXPIRED') {
      // renewSession signs the user out itself if the refresh fails
      const renewed = await dispatch(renewSession()).unwrap().catch(() => null);
      if (renewed) return call(renewed.accessToken);
    } else {
      dispatch(sessionEnded());
    }
    throw err;
  }
}
