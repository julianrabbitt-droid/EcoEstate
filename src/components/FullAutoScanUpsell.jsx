import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { GraduationCap, Leaf, Loader2, LogIn, ScanLine } from 'lucide-react';
import { useAutoScanAccess } from '@/hooks/useAutoScanAccess';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { startCheckout } from '@/lib/checkout';
import { loginPath } from '@/lib/authReturnTo';

// Shown on the Analysis step. Full Auto Scans and the 3D Garden View are free
// for every signed-in user; anonymous users are asked to sign in. Pro
// ($10/month) adds the community, project tracking and project exports, and is
// free for students with a school email.
export default function FullAutoScanUpsell() {
  const location = useLocation();
  const { isAuthenticated, authChecked } = useAuth();
  const { premium, student, loading } = useAutoScanAccess();
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState('');

  const busy = loading || !authChecked;

  const handlePurchase = async () => {
    setError('');
    setPurchasing(true);
    sessionStorage.setItem('ecoestate_premium_pending', '1');
    try {
      const res = await startCheckout();
      const url = res?.data?.redirectUrl;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (e) {
      setError(e?.message || 'Could not start checkout. Please try again.');
      setPurchasing(false);
    }
  };

  if (busy) return null;

  const benefits = [
    'Automatic lawn detection across all four sides of the lot',
    'Property and building boundaries from parcel data',
    'Trees, paths and hardscape mapped onto your property',
    'Free 3D Garden View with orbit camera and first-person walk-through',
  ];

  if (premium) {
    return (
      <section className="surface p-5">
        <div className="flex items-center gap-2">
          <ScanLine className="h-4 w-4 text-accent" />
          <span className="label-xs">Full Auto Scan</span>
        </div>
        <h2 className="mt-2 font-display text-2xl tracking-tight">Thanks for subscribing</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Your EcoEstate Pro plan includes the community, project tracking and project exports. Invite friends:
          they get $5 off, you get a free month.
        </p>
      </section>
    );
  }

  if (student) {
    return (
      <section className="surface p-5">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-accent" />
          <span className="label-xs">Student access</span>
        </div>
        <h2 className="mt-2 font-display text-2xl tracking-tight">Community and tracking are unlocked</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Your verified school email unlocks the community and project tracking at no cost. Pro adds project
          exports.
        </p>
        <Button onClick={handlePurchase} disabled={purchasing} variant="outline" className="mt-4 rounded-full px-6">
          {purchasing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting to checkout…
            </>
          ) : (
            <>Upgrade to Pro for project exports — $10/month</>
          )}
        </Button>
        {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="surface p-5">
        <div className="flex items-center gap-2">
          <ScanLine className="h-4 w-4 text-accent" />
          <span className="label-xs">Full Auto Scan</span>
        </div>
        <h2 className="mt-2 font-display text-2xl tracking-tight">Sign in to run a free Full Auto Scan</h2>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          Scanning and the 3D Garden View are free for every signed-in user — the scan detects your lawn automatically
          across all four sides of the property. You can still outline your lawn manually below.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5 text-[12px] text-muted-foreground">
          {benefits.map((b) => (
            <li key={b} className="inline-flex items-center gap-1.5">
              <Leaf className="h-3.5 w-3.5 shrink-0 text-accent" /> {b}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild className="rounded-full">
            <Link to={loginPath(location)}>
              <LogIn className="mr-2 h-4 w-4" /> Sign in
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="surface p-5">
      <div className="flex items-center gap-2">
        <ScanLine className="h-4 w-4 text-accent" />
        <span className="label-xs">Upgrade</span>
      </div>
      <h2 className="mt-2 font-display text-2xl tracking-tight">Track your project with Pro</h2>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
        Scanning and the 3D Garden View are free. EcoEstate Pro ($10/month) adds the community, project tracking
        (progress, photos, water and money savings) and project exports. Students get the community and tracking free
        with a school email. Invite friends: they get $5 off, you get a free month.
      </p>
      <ul className="mt-3 flex flex-col gap-1.5 text-[12px] text-muted-foreground">
        {benefits.map((b) => (
          <li key={b} className="inline-flex items-center gap-1.5">
            <Leaf className="h-3.5 w-3.5 shrink-0 text-accent" /> {b}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={handlePurchase} disabled={purchasing} className="rounded-full px-6">
          {purchasing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting to checkout…
            </>
          ) : (
            <>Upgrade to Pro — $10/month</>
          )}
        </Button>
        <Button asChild variant="outline" className="rounded-full px-6">
          <Link to="/my-projects">
            <GraduationCap className="mr-2 h-4 w-4" /> Unlock with a school email
          </Link>
        </Button>
      </div>
      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
    </section>
  );
}
