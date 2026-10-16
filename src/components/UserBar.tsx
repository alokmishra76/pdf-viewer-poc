import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { Button } from '../widget';

/** Thin bar at the top of the signed-in app: who is signed in, and a sign-out button. */
export function UserBar() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;

  return (
    <div className="user-bar">
      <span>
        Signed in as <strong>{user.name}</strong>
      </span>
      <Button
        variant="secondary"
        size="sm"
        loading={signingOut}
        loadingLabel="Signing out"
        onClick={async () => {
          setSigningOut(true);
          await logout();
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
