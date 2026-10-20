/**
 * A tiny router with no library: the current path lives in the browser URL,
 * navigate() changes it without a page reload, and the back / forward buttons work.
 *
 *   const path = usePath();
 *   navigate('/projects/PRJ-1042/outreach');
 */
import { useSyncExternalStore } from 'react';

const CHANGE_EVENT = 'app:navigate';

export function navigate(path: string) {
  if (path === window.location.pathname + window.location.search) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(CHANGE_EVENT));
  window.scrollTo(0, 0);
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange); // back / forward
  window.addEventListener(CHANGE_EVENT, onChange); // navigate()
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** The current path, e.g. "/projects/PRJ-1042/outreach". Re-renders when it changes. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

/* ---------- the app's routes ---------- */

export const routes = {
  projects: () => '/',
  outreach: (projectRef: string | number) => `/projects/${encodeURIComponent(String(projectRef))}/outreach`,
};

export type Route = { name: 'projects' } | { name: 'outreach'; projectRef: string };

/** Works out which page a path belongs to. Unknown paths show the projects page. */
export function matchRoute(path: string): Route {
  const outreach = /^\/projects\/([^/]+)\/outreach\/?$/.exec(path);
  if (outreach) return { name: 'outreach', projectRef: decodeURIComponent(outreach[1]) };
  return { name: 'projects' };
}
