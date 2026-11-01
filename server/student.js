// Free student / educator unlock: a verified school email gets the 3D Garden
// View, orbit camera, walk-through and unlimited Full Auto Scans, recorded as a
// paid '3d_view' Base44Purchase with amount "0" (the record the app reads).
//
// School domains are checked against the community-maintained JetBrains/swot
// directory (which includes legitimate non-.edu schools); public email
// providers never qualify. If the directory can't be reached, nothing is granted.
import { entityService } from './entities.js';

const SWOT_BASE = 'https://cdn.jsdelivr.net/gh/JetBrains/swot@master/lib/domains/';
const PRODUCT_ID = '3d_view';
const PRODUCT_NAME = '3D Garden View — Student / Educator Unlock';

const FREE_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me',
  'gmx.com', 'gmx.net', 'mail.com', 'yandex.com', 'yandex.ru', 'qq.com',
  '163.com', '126.com', 'foxmail.com', 'zoho.com', 'tutanota.com', 'tuta.io',
  'fastmail.com', 'hushmail.com', 'mail.ru', 'web.de', 'gmx.de', 'freenet.de',
]);

export function emailDomain(email) {
  if (typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  return at < 1 ? null : email.slice(at + 1).toLowerCase().trim() || null;
}

// true if the file exists, false on a clean 404; throws if the directory is unreachable.
async function swotFileExists(url) {
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(6000) });
  } catch {
    throw new Error('directory unavailable');
  }
  if (res.ok) return true;
  if (res.status === 404) return false;
  throw new Error('directory unavailable');
}

/**
 * Whether a domain belongs to a school. For mail.cs.stanford.edu this tries
 * edu/stanford/cs/mail.txt, then edu/stanford/cs.txt, then edu/stanford.txt.
 * Throws "directory unavailable" so callers can fail closed.
 */
export async function isSchoolDomain(domain) {
  if (!domain) return false;
  if (domain.endsWith('.edu')) return true;
  if (FREE_PROVIDERS.has(domain)) return false;
  const reversed = domain.split('.').reverse();
  if (reversed.length < 2) return false;
  for (let depth = reversed.length; depth >= 2; depth--) {
    if (await swotFileExists(`${SWOT_BASE}${reversed.slice(0, depth).join('/')}.txt`)) return true;
  }
  return false;
}

/** Record the free unlock for a user (idempotent). */
export async function grantStudentUnlock(user) {
  const purchases = entityService('Base44Purchase', null, { service: true });
  if ((await purchases.filter({ productId: PRODUCT_ID, appUserId: user.id, status: 'paid' }, { limit: 1 })).length) return false;
  await purchases.create({
    checkoutSessionId: `student_${user.id}_${PRODUCT_ID}_${Date.now()}`,
    status: 'paid',
    appUserId: user.id,
    buyerEmail: user.email,
    productId: PRODUCT_ID,
    productName: PRODUCT_NAME,
    quantity: 1,
    amount: '0',
    currency: 'USD',
    studentUnlock: true,
    paidAt: new Date().toISOString(),
  });
  return true;
}

// Accounts already checked this run, so the directory is asked once per user.
const checked = new Set();

/**
 * Unlock automatically for a signed-in user with a verified school email.
 * Never throws: a directory outage just means we try again next time.
 */
export async function autoUnlockStudent(user) {
  if (!user?.id || checked.has(user.id)) return;
  const domain = emailDomain(user.email);
  if (!domain || FREE_PROVIDERS.has(domain)) {
    checked.add(user.id);
    return;
  }
  try {
    if (await isSchoolDomain(domain)) {
      if (await grantStudentUnlock(user)) console.log(`[student] unlocked Pro features for user ${user.id} (${domain})`);
    }
    checked.add(user.id);
  } catch {
    /* directory unreachable: retry on the next request */
  }
}
