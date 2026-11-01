import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { savedReferral } from '@/lib/checkout';

// Automatic-renewal terms, shown right next to every button that starts a Pro
// subscription. California's Automatic Renewal Law wants them "clear and
// conspicuous" and close to the point of purchase: readable size, full-contrast
// text, the key terms called out. Stripe Checkout repeats them by its pay button.
// `referral` adds the first-month discount line; when omitted it's inferred from
// a saved ?ref= code (the one checkout will apply).
export default function RenewalTerms({ className, referral }) {
  const hasReferral = referral ?? !!savedReferral();
  return (
    <p className={cn('max-w-md text-[13px] leading-relaxed text-foreground', className)}>
      <b className="font-semibold">EcoEstate Pro: $10/month, renews automatically every month until you cancel.</b>{' '}
      {hasReferral ? 'Your first month is $5 with your friend’s code, then $10/month. ' : ''}
      Charged to your card today and on the same date each month, plus any tax. Cancel anytime online from your account
      menu → “Manage subscription”; Pro stays on until the end of the month you’ve paid for. No refunds for partial
      months. See the{' '}
      <Link to="/terms" className="underline underline-offset-2">Terms of Service</Link>.
    </p>
  );
}
