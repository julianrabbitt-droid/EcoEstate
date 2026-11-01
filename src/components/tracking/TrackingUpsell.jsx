import { useState } from 'react';
import { GraduationCap, Leaf, Loader2, Sprout } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { startCheckout } from '@/lib/checkout';

const FEATURES = {
  tracking: {
    title: 'Track your lawn conversion',
    blurb:
      'My projects turns a scanned property into a living record of the real work: progress photos, plants, spending and water bills — then shows the water and money you save.',
    benefits: [
      'Connect a scanned property to a real-world project',
      'Log progress updates with photos as you convert the lawn',
      'Track money spent, rebates received and your actual water bills',
      'See water saved, net cost and payback time computed from your own numbers',
      'Project exports: printable PDF brief and materials spreadsheet',
    ],
  },
  community: {
    title: 'Join the EcoEstate community',
    blurb:
      'The community is where neighbors share progress, swap examples and message each other, with a map of tracked properties near you.',
    benefits: [
      'Browse and post progress updates and before/after photos',
      'Message other members privately',
      'Explore the map of tracked properties',
      'Project tracking and project exports are included',
    ],
  },
  properties: {
    title: 'Keep every property you scan',
    blurb:
      'My properties saves each scan with its design, numbers and 3D garden, so you can come back, compare properties and pick up where you left off. Scanning and the 3D view stay free.',
    benefits: [
      'A saved library of every property you scan',
      'Reopen any design, plan and payoff later',
      'Track a saved property as a real project with photos and savings',
      'Community, messages and the map of tracked properties',
      'Project exports: printable PDF brief and materials spreadsheet',
    ],
  },
};

// Shown on Social, My projects and My properties to users without Pro or the student
// unlock. Scanning and the 3D Garden View are free for everyone.
export default function TrackingUpsell({ onUnlocked, feature = 'tracking' }) {
  const { title, blurb, benefits: BENEFITS } = FEATURES[feature] || FEATURES.tracking;
  const [purchasing, setPurchasing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');

  const upgrade = async () => {
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
        <span className="label-xs">Pro feature</span>
      </div>
      <h2 className="mt-2 font-display text-2xl tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
        {blurb} Included with EcoEstate Pro ($10/month), and free with a verified school email. Invite friends:
        they get $5 off, you get a free month.
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
            <>Upgrade to Pro — $10/month</>
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
