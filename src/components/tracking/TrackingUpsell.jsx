import { useState } from 'react';
import { GraduationCap, Leaf, Loader2, Sprout } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const BENEFITS = [
  'Connect a scanned property to a real-world project',
  'Log progress updates with photos as you convert the lawn',
  'Track money spent, rebates received and your actual water bills',
  'See water saved, net cost and payback time computed from your own numbers',
  'Optionally share an approximate pin on the community map',
];

// Shown on My projects pages to users without Premium or the student unlock.
// Same checkout / student-claim flow as FullAutoScanUpsell.
export default function TrackingUpsell({ onUnlocked }) {
  const [purchasing, setPurchasing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');

  const upgrade = async () => {
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

  const claimStudent = async () => {
    setError('');
    setClaiming(true);
    try {
      await base44.functions.invoke('claim3dStudent');
      await onUnlocked?.();
    } catch (e) {
      setError(e?.message || 'We could not verify a school email on your account.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <section className="surface p-6">
      <div className="flex items-center gap-2">
        <Sprout className="h-4 w-4 text-accent" />
        <span className="label-xs">Premium feature</span>
      </div>
      <h2 className="mt-2 font-display text-2xl tracking-tight">Track your lawn conversion</h2>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
        My projects turns a scanned property into a living record of the real work: progress photos, plants, spending
        and water bills — then shows the environmental and economic impact. Included with EcoEstate Premium
        ($5/month) and free with a verified school email.
      </p>
      <ul className="mt-3 flex flex-col gap-1.5 text-[12px] text-muted-foreground">
        {BENEFITS.map((b) => (
          <li key={b} className="inline-flex items-center gap-1.5">
            <Leaf className="h-3.5 w-3.5 shrink-0 text-accent" /> {b}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={upgrade} disabled={purchasing} className="rounded-full px-6">
          {purchasing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting to checkout…
            </>
          ) : (
            <>Upgrade to Premium — $5/month</>
          )}
        </Button>
        <Button onClick={claimStudent} disabled={claiming} variant="outline" className="rounded-full px-6">
          {claiming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking…
            </>
          ) : (
            <>
              <GraduationCap className="mr-2 h-4 w-4" /> Unlock with a school email
            </>
          )}
        </Button>
      </div>
      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
    </section>
  );
}
