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

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const normEmail = (e) => String(e || '').trim().toLowerCase();

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
    row = existing
      ? await users.update(existing.id, { clerk_id: clerkId, full_name: existing.full_name || fullName })
      : await users.create({
          clerkId,
          email: address,
          phone: phone?.phoneNumber ?? null,
          fullName,
          role: address && ADMIN_EMAILS.includes(address) ? 'admin' : 'user',
        });
  } else if (!row.email) {
    // A phone-only account may have added and verified an email since (for
    // example a school email, which unlocks Pro features).
    const account = await clerk.users.getUser(clerkId);
    const added = account.emailAddresses.find((e) => e.verification?.status === 'verified');
    const address = added ? normEmail(added.emailAddress) : null;
    if (address && !(await users.byEmail(address))) row = await users.update(row.id, { email: address });
  }
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

authRouter.get('/me', wrap(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  // The app calls this after every sign-in, so a verified school email is
  // unlocked before the app checks entitlements.
  await autoUnlockStudent(req.user);
  res.json(req.user);
}));

authRouter.patch('/me', wrap(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  const { full_name, ...rest } = req.body || {};
  for (const k of ['id', 'email', 'role', 'created_date', 'updated_date']) delete rest[k];
  const row = await users.byId(req.user.id);
  const updated = await users.update(row.id, { full_name: full_name ?? undefined, data: { ...(row.data || {}), ...rest } });
  for (const [k, v] of linked) if (v.row.id === row.id) linked.delete(k);
  res.json(publicUser(updated));
}));
