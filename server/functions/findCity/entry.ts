import { createClientFromRequest } from '../../sdk.js';

// City search for community posts: { query } -> { cities: [{ label, point }] }.
// Uses OpenStreetMap's Nominatim, limited to towns and cities, one request at
// a time at most once a second (its usage policy), with results cached. Only
// the city's centre is returned, rounded to about 1 km, so a post on the map
// never points at anyone's home. Signed-in members only.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const cache = new Map<string, unknown[]>();
let queue: Promise<unknown> = Promise.resolve();
let last = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

const round = (v: number) => Math.round(v * 100) / 100;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Sign in to add a city.' }, { status: 401 });

    const { query } = await req.json().catch(() => ({}));
    const q = String(query || '').trim().slice(0, 80);
    if (q.length < 2) return Response.json({ cities: [] });
    const key = q.toLowerCase();
    if (cache.has(key)) return Response.json({ cities: cache.get(key) });

    const params = new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', limit: '6', featureType: 'settlement', 'accept-language': 'en' });
    const data = await throttled(async () => {
      const res = await fetch(`${NOMINATIM}?${params}`, {
        headers: { 'User-Agent': 'EcoEstate/1.0 (https://ecoestate.org; support@ecoestate.org)' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
      return res.json();
    });

    const seen = new Set<string>();
    const cities = (Array.isArray(data) ? data : [])
      .map((r) => {
        const a = r.address || {};
        const name = a.city || a.town || a.village || a.hamlet || a.municipality || r.name;
        const region = a.state || a.region || a.county;
        const country = (a.country_code || '').toUpperCase();
        const label = [name, region, country === 'US' ? null : a.country].filter(Boolean).join(', ');
        return name ? { label, point: [round(Number(r.lat)), round(Number(r.lon))] } : null;
      })
      .filter((c) => c && Number.isFinite(c.point[0]) && Number.isFinite(c.point[1]) && !seen.has(c.label) && seen.add(c.label));

    cache.set(key, cities);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return Response.json({ cities });
  } catch (error) {
    console.error('findCity: error', error);
    return Response.json({ error: 'City search is unavailable right now.' }, { status: 502 });
  }
}
