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

async function call(path, init) {
  let res;
  try {
    const sid = sessionId();
    res = await fetch(`/api/lawn${path}`, { ...init, headers: { ...(init?.headers || {}), ...(sid ? { 'X-Session-Id': sid } : {}) } });
  } catch {
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
