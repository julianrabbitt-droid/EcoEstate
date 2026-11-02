import jpeg from 'jpeg-js';
import { createClientFromRequest } from '../../sdk.js';
import { recordUsage } from '../../usage.js';

// The wall colour of a house, from one Google Street View photo taken from the
// street and pointed at the building: { wallColor, hex, panoDate } (wallColor
// is null when there's no usable photo). Body: { building: [lat, lng] }.
//
// Cost control: the metadata check (free) runs first, so a paid photo is only
// fetched where one exists; results are cached per house in HouseColor, so an
// address is paid for once; and each visitor gets a limited number a day.
// Off unless GOOGLE_MAPS_API_KEY is set.
const STREETVIEW = 'https://maps.googleapis.com/maps/api/streetview';
const DAILY_LIMIT = 30;
const seen = new Map(); // visitor -> { day, n }

// Same names and colours as the 3D view's wall palette (houseModel.js WALL_COLORS).
const PALETTE = {
  white: [0xf2, 0xef, 0xe9], cream: [0xef, 0xe6, 0xd4], beige: [0xe8, 0xdc, 0xc6], tan: [0xcf, 0xa9, 0x78],
  yellow: [0xd8, 0xc4, 0x7a], gray: [0x9a, 0x9a, 0x96], blue: [0x6b, 0x7d, 0x8f], green: [0x6f, 0x81, 0x75],
  brown: [0x6e, 0x56, 0x42], brick: [0x9a, 0x5a, 0x45], red: [0x9c, 0x4b, 0x3a],
};

function bearing([lat1, lng1], [lat2, lng2]) {
  const r = (d) => (d * Math.PI) / 180;
  const y = Math.sin(r(lng2 - lng1)) * Math.cos(r(lat2));
  const x = Math.cos(r(lat1)) * Math.sin(r(lat2)) - Math.sin(r(lat1)) * Math.cos(r(lat2)) * Math.cos(r(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Wall pixels: the middle of the frame, minus sky, plants, deep shadow and
// glare. Median of each channel, matched to the nearest palette colour.
function wallColorFrom(buffer) {
  const { width, height, data } = jpeg.decode(buffer, { useTArray: true });
  const rs = [], gs = [], bs = [];
  let total = 0;
  for (let y = Math.floor(height * 0.3); y < height * 0.72; y += 2) {
    for (let x = Math.floor(width * 0.28); x < width * 0.72; x += 2) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      total++;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 45 || lum > 248) continue; // shadow, windows, glare
      if (b > r + 18 && b > g + 6 && lum > 120) continue; // sky
      if (g > r + 10 && g > b + 6) continue; // lawn, trees, hedges
      rs.push(r); gs.push(g); bs.push(b);
    }
  }
  if (rs.length < total * 0.15) return null; // mostly hidden by trees or cars
  const median = (a) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
  const rgb = [median(rs), median(gs), median(bs)];
  let best = null;
  for (const [name, c] of Object.entries(PALETTE)) {
    const d = (c[0] - rgb[0]) ** 2 * 0.3 + (c[1] - rgb[1]) ** 2 * 0.59 + (c[2] - rgb[2]) ** 2 * 0.11;
    if (!best || d < best.d) best = { name, d };
  }
  return { wallColor: best.name, hex: `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}` };
}

export default async function (req) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return Response.json({ available: false, wallColor: null });
  try {
    const { building } = await req.json().catch(() => ({}));
    const [lat, lng] = Array.isArray(building) ? building.map(Number) : [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return Response.json({ error: 'A building location is required.' }, { status: 400 });
    }
    const base44 = createClientFromRequest(req);
    const cache = base44.asServiceRole.entities.HouseColor;
    const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const hit = (await cache.filter({ key: cacheKey }, { limit: 1 })).items?.[0];
    if (hit) return Response.json({ available: true, wallColor: hit.wallColor || null, hex: hit.hex || null, panoDate: hit.panoDate || null, cached: true });

    // Per-visitor daily cap (signed-in account, else IP as seen by our host).
    const user = await base44.auth.me().catch(() => null);
    const who = user?.id || req.headers.get('cf-connecting-ip') || String(req.headers.get('x-forwarded-for') || '').split(',').pop()?.trim() || 'anon';
    const day = new Date().toISOString().slice(0, 10);
    const count = seen.get(who)?.day === day ? seen.get(who).n : 0;
    if (count >= DAILY_LIMIT) return Response.json({ available: true, wallColor: null, reason: 'daily limit' });
    seen.set(who, { day, n: count + 1 });
    if (seen.size > 20000) seen.clear();

    const meta = await (await fetch(`${STREETVIEW}/metadata?${new URLSearchParams({ location: `${lat},${lng}`, radius: '60', source: 'outdoor', key })}`, { signal: AbortSignal.timeout(10000) })).json();
    if (meta.status !== 'OK' || !meta.location) {
      await cache.create({ key: cacheKey, wallColor: '', reason: meta.status || 'no photo' });
      return Response.json({ available: true, wallColor: null, reason: 'no street photo' });
    }
    const pano = [meta.location.lat, meta.location.lng];
    const params = new URLSearchParams({ size: '480x320', pano: meta.pano_id, heading: String(Math.round(bearing(pano, [lat, lng]))), pitch: '4', fov: '55', key });
    const res = await fetch(`${STREETVIEW}?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Street View returned ${res.status}`);
    recordUsage('google_street_view', 1, 'house wall colour');
    const found = wallColorFrom(Buffer.from(await res.arrayBuffer()));
    await cache.create({ key: cacheKey, wallColor: found?.wallColor || '', hex: found?.hex || '', panoDate: meta.date || '', reason: found ? '' : 'wall hidden' });
    return Response.json({ available: true, wallColor: found?.wallColor || null, hex: found?.hex || null, panoDate: meta.date || null });
  } catch (error) {
    console.error('houseColor: error', error?.message);
    return Response.json({ available: true, wallColor: null, reason: 'lookup failed' });
  }
}
