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
  naip: 'https://planetarycomputer.microsoft.com/dataset/naip',
  usgs: 'https://apps.nationalmap.gov/epqs/',
  lidar: 'https://registry.opendata.aws/usgs-lidar/',
  overture: 'https://docs.overturemaps.org/',
  terrain: 'https://registry.opendata.aws/terrain-tiles/',
};
const stripeUrl = (path) => `https://dashboard.stripe.com/${stripeLive() ? '' : 'test/'}${path}`;

// Monthly plan costs, from each provider's current plan (since: first month
// charged, for the history). Most of these providers have no billing API, so
// their plan price is shown; Stripe and Cloudflare report real money below.
// Metered usage is added separately.
export const FIXED_COSTS = [
  { name: 'Anthropic (Claude subscription)', usd: 100, url: 'https://claude.ai/settings/billing', since: '2026-10' },
  { name: 'Render (Starter web service)', usd: 7, url: CONSOLES.render, since: '2026-11' },
  { name: 'Cloudflare (ecoestate.org domain, yearly / 12)', usd: 10.44 / 12, url: CONSOLES.cloudflare, since: '2026-10', billingApi: 'cloudflare' },
  { name: 'Supabase (Free plan)', usd: 0, url: `${CONSOLES.supabase}/settings/billing`, since: '2026-10' },
  { name: 'Clerk (Free plan)', usd: 0, url: CONSOLES.clerk, since: '2026-10' },
  { name: 'Resend (Free plan)', usd: 0, url: CONSOLES.resend, since: '2026-10' },
  { name: 'Google Maps Platform (free trial to Jan 30, 2027; $5 budget alert)', usd: 0, url: CONSOLES.googleBilling, since: '2026-11' },
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
    // Free public data every scan uses. Aerial imagery has no stand-in, so it
    // alerts; the others have fallbacks, so they're shown here without emails.
    { id: 'naip', name: 'Aerial imagery (USDA NAIP, Planetary Computer)', url: CONSOLES.naip, run: () => ping('https://planetarycomputer.microsoft.com/api/sas/v1/token/naip') },
    { id: 'usgs-elevation', name: 'Ground elevation (USGS; falls back to AWS terrain)', url: CONSOLES.usgs, quiet: true, run: () => ping('https://epqs.nationalmap.gov/v1/json?x=-122.143&y=37.4419&units=Meters&wkid=4326') },
    { id: 'usgs-lidar', name: 'Lidar (USGS 3DEP; falls back to the canopy map)', url: CONSOLES.lidar, quiet: true, run: () => ping('https://s3-us-west-2.amazonaws.com/usgs-lidar-public/CA_SantaClaraCounty_2020/ept.json') },
    { id: 'overture', name: 'Buildings, roads and addresses (Overture Maps)', url: CONSOLES.overture, quiet: true, run: () => ping('https://stac.overturemaps.org/catalog.json') },
    { id: 'terrain', name: 'Terrain tiles (AWS Open Data)', url: CONSOLES.terrain, quiet: true, run: () => ping('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/5661/13077.png') },
  ];
  return Promise.all(checks.map(async (c) => ({ id: c.id, name: c.name, url: c.url, quiet: Boolean(c.quiet), ...(await timed(c.run)) })));
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

const monthKey = (d) => new Date(d).toISOString().slice(0, 7);
function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 60) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

// Real money in from Stripe's balance history: what customers paid, refunds,
// Stripe's fees and the net that reaches the bank, per month.
async function stripeMonths() {
  const s = stripeClient();
  if (!s) return { error: 'No Stripe key set', months: {} };
  const months = {};
  try {
    const since = Math.floor((Date.now() - 36 * 30 * DAY) / 1000);
    for await (const t of s.balanceTransactions.list({ created: { gte: since }, limit: 100 })) {
      if (t.type === 'payout' || t.type === 'transfer' || t.type === 'payout_cancel') continue; // moving money, not earning it
      const k = monthKey(t.created * 1000);
      const m = (months[k] ||= { paid: 0, refunded: 0, fees: 0, net: 0 });
      if (t.type === 'charge' || t.type === 'payment') m.paid += t.amount / 100;
      if (t.type === 'refund' || t.type === 'payment_refund') m.refunded += -t.amount / 100;
      m.fees += t.fee / 100;
      m.net += t.net / 100;
    }
    return { months };
  } catch (e) {
    return { error: `Stripe balance history: ${e.message}`, months };
  }
}

// Cloudflare's own billing history (domain renewals), when an API token with
// billing read access is set; otherwise the plan line's price stands in.
async function cloudflareMonths() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/user/billing/history?per_page=50', {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.errors?.[0]?.message || `HTTP ${r.status}`);
    const months = {};
    for (const item of d.result || []) {
      if (item.currency && item.currency !== 'USD') continue;
      const k = monthKey(item.occurred_at);
      months[k] = (months[k] || 0) + Number(item.amount || 0);
    }
    return { months };
  } catch (e) {
    return { error: `Cloudflare billing: ${e.message}`, months: {} };
  }
}

