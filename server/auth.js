// Sign-in is handled by Clerk (email, Google and more, with verification and
// password resets on Clerk's side). The browser sends its Clerk session token
// as a Bearer token; we verify it and map the Clerk account to an app user row,
// which keeps the user ids all records refer to. Existing users are linked to
// their Clerk account by verified email the first time they sign in; people
// can also sign up with just a phone number.
import express from 'express';
import { createClerkClient, verifyToken } from '@clerk/express';
import { ADMIN_EMAILS } from './config.js';
import { publicUser, users } from './db.js';
import { HttpError } from './entities.js';
import { autoUnlockStudent } from './student.js';
import { deleteAccount } from './accountDeletion.js';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const normEmail = (e) => String(e || '').trim().toLowerCase();

// Version (effective date) of the Terms and Privacy Policy that sign-up asks
// people to accept; keep in step with EFFECTIVE_DATE in src/pages/Legal.jsx.
export const TERMS_VERSION = '2026-11-01';

// Clerk user id -> app user row, so most requests skip the database lookup.
const linked = new Map();

async function appUserForClerk(clerkId) {
  const cached = linked.get(clerkId);
  if (cached && Date.now() - cached.at < 60_000) return cached.row;
  let row = await users.byClerkId(clerkId);
  if (!row) {
    // Accounts sign up with an email or a phone number (Clerk verifies either).
    // Only a verified email links to an existing account or unlocks school features.
    const account = await clerk.users.getUser(clerkId);
    const email = account.emailAddresses.find((e) => e.id === account.primaryEmailAddressId && e.verification?.status === 'verified');
    const phone = account.phoneNumbers.find((p) => p.id === account.primaryPhoneNumberId && p.verification?.status === 'verified');
    if (!email && !phone) return null;
    const address = email ? normEmail(email.emailAddress) : null;
    const fullName = [account.firstName, account.lastName].filter(Boolean).join(' ') || null;
    const existing = address ? await users.byEmail(address) : null;
    try {
      row = existing
        ? await users.update(existing.id, { clerk_id: clerkId, full_name: existing.full_name || fullName })
        : await users.create({
            clerkId,
            email: address,
            phone: phone?.phoneNumber ?? null,
            fullName,
            role: address && ADMIN_EMAILS.includes(address) ? 'admin' : 'user',
          });
    } catch (e) {
      // A parallel first request for the same new account created it already.
      if (e?.code !== '23505') throw e;
      row = await users.byClerkId(clerkId);
      if (!row) throw e;
    }
  } else if (!row.email) {
    // A phone-only account may have added and verified an email since (for
    // example a school email, which unlocks Pro features).
    const account = await clerk.users.getUser(clerkId);
    const added = account.emailAddresses.find((e) => e.verification?.status === 'verified');
    const address = added ? normEmail(added.emailAddress) : null;
    if (address && !(await users.byEmail(address))) row = await users.update(row.id, { email: address });
  }
  if (linked.size > 5000) for (const [k, v] of linked) if (Date.now() - v.at >= 60_000) linked.delete(k);
  linked.set(clerkId, { row, at: Date.now() });
  return row;
}

// Resolves the signed-in user from an Authorization header, or null.
export async function userFromHeader(header) {
  const token = /^Bearer\s+(.+)$/i.exec(header || '')?.[1];
  if (!token || token === 'null' || !process.env.CLERK_SECRET_KEY) return null;
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    return publicUser(await appUserForClerk(payload.sub));
  } catch {
    return null;
  }
}

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal error' : err.message });
  });

export const authRouter = express.Router();
authRouter.use(express.json());

// Copies the sign-up acceptance Clerk recorded (the required "I agree to the
// Terms and Privacy Policy" box) onto the app user, as proof of agreement.
const noAcceptance = new Set();
async function recordTermsAcceptance(user) {
  if (user.termsAcceptedAt || noAcceptance.has(user.id)) return user;
  const row = await users.byId(user.id);
  if (!row?.clerk_id) return user;
  const account = await clerk.users.getUser(row.clerk_id);
  if (!account.legalAcceptedAt) {
    noAcceptance.add(user.id);
    return user;
  }
  const data = { ...(row.data || {}), termsAcceptedAt: new Date(account.legalAcceptedAt).toISOString(), termsVersion: TERMS_VERSION };
  const updated = await users.update(row.id, { data });
  for (const [k, v] of linked) if (v.row.id === row.id) linked.delete(k);
  return publicUser(updated);
}

authRouter.get('/me', wrap(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  req.user = await recordTermsAcceptance(req.user).catch((e) => {
    console.warn('terms acceptance lookup failed', e?.message);
    return req.user;
  });
  // The app calls this after every sign-in, so a verified school email is
  // unlocked before the app checks entitlements.
  await autoUnlockStudent(req.user);
  res.json(req.user);
}));

authRouter.patch('/me', wrap(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  const { full_name, ...rest } = req.body || {};
  for (const k of ['id', 'email', 'role', 'created_date', 'updated_date', 'termsAcceptedAt', 'termsVersion']) delete rest[k];
  const row = await users.byId(req.user.id);
  const updated = await users.update(row.id, { full_name: full_name ?? undefined, data: { ...(row.data || {}), ...rest } });
  for (const [k, v] of linked) if (v.row.id === row.id) linked.delete(k);
  res.json(publicUser(updated));
}));

// Self-service account deletion (Privacy Policy). The body must confirm it:
// { confirm: 'DELETE' }. Payment records are kept as the law requires.
authRouter.delete('/me', wrap(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  if (req.body?.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.');
  const row = await users.byId(req.user.id);
  if (!row) throw new HttpError(404, 'Account not found');
  const result = await deleteAccount(row, { log: (line) => console.log(`[delete-account ${row.id}] ${line}`) });
  for (const [k, v] of linked) if (v.row.id === row.id) linked.delete(k);
  res.json({ deleted: true, ...result });
}));
