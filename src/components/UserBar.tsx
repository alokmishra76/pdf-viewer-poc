import { useState } from 'react';
import { logout, selectCurrentUser } from '../auth/authSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { Button } from '../widget';

/** Thin bar at the top of the signed-in app: who is signed in, and a sign-out button. */
export function UserBar() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
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
        onClick={() => {
          setSigningOut(true);
          dispatch(logout());
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
