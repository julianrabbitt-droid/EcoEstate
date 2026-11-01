import { base44 } from '@/api/base44Client';

const REF_KEY = 'ecoestate_ref';

// Remembers a referral code from a shared link (?ref=CODE) until checkout.
export function captureReferral(search = window.location.search) {
  const code = new URLSearchParams(search).get('ref');
  if (!code || !/^[A-Za-z0-9]{6,12}$/.test(code)) return;
  try {
    window.localStorage.setItem(REF_KEY, code.toUpperCase());
  } catch {
    /* storage unavailable */
  }
}

export function savedReferral() {
  try {
    return window.localStorage.getItem(REF_KEY) || '';
  } catch {
    return '';
  }
}

// Starts Stripe Checkout for Pro, applying a saved referral code.
// Resolves to the function response ({ data: { redirectUrl } }).
export function startCheckout() {
  return base44.functions.invoke('create-checkout', { referralCode: savedReferral() || undefined });
}

export async function openBillingPortal() {
  const res = await base44.functions.invoke('billing-portal', {});
  if (res?.data?.redirectUrl) window.location.href = res.data.redirectUrl;
}

// After Stripe sends the buyer back, unlock Pro straight away.
export async function confirmCheckout(sessionId) {
  const res = await base44.functions.invoke('confirm-checkout', { sessionId });
  if (res?.data?.premium) {
    try {
      window.localStorage.removeItem(REF_KEY);
    } catch {
      /* storage unavailable */
    }
  }
  return !!res?.data?.premium;
}
