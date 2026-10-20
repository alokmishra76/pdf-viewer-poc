import { AuthGate } from './auth';
import { UserBar } from './components/UserBar';
import { OutreachPage } from './pages/OutreachPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { matchRoute, usePath } from './router/router';

/**
 * App shell. Signed-out users see the login / register pages (AuthGate);
 * signed-in users see the page that matches the URL:
 *
 *   /                            -> projects
 *   /projects/PRJ-1042/outreach  -> that project's outreach
 *
 * The Redux store is provided in main.tsx.
 */
export default function App() {
  const route = matchRoute(usePath());

  return (
    <AuthGate>
      <UserBar />
      {route.name === 'outreach' ? <OutreachPage key={route.projectRef} projectRef={route.projectRef} /> : <ProjectsPage />}
    </AuthGate>
  );
}
