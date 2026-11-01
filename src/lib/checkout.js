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

const PENDING_FLAG = 'ecoestate_premium_pending';

// Starts Stripe Checkout for Pro, applying a saved referral code.
// Resolves to the function response ({ data: { redirectUrl } }); on failure
// clears the "Pro pending" flag callers set and rethrows (message = {error}).
export async function startCheckout() {
  try {
    const res = await base44.functions.invoke('create-checkout', { referralCode: savedReferral() || undefined });
    if (!res?.data?.redirectUrl) throw new Error('Checkout didn’t open. Please try again.');
    return res;
  } catch (e) {
    try {
      window.sessionStorage.removeItem(PENDING_FLAG);
    } catch {
      /* storage unavailable */
    }
    throw e;
  }
}

export async function openBillingPortal() {
  const res = await base44.functions.invoke('billing-portal', {});
  if (!res?.data?.redirectUrl) throw new Error('The billing portal didn’t open. Please try again.');
  window.location.href = res.data.redirectUrl;
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
