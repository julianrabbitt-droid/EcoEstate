import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { captureReferral, confirmCheckout } from '@/lib/checkout';

// Remembers referral codes from shared links, and finishes a Pro checkout
// when Stripe sends the buyer back (?checkout=success&session_id=...).
export default function CheckoutReturn() {
  const location = useLocation();
  const navigate = useNavigate();
  const { authChecked, isAuthenticated } = useAuth();
  const confirming = useRef(null);

  useEffect(() => {
    captureReferral(location.search);
  }, [location.search]);

  useEffect(() => {
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
    // Confirming needs the Clerk session; keep session_id in the URL until
    // signed in so it runs once auth is ready.
    if (!authChecked || !isAuthenticated || confirming.current === sessionId) return;
    confirming.current = sessionId;
    confirmCheckout(sessionId)
      .then((ok) => {
        if (ok) toast({ title: 'Welcome to EcoEstate Pro!' });
        window.location.replace(clean); // reload so every page sees the new access
      })
      .catch((e) => {
        if (e?.status === 401) {
          confirming.current = null; // session not ready yet; retry on the next auth change
          return;
        }
        toast({ title: 'Payment received', description: 'Pro will unlock in a minute. Refresh if it doesn’t.' });
        navigate(clean, { replace: true });
      });
  }, [location.search, location.pathname, navigate, authChecked, isAuthenticated]);

  return null;
}
