import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const KEY = 'ecoestate_cookie_notice';

function seen() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

// EcoEstate only uses cookies and storage the app needs (sign-in, settings),
// so there is nothing to accept or reject; this just says so, once.
export default function CookieNotice() {
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* private mode: the notice just shows again next visit */
    }
    setOpen(false);
  };
  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed bottom-3 left-3 right-3 z-40 flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:right-auto sm:max-w-sm"
    >
      <p className="text-[12.5px] leading-snug text-foreground">
        Only the cookies needed to sign in. No ads or tracking.{' '}
        <Link to="/cookies" className="underline underline-offset-2">Details</Link>
      </p>
      <Button size="sm" className="shrink-0 rounded-full px-4" onClick={close}>
        OK
      </Button>
    </div>
  );
}
