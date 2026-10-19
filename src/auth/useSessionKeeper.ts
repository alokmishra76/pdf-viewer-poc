import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { renewSession, restoreSession, selectAccessTokenExpiresAt, type AuthErrorPayload } from './authSlice';

/** Renew this long before the access token expires, so requests never hit an expired token. */
const RENEW_EARLY_MS = 60_000;
/** After a network error, try renewing again this much later. */
const NETWORK_RETRY_MS = 15_000;

/**
 * Keeps the session alive. Call it once, near the top of the app (AuthGate does).
 *
 * - On start it restores the session from the refresh cookie.
 * - While signed in it renews the access token a minute before it expires.
 */
export function useSessionKeeper() {
  const dispatch = useAppDispatch();
  const expiresAt = useAppSelector(selectAccessTokenExpiresAt);
  const [retryAt, setRetryAt] = useState<number | null>(null);

  // Restore the session after a page reload. Under StrictMode this runs twice in
  // development; refreshSession() shares one request, so the server sees only one.
  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);

  useEffect(() => {
    if (!expiresAt) return;
    const renewAt = retryAt ?? Date.parse(expiresAt) - RENEW_EARLY_MS;
    const timer = window.setTimeout(() => {
      dispatch(renewSession())
        .unwrap()
        .then(() => setRetryAt(null))
        .catch((err: AuthErrorPayload) => {
          // Any other error has already signed the user out (see authSlice)
          if (err.code === 'NETWORK') setRetryAt(Date.now() + NETWORK_RETRY_MS);
        });
    }, Math.max(renewAt - Date.now(), 5_000));
    return () => window.clearTimeout(timer);
  }, [dispatch, expiresAt, retryAt]);
}
