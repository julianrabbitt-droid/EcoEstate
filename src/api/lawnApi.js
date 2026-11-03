// Client for the lawn-to-native API (lawn-api/), reached through this app's
// server at /api/lawn so no API key is ever sent from the browser.
import { sessionId } from '@/api/base44Client';
import { geoJsonOuterRings, outlinesToFeatureCollection } from '@/lib/geo';

export class LawnApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const JOB_POLL_MS = 3000;
const JOB_MAX_MS = 11 * 60_000;

async function call(path, init) {
  const sid = sessionId();
  const headers = { ...(init?.headers || {}), ...(sid ? { 'X-Session-Id': sid } : {}) };
  let res;
  try {
    res = await fetch(`/api/lawn${path}`, { ...init, headers });
    // Big properties are measured in the background: wait for the job.
    if (res.status === 202) {
      const { job } = await res.clone().json();
      const started = Date.now();
      while (res.status === 202 && job && Date.now() - started < JOB_MAX_MS) {
        await new Promise((done) => setTimeout(done, JOB_POLL_MS));
        res = await fetch(`/api/lawn/jobs/${encodeURIComponent(job)}`, { headers });
      }
      if (res.status === 202) throw new LawnApiError('This property is taking too long to measure. Try again, or outline the lawn by hand.', 504, 'scan_timeout');
    }
  } catch (err) {
    if (err instanceof LawnApiError) throw err;
    throw new LawnApiError('Couldn’t reach the lawn measurement service. Check your connection and try again.', 0, 'network_error');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new LawnApiError(data?.error?.message || 'The lawn measurement service returned an error.', res.status, data?.error?.code);
  }
  return data;
}

/**
 * GET /v1/lawn — lawn square footage, lawn polygons, parcel outline and impact.
 * Pass the picked suggestion's `lat`/`lng` and OpenStreetMap `osm` ID when there
 * is one, so named places (a campus, a park) are scanned in full.
 */
export function getLawn(address, picked = null) {
  const params = new URLSearchParams({ address });
  if (picked?.osm) params.set('osm', picked.osm);
  if (Number.isFinite(picked?.lat) && Number.isFinite(picked?.lng)) {
    params.set('lat', String(picked.lat));
    params.set('lon', String(picked.lng));
  }
  return call(`/lawn?${params}`);
}

/**
 * GET /v1/locate — where an address is, before scanning. With the app's own
 * lookup (`hit`) the lawn service only moves it onto the published address
 * point; without, it looks the address up itself. Returns { lat, lon, accuracy, … }.
 */
export function locateAddress(address, hit = null) {
  const params = new URLSearchParams({ address });
  if (Number.isFinite(hit?.lat) && Number.isFinite(hit?.lng)) {
    params.set('lat', String(hit.lat));
    params.set('lon', String(hit.lng));
  }
  return call(`/locate?${params}`);
}

/** GET /v1/terrain — bare-earth heights around a property ([west, south, east, north]), as a scan's `terrain`. */
export async function getTerrain([west, south, east, north]) {
  const params = new URLSearchParams({ west: String(west), south: String(south), east: String(east), north: String(north) });
  return (await call(`/terrain?${params}`)).terrain;
}

/** POST /v1/lawn — re-detect the lawn inside a property line the user adjusted. */
export function getLawnForParcel({ parcel, address, location }) {
  return call('/lawn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parcel, address, location }),
  });
}

/** POST /v1/area — square footage and impact for lawn outlines the user drew or edited. */
export function measureArea(geometry, assumptions) {
  return call('/area', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ geometry, ...(assumptions ? { assumptions } : {}) }),
  });
}

/**
 * Combine lawn outlines ([lat, lng] rings) that overlap or touch into lawn
 * groups, one shared mulch bed each. Returns { outlines, lawnSqft, impact },
 * or null when the lawn service can't be reached (callers keep the originals).
 */
export async function mergeLawnOutlines(outlines) {
  const valid = (outlines || []).filter((pts) => Array.isArray(pts) && pts.length >= 3);
  if (!valid.length) return null;
  try {
    const res = await measureArea(outlinesToFeatureCollection(valid));
    return { outlines: geoJsonOuterRings(res.lawn), lawnSqft: res.lawnSqft, impact: res.impact };
  } catch {
    return null;
  }
}
