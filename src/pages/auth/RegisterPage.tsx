import { useState, type ChangeEvent, type FormEvent } from 'react';
import { register } from '../../auth/authSlice';
import { useAppDispatch } from '../../store/hooks';
import { Button, Input } from '../../widget';
import { AuthLayout } from './AuthLayout';
import { describeAuthError } from './authErrors';

interface RegisterPageProps {
  onSwitchToLogin: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RegisterForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

function validate(form: RegisterForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Enter your name.';
  else if (name.length < 2) errors.name = 'Name must be at least 2 characters.';

  if (!form.email.trim()) errors.email = 'Enter your email.';
  else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = 'Enter a valid email address.';

  if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (!/[A-Za-z]/.test(form.password)) errors.password = 'Password must contain a letter.';
  else if (!/\d/.test(form.password)) errors.password = 'Password must contain a number.';

  if (!form.confirmPassword) errors.confirmPassword = 'Enter the password again.';
  else if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match.';
  return errors;
}

export function RegisterPage({ onSwitchToLogin }: RegisterPageProps) {
  const dispatch = useAppDispatch();
  const [form, setForm] = useState<RegisterForm>({ name: '', email: '', password: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const update = (field: keyof RegisterForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    if (fieldErrors[field]) setFieldErrors(({ [field]: _removed, ...rest }) => rest);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validate(form);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      // Registering also signs in, so the AuthGate moves straight on to the app
      await dispatch(register({ name: form.name.trim(), email: form.email.trim(), password: form.password })).unwrap();
    } catch (err) {
      const described = describeAuthError(err);
      setFormError(described.formError);
      setFieldErrors(described.fieldErrors);
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create an account"
      subtitle="It only takes a minute."
      error={formError}
      footer={
        <>
          Already have an account?{' '}
          <Button variant="link" onClick={onSwitchToLogin}>
            Sign in
          </Button>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Input
          label="Full name"
          name="name"
          autoComplete="name"
          autoFocus
          required
          fullWidth
          value={form.name}
          onChange={update('name')}
          error={fieldErrors.name}
        />
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          fullWidth
          value={form.email}
          onChange={update('email')}
          error={fieldErrors.email}
        />
        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          fullWidth
          hint="At least 8 characters, with a letter and a number."
          value={form.password}
          onChange={update('password')}
          error={fieldErrors.password}
        />
        <Input
          label="Confirm password"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          fullWidth
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          error={fieldErrors.confirmPassword}
        />
        <Button type="submit" size="lg" fullWidth loading={submitting} loadingLabel="Creating your account">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
