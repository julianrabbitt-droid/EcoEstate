import Stripe from 'stripe';
import { users } from '../db.js';
import { LEGAL_ADDRESS, LEGAL_OPERATOR } from '../config.js';
import { sendEmail } from '../email.js';
import { proSubscriptionEmail } from '../emailTemplates.js';

// EcoEstate Pro billing on Stripe: a $10/month subscription, plus referrals.
// A friend who subscribes with a referral code gets $5 off their first month
// (a one-time coupon); the person who referred them gets one free month, as a
// $10 credit on their Stripe customer balance (applied to their next invoice,
// or to their first one when they subscribe later).
// Stripe objects are looked up by fixed keys and created on first use, so the
// same code works with a test key or a live key.

export const PREMIUM_USD = 10;
export const REFERRAL_DISCOUNT_USD = 5;
const PRICE_LOOKUP_KEY = 'ecoestate_premium_monthly_10';
const COUPON_ID = 'ECOESTATE_REFERRAL_5_OFF';

// Local development uses a test key against the same database as the live
// site, so Stripe ids and purchases are kept apart by mode: a test customer id
// never reaches a live checkout, and a test purchase never unlocks Pro live.
export const stripeLive = () => String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_');
const customerField = () => (stripeLive() ? 'stripeCustomerId' : 'stripeTestCustomerId');

// Creates a record that a unique index keeps to one per key; when a parallel
// request created it first, returns that one instead.
async function createOnce(entity, key: Record<string, unknown>, data: Record<string, unknown>) {
  try {
    return await entity.create(data);
  } catch (e: any) {
    if (e?.code !== '23505') throw e;
    const found = (await entity.filter(key, { limit: 1 })).items?.[0];
    if (!found) throw e;
    return found;
  }
}

let stripe: Stripe | null = null;
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripe ??= new Stripe(key);
  return stripe;
}

let priceId: string | null = null;
export async function premiumPriceId(s: Stripe): Promise<string> {
  if (priceId) return priceId;
  const found = await s.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], active: true, limit: 1 });
  if (found.data[0]) return (priceId = found.data[0].id);
  const product = await s.products.create({
    name: 'EcoEstate Pro',
    description: 'Community, project tracking and project exports.',
  });
  const price = await s.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: PREMIUM_USD * 100,
    recurring: { interval: 'month' },
    lookup_key: PRICE_LOOKUP_KEY,
  });
  return (priceId = price.id);
}

