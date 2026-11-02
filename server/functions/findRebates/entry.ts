import { rebatesFor } from '../../shared/rebates.ts';

// Rebates and incentives for a property: its water utility, ZIP, city, county
// and state, the programs that serve it, and estimates for the lawn area.
// Body: { lat, lon, turfSqft }. Public, like scanning.
export default async function (req) {
  const body = await req.json().catch(() => ({}));
  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  const turfSqft = Math.max(0, Math.min(1_000_000, Math.round(Number(body?.turfSqft) || 0)));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: 'A valid location is required.' }, { status: 400 });
  }
  try {
    return Response.json(await rebatesFor(lat, lon, turfSqft));
  } catch (error) {
    console.error('findRebates: error', error);
    return Response.json({ error: 'Could not look up rebates right now.' }, { status: 502 });
  }
}
