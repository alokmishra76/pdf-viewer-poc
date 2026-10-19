import type { AuthErrorPayload } from '../../auth/authSlice';

/** True for the rejected value of the login / register thunks (after .unwrap()). */
function isAuthErrorPayload(err: unknown): err is AuthErrorPayload {
  return typeof err === 'object' && err !== null && 'code' in err && 'fieldErrors' in err;
}

/** Splits an error from login/register into a message for the top of the form and per-field messages. */
export function describeAuthError(err: unknown): { formError: string | null; fieldErrors: Record<string, string> } {
  if (!isAuthErrorPayload(err)) {
    return { formError: 'Something went wrong. Please try again.', fieldErrors: {} };
  }
  switch (err.code) {
    case 'VALIDATION_ERROR':
      // Shown next to the fields; only fall back to the banner if no field was named
      return {
        formError: Object.keys(err.fieldErrors).length ? null : err.message,
        fieldErrors: err.fieldErrors,
      };
    case 'EMAIL_TAKEN':
      return { formError: null, fieldErrors: { email: 'An account with this email already exists.' } };
    case 'TOO_MANY_ATTEMPTS': {
      const minutes = err.retryAfterSeconds ? Math.ceil(err.retryAfterSeconds / 60) : null;
      return {
        formError: `Too many failed attempts. Try again${minutes ? ` in ${minutes} minute${minutes === 1 ? '' : 's'}` : ' later'}.`,
        fieldErrors: {},
      };
    }
    default:
      return { formError: err.message, fieldErrors: {} };
  }
}
