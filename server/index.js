import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { authRouter, userFromHeader } from './auth.js';
import { IS_PROD, PORT, ROOT } from './config.js';
import { entityService } from './entities.js';
import { filesRouter } from './files.js';
import { runFunction } from './functions.js';
import { usageBySession, usageContext } from './usage.js';
import { lawnRouter } from './lawnApi.js';
import { startRenewalReminders } from './renewalReminders.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// Standard browser protections: HTTPS only, no framing by other sites,
// no MIME sniffing, and only the origin sent as referrer.
app.use((req, res, next) => {
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Resolve the signed-in user (if any) for every API request.
app.use('/api', async (req, _res, next) => {
  req.user = await userFromHeader(req.headers.authorization).catch(() => null);
  next();
});

// Paid API calls made while handling this request are charged to its session.
app.use('/api', usageContext);

app.use('/api/auth', authRouter);

// What each session cost in paid API calls (admins only).
app.get('/api/admin/usage', async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  res.json({ sessions: await usageBySession({ limit: Math.min(500, Number(req.query.limit) || 50) }) });
});
app.use('/api/files', filesRouter);

app.get('/api/app/public-settings', (_req, res) => {
  res.json({ id: 'ecoestate', public_settings: { name: 'EcoEstate' } });
});

// ---- Entities ----
const entities = express.Router();
entities.use(express.json({ limit: '5mb' }));
const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(entityService(req.params.entity, req.user), req.body || {}, req));
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal error' : err.message });
  }
};
entities.post('/:entity/query', handle((svc, b) => svc.filter(b.query, { sort: b.sort, limit: b.limit, skip: b.skip })));
entities.post('/:entity/bulk', handle((svc, b) => svc.bulkCreate(Array.isArray(b) ? b : [])));
entities.post('/:entity/update-many', handle((svc, b) => svc.updateMany(b.query, b.update)));
entities.post('/:entity/delete-many', handle((svc, b) => svc.deleteMany(b.query)));
entities.post('/:entity', handle((svc, b) => svc.create(b)));
entities.get('/:entity/:id', handle((svc, _b, req) => svc.get(req.params.id)));
entities.patch('/:entity/:id', handle((svc, b, req) => svc.update(req.params.id, b)));
entities.delete('/:entity/:id', handle((svc, _b, req) => svc.delete(req.params.id)));
app.use('/api/entities', entities);

// ---- Backend functions (server/functions/*) ----
app.all('/api/functions/:name', (req, res, next) =>
  ['GET', 'POST'].includes(req.method) ? next() : res.status(405).json({ error: 'Method not allowed' }));
app.all('/api/functions/:name', express.raw({ type: () => true, limit: '5mb' }), (req, res) => runFunction(req.params.name, req, res));

// ---- Lawn-to-native API (lawn-api/), forwarded so its key stays on the server ----
app.use('/api/lawn', lawnRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Bad request bodies (broken JSON, too large) get a short JSON error, not a
// stack trace.
app.use('/api', (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal error' : err.type === 'entity.too.large' ? 'Request too large' : 'Invalid request body' });
});

// ---- Built frontend (production) ----
const dist = path.join(ROOT, 'dist');
if (IS_PROD && fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// A stray rejected promise must not take the whole site down.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection', err));

app.listen(PORT, () => {
  console.log(`EcoEstate API listening on http://localhost:${PORT}`);
  if (!process.env.GOOGLE_MAPS_API_KEY) console.warn('  ! GOOGLE_MAPS_API_KEY is not set — features that need it will return an error.');
  if (!process.env.CLERK_SECRET_KEY) console.warn('  ! CLERK_SECRET_KEY is not set — nobody can sign in.');
  startRenewalReminders();
});
