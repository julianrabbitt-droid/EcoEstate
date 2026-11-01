// Server-side entitlement checks for EcoEstate. The Full Auto Scan is a paid
// feature: it is unlocked by an EcoEstate Premium subscription ($5/month) OR by
// a free student/educator email unlock (the same '3d_view' grant the school-email
// flow issues). Without either, the caller must outline their lawn manually —
// the backend never spends LLM, Maps or third-party quota on an unentitled scan.
// The 3D Garden View follows the same rule (Premium or student unlock). The
// client paywalls are never trusted — a backend function re-verifies the
// caller's Base44Purchase records (admin-only writes) before spending quota.

const PREMIUM_PRODUCT = 'premium';
const THREE_D_PRODUCT = '3d_view';

async function paidRecord(base44, userId, productId) {
  if (!userId) return null;
  try {
    const { items } = await base44.asServiceRole.entities.Base44Purchase.filter(
      { productId, status: 'paid', appUserId: userId },
      { limit: 1 },
    );
    return Array.isArray(items) && items.length ? items[0] : null;
  } catch (e) {
    console.error('entitlement check failed', productId, e?.message);
    return null;
  }
}

// Active Premium subscription: a paid, non-canceled 'premium' purchase.
export async function hasPremium(base44, userId) {
  return !!(await paidRecord(base44, userId, PREMIUM_PRODUCT));
}

// 3D Garden View: Premium, OR a paid/student '3d_view' unlock (free school email).
export async function has3dView(base44, userId) {
  if (await paidRecord(base44, userId, PREMIUM_PRODUCT)) return true;
  return !!(await paidRecord(base44, userId, THREE_D_PRODUCT));
}

// Full Auto Scan: Premium and verified students get unlimited scans. Any other
// signed-in user gets FREE_SCAN_LIMIT free Full Auto Scans per calendar month,
// tracked in the ScanUsage entity (admin-only writes — never on the user
// profile, which is client-editable). Anonymous callers get nothing. Returns
// { ok, reason, remaining, unlimited }. reason is 'locked' or 'error' on failure.
const FREE_SCAN_LIMIT = 10;

function currentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function consumeFullScanToken(base44, userId, email) {
  if (await paidRecord(base44, userId, PREMIUM_PRODUCT)) {
    return { ok: true, reason: '', remaining: Infinity, unlimited: true };
  }
  if (await paidRecord(base44, userId, THREE_D_PRODUCT)) {
    return { ok: true, reason: '', remaining: Infinity, unlimited: true };
  }
  if (!userId) {
    return { ok: false, reason: 'locked', remaining: 0, unlimited: false };
  }
  const period = currentPeriod();
  let rec = null;
  try {
    const { items } = await base44.asServiceRole.entities.ScanUsage.filter(
      { appUserId: userId, period },
      { limit: 1 },
    );
    rec = Array.isArray(items) && items.length ? items[0] : null;
  } catch (e) {
    console.error('scan usage lookup failed', e?.message);
    return { ok: false, reason: 'error', remaining: 0, unlimited: false };
  }
  const used = rec?.count || 0;
  if (used >= FREE_SCAN_LIMIT) {
    return { ok: false, reason: 'locked', remaining: 0, unlimited: false };
  }
  const next = used + 1;
  try {
    if (rec) {
      await base44.asServiceRole.entities.ScanUsage.update(rec.id, { count: next });
    } else {
      await base44.asServiceRole.entities.ScanUsage.create({ appUserId: userId, period, count: next });
    }
  } catch (e) {
    console.error('scan usage increment failed', e?.message);
    return { ok: false, reason: 'error', remaining: 0, unlimited: false };
  }
  return { ok: true, reason: '', remaining: Math.max(0, FREE_SCAN_LIMIT - next), unlimited: false };
}