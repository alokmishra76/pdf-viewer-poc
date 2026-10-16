import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/authContext';
import { Button, Input } from '../../widget';
import { AuthLayout } from './AuthLayout';
import { describeAuthError } from './authErrors';

interface LoginPageProps {
  onSwitchToRegister: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage({ onSwitchToRegister }: LoginPageProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Quick checks before calling the server; the server validates again either way
  const validate = () => {
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = 'Enter your email.';
    else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (!password) errors.password = 'Enter your password.';
    return errors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      // On success the AuthGate swaps this page for the app; nothing else to do here
      await login({ email: email.trim(), password });
    } catch (err) {
      const described = describeAuthError(err);
      setFormError(described.formError);
      setFieldErrors(described.fieldErrors);
      setSubmitting(false);
    }
  };

  const clearFieldError = (field: string) =>
    fieldErrors[field] && setFieldErrors(({ [field]: _removed, ...rest }) => rest);

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back. Sign in to review your documents."
      error={formError}
      footer={
        <>
          No account yet?{' '}
          <Button variant="link" onClick={onSwitchToRegister}>
            Create one
          </Button>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          required
          fullWidth
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError('email');
          }}
          error={fieldErrors.email}
        />
        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          fullWidth
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearFieldError('password');
          }}
          error={fieldErrors.password}
        />
        <Button type="submit" size="lg" fullWidth loading={submitting} loadingLabel="Signing in">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
