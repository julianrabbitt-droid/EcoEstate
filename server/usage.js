// What each session costs: every call to a paid service is recorded with the
// browser session (X-Session-Id header, one per tab) and signed-in user, at
// list price. Free tiers are noted but not subtracted, so totals are an upper
// bound until a service's free allowance runs out.
import { AsyncLocalStorage } from 'node:async_hooks';
import { now, sql } from './db.js';

// List prices in USD. Check these against each provider's pricing page.
export const PRICES = {
  geocodio: { per: 'lookup', usd: 0.0005, free: '2,500 lookups/day free' },
  resend: { per: 'email', usd: 0.0004, free: '3,000 emails/month free; $20/month for 50,000' },
  anthropic_input: { per: 'token', usd: 4 / 1e6, free: 'none (claude-opus-5-5 input)' },
  anthropic_output: { per: 'token', usd: 20 / 1e6, free: 'none (claude-opus-5-5 output)' },
  google_static_map: { per: 'request', usd: 0.002, free: 'monthly free allowance per Google Maps Platform SKU' },
  google_street_view: { per: 'request', usd: 0.007, free: 'monthly free allowance per Google Maps Platform SKU' },
  google_3d_tiles: { per: 'session', usd: 0.006, free: 'monthly free allowance of root tile requests (Map Tiles API)' },
  rapidapi_zillow: { per: 'request', usd: Number(process.env.RAPIDAPI_COST_PER_CALL || 0), free: 'depends on your RapidAPI plan' },
};



const context = new AsyncLocalStorage();

/** Express middleware: remember the session and user for everything this request does. */
export function usageContext(req, _res, next) {
  const sessionId = String(req.get('x-session-id') || '').replace(/[^\w-]/g, '').slice(0, 64) || null;
  context.run({ sessionId, userId: req.user?.id ?? null }, next);
}

/** Record `units` of a paid service against the current request's session. */
export function recordUsage(service, units = 1, detail = null) {
  const price = PRICES[service];
  if (!price || !(units > 0)) return;
  const { sessionId = null, userId = null } = context.getStore() ?? {};
  sql`INSERT INTO usage (ts, session_id, user_id, service, units, cost_usd, detail)
       VALUES (${now()}, ${sessionId}, ${userId}, ${service}, ${units}, ${units * price.usd}, ${detail})`.catch((e) =>
    console.warn('usage record failed:', e.message)
  );
}

/** Cost per session, newest first: [{ sessionId, user, started, ended, totalUsd, services: { name: { units, usd } } }]. */
export async function usageBySession({ limit = 50 } = {}) {
  const rows = await sql`
    SELECT u.session_id, u.service, SUM(u.units)::float8 units, SUM(u.cost_usd)::float8 usd, MIN(u.ts) started, MAX(u.ts) ended,
           MAX(users.email) email
      FROM usage u LEFT JOIN users ON users.id = u.user_id
     GROUP BY u.session_id, u.service`;
  const sessions = new Map();
  for (const r of rows) {
    const key = r.session_id ?? '(no session id)';
    const s = sessions.get(key) ?? { sessionId: key, user: r.email ?? null, started: r.started, ended: r.ended, totalUsd: 0, services: {} };
    s.user ??= r.email;
    s.started = r.started < s.started ? r.started : s.started;
    s.ended = r.ended > s.ended ? r.ended : s.ended;
    s.services[r.service] = { units: r.units, usd: Number(r.usd.toFixed(6)) };
    s.totalUsd += r.usd;
    sessions.set(key, s);
  }
  return [...sessions.values()]
    .map((s) => ({ ...s, totalUsd: Number(s.totalUsd.toFixed(6)) }))
    .sort((a, b) => (a.ended < b.ended ? 1 : -1))
    .slice(0, limit);
}
