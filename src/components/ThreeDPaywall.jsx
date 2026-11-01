import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, GraduationCap, Leaf, Loader2, LogIn, RefreshCw, UserPlus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { use3dAccess } from '@/hooks/use3dAccess';
import { Button } from '@/components/ui/button';

// Wraps the 3D garden view. Unlocks for a Premium subscriber (paid 'premium'
// subscription) OR a free school-email 3d_view student unlock. Renders the
// children (the real 3D view) once unlocked. Scanning, analysis and planning
// stay free.
export default function ThreeDPaywall({ projectId, children }) {
  const { isAuthenticated, isLoadingAuth, authChecked } = useAuth();
  const { unlocked, loading, refresh } = use3dAccess();
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');

  const returnTo = `/project/${projectId}/design`;

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

  const handleStudentUnlock = async () => {
    setClaimError('');
    setClaiming(true);
    try {
      await base44.functions.invoke('claim3dStudent');
      await refresh();
    } catch (e) {
      setClaimError(e?.response?.data?.error || e?.message || 'Could not verify school email');
    } finally {
      setClaiming(false);
    }
  };

  const busy = isLoadingAuth || !authChecked || loading;

  if (!busy && unlocked) return children;

  const benefits = [
    '3D Garden View — every plant grown to maturity',
    'Unlimited Full Auto Scans every month',
    'Project exports: printable PDF brief and materials spreadsheet',
    'First-person walk-through of your garden',
  ];

  return (
    <div className="flex min-h-[330px] flex-col items-center justify-center gap-5 px-6 py-12 text-center sm:min-h-[420px]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <Box className="h-6 w-6 text-accent" />
        )}
      </div>

      {busy ? (
        <p className="text-[13px] text-muted-foreground">Checking your access…</p>
      ) : !isAuthenticated ? (
        <>
          <div>
            <span className="label-xs">Premium feature</span>
            <h2 className="mt-2 font-display text-2xl tracking-tight">EcoEstate Premium</h2>
          </div>
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            Sign in or create an account, then subscribe to unlock the 3D Garden View, unlimited Full Auto Scans, and
            project exports. The 3D Garden View is free with a verified school email. Full Auto Scans are free (30 per
            month) for everyone.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Button asChild className="rounded-full">
              <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                <LogIn className="mr-2 h-4 w-4" /> Sign in
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link to={`/register?returnTo=${encodeURIComponent(returnTo)}`}>
                <UserPlus className="mr-2 h-4 w-4" /> Create account
              </Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <div>
            <span className="label-xs">Monthly subscription</span>
            <h2 className="mt-2 font-display text-2xl tracking-tight">EcoEstate Premium</h2>
          </div>
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            One subscription unlocks every premium feature: the 3D Garden View, unlimited Full Auto Scans, and project
            exports you can hand to a nursery or crew.
          </p>
          <ul className="flex max-w-md flex-col items-center gap-1.5 text-[12px] text-muted-foreground">
            {benefits.map((b) => (
              <li key={b} className="inline-flex items-center gap-1.5">
                <Leaf className="h-3.5 w-3.5 shrink-0 text-accent" /> {b}
              </li>
            ))}
          </ul>

          <Button onClick={handlePurchase} disabled={purchasing} className="rounded-full px-6">
            {purchasing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting to checkout…
              </>
            ) : (
              <>Subscribe — $5/month</>
            )}
          </Button>

          {error && <p className="text-[12px] text-destructive">{error}</p>}

          <div className="mt-1 w-full max-w-sm border-t border-border/70 pt-4">
            <p className="mb-2 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5 text-accent" />
              Free 3D Garden View with a school email
            </p>
            <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
              Students and educators get the 3D Garden View at no cost. Unlimited scans and exports are part of Premium.
            </p>
            <Button
              onClick={handleStudentUnlock}
              disabled={claiming}
              variant="outline"
              className="rounded-full px-5"
            >
              {claiming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying school email…
                </>
              ) : (
                <>
                  <GraduationCap className="mr-2 h-4 w-4" /> Unlock 3D free with school email
                </>
              )}
            </Button>
            {claimError && <p className="mt-2 text-[11.5px] leading-relaxed text-destructive">{claimError}</p>}
          </div>

          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            <RefreshCw className="h-3 w-3" /> I've already paid — refresh access
          </button>
        </>
      )}
    </div>
  );
}