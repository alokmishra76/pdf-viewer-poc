import { useState, type ReactNode } from 'react';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { useAppSelector } from '../store/hooks';
import { selectAuthStatus } from './authSlice';
import { useSessionKeeper } from './useSessionKeeper';

type AuthView = 'login' | 'register';

interface AuthGateProps {
  /** What signed-in users see */
  children: ReactNode;
  /** Which screen signed-out users see first. Default: 'login' */
  initialView?: AuthView;
}

/**
 * Shows `children` to signed-in users, and the login or register page to everyone else.
 * Needs the Redux <Provider store={store}> above it (see main.tsx).
 *
 *   <AuthGate>
 *     <ProtectedApp />
 *   </AuthGate>
 */
export function AuthGate({ children, initialView = 'login' }: AuthGateProps) {
  useSessionKeeper();
  const status = useAppSelector(selectAuthStatus);
  const [view, setView] = useState<AuthView>(initialView);

  if (status === 'checking') {
    return (
      <main className="auth-page auth-page--checking" aria-busy="true">
        <span className="ui-spinner" aria-hidden="true" />
        <span>Checking your session…</span>
      </main>
    );
  }

  if (status === 'signedIn') return <>{children}</>;

  return view === 'login' ? (
    <LoginPage onSwitchToRegister={() => setView('register')} />
  ) : (
    <RegisterPage onSwitchToLogin={() => setView('login')} />
  );
}
