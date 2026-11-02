import { recordUsage } from '../../usage.js';

// Logs one Google Photorealistic 3D Tiles session (a root tileset request made
// by the browser) so it shows on the owner dashboard. The browser loads the
// tiles itself with its own website-restricted key; this only counts them.
// Capped per visitor so a script can't inflate the numbers.
const DAILY_LIMIT = 50;
const seen = new Map(); // visitor -> { day, n }

export default async function (req) {
  const who = req.headers.get('cf-connecting-ip') || String(req.headers.get('x-forwarded-for') || '').split(',').pop()?.trim() || 'anon';
  const day = new Date().toISOString().slice(0, 10);
  const count = seen.get(who)?.day === day ? seen.get(who).n : 0;
  if (count >= DAILY_LIMIT) return Response.json({ ok: true, counted: false });
  seen.set(who, { day, n: count + 1 });
  if (seen.size > 20000) seen.clear();
  recordUsage('google_3d_tiles', 1, 'design 3D view');
  return Response.json({ ok: true, counted: true });
}
