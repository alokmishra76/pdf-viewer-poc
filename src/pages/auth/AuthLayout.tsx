import type { ReactNode } from 'react';
import './auth.css';

interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  /** Form-level error (wrong password, server down...). Field errors go on the inputs. */
  error?: string | null;
  /** Line under the card, e.g. "No account? Create one" */
  footer?: ReactNode;
  children: ReactNode;
}

/** The centred card shared by the login and register pages. */
export function AuthLayout({ title, subtitle, error, footer, children }: AuthLayoutProps) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <header className="auth-card__header">
          <p className="auth-card__brand">Large document preview</p>
          <h1 className="auth-card__title">{title}</h1>
          {subtitle && <p className="auth-card__subtitle">{subtitle}</p>}
        </header>

        {error && (
          <div className="auth-card__alert" role="alert">
            {error}
          </div>
        )}

        {children}
      </div>
      {footer && <p className="auth-page__footer">{footer}</p>}
    </main>
  );
}
