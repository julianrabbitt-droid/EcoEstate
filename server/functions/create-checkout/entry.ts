import { createClientFromRequest } from '../../sdk.js';
import { APP_URL } from '../../config.js';
import { billingAccount, premiumPriceId, referralCouponId, referrerForCode, stripeClient } from '../../shared/billing.ts';

// Starts a Stripe Checkout for EcoEstate Pro ($10/month). Signed-in users
// only, so the subscription is tied to their account. Body: { referralCode? } —
// a valid code from another user gives $5 off the first month (new subscribers
// only) and earns that user a free month once this payment succeeds.
// Returns { redirectUrl }.
export default async function (req) {
  try {
    const s = stripeClient();
    if (!s) {
      console.error('create-checkout: STRIPE_SECRET_KEY is not set');
      return Response.json({ error: 'Payments aren’t available right now. Please try again later.' }, { status: 503 });
    }
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Sign in to subscribe to Pro.' }, { status: 401 });

    const active = await base44.asServiceRole.entities.Base44Purchase.filter({ appUserId: user.id, productId: 'premium', status: 'paid' }, { limit: 1 });
    if (active.items?.length) return Response.json({ error: 'You already have EcoEstate Pro.' }, { status: 409 });

    const body = await req.json().catch(() => ({}));
    const referrerId = await referrerForCode(base44, body.referralCode, user);
    const account = await billingAccount(base44, user, s);
    // A subscription Stripe already has (e.g. paid in another tab, not yet
    // recorded here) must not be duplicated.
    const subs = await s.subscriptions.list({ customer: account.stripeCustomerId, status: 'all', limit: 10 });
    if (subs.data.some((x) => ['active', 'trialing', 'past_due'].includes(x.status))) {
      return Response.json({ error: 'You already have EcoEstate Pro. It can take a minute to show up.' }, { status: 409 });
    }

    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      // Cards only: delayed methods (bank debits) would finish after checkout.
      payment_method_types: ['card'],
      customer: account.stripeCustomerId,
      client_reference_id: user.id,
      line_items: [{ price: await premiumPriceId(s), quantity: 1 }],
      ...(referrerId ? { discounts: [{ coupon: await referralCouponId(s) }] } : { allow_promotion_codes: true }),
      metadata: { appUserId: user.id, ...(referrerId ? { referrerId } : {}) },
      subscription_data: { metadata: { appUserId: user.id } },
      success_url: `${APP_URL}/my-projects?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/my-projects?checkout=canceled`,
    });
    return Response.json({ redirectUrl: session.url, referralApplied: !!referrerId });
  } catch (error) {
    console.error('create-checkout: error', error?.message);
    return Response.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
  }
}
