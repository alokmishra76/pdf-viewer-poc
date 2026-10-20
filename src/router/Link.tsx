import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from './router';

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

/**
 * A real <a href> (so "open in new tab" and copy link work) that switches pages
 * without reloading on a normal click.
 */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    // Let the browser handle new-tab clicks (Ctrl / Cmd / middle button)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handleClick} {...rest} />;
}
