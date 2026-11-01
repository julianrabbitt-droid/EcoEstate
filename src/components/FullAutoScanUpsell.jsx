import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Leaf, Loader2, LogIn, ScanLine } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAutoScanAccess } from '@/hooks/useAutoScanAccess';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';

// Shown on the Analysis step. Every signed-in user gets 10 free Full Auto Scans
// per month. Unlimited scans (plus interactive 3D and exports) come with
// EcoEstate Premium ($5/month) or a verified school email. Manual scanning,
// analysis and planning are always free.
export default function FullAutoScanUpsell() {
  const { isAuthenticated, authChecked } = useAuth();
  const { tier, premium, student, unlimited, loading } = useAutoScanAccess();
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState('');

  const busy = loading || !authChecked;

  const handlePurchase = async () => {
    setError('');
    setPurchasing(true);
    sessionStorage.setItem('ecoestate_premium_pending', '1');
    try {
      const res = await base44.functions.invoke('create-checkout', { productId: 'premium' });
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
    'Unlimited Full Auto Scans every month',
    'Interactive 3D orbit and first-person walk-through',
    'Project exports: printable PDF brief and materials spreadsheet',
  ];

  if (premium) {
    return (
      <section className="surface p-5">
        <div className="flex items-center gap-2">
          <ScanLine className="h-4 w-4 text-accent" />
          <span className="label-xs">Full Auto Scan</span>
        </div>
        <h2 className="mt-2 font-display text-2xl tracking-tight">Unlimited Full Auto Scans</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Your scans check all four sides of the property automatically, with no monthly cap — thanks to EcoEstate
          Premium.
        </p>
      </section>
    );
  }

  if (student) {
    return (
      <section className="surface p-5">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-accent" />
          <span className="label-xs">Full Auto Scan</span>
        </div>
        <h2 className="mt-2 font-display text-2xl tracking-tight">Full Auto Scan is unlocked</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Your verified school email unlocks the Full Auto Scan at no cost — every scan checks all four sides of the
          property automatically.
        </p>
        <Button onClick={handlePurchase} disabled={purchasing} variant="outline" className="mt-4 rounded-full px-6">
          {purchasing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting to checkout…
            </>
          ) : (
            <>Upgrade to Premium for project exports — $5/month</>
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
        <h2 className="mt-2 font-display text-2xl tracking-tight">Sign in for 10 free Full Auto Scans</h2>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          Every signed-in user gets 10 free Full Auto Scans each month — the scan detects your lawn automatically across
          all four sides of the property. Unlimited scans, interactive 3D and exports come with EcoEstate Premium
          ($5/month) or a verified school email. You can still outline your lawn manually below.
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
            <Link to="/login">
              <LogIn className="mr-2 h-4 w-4" /> Sign in
            </Link>
          </Button>
          <Button onClick={handlePurchase} disabled={purchasing} variant="outline" className="rounded-full px-6">
            {purchasing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting…
              </>
            ) : (
              <>Get Premium — $5/month</>
            )}
          </Button>
        </div>
        {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
      </section>
    );
  }

  return (
    <section className="surface p-5">
      <div className="flex items-center gap-2">
        <ScanLine className="h-4 w-4 text-accent" />
        <span className="label-xs">Upgrade</span>
      </div>
      <h2 className="mt-2 font-display text-2xl tracking-tight">Unlimited Full Auto Scans with Premium</h2>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
        You get 10 free Full Auto Scans each month. Upgrade to EcoEstate Premium ($5/month) or verify a school email
        for unlimited scans, the interactive 3D orbit and walk-through, and project exports. You can still outline
        your lawn manually below.
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
            <>Upgrade to Premium — $5/month</>
          )}
        </Button>
        <Button asChild variant="outline" className="rounded-full px-6">
          <Link to="/login">
            <GraduationCap className="mr-2 h-4 w-4" /> Unlock with a school email
          </Link>
        </Button>
      </div>
      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
    </section>
  );
}