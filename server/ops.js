// Owner dashboard and alerts: money in (Stripe), money out (fixed plans plus
// metered API usage), users, and the health of every service the projects
// depend on. Admins only (/api/admin/overview). A background check emails
// support@ when something breaks and again when it recovers.
//
// To add another project later, add an entry to PROJECTS with the URL to ping.
// To change a plan price, edit FIXED_COSTS (USD per month).
import { sql } from './db.js';
import { emailConfigured, sendEmail } from './email.js';
import { stripeClient, stripeLive } from './shared/billing.ts';

export const PROJECTS = [
  { id: 'ecoestate', name: 'EcoEstate', url: 'https://ecoestate.org', health: 'https://ecoestate.org/api/app/public-settings', console: 'https://dashboard.render.com' },
];

// Where to go to deal with each service: its own dashboard.
export const CONSOLES = {
  render: 'https://dashboard.render.com',
  cloudflare: 'https://dash.cloudflare.com',
  supabase: 'https://supabase.com/dashboard/project/lzstqfqslvaxyaxqelkv',
  clerk: 'https://dashboard.clerk.com',
  clerkUsers: 'https://dashboard.clerk.com/last-active?path=users',
  resend: 'https://resend.com/emails',
  google: 'https://console.cloud.google.com/google/maps-apis/metrics?project=project-b642fd21-6469-403c-892',
  googleBilling: 'https://console.cloud.google.com/billing/011A45-06D76A-8A4A16/budgets?project=project-b642fd21-6469-403c-892',
  epa: 'https://www.epa.gov/ground-water-and-drinking-water',
  census: 'https://geocoding.geo.census.gov/geocoder/',
};
const stripeUrl = (path) => `https://dashboard.stripe.com/${stripeLive() ? '' : 'test/'}${path}`;

// Monthly plan costs, from each provider's current plan. Metered usage is added separately.
export const FIXED_COSTS = [
  { name: 'Render (Free web service)', usd: 0, url: CONSOLES.render },
  { name: 'Cloudflare (ecoestate.org domain, yearly / 12)', usd: 10.44 / 12, url: CONSOLES.cloudflare },
  { name: 'Supabase (Free plan)', usd: 0, url: `${CONSOLES.supabase}/settings/billing` },
  { name: 'Clerk (Free plan)', usd: 0, url: CONSOLES.clerk },
  { name: 'Resend (Free plan)', usd: 0, url: CONSOLES.resend },
  { name: 'Google Maps Platform (free trial to Jan 30, 2027; $5 budget alert)', usd: 0, url: CONSOLES.googleBilling },
];
const METERED_CONSOLES = { google_static_map: CONSOLES.google, google_street_view: CONSOLES.google, google_3d_tiles: CONSOLES.google, resend: CONSOLES.resend };

const DAY = 864e5;
const ALERT_EMAIL = process.env.OPS_ALERT_EMAIL || 'support@ecoestate.org';

async function timed(fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - t0, detail: detail ?? null };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, detail: String(e?.message || e).slice(0, 200) };
  }
}

async function ping(url, init = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return `HTTP ${r.status}`;
}

