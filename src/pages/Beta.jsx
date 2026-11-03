import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { usePageMeta } from '@/hooks/usePageMeta';
import { BETA_CODE_KEY, claimBetaAccess } from '@/lib/beta';

// The tester link (/beta?code=…): free access to everything while EcoEstate is
// being built, in exchange for feedback. The code is kept until the person has
// signed in, so it still applies after they create an account.
export default function Beta() {
  usePageMeta({ title: 'Try EcoEstate free', description: 'Free tester access to EcoEstate while it is being built. Scan your lawn, design a native garden, and tell us what you think.' });
  const { isAuthenticated, authChecked, navigateToLogin } = useAuth();
  const [state, setState] = useState('idle'); // idle | claiming | done | error
  const [error, setError] = useState('');

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      try {
        localStorage.setItem(BETA_CODE_KEY, code);
      } catch {
        /* private browsing: claimed now if signed in, otherwise the link is needed again */
      }
    }
  }, []);

  useEffect(() => {
    if (!authChecked || !isAuthenticated || state !== 'idle') return;
    setState('claiming');
    claimBetaAccess()
      .then((ok) => setState(ok ? 'done' : 'error'))
      .catch((e) => {
        setError(e?.message || 'Something went wrong.');
        setState('error');
      });
  }, [authChecked, isAuthenticated, state]);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-14">
      <p className="label-xs">Tester access</p>
      <h1 className="mt-2 font-display text-[2.4rem] leading-tight tracking-tight">
        Try EcoEstate <em className="italic text-accent">free</em>, and tell us what you think
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        EcoEstate is still being built. With this link you get every feature free: scan your lawn, see a native garden
        designed for it in 3D (with Real 3D of your house), and the water and money it would save. In return, tell us
        what works and what doesn’t with the Feedback button at the bottom of every page.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        {!authChecked || state === 'claiming' ? (
          <p className="flex items-center gap-2 text-[14px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Setting up your access…</p>
        ) : !isAuthenticated ? (
          <>
            <p className="text-[15px] font-medium">Step 1: create a free account</p>
            <p className="mt-1 text-[13px] text-muted-foreground">An email address is all it takes. Your tester access turns on as soon as you’re in.</p>
            <Button onClick={() => navigateToLogin?.(window.location.href)} className="mt-4 rounded-full">Create account or sign in</Button>
          </>
        ) : state === 'done' ? (
          <>
            <p className="flex items-center gap-2 text-[15px] font-medium"><Check className="h-4 w-4 text-primary" /> You have full tester access.</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Start with your own address, or any home you know.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className="rounded-full"><Link to="/">Scan a lawn</Link></Button>
              <Button asChild variant="outline" className="rounded-full"><Link to="/examples">See examples</Link></Button>
            </div>
          </>
        ) : (
          <p role="alert" className="text-[14px] text-destructive">
            {error || 'That tester link is not valid.'}{' '}
            <a href="mailto:support@ecoestate.org?subject=EcoEstate%20tester%20link" className="underline underline-offset-2">Email support@ecoestate.org</a> for a new one.
          </p>
        )}
      </div>

      <p className="mt-6 flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        Anything confusing, wrong or missing is worth a note: a scan that missed your lawn, a slow page, a plant you’d expect.
        Every note is read.
      </p>
    </div>
  );
}
