import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from './cx';
import './widget.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** Look of the button. Default: 'primary' */
  variant?: ButtonVariant;
  /** Default: 'md' */
  size?: ButtonSize;
  /** Shows a spinner and blocks clicks, keeping the button's width. Use while a request is running. */
  loading?: boolean;
  /** Read by screen readers while loading. Default: 'Loading' */
  loadingLabel?: string;
  /** Stretch to the width of the container (e.g. the submit button of a form) */
  fullWidth?: boolean;
  /** Icon before the label */
  startIcon?: ReactNode;
  /** Icon after the label */
  endIcon?: ReactNode;
}

/**
 * A button for any app.
 *
 *   <Button onClick={save}>Save</Button>
 *   <Button type="submit" loading={isSubmitting} fullWidth>Sign in</Button>
 *   <Button variant="secondary" size="sm" startIcon={<PlusIcon />}>Add</Button>
 *
 * Every native <button> prop works too (onClick, disabled, form, aria-*, ref...).
 * It defaults to type="button", so it never submits a form by accident; pass type="submit" for that.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel = 'Loading',
  fullWidth = false,
  startIcon,
  endIcon,
  type = 'button',
  disabled,
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      // While loading the button stays focusable (no focus loss) but ignores clicks
      onClick={loading ? (event) => event.preventDefault() : onClick}
      className={cx(
        'ui-button',
        `ui-button--${variant}`,
        size !== 'md' && `ui-button--${size}`,
        fullWidth && 'ui-button--full',
        loading && 'ui-button--loading',
        className
      )}
    >
      {loading && (
        <>
          <span className="ui-spinner ui-button__spinner" aria-hidden="true" />
          <span style={visuallyHidden}>
            {loadingLabel}
          </span>
        </>
      )}
      <span className="ui-button__content">
        {startIcon && (
          <span className="ui-button__icon" aria-hidden="true">
            {startIcon}
          </span>
        )}
        {children}
        {endIcon && (
          <span className="ui-button__icon" aria-hidden="true">
            {endIcon}
          </span>
        )}
      </span>
    </button>
  );
}

// Inline so the widget doesn't depend on the host app having a .visually-hidden class
const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

export default Button;
