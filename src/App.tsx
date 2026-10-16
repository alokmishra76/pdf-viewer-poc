import { AuthGate, AuthProvider } from './auth';
import { UserBar } from './components/UserBar';

/**
 * App shell. Signed-out users see the login / register pages (AuthGate);
 * signed-in users see the app.
 */
export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <UserBar />
      </AuthGate>
    </AuthProvider>
  );
}
