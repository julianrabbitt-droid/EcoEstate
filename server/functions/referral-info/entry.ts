import { createClientFromRequest } from '../../sdk.js';
import { APP_URL } from '../../config.js';
import { billingAccount, PREMIUM_USD, REFERRAL_DISCOUNT_USD } from '../../shared/billing.ts';

// The signed-in user's referral code and link, and the friends who subscribed with it.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Sign in to get your referral link.' }, { status: 401 });
    const account = await billingAccount(base44, user);
    const { items = [] } = await base44.asServiceRole.entities.Referral.filter({ referrerId: user.id }, { sort: '-created_date', limit: 100 });
    const rewarded = items.filter((r) => r.status === 'rewarded');
    return Response.json({
      code: account.referralCode,
      link: `${APP_URL}/?ref=${account.referralCode}`,
      friendDiscountUsd: REFERRAL_DISCOUNT_USD,
      freeMonthsEarned: rewarded.length,
      creditUsd: rewarded.length * PREMIUM_USD,
      friends: items.map((r) => ({ name: r.refereeFirstName, status: r.status, date: r.rewardedAt || r.created_date })),
    });
  } catch (error) {
    console.error('referral-info: error', error?.message);
    return Response.json({ error: 'Could not load your referral link.' }, { status: 500 });
  }
}
