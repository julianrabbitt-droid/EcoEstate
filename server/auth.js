// Sign-in is handled by Clerk (email, Google and more, with verification and
// password resets on Clerk's side). The browser sends its Clerk session token
// as a Bearer token; we verify it and map the Clerk account to an app user row,
// which keeps the user ids all records refer to. Existing users are linked to
// their Clerk account by verified email the first time they sign in.
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
    const account = await clerk.users.getUser(clerkId);
    const primary = account.emailAddresses.find((e) => e.id === account.primaryEmailAddressId);
    if (!primary || primary.verification?.status !== 'verified') return null; // only verified emails
    const email = normEmail(primary.emailAddress);
    const fullName = [account.firstName, account.lastName].filter(Boolean).join(' ') || null;
    const existing = await users.byEmail(email);
    row = existing
      ? await users.update(existing.id, { clerk_id: clerkId, full_name: existing.full_name || fullName })
      : await users.create({ clerkId, email, fullName, role: ADMIN_EMAILS.includes(email) ? 'admin' : 'user' });
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
