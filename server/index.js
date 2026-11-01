import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { authRouter, userFromHeader } from './auth.js';
import { IS_PROD, PORT, ROOT } from './config.js';
import { emailConfigured } from './email.js';
import { entityService } from './entities.js';
import { filesRouter } from './files.js';
import { runFunction } from './functions.js';
import { usageBySession, usageContext } from './usage.js';
import { lawnRouter } from './lawnApi.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// Resolve the signed-in user (if any) for every API request.
app.use('/api', async (req, _res, next) => {
  req.user = await userFromHeader(req.headers.authorization);
  next();
});

// Paid API calls made while handling this request are charged to its session.
app.use('/api', usageContext);

app.use('/api/auth', authRouter);

// What each session cost in paid API calls (admins only).
app.get('/api/admin/usage', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  res.json({ sessions: usageBySession({ limit: Math.min(500, Number(req.query.limit) || 50) }) });
});
app.use('/api/files', filesRouter);

app.get('/api/app/public-settings', (_req, res) => {
  res.json({ id: 'ecoestate', public_settings: { name: 'EcoEstate', google_login: !!process.env.GOOGLE_CLIENT_ID } });
});

// ---- Entities ----
const entities = express.Router();
entities.use(express.json({ limit: '5mb' }));
const handle = (fn) => (req, res) => {
  try {
    res.json(fn(entityService(req.params.entity, req.user), req.body || {}, req));
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
app.all('/api/functions/:name', express.raw({ type: () => true, limit: '25mb' }), (req, res) => runFunction(req.params.name, req, res));

// ---- Lawn-to-native API (lawn-api/), forwarded so its key stays on the server ----
app.use('/api/lawn', lawnRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Built frontend (production) ----
const dist = path.join(ROOT, 'dist');
if (IS_PROD && fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`EcoEstate API listening on http://localhost:${PORT}`);
  if (!process.env.GOOGLE_MAPS_API_KEY) console.warn('  ! GOOGLE_MAPS_API_KEY is not set — features that need it will return an error.');
  if (!emailConfigured()) {
    console.warn('  ! RESEND_API_KEY is not set — verification codes and password resets will be printed here, not emailed.');
  }
});