export async function referralCouponId(s: Stripe): Promise<string> {
  try {
    await s.coupons.retrieve(COUPON_ID);
  } catch (e: any) {
    if (e?.statusCode !== 404) throw e;
    await s.coupons.create({
      id: COUPON_ID,
      name: 'Referral: $5 off your first month',
      amount_off: REFERRAL_DISCOUNT_USD * 100,
      currency: 'usd',
      duration: 'once',
    });
  }
  return COUPON_ID;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
function newCode() {
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

// The user's billing account (Stripe customer + referral code), created on
// demand. Its stripeCustomerId is the customer for the current key's mode.
export async function billingAccount(base44, user, s: Stripe | null = null) {
  const accounts = base44.asServiceRole.entities.BillingAccount;
  let account = (await accounts.filter({ appUserId: user.id }, { limit: 1 })).items?.[0] ?? null;
  if (!account) {
    let code = newCode();
    while ((await accounts.filter({ referralCode: code }, { limit: 1 })).items?.length) code = newCode();
    account = await createOnce(accounts, { appUserId: user.id }, { appUserId: user.id, referralCode: code });
  }
  const field = customerField();
  if (s && !account[field]) {
    const customer = await s.customers.create(
      { email: user.email, name: user.full_name || undefined, metadata: { appUserId: user.id } },
      { idempotencyKey: `customer-${user.id}` },
    );
    account = await accounts.update(account.id, { [field]: customer.id });
  }
  return { ...account, stripeCustomerId: account[field] };
}

export async function referrerForCode(base44, code: unknown, user) {
  const clean = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(clean)) return null;
  const account = (await base44.asServiceRole.entities.BillingAccount.filter({ referralCode: clean }, { limit: 1 })).items?.[0];
  if (!account || account.appUserId === user.id) return null; // no self-referrals
  // Only new subscribers get the referral discount.
  const before = await base44.asServiceRole.entities.Base44Purchase.filter({ appUserId: user.id, productId: 'premium' }, { limit: 1 });
  if (before.items?.length) return null;
  return account.appUserId;
}

// Records an active Pro subscription for the user, once per checkout, and
// rewards the referrer. Safe to call from both the return page and the webhook.
export async function fulfillCheckout(base44, s: Stripe, session: Stripe.Checkout.Session) {
  const appUserId = session.client_reference_id || session.metadata?.appUserId;
  if (!appUserId || session.status !== 'complete' || !['paid', 'no_payment_required'].includes(session.payment_status)) return null;
  const purchases = base44.asServiceRole.entities.Base44Purchase;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  const existing = (await purchases.filter({ checkoutSessionId: session.id }, { limit: 1 })).items?.[0];
  // The subscription may already have been canceled (events can arrive late or
  // out of order), so record its current state rather than assuming it's live.
  const subscription = subscriptionId && !existing ? await s.subscriptions.retrieve(subscriptionId) : null;
  const live = !subscription || ['active', 'trialing', 'past_due'].includes(subscription.status);
  const purchase =
    existing ??
    (await createOnce(purchases, { checkoutSessionId: session.id }, {
      checkoutSessionId: session.id,
      status: live ? 'paid' : 'canceled',
      livemode: session.livemode,
      // Proof of the buyer's agreement to the renewal terms at checkout.
      termsVersion: session.metadata?.termsVersion || null,
      renewalDisclosure: session.metadata?.renewalDisclosure || null,
      consentTermsOfService: session.consent?.terms_of_service || null,
      appUserId,
      buyerEmail: session.customer_details?.email || '',
      productId: 'premium',
      productName: 'EcoEstate Pro',
      quantity: 1,
      amount: String((session.amount_total ?? PREMIUM_USD * 100) / 100),
      recurringAmount: String(PREMIUM_USD),
      currency: 'USD',
      subscriptionId,
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
      paidAt: new Date().toISOString(),
    }));

  if (!existing && purchase && !purchase.ackEmailAt) await sendWelcome(base44, purchase, session);

  // Only a friend who actually paid earns the referrer a month (a first
  // invoice paid entirely by credit doesn't count).
  const referrerId = session.metadata?.referrerId;
  if (referrerId && referrerId !== appUserId && (session.amount_total ?? 0) > 0) await rewardReferrer(base44, s, referrerId, appUserId);
  return purchase;
}

// The subscription acknowledgment (renewal terms and how to cancel), sent once.
async function sendWelcome(base44, purchase, session: Stripe.Checkout.Session) {
  const to = session.customer_details?.email || purchase.buyerEmail;
  if (!to) return;
  try {
    const mail = proSubscriptionEmail({
      kind: 'welcome',
      firstMonthUsd: (session.amount_total ?? PREMIUM_USD * 100) / 100,
      termsVersion: purchase.termsVersion || '',
      operator: LEGAL_OPERATOR,
      address: LEGAL_ADDRESS,
    });
    const result = await sendEmail({ to, ...mail });
    await base44.asServiceRole.entities.Base44Purchase.update(purchase.id, { ackEmailAt: new Date().toISOString(), ackEmailId: result.id || null });
  } catch (e) {
    console.error('Pro welcome email failed', e?.message);
  }
}

async function rewardReferrer(base44, s: Stripe, referrerId: string, refereeId: string) {
  const referrals = base44.asServiceRole.entities.Referral;
  const referrer: any = await users.byId(referrerId);
  const referee: any = await users.byId(refereeId);
  const record = { referrerId, refereeId, refereeFirstName: String(referee?.full_name || '').split(' ')[0] || 'A friend' };
  // One row per friend (a unique index enforces it); a failed reward is retried
  // the next time this checkout is confirmed or its webhook is redelivered.
  let row = (await referrals.filter({ refereeId }, { limit: 1 })).items?.[0];
  if (row?.status === 'rewarded') return;
  row ??= await createOnce(referrals, { refereeId }, { ...record, status: 'failed' });
  if (row.status === 'rewarded' || !referrer) return;
  try {
    const account = await billingAccount(base44, referrer, s);
    await s.customers.createBalanceTransaction(
      account.stripeCustomerId,
      { amount: -PREMIUM_USD * 100, currency: 'usd', description: 'EcoEstate referral: 1 free month' },
      { idempotencyKey: `referral-${refereeId}` },
    );
    await referrals.update(row.id, { status: 'rewarded', creditUsd: PREMIUM_USD, rewardedAt: new Date().toISOString() });
  } catch (e) {
    console.error('referral reward failed', e?.message);
  }
}

// Keeps the Pro purchase in step with the Stripe subscription. A subscription
// paid by a delayed method (e.g. a bank debit) completes checkout unpaid, so
// its purchase is recorded here once Stripe marks it active.
export async function syncSubscription(base44, subscription: Stripe.Subscription) {
  const purchases = base44.asServiceRole.entities.Base44Purchase;
  const rows = (await purchases.filter({ subscriptionId: subscription.id })).items ?? [];
  const active = ['active', 'trialing', 'past_due'].includes(subscription.status);
  const appUserId = subscription.metadata?.appUserId;
  if (!rows.length && active && appUserId) {
    const s = stripeClient();
    const session = s && (await s.checkout.sessions.list({ subscription: subscription.id, limit: 1 })).data[0];
    if (session) await fulfillCheckout(base44, s, { ...session, payment_status: 'paid' });
    return;
  }
  for (const row of rows) {
    const status = active ? 'paid' : 'canceled';
    if (row.status !== status) {
      await purchases.update(row.id, { status, ...(active ? {} : { canceledAt: new Date().toISOString() }) });
    }
  }
}
