// File storage in a private Supabase Storage bucket ("uploads"), served through
// this API. Private files are only reachable through time-limited signed links,
// like Base44's UploadPrivateFile/CreateFileSignedUrl.
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { SECRET } from './config.js';
import { newId, now, sql } from './db.js';
import { HttpError } from './entities.js';

const BUCKET = 'uploads';
let storage = null;
function bucket() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(503, 'File storage is not configured');
  }
  storage ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(BUCKET);
  return storage;
}

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|heic|heif|avif)|application\/pdf)$/;

export async function saveFile(buffer, { name = 'file', mime = 'application/octet-stream', isPublic = false, userId = null } = {}) {
  const id = newId();
  const { error } = await bucket().upload(id, buffer, { contentType: mime, upsert: false });
  if (error) throw new HttpError(502, 'Could not store the file. Please try again.');
  await sql`INSERT INTO files (id, name, mime, size, is_public, created_by_id, created_date)
            VALUES (${id}, ${name}, ${mime}, ${buffer.length}, ${isPublic}, ${userId}, ${now()})`;
  return isPublic ? { file_url: `/api/files/public/${id}` } : { file_uri: `private/${id}` };
}

const sign = (id, exp) => crypto.createHmac('sha256', SECRET).update(`${id}.${exp}`).digest('base64url');

export function signedUrl(fileUri, expiresIn = 3600) {
  const id = String(fileUri || '').replace(/^private\//, '');
  if (!/^[a-f0-9]{24}$/.test(id)) throw new HttpError(400, 'Invalid file_uri');
  const exp = Math.floor(Date.now() / 1000) + Math.min(Number(expiresIn) || 3600, 7 * 24 * 3600);
  return `/api/files/private/${id}?exp=${exp}&sig=${sign(id, exp)}`;
}

async function sendStored(res, row) {
  const { data, error } = await bucket().download(row.id);
  if (error || !data) return res.status(404).end();
  res.setHeader('Content-Type', row.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', row.is_public ? 'public, max-age=31536000, immutable' : 'private, max-age=3600');
  res.send(Buffer.from(await data.arrayBuffer()));
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

export const filesRouter = express.Router();

function handleUpload(isPublic) {
  return [
    upload.single('file'),
    async (req, res) => {
      if (!req.user) return res.status(401).json({ error: 'Please sign in to upload files' });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      if (!ALLOWED.test(req.file.mimetype)) return res.status(400).json({ error: 'Unsupported file type' });
      try {
        res.json(await saveFile(req.file.buffer, { name: req.file.originalname, mime: req.file.mimetype, isPublic, userId: req.user.id }));
      } catch (err) {
        res.status(err.status || 500).json({ error: err.status ? err.message : 'Upload failed' });
      }
    },
  ];
}

filesRouter.post('/public', ...handleUpload(true));
filesRouter.post('/private', ...handleUpload(false));

// Signed links are only handed to signed-in users (private files belong to
// signed-in uploaders and the Pro features that show them).
filesRouter.post('/signed-url', express.json(), (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  try {
    res.json({ signed_url: signedUrl(req.body?.file_uri, req.body?.expires_in) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

filesRouter.get('/public/:id', async (req, res) => {
  try {
    const [row] = await sql`SELECT * FROM files WHERE id = ${req.params.id} AND is_public`;
    if (!row) return res.status(404).end();
    await sendStored(res, row);
  } catch {
    if (!res.headersSent) res.status(502).end();
  }
});

filesRouter.get('/private/:id', async (req, res) => {
  const { id } = req.params;
  const exp = Number(req.query.exp);
  const sig = String(req.query.sig || '');
  const expected = sign(id, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // Compare byte lengths: timingSafeEqual throws on buffers of different sizes.
  const valid = exp > Date.now() / 1000 && a.length === b.length && crypto.timingSafeEqual(a, b);
  try {
    const [row] = valid ? await sql`SELECT * FROM files WHERE id = ${id}` : [];
    if (!row) return res.status(403).end();
    await sendStored(res, row);
  } catch {
    if (!res.headersSent) res.status(502).end();
  }
});
