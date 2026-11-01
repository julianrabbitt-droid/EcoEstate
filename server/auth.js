import crypto from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { ADMIN_EMAILS, APP_URL, SECRET } from './config.js';
import { db, newId, now } from './db.js';
import { sendEmail } from './email.js';
import { resetPasswordEmail, verificationEmail } from './emailTemplates.js';
import { HttpError } from './entities.js';
import { autoUnlockStudent } from './student.js';

const scrypt = promisify(crypto.scrypt);
const key = new TextEncoder().encode(SECRET);
const OTP_TTL = 10 * 60 * 1000;
const RESET_TTL = 60 * 60 * 1000;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

async function checkPassword(password, stored) {
  if (!stored) return false;
  const [salt, hex] = stored.split(':');
  const hash = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hex, 'hex'));
}

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();

export function publicUser(row) {
  if (!row) return null;
  return {
    ...JSON.parse(row.data || '{}'),
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

const userByEmail = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(normEmail(email));
const userById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

function createUser({ email, full_name, password_hash = null, google_id = null, verified = 0 }) {
  const ts = now();
  const id = newId();
  const role = ADMIN_EMAILS.includes(normEmail(email)) ? 'admin' : 'user';
  db.prepare(
    'INSERT INTO users (id, email, full_name, role, password_hash, google_id, verified, created_date, updated_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, normEmail(email), full_name || null, role, password_hash, google_id, verified ? 1 : 0, ts, ts);
  return userById(id);
}

export async function issueToken(user) {
  return new SignJWT({ sub: user.id }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(key);
}

// Resolves the signed-in user from an Authorization header, or null.
export async function userFromHeader(header) {
  const token = /^Bearer\s+(.+)$/i.exec(header || '')?.[1];
  if (!token || token === 'null') return null;
  try {
    const { payload } = await jwtVerify(token, key);
    const row = userById(payload.sub);
    return row ? publicUser(row) : null;
  } catch {
    return null;
  }
}

async function sendOtp(row) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare('UPDATE users SET otp_hash = ?, otp_expires = ?, otp_attempts = 0 WHERE id = ?').run(sha(code), Date.now() + OTP_TTL, row.id);
  try {
    await sendEmail({ to: row.email, ...verificationEmail({ code, minutes: OTP_TTL / 60000 }) });
  } catch (err) {
    console.error(`[email] verification code to user ${row.id} failed: ${err.message}`);
    throw new HttpError(502, 'We couldn’t send the verification email right now. Please try again in a moment.');
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
  // Every sign-in (password, email code, Google) ends with the app calling this,
  // so a verified school email is unlocked before the app checks entitlements.
  // Only verified accounts can sign in, so the email is confirmed.
  await autoUnlockStudent(req.user);
  res.json(req.user);
}));

authRouter.patch('/me', wrap(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  const { full_name, ...rest } = req.body || {};
  for (const k of ['id', 'email', 'role', 'created_date', 'updated_date']) delete rest[k];
  const row = userById(req.user.id);
  const data = { ...JSON.parse(row.data || '{}'), ...rest };
  db.prepare('UPDATE users SET full_name = COALESCE(?, full_name), data = ?, updated_date = ? WHERE id = ?').run(
    full_name ?? null,
    JSON.stringify(data),
    now(),
    row.id
  );
  res.json(publicUser(userById(row.id)));
}));

authRouter.post('/register', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const password = String(req.body?.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Please enter a valid email address');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  let row = userByEmail(email);
  if (row?.verified) throw new HttpError(409, 'An account with this email already exists');
  const password_hash = await hashPassword(password);
  if (row) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, row.id);
  else row = createUser({ email, password_hash, full_name: req.body?.full_name });
  await sendOtp(userByEmail(email));
  res.json({ success: true });
}));

authRouter.post('/resend-otp', wrap(async (req, res) => {
  const row = userByEmail(req.body?.email);
  if (row && !row.verified) await sendOtp(row);
  res.json({ success: true });
}));

