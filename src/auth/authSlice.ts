import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as authApi from '../api/auth';
import type { AuthErrorCode, AuthResponse, AuthUser, LoginRequest, RegisterRequest } from '../api/auth';

/**
 * checking  - app just opened, asking the server whether the refresh cookie is still valid
 * signedIn  - we have a user and an access token
 * signedOut - show the login / register screens
 */
export type AuthStatus = 'checking' | 'signedIn' | 'signedOut';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Send as "Authorization: Bearer <accessToken>". Kept in the store (memory) only, never in localStorage. */
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
}

/** A plain-object copy of AuthError: Redux actions must be serializable, class instances aren't. */
export interface AuthErrorPayload {
  code: AuthErrorCode;
  message: string;
  status: number;
  fieldErrors: Record<string, string>;
  retryAfterSeconds?: number;
}

function toErrorPayload(err: unknown): AuthErrorPayload {
  if (err instanceof authApi.AuthError) {
    return {
      code: err.code,
      message: err.message,
      status: err.status,
      fieldErrors: err.fieldErrors,
      retryAfterSeconds: err.retryAfterSeconds,
    };
  }
  return { code: 'SERVER', message: 'Something went wrong. Please try again.', status: 0, fieldErrors: {} };
}

const initialState: AuthState = {
  status: 'checking',
  user: null,
  accessToken: null,
  accessTokenExpiresAt: null,
};

/* ------------------------------------------------------------------ */
/* Thunks: the API calls                                               */
/* ------------------------------------------------------------------ */

type ThunkConfig = { rejectValue: AuthErrorPayload };

/** On app start: use the refresh cookie (if any) to stay signed in after a page reload. */
export const restoreSession = createAsyncThunk<AuthResponse, void, ThunkConfig>(
  'auth/restoreSession',
  async (_, { rejectWithValue }) => {
    try {
      return await authApi.refreshSession();
    } catch (err) {
      return rejectWithValue(toErrorPayload(err));
    }
  }
);

/** While signed in: get a new access token before the current one expires. */
export const renewSession = createAsyncThunk<AuthResponse, void, ThunkConfig>(
  'auth/renewSession',
  async (_, { rejectWithValue }) => {
    try {
      return await authApi.refreshSession();
    } catch (err) {
      return rejectWithValue(toErrorPayload(err));
    }
  }
);

export const login = createAsyncThunk<AuthResponse, LoginRequest, ThunkConfig>(
  'auth/login',
  async (request, { rejectWithValue }) => {
    try {
      return await authApi.login(request);
    } catch (err) {
      return rejectWithValue(toErrorPayload(err));
    }
  }
);

/** Creating an account also signs the user in. */
export const register = createAsyncThunk<AuthResponse, RegisterRequest, ThunkConfig>(
  'auth/register',
  async (request, { rejectWithValue }) => {
    try {
      return await authApi.register(request);
    } catch (err) {
      return rejectWithValue(toErrorPayload(err));
    }
  }
);

/** Ends the session on the server. Always signs out locally, even if the server can't be reached. */
export const logout = createAsyncThunk('auth/logout', () => authApi.logout());

/* ------------------------------------------------------------------ */
/* Slice                                                               */
/* ------------------------------------------------------------------ */

function setSession(state: AuthState, response: AuthResponse) {
  state.status = 'signedIn';
  state.user = response.user;
  state.accessToken = response.accessToken;
  state.accessTokenExpiresAt = response.accessTokenExpiresAt;
}

function clearSession(state: AuthState) {
  state.status = 'signedOut';
  state.user = null;
  state.accessToken = null;
  state.accessTokenExpiresAt = null;
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Sign out in the browser only, e.g. when another API call reports the session has ended. */
    sessionEnded: clearSession,
  },
  extraReducers: (builder) => {
    builder
      // Ignore a late answer if the user already signed in or out meanwhile
      .addCase(restoreSession.fulfilled, (state, action) => {
        if (state.status === 'checking') setSession(state, action.payload);
      })
      .addCase(restoreSession.rejected, (state) => {
        if (state.status === 'checking') clearSession(state);
      })
      // Don't sign back in a user who signed out while the renewal was running
      .addCase(renewSession.fulfilled, (state, action) => {
        if (state.status === 'signedIn') setSession(state, action.payload);
      })
      .addCase(renewSession.rejected, (state, action) => {
        // A network blip keeps the session; useSessionKeeper retries shortly
        if (action.payload?.code !== 'NETWORK') clearSession(state);
      })
      .addCase(login.fulfilled, (state, action) => setSession(state, action.payload))
      .addCase(register.fulfilled, (state, action) => setSession(state, action.payload))
      .addCase(logout.fulfilled, clearSession)
      .addCase(logout.rejected, clearSession);
  },
});

export const { sessionEnded } = authSlice.actions;
export const authReducer = authSlice.reducer;

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

type StateWithAuth = { auth: AuthState };

export const selectAuthStatus = (state: StateWithAuth) => state.auth.status;
export const selectCurrentUser = (state: StateWithAuth) => state.auth.user;
export const selectAccessToken = (state: StateWithAuth) => state.auth.accessToken;
export const selectAccessTokenExpiresAt = (state: StateWithAuth) => state.auth.accessTokenExpiresAt;
export const selectIsSignedIn = (state: StateWithAuth) => state.auth.status === 'signedIn';
