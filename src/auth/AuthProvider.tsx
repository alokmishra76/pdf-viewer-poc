import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import type { AuthResponse, AuthUser } from '../api/auth';
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext';

/** Refresh this long before the access token expires, so requests never hit an expired token. */
const REFRESH_EARLY_MS = 60_000;

interface Session {
  user: AuthUser;
  accessToken: string;
  expiresAt: number;
}

const toSession = (response: AuthResponse): Session => ({
  user: response.user,
  accessToken: response.accessToken,
  expiresAt: Date.parse(response.accessTokenExpiresAt),
});

/**
 * Holds the signed-in user for the whole app.
 *
 * - On start it calls /refresh: if the refresh cookie is still valid the user stays
 *   signed in after a page reload, without typing the password again.
 * - While signed in it renews the access token shortly before it expires.
 * - If a renewal fails (session ended, password changed elsewhere...) it signs out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [session, setSession] = useState<Session | null>(null);

  const signIn = useCallback((response: AuthResponse) => {
    setSession(toSession(response));
    setStatus('signedIn');
  }, []);

  const signOutLocally = useCallback(() => {
    setSession(null);
    setStatus('signedOut');
  }, []);

  // Restore the session after a page reload
  useEffect(() => {
    let cancelled = false;
    authApi
      .refreshSession()
      .then((response) => !cancelled && signIn(response))
      .catch(() => !cancelled && signOutLocally());
    return () => {
      cancelled = true;
    };
  }, [signIn, signOutLocally]);

  // Renew the access token before it expires
  useEffect(() => {
    if (!session) return;
    const delay = Math.max(session.expiresAt - Date.now() - REFRESH_EARLY_MS, 5_000);
    const timer = window.setTimeout(() => {
      authApi
        .refreshSession()
        .then(signIn)
        .catch((err) => {
          // A network blip shouldn't sign the user out: try again in a moment
          if (err instanceof authApi.AuthError && err.code === 'NETWORK') {
            setSession((current) => current && { ...current, expiresAt: Date.now() + REFRESH_EARLY_MS + 15_000 });
          } else {
            signOutLocally();
          }
        });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [session, signIn, signOutLocally]);

  const login = useCallback<AuthContextValue['login']>(
    async (request) => signIn(await authApi.login(request)),
    [signIn]
  );

  const register = useCallback<AuthContextValue['register']>(
    async (request) => signIn(await authApi.register(request)),
    [signIn]
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    signOutLocally();
  }, [signOutLocally]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      login,
      register,
      logout,
    }),
    [status, session, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