authRouter.post('/verify-otp', wrap(async (req, res) => {
  const row = userByEmail(req.body?.email);
  const code = String(req.body?.otpCode || '').trim();
  if (!row || !row.otp_hash || row.otp_expires < Date.now() || sha(code) !== row.otp_hash) {
    // Five wrong guesses burn the code; the user has to request a new one.
    if (row?.otp_hash) {
      const attempts = (row.otp_attempts || 0) + 1;
      if (attempts >= 5) db.prepare('UPDATE users SET otp_hash = NULL, otp_attempts = 0 WHERE id = ?').run(row.id);
      else db.prepare('UPDATE users SET otp_attempts = ? WHERE id = ?').run(attempts, row.id);
    }
    throw new HttpError(400, 'Invalid or expired verification code');
  }
  db.prepare('UPDATE users SET verified = 1, otp_hash = NULL, otp_expires = NULL WHERE id = ?').run(row.id);
  res.json({ access_token: await issueToken(row), user: publicUser(row) });
}));

authRouter.post('/login', wrap(async (req, res) => {
  const row = userByEmail(req.body?.email);
  if (!row || !(await checkPassword(String(req.body?.password || ''), row.password_hash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  if (!row.verified) {
    await sendOtp(row);
    throw new HttpError(403, 'Please verify your email first. We sent you a new code.');
  }
  res.json({ access_token: await issueToken(row), user: publicUser(row) });
}));

authRouter.post('/reset-password-request', wrap(async (req, res) => {
  const row = userByEmail(req.body?.email);
  if (row) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('UPDATE users SET reset_hash = ?, reset_expires = ? WHERE id = ?').run(sha(token), Date.now() + RESET_TTL, row.id);
    // A send failure is logged, not reported: the reply must look the same
    // whether or not the email has an account.
    await sendEmail({ to: row.email, ...resetPasswordEmail({ url: `${APP_URL}/reset-password?token=${token}`, minutes: RESET_TTL / 60000 }) }).catch(
      (err) => console.error(`[email] password reset to user ${row.id} failed: ${err.message}`)
    );
  }
  // Same answer either way so the form can't be used to probe for accounts.
  res.json({ success: true });
}));

authRouter.post('/reset-password', wrap(async (req, res) => {
  const token = String(req.body?.resetToken || '');
  const password = String(req.body?.newPassword || '');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  const row = db.prepare('SELECT * FROM users WHERE reset_hash = ?').get(sha(token));
  if (!row || row.reset_expires < Date.now()) throw new HttpError(400, 'This reset link is invalid or has expired');
  db.prepare('UPDATE users SET password_hash = ?, reset_hash = NULL, reset_expires = NULL, verified = 1 WHERE id = ?').run(
    await hashPassword(password),
    row.id
  );
  res.json({ success: true });
}));

// ---- Google sign-in (OAuth 2.0 authorization code flow) ----

const GOOGLE_CALLBACK = `${APP_URL}/api/auth/google/callback`;

function safePath(p) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') ? p : '/';
}

authRouter.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.redirect(`/login?error=${encodeURIComponent('Google sign-in is not configured yet')}`);
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `oauth_state=${state}.${Buffer.from(safePath(req.query.returnTo)).toString('base64url')}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600`);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_CALLBACK,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get('/google/callback', wrap(async (req, res) => {
  const cookie = /(?:^|;\s*)oauth_state=([^;]+)/.exec(req.headers.cookie || '')?.[1] || '';
  const [state, encodedReturn] = cookie.split('.');
  if (!state || state !== req.query.state) throw new HttpError(400, 'Sign-in expired, please try again');
  const returnTo = safePath(Buffer.from(encodedReturn || '', 'base64url').toString());

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(req.query.code || ''),
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: GOOGLE_CALLBACK,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok) throw new HttpError(400, 'Google sign-in failed');
  const profile = await (
    await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
  ).json();
  if (!profile.email || profile.email_verified === false) throw new HttpError(400, 'Google account email is not verified');

  let row = userByEmail(profile.email);
  if (!row) row = createUser({ email: profile.email, full_name: profile.name, google_id: profile.sub, verified: 1 });
  else {
    // A password set during an unverified email signup may belong to whoever
    // typed this address, not its owner, so it's dropped once Google proves
    // ownership (the owner can set one with "forgot password").
    const dropPassword = !row.verified;
    db.prepare(
      `UPDATE users SET google_id = ?, verified = 1, full_name = COALESCE(full_name, ?)${dropPassword ? ', password_hash = NULL, otp_hash = NULL' : ''} WHERE id = ?`
    ).run(profile.sub, profile.name || null, row.id);
  }
  const url = new URL(returnTo, APP_URL);
  url.searchParams.set('access_token', await issueToken(row));
  res.setHeader('Set-Cookie', 'oauth_state=; Path=/api/auth; Max-Age=0');
  res.redirect(url.pathname + url.search);
}));
