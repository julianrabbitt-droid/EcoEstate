import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
export const IS_PROD = process.env.NODE_ENV === 'production';

// Public URL of the site, used for email links, OAuth callbacks and checkout
// return links. In development the browser talks to Vite on :5173.
export const APP_URL = (process.env.APP_URL || (IS_PROD ? `http://localhost:${PORT}` : 'http://localhost:5173')).replace(/\/$/, '');

// Signing secret for login tokens and private file links. Generated once and
// kept in the data folder when not supplied, so sessions survive restarts.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, '.secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}
export const SECRET = loadSecret();

export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
