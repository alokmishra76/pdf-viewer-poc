import { config } from '../config';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  createdAt: string;
  lastLoginAt: string | null;
}

/** What login and register return. The refresh token is set as an httpOnly cookie, not included here. */
export interface AuthResponse {
  tokenType: 'Bearer';
  accessToken: string;
  /** Seconds until the access token expires */
  expiresIn: number;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export type AuthErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_TAKEN'
  | 'TOO_MANY_ATTEMPTS'
  | 'USER_DISABLED'
  | 'REGISTRATION_DISABLED'
  | 'NETWORK'
  | 'SERVER';

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: AuthErrorCode,
    public readonly status: number,
    /** Per-field messages for VALIDATION_ERROR, e.g. { password: 'Password must contain a number.' } */
    public readonly fieldErrors: Record<string, string> = {},
    /** Seconds to wait, for TOO_MANY_ATTEMPTS */
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

async function postAuth<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBase}/auth${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Lets the browser store the refresh-token cookie the server sets
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('Could not reach the server. Check that the mock server is running.', 'NETWORK', 0);
  }

  const data = await response.json().catch(() => ({}));
  if (response.ok) return data as T;

  const fieldErrors: Record<string, string> = {};
  for (const detail of data.details ?? []) {
    if (detail.field && !fieldErrors[detail.field]) fieldErrors[detail.field] = detail.message;
  }
  const retryAfter = Number(response.headers.get('retry-after')) || undefined;
  throw new AuthError(
    data.message || `The server returned an error (HTTP ${response.status}).`,
    (data.error as AuthErrorCode) || 'SERVER',
    response.status,
    fieldErrors,
    retryAfter
  );
}

/** POST /api/auth/login */
export function login(request: LoginRequest): Promise<AuthResponse> {
  return postAuth('/login', request);
}

/** POST /api/auth/register: creates the account and signs the user in. */
export function register(request: RegisterRequest): Promise<AuthResponse> {
  return postAuth('/register', request);
}

let refreshInFlight: Promise<AuthResponse> | null = null;

/**
 * POST /api/auth/refresh: swaps the refresh-token cookie for a new access token.
 * Calls made while one is running share it, because a refresh token works only once.
 */
export function refreshSession(): Promise<AuthResponse> {
  refreshInFlight ??= postAuth<AuthResponse>('/refresh', {}).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** POST /api/auth/logout: ends the session on the server and clears the cookie. */
export async function logout(): Promise<void> {
  try {
    await postAuth('/logout', {});
  } catch {
    // Signing out locally must work even if the server can't be reached
  }
}
