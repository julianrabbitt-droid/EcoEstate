// Server-side entitlement checks for EcoEstate. Scanning and the 3D Garden View
// are free for everyone signed in. EcoEstate Pro ($10/month) unlocks the
// community (Social) and project tracking (My projects); a verified school
// email unlocks the same features for free (the '3d_view' grant, kept under its
// original product id). The client paywalls are never trusted — functions and
// the entity layer re-verify the caller's Base44Purchase records (admin-only writes).

import { purchaseCounts } from '../entities.js';

const PREMIUM_PRODUCT = 'premium';
const STUDENT_PRODUCT = '3d_view';

async function paidRecord(base44, userId, productId) {
  if (!userId) return null;
  try {
    const { items } = await base44.asServiceRole.entities.Base44Purchase.filter({ productId, status: 'paid', appUserId: userId });
    return (Array.isArray(items) ? items : []).find(purchaseCounts) ?? null;
  } catch (e) {
    console.error('entitlement check failed', productId, e?.message);
    return null;
  }
}

// Active Pro subscription: a paid, non-canceled 'premium' purchase.
export async function hasPremium(base44, userId) {
  return !!(await paidRecord(base44, userId, PREMIUM_PRODUCT));
}

// Community and project tracking: Pro, OR the free student unlock.
export async function hasPremiumFeatures(base44, userId) {
  if (await paidRecord(base44, userId, PREMIUM_PRODUCT)) return true;
  return !!(await paidRecord(base44, userId, STUDENT_PRODUCT));
}
