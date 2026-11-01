import { createClientFromRequest } from '../../sdk.js';
import { APP_URL } from '../../config.js';
import { TERMS_VERSION } from '../../auth.js';
import { billingAccount, premiumPriceId, referralCouponId, referrerForCode, stripeClient } from '../../shared/billing.ts';

// Bump when the renewal wording below changes (kept as proof of what buyers saw).
const RENEWAL_DISCLOSURE_VERSION = 'rt-2026-11-01';

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

    const params = {
      mode: 'subscription',
      // Cards only: delayed methods (bank debits) would finish after checkout.
      payment_method_types: ['card'],
      customer: account.stripeCustomerId,
      client_reference_id: user.id,
      line_items: [{ price: await premiumPriceId(s), quantity: 1 }],
      ...(referrerId ? { discounts: [{ coupon: await referralCouponId(s) }] } : { allow_promotion_codes: true }),
      // The buyer ticks a required box agreeing to the renewal terms, right by
      // Stripe's Subscribe button (California Automatic Renewal Law: express
      // consent to clearly shown terms). Stripe records the acceptance on the session.
      consent_collection: { terms_of_service: 'required' },
      custom_text: {
        terms_of_service_acceptance: {
          message:
            'I agree that EcoEstate Pro renews automatically and charges my card $10 per month (plus any tax), after any first-month discount shown above, until I cancel; ' +
            `that I can cancel anytime online from “Manage subscription”; and to the [Terms of Service](${APP_URL}/terms).`,
        },
        submit: {
          message: 'Recurring charge: $10/month until you cancel. Cancel anytime from “Manage subscription” in your EcoEstate account menu.',
        },
      },
      metadata: { appUserId: user.id, termsVersion: TERMS_VERSION, renewalDisclosure: RENEWAL_DISCLOSURE_VERSION, ...(referrerId ? { referrerId } : {}) },
      subscription_data: { metadata: { appUserId: user.id, termsVersion: TERMS_VERSION } },
      success_url: `${APP_URL}/my-projects?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/my-projects?checkout=canceled`,
    };
    let session;
    try {
      session = await s.checkout.sessions.create(params);
    } catch (e) {
      // Stripe refuses the required box until a Terms URL is set in its
      // Dashboard (Settings → Public details); fall back to the disclosure text.
      if (!/terms of service/i.test(e?.message || '')) throw e;
      console.warn('create-checkout: set the Terms of Service URL in Stripe → Settings → Public details to require the consent box');
      const { consent_collection: _consent, ...rest } = params;
      session = await s.checkout.sessions.create({
        ...rest,
        custom_text: {
          submit: {
            message:
              'EcoEstate Pro renews automatically every month at $10 (plus any tax), after any first-month discount shown above, charged to this card until you cancel. ' +
              `Cancel anytime from “Manage subscription” in your EcoEstate account menu. By subscribing you agree to the Terms of Service (${APP_URL}/terms).`,
          },
        },
      });
    }
    return Response.json({ redirectUrl: session.url, referralApplied: !!referrerId });
  } catch (error) {
    console.error('create-checkout: error', error?.message);
    return Response.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
  }
}
