import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

function AccountUnavailable() {
  const { logout } = useAuth();
  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="font-display text-3xl tracking-tight">We couldn’t load your account</h1>
      <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
        You’re signed in, but EcoEstate couldn’t confirm it just now. Please try again in a minute, or sign out and back in.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={() => window.location.reload()} className="rounded-full border border-border px-4 py-2 text-[13px]">
          Try again
        </button>
        <button type="button" onClick={() => logout()} className="rounded-full bg-primary px-4 py-2 text-[13px] text-primary-foreground">
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (authError.type === 'account_unavailable') {
      return <AccountUnavailable />;
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  return <Outlet />;
}
