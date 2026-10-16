import { useId, useState, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from './cx';
import './widget.css';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<ComponentPropsWithRef<'input'>, 'size'> {
  /** Text above the field. Always give one (or aria-label) so the field is accessible. */
  label?: ReactNode;
  /** Help text under the field, e.g. "At least 8 characters". Hidden while there is an error. */
  hint?: ReactNode;
  /** Error message under the field. Also marks the field invalid for screen readers. */
  error?: ReactNode;
  /** Default: 'md' */
  size?: InputSize;
  /** Stretch to the width of the container */
  fullWidth?: boolean;
  /** Content inside the field before the text, e.g. an icon or "$" */
  startAdornment?: ReactNode;
  /** Content inside the field after the text, e.g. an icon or "kg" */
  endAdornment?: ReactNode;
  /** For type="password": adds a Show / Hide button. Default: true */
  passwordToggle?: boolean;
  /** Class for the outer wrapper (label + field + messages). `className` goes on the <input> itself. */
  wrapperClassName?: string;
}

/**
 * A labelled text field for any app.
 *
 *   <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
 *   <Input label="Password" type="password" error={errors.password} hint="At least 8 characters" required />
 *   <Input label="Budget" type="number" startAdornment="$" />
 *
 * Every native <input> prop works too (name, autoComplete, onBlur, ref...), so it also
 * works with form libraries such as react-hook-form: <Input label="Email" {...register('email')} />
 */
export function Input({
  label,
  hint,
  error,
  size = 'md',
  fullWidth = false,
  startAdornment,
  endAdornment,
  passwordToggle = true,
  wrapperClassName,
  className,
  id,
  type = 'text',
  required,
  disabled,
  'aria-describedby': describedBy,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [showPassword, setShowPassword] = useState(false);

  const hasError = error !== undefined && error !== null && error !== false && error !== '';
  const isPassword = type === 'password';
  const showToggle = isPassword && passwordToggle && !disabled;

  return (
    <div
      className={cx(
        'ui-field',
        size !== 'md' && `ui-field--${size}`,
        fullWidth && 'ui-field--full',
        hasError && 'ui-field--invalid',
        disabled && 'ui-field--disabled',
        wrapperClassName
      )}
    >
      {label && (
        <label className="ui-field__label" htmlFor={inputId}>
          {label}
          {required && (
            <span className="ui-field__required" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <div className="ui-field__control">
        {startAdornment && <span className="ui-field__adornment ui-field__adornment--start">{startAdornment}</span>}
        <input
          {...rest}
          id={inputId}
          type={isPassword && showPassword ? 'text' : type}
          required={required}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={cx(describedBy, hasError ? errorId : hint ? hintId : undefined) || undefined}
          className={cx('ui-field__input', className)}
        />
        {showToggle && (
          <button
            type="button"
            className="ui-field__toggle"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-controls={inputId}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        )}
        {endAdornment && <span className="ui-field__adornment ui-field__adornment--end">{endAdornment}</span>}
      </div>

      {hasError ? (
        <p id={errorId} className="ui-field__error" role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="ui-field__hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export default Input;
