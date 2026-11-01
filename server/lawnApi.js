// Forwards /api/lawn/* to the lawn-to-native API in lawn-api/. The browser never
// talks to it directly, so its x-api-key (APP_API_KEY in lawn-api/.env) stays
// on the server.
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { ROOT } from './config.js';
import { recordUsage } from './usage.js';

const ENV_FILE = path.join(ROOT, 'lawn-api', '.env');

// Read per request so editing lawn-api/.env takes effect without a restart.
function lawnEnv() {
  try {
    return dotenv.parse(fs.readFileSync(ENV_FILE));
  } catch {
    return {};
  }
}

function baseUrl(env) {
  return (process.env.LAWN_API_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, '');
}

const ROUTES = { 'GET /lawn': '/v1/lawn', 'POST /lawn': '/v1/lawn', 'POST /area': '/v1/area', 'GET /health': '/health' };

export const lawnRouter = express.Router();
lawnRouter.use(express.json({ limit: '1mb' }));

// Scans are free but heavy, so each visitor (account, or IP for guests) gets
// a limited number per 10 minutes.
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 30;
const recent = new Map();
function overLimit(req) {
  const who = req.user?.id || req.ip || 'unknown';
  const cutoff = Date.now() - WINDOW_MS;
  const times = (recent.get(who) || []).filter((t) => t > cutoff);
  times.push(Date.now());
  recent.set(who, times);
  if (recent.size > 10_000) for (const [k, v] of recent) if (!v.some((t) => t > cutoff)) recent.delete(k);
  return times.length > MAX_PER_WINDOW;
}

lawnRouter.use(async (req, res) => {
  const target = ROUTES[`${req.method} ${req.path}`];
  if (!target) return res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });

  if (req.path !== '/health' && overLimit(req)) {
    return res.status(429).json({ error: { code: 'rate_limited', message: 'Too many scans in a short time. Please wait a few minutes and try again.' } });
  }

  const env = lawnEnv();
  const query = new URLSearchParams(req.query).toString();
  const headers = { Accept: 'application/json' };
  const key = env.APP_API_KEY || process.env.APP_API_KEY; // file locally, env var on the host
  if (key) headers['x-api-key'] = key;
  if (req.method === 'POST') headers['Content-Type'] = 'application/json';

  let upstream;
  let body;
  try {
    upstream = await fetch(`${baseUrl(env)}${target}${query ? `?${query}` : ''}`, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(120_000),
    });
    body = Buffer.from(await upstream.arrayBuffer());
  } catch {
    console.warn(`[lawn] lawn API unreachable at ${baseUrl(env)} — is it running? (npm run dev starts it)`);
    return res.status(503).json({
      error: { code: 'lawn_api_unreachable', message: 'Our lawn measurement service is temporarily unavailable. Please try again in a few minutes.' },
    });
  }
  // The lawn API reports its paid calls (e.g. "geocodio=1") for this session.
  for (const part of (upstream.headers.get('x-usage') || '').split(',')) {
    const [service, units] = part.split('=');
    if (service && Number(units) > 0) recordUsage(service.trim(), Number(units), 'lawn-api');
  }
  res.status(upstream.status);
  res.type(upstream.headers.get('content-type') || 'application/json');
  res.send(body);
});
