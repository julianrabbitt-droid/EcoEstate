// File storage on local disk. Private files are only reachable through
// time-limited signed links, like Base44's UploadPrivateFile/CreateFileSignedUrl.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { SECRET, UPLOAD_DIR } from './config.js';
import { db, newId, now } from './db.js';
import { HttpError } from './entities.js';

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|heic|heif|avif)|application\/pdf)$/;

export function saveFile(buffer, { name = 'file', mime = 'application/octet-stream', isPublic = false, userId = null } = {}) {
  const id = newId();
  fs.writeFileSync(path.join(UPLOAD_DIR, id), buffer);
  db.prepare('INSERT INTO files (id, name, mime, size, is_public, created_by_id, created_date) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    name,
    mime,
    buffer.length,
    isPublic ? 1 : 0,
    userId,
    now()
  );
  return isPublic ? { file_url: `/api/files/public/${id}` } : { file_uri: `private/${id}` };
}

const sign = (id, exp) => crypto.createHmac('sha256', SECRET).update(`${id}.${exp}`).digest('base64url');

export function signedUrl(fileUri, expiresIn = 3600) {
  const id = String(fileUri || '').replace(/^private\//, '');
  if (!/^[a-f0-9]{24}$/.test(id)) throw new HttpError(400, 'Invalid file_uri');
  const exp = Math.floor(Date.now() / 1000) + Math.min(Number(expiresIn) || 3600, 7 * 24 * 3600);
  return `/api/files/private/${id}?exp=${exp}&sig=${sign(id, exp)}`;
}

// Reads a file this server stores, given one of its own URLs (used to hand
// images to the AI model, which can't reach localhost).
export function readLocalFile(url) {
  const m = /\/api\/files\/(?:public|private)\/([a-f0-9]{24})/.exec(url || '');
  if (!m) return null;
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(m[1]);
  if (!row) return null;
  return { buffer: fs.readFileSync(path.join(UPLOAD_DIR, row.id)), mime: row.mime };
}

function sendStored(res, row) {
  res.setHeader('Content-Type', row.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', row.is_public ? 'public, max-age=31536000, immutable' : 'private, max-age=3600');
  res.sendFile(path.join(UPLOAD_DIR, row.id));
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

export const filesRouter = express.Router();

function handleUpload(isPublic) {
  return [
    upload.single('file'),
    (req, res) => {
      if (!req.user) return res.status(401).json({ error: 'Please sign in to upload files' });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      if (!ALLOWED.test(req.file.mimetype)) return res.status(400).json({ error: 'Unsupported file type' });
      res.json(saveFile(req.file.buffer, { name: req.file.originalname, mime: req.file.mimetype, isPublic, userId: req.user.id }));
    },
  ];
}

filesRouter.post('/public', ...handleUpload(true));
filesRouter.post('/private', ...handleUpload(false));

filesRouter.post('/signed-url', express.json(), (req, res) => {
  try {
    res.json({ signed_url: signedUrl(req.body?.file_uri, req.body?.expires_in) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

filesRouter.get('/public/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM files WHERE id = ? AND is_public = 1').get(req.params.id);
  if (!row) return res.status(404).end();
  sendStored(res, row);
});

filesRouter.get('/private/:id', (req, res) => {
  const { id } = req.params;
  const exp = Number(req.query.exp);
  const sig = String(req.query.sig || '');
  const expected = sign(id, exp);
  const valid =
    exp > Date.now() / 1000 && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  const row = valid && db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  if (!row) return res.status(403).end();
  sendStored(res, row);
});
