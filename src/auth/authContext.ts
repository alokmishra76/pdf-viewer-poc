import { createContext, useContext } from 'react';
import type { AuthUser, LoginRequest, RegisterRequest } from '../api/auth';

/**
 * checking  - app just opened, asking the server whether the refresh cookie is still valid
 * signedIn  - we have a user and an access token
 * signedOut - show the login / register screens
 */
export type AuthStatus = 'checking' | 'signedIn' | 'signedOut';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Send as "Authorization: Bearer <accessToken>". Kept in memory only, never in localStorage. */
  accessToken: string | null;
  login: (request: LoginRequest) => Promise<void>;
  register: (request: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** The signed-in user and the auth actions. Use inside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth() must be used inside <AuthProvider>.');
  return value;
}