/** Each dependency's health: [{ id, name, ok, ms, detail }]. */
export async function healthChecks() {
  const lawnBase = (process.env.LAWN_API_URL || `http://localhost:${process.env.LAWN_PORT || 3000}`).replace(/\/$/, '');
  const checks = [
    ...PROJECTS.map((p) => ({ id: `site:${p.id}`, name: `${p.name} website`, url: p.console, run: () => ping(p.health) })),
    { id: 'lawn-api', name: 'Lawn measurement service', url: CONSOLES.render, run: () => ping(`${lawnBase}/health`) },
    { id: 'database', name: 'Database (Supabase)', url: CONSOLES.supabase, run: async () => `${(await sql`select count(*)::int n from users`)[0].n} users` },
    {
      id: 'stripe',
      name: 'Payments (Stripe)',
      url: stripeUrl('dashboard'),
      run: async () => {
        const s = stripeClient();
        if (!s) throw new Error('No Stripe key');
        await s.prices.list({ limit: 1 });
        return stripeLive() ? 'live key' : 'test key';
      },
    },
    { id: 'clerk', name: 'Sign-in (Clerk)', url: CONSOLES.clerk, run: () => ping('https://clerk.ecoestate.org/v1/environment') },
    { id: 'epa', name: 'Water utility lookup (EPA)', url: CONSOLES.epa, run: () => ping('https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Water_System_Boundaries/FeatureServer/0?f=json') },
    { id: 'census', name: 'ZIP and county lookup (US Census)', url: CONSOLES.census, run: () => ping('https://geocoding.geo.census.gov/geocoder/benchmarks?format=json') },
    {
      id: 'google',
      name: 'Street View and 3D maps (Google)',
      url: CONSOLES.google,
      // The metadata lookup is free; it proves the server key works.
      run: async () => {
        const key = process.env.GOOGLE_MAPS_API_KEY;
        if (!key) throw new Error('GOOGLE_MAPS_API_KEY not set');
        const r = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=37.4419,-122.143&key=${key}`, { signal: AbortSignal.timeout(10000) });
        const d = await r.json();
        if (d.status !== 'OK' && d.status !== 'ZERO_RESULTS') throw new Error(`Street View: ${d.status}`);
        return 'key working';
      },
    },
    { id: 'email', name: 'Email (Resend)', url: CONSOLES.resend, run: async () => (emailConfigured() ? 'key set' : Promise.reject(new Error('RESEND_API_KEY not set'))) },
  ];
  return Promise.all(checks.map(async (c) => ({ id: c.id, name: c.name, url: c.url, ...(await timed(c.run)) })));
}

async function stripeMoney() {
  const s = stripeClient();
  if (!s) return { error: 'No Stripe key set' };
  const since = Math.floor((Date.now() - 30 * DAY) / 1000);
  const out = { mode: stripeLive() ? 'live' : 'test' };
  try {
    let mrr = 0;
    let active = 0;
    for await (const sub of s.subscriptions.list({ status: 'active', limit: 100 })) {
      active++;
      for (const item of sub.items.data) {
        const p = item.price;
        if (p?.recurring?.interval === 'month') mrr += ((p.unit_amount || 0) * (item.quantity || 1)) / 100;
        if (p?.recurring?.interval === 'year') mrr += ((p.unit_amount || 0) * (item.quantity || 1)) / 1200;
      }
    }
    Object.assign(out, { activeSubscriptions: active, mrrUsd: Math.round(mrr * 100) / 100 });
  } catch (e) {
    out.subscriptionsError = e.message;
  }
  try {
    let gross = 0;
    let refunded = 0;
    let count = 0;
    for await (const ch of s.charges.list({ created: { gte: since }, limit: 100 })) {
      if (ch.status !== 'succeeded') continue;
      count++;
      gross += ch.amount / 100;
      refunded += (ch.amount_refunded || 0) / 100;
    }
    Object.assign(out, { charges30d: count, gross30dUsd: Math.round(gross * 100) / 100, refunded30dUsd: Math.round(refunded * 100) / 100 });
  } catch (e) {
    out.chargesError = e.message;
  }
  return out;
}

/** Everything the dashboard shows. */
export async function overview() {
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const since7 = new Date(Date.now() - 7 * DAY).toISOString();
  const [money, usage, users, members, health] = await Promise.all([
    stripeMoney(),
    sql`select service, sum(units)::float8 units, sum(cost_usd)::float8 usd from usage where ts >= ${since30} group by service order by usd desc`,
    sql`select count(*)::int total,
               count(*) filter (where created_date >= ${since7})::int new7d,
               count(*) filter (where created_date >= ${since30})::int new30d
          from users`,
    sql`select data->>'productId' product, count(*)::int n from records
         where entity = 'Base44Purchase' and data->>'status' = 'paid' group by 1`,
    healthChecks(),
  ]);
  const meteredUsd = usage.reduce((s, r) => s + r.usd, 0);
  const fixedUsd = FIXED_COSTS.reduce((s, c) => s + c.usd, 0);
  const revenue = money.mrrUsd ?? 0;
  return {
    generatedAt: new Date().toISOString(),
    projects: PROJECTS,
    money: {
      ...money,
      links: { subscriptions: stripeUrl('subscriptions'), payments: stripeUrl('payments'), customers: stripeUrl('customers') },
      costs: {
        fixed: FIXED_COSTS,
        fixedMonthlyUsd: round(fixedUsd),
        metered30d: usage.map((r) => ({ ...r, usd: round(r.usd), url: METERED_CONSOLES[r.service] || null })),
        metered30dUsd: round(meteredUsd),
      },
      netMonthlyUsd: round(revenue - fixedUsd - meteredUsd),
    },
    users: {
      ...users[0],
      url: CONSOLES.clerkUsers,
      proUrl: stripeUrl('subscriptions'),
      pro: members.find((m) => m.product === 'premium')?.n ?? 0,
      studentUnlocks: members.find((m) => m.product === '3d_view')?.n ?? 0,
    },
    health,
    alerts: [...recentAlerts],
  };
}

const round = (n) => Math.round(n * 100) / 100;

// ---- Alerts ----
// A check that fails twice in a row is an incident: email once, then again
// only when it recovers. The last 20 alerts are shown on the dashboard.
const failures = new Map(); // check id -> consecutive failures
const open = new Set(); // check ids with an open incident
const recentAlerts = [];

async function notify(subject, lines) {
  recentAlerts.unshift({ at: new Date().toISOString(), subject });
  recentAlerts.splice(20);
  console.warn(`[ops] ${subject}`);
  if (!emailConfigured()) return;
  await sendEmail({ to: ALERT_EMAIL, subject: `[EcoEstate ops] ${subject}`, text: lines.join('\n'), html: `<pre>${lines.join('\n')}</pre>` }).catch((e) =>
    console.error('[ops] alert email failed', e.message)
  );
}

export async function runHealthAlerts() {
  const results = await healthChecks();
  for (const r of results) {
    const n = r.ok ? 0 : (failures.get(r.id) || 0) + 1;
    failures.set(r.id, n);
    if (n >= 2 && !open.has(r.id)) {
      open.add(r.id);
      await notify(`${r.name} is down`, [`${r.name} failed two checks in a row.`, `Detail: ${r.detail}`, ...(r.url ? [`Open it: ${r.url}`] : []), `Dashboard: https://ecoestate.org/admin`]);
    } else if (r.ok && open.has(r.id)) {
      open.delete(r.id);
      await notify(`${r.name} recovered`, [`${r.name} is responding again (${r.detail}).`]);
    }
  }
  return results;
}

export function startOpsMonitor() {
  // Only the live site watches itself; local development would send false alarms.
  if (process.env.NODE_ENV !== 'production') return;
  const run = () => runHealthAlerts().catch((e) => console.error('[ops] health check failed', e.message));
  setTimeout(run, 2 * 60_000);
  setInterval(run, 15 * 60_000).unref();
}