/** Month-by-month money: revenue (Stripe, real), costs (plans, metered use, Cloudflare when connected), net. */
export async function moneyHistory() {
  const [stripe, cloudflare, usage] = await Promise.all([
    stripeMonths(),
    cloudflareMonths(),
    sql`select to_char(date_trunc('month', ts::timestamptz), 'YYYY-MM') month, sum(cost_usd)::float8 usd from usage group by 1`.catch(() => []),
  ]);
  const metered = Object.fromEntries(usage.map((r) => [r.month, r.usd]));
  const now = monthKey(Date.now());
  const starts = [...FIXED_COSTS.map((c) => c.since), ...Object.keys(stripe.months), ...Object.keys(metered)].filter(Boolean).sort();
  const months = monthsBetween(starts[0] || now, now).map((month) => {
    const st = stripe.months[month] || { paid: 0, refunded: 0, fees: 0, net: 0 };
    let plans = 0;
    for (const c of FIXED_COSTS) {
      if (c.since && c.since > month) continue;
      if (c.billingApi === 'cloudflare' && cloudflare && !cloudflare.error) continue; // real charges below instead
      plans += c.usd;
    }
    const cf = cloudflare && !cloudflare.error ? cloudflare.months[month] || 0 : 0;
    const costs = plans + cf + (metered[month] || 0);
    // Revenue after Stripe's fees and refunds (Stripe's net), minus running costs.
    return { month, revenue: round(st.net), paid: round(st.paid), fees: round(st.fees), refunded: round(st.refunded), costs: round(costs), net: round(st.net - costs) };
  });
  let total = 0;
  for (const m of months) m.cumulative = round((total += m.net));
  return {
    months,
    sources: {
      stripe: stripe.error ? { ok: false, detail: stripe.error } : { ok: true, detail: 'Real: balance history (payments, refunds, fees)' },
      cloudflare: !cloudflare ? { ok: false, detail: 'Plan price; add CLOUDFLARE_API_TOKEN (Billing: Read) for real charges' } : cloudflare.error ? { ok: false, detail: cloudflare.error } : { ok: true, detail: 'Real: billing history' },
      plans: { ok: true, detail: 'Anthropic, Render, Supabase, Clerk, Resend and Google have no billing API: plan prices' },
      metered: { ok: true, detail: 'Google, Resend and Anthropic API calls recorded by the app at list price' },
    },
  };
}

// ---- Server metrics ----
// The live server samples its own CPU and memory every 5 minutes (last 24 h);
// Render's metrics are added when RENDER_API_KEY and RENDER_SERVICE_ID are set.
const samples = [];
let lastCpu = process.cpuUsage();
let lastAt = Date.now();
function sample() {
  const cpu = process.cpuUsage(lastCpu);
  const now = Date.now();
  const elapsedUs = (now - lastAt) * 1000;
  lastCpu = process.cpuUsage();
  lastAt = now;
  samples.push({
    t: new Date(now).toISOString(),
    cpuPct: Math.round(((cpu.user + cpu.system) / elapsedUs) * 1000) / 10,
    memoryMb: Math.round(process.memoryUsage().rss / 1e6),
  });
  samples.splice(0, Math.max(0, samples.length - 288));
}
setInterval(sample, 5 * 60_000).unref();
setTimeout(sample, 10_000).unref();

async function renderMetrics() {
  const key = process.env.RENDER_API_KEY;
  const service = process.env.RENDER_SERVICE_ID;
  if (!key || !service) return null;
  const end = new Date();
  const start = new Date(end - DAY);
  const get = async (kind) => {
    const q = new URLSearchParams({ resource: service, startTime: start.toISOString(), endTime: end.toISOString(), resolutionSeconds: '900' });
    const r = await fetch(`https://api.render.com/v1/metrics/${kind}?${q}`, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Render ${kind}: HTTP ${r.status}`);
    const series = await r.json();
    return (series?.[0]?.values || []).map((v) => ({ t: v.timestamp, value: v.value }));
  };
  try {
    const [cpu, memory] = await Promise.all([get('cpu'), get('memory')]);
    return { cpu, memory };
  } catch (e) {
    return { error: e.message };
  }
}

/** Everything the dashboard shows. */
export async function overview() {
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const since7 = new Date(Date.now() - 7 * DAY).toISOString();
  const [money, usage, users, members, health, history, render] = await Promise.all([
    stripeMoney(),
    sql`select service, sum(units)::float8 units, sum(cost_usd)::float8 usd from usage where ts >= ${since30} group by service order by usd desc`,
    sql`select count(*)::int total,
               count(*) filter (where created_date >= ${since7})::int new7d,
               count(*) filter (where created_date >= ${since30})::int new30d
          from users`,
    sql`select data->>'productId' product, count(*)::int n from records
         where entity = 'Base44Purchase' and data->>'status' = 'paid' group by 1`,
    healthChecks(),
    moneyHistory(),
    renderMetrics(),
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
    history,
    metrics: { process: [...samples], render },
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
    if (r.quiet) continue; // shown on the dashboard, never emailed
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
