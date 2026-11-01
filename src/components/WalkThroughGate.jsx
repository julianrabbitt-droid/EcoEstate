import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, GraduationCap, Loader2, LogIn, Lock, RefreshCw, UserPlus, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { Button } from '@/components/ui/button';

// Compact inline gate for the first-person walk-through. The walk-through is a
// Premium/student feature: unlocked by an EcoEstate Premium subscription OR a
// free verified school-email 3d_view grant. When unlocked, the parent renders
// the draggable walk handle; when not, this panel offers sign-in, subscription,
// or the free student unlock — the same entitlements as the 3D view, expressed
// here at the walk control so the gate is explicit and self-contained.
export default function WalkThroughGate({ projectId, onClose, title = 'Walk through your garden', blurb = 'Walk the garden in first person with EcoEstate Premium, or free with a verified school email.' }) {
  const { isAuthenticated, isLoadingAuth, authChecked } = useAuth();
  const { premium, threeD, loading, refresh } = usePremiumAccess();
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');

  const unlocked = premium || threeD;
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

  return (
    <div className="absolute inset-x-3 bottom-3 z-10 mx-auto max-w-sm rounded-2xl border border-border bg-card p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
            <Lock className="h-4 w-4 text-accent" />
          </span>
          <div>
            <span className="label-xs">Premium feature</span>
            <p className="text-[12.5px] font-medium leading-tight text-foreground">{title}</p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {busy ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your access…
        </p>
      ) : !isAuthenticated ? (
        <div className="mt-3">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            First-person walk-through is part of EcoEstate Premium, or free with a verified school email. Sign in to
            unlock it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" className="rounded-full">
              <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                <LogIn className="mr-1.5 h-3.5 w-3.5" /> Sign in
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to={`/register?returnTo=${encodeURIComponent(returnTo)}`}>
                <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Create account
              </Link>
            </Button>
          </div>
        </div>
      ) : unlocked ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-accent" /> You have access — drag the person onto the property to walk it.
        </p>
      ) : (
        <div className="mt-3">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            {blurb}
          </p>
          <Button onClick={handlePurchase} disabled={purchasing} size="sm" className="mt-3 w-full rounded-full">
            {purchasing ? (
              <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Redirecting…</>
            ) : (
              <>Subscribe — $5/month</>
            )}
          </Button>
          {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}

          <div className="mt-3 border-t border-border/70 pt-2.5">
            <p className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5 text-accent" /> Free with a school email
            </p>
            <Button
              onClick={handleStudentUnlock}
              disabled={claiming}
              variant="outline"
              size="sm"
              className="w-full rounded-full"
            >
              {claiming ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Verifying…</>
              ) : (
                <><GraduationCap className="mr-2 h-3.5 w-3.5" /> Unlock free with school email</>
              )}
            </Button>
            {claimError && <p className="mt-1.5 text-[11px] text-destructive">{claimError}</p>}
          </div>

          <button
            type="button"
            onClick={refresh}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            <RefreshCw className="h-3 w-3" /> I've already paid — refresh access
          </button>
        </div>
      )}
    </div>
  );
}