import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { captureReferral, confirmCheckout } from '@/lib/checkout';

// Remembers referral codes from shared links, and finishes a Pro checkout
// when Stripe sends the buyer back (?checkout=success&session_id=...).
export default function CheckoutReturn() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    captureReferral(location.search);
    const params = new URLSearchParams(location.search);
    const status = params.get('checkout');
    if (!status) return;
    const sessionId = params.get('session_id');
    params.delete('checkout');
    params.delete('session_id');
    const clean = `${location.pathname}${params.toString() ? `?${params}` : ''}`;
    if (status !== 'success' || !sessionId) {
      navigate(clean, { replace: true });
      return;
    }
    confirmCheckout(sessionId)
      .then((ok) => {
        if (ok) toast({ title: 'Welcome to EcoEstate Pro!' });
        window.location.replace(clean); // reload so every page sees the new access
      })
      .catch(() => {
        toast({ title: 'Payment received', description: 'Pro will unlock in a minute. Refresh if it doesn’t.' });
        navigate(clean, { replace: true });
      });
  }, [location.search, location.pathname, navigate]);

  return null;
}
