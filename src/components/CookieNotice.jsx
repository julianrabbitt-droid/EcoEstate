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
    <div role="region" aria-label="Cookie notice" className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-xl rounded-2xl border border-border bg-card p-4 shadow-lg sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
      <p className="text-[13px] leading-relaxed text-foreground">
        We only use cookies needed to sign you in and keep the site working — no ads, analytics or tracking.{' '}
        <Link to="/cookies" className="underline underline-offset-2">Cookie Policy</Link>
      </p>
      <div className="mt-3 flex justify-end">
        <Button size="sm" className="rounded-full px-5" onClick={close}>
          OK
        </Button>
      </div>
    </div>
  );
}
