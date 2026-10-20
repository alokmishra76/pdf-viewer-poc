import { AuthGate } from './auth';
import { UserBar } from './components/UserBar';
import { ProjectsPage } from './pages/ProjectsPage';

/**
 * App shell. Signed-out users see the login / register pages (AuthGate);
 * signed-in users see the app. The Redux store is provided in main.tsx.
 */
export default function App() {
  return (
    <AuthGate>
      <UserBar />
      <ProjectsPage />
    </AuthGate>
  );
}
