import { Link } from 'react-router-dom';
import { safeReturnTo } from '@/lib/authReturnTo';

// Shown under the sign-in and sign-up forms: scanning and the 3D view work
// without an account, so visitors can skip signing in.
export default function GuestLink() {
  const returnTo = safeReturnTo();
  const to = /^\/(login|register)(\/|$)/.test(returnTo) ? '/' : returnTo;
  return (
    <Link
      to={to}
      className="mt-4 rounded-full border border-border bg-card px-5 py-2 text-[13px] text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
    >
      Continue as guest
    </Link>
  );
}
