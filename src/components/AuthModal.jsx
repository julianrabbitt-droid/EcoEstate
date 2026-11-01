import { useEffect, useState } from 'react';
import { SignIn } from '@clerk/clerk-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/AuthContext';

const DISMISSED_KEY = 'ecoestate_auth_prompt_dismissed';

// Auto-pops a sign-in dialog (Clerk) for guests on first load. The built-in X
// closes it so the visitor can continue as a guest for the session.
export default function AuthModal() {
  const { isAuthenticated, authChecked } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!authChecked) return;
    if (isAuthenticated) { setOpen(false); return; }
    if (!sessionStorage.getItem(DISMISSED_KEY)) setOpen(true);
  }, [authChecked, isAuthenticated]);

  const close = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">Sign in to EcoEstate</DialogTitle>
        <div className="flex justify-center">
          <SignIn
            routing="hash"
            signUpUrl="/register"
            fallbackRedirectUrl={window.location.pathname + window.location.search}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
