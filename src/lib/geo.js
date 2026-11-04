const SQFT_PER_SQM = 10.7639;

/** Area of a lat/lng polygon in square feet (spherical excess, good enough at parcel scale). */
export function polygonAreaSqFt(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  const R = 6378137;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const lat1 = (a[0] * Math.PI) / 180;
    const lat2 = (b[0] * Math.PI) / 180;
    const dLng = ((b[1] - a[1]) * Math.PI) / 180;
    sum += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((sum * R * R) / 2) * SQFT_PER_SQM;
}

export function centroid(points) {
  if (!points || !points.length) return null;
  const lat = points.reduce((s, p) => s + p[0], 0) / points.length;
  const lng = points.reduce((s, p) => s + p[1], 0) / points.length;
  return [lat, lng];
}

/** Pick a Leaflet zoom that fits the whole property: big lots zoom out, small lots zoom in. */
export function zoomForLotSize(sqft) {
  if (!sqft || sqft < 1) return 18;
  const side = Math.sqrt(sqft);
  if (side > 1200) return 15;
  if (side > 700) return 16;
  if (side > 350) return 17;
  if (side > 180) return 18;
  return 19;
}

// Reduce an outline to at most `max` points by uniform stride (keeps the shape, drops noise).
function simplifyOutline(ring, max = 120) {
  if (!Array.isArray(ring) || ring.length <= max) return ring || [];
  const out = [];
  const stride = (ring.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) out.push(ring[Math.round(i * stride)]);
  return out;
}

// Nominatim returns GeoJSON geometries as [lng, lat]; convert and pick the largest ring.
function outlineFromGeoJSON(geojson) {
  if (!geojson) return null;
  const rings = [];
  if (geojson.type === 'Polygon') rings.push(...geojson.coordinates);
  else if (geojson.type === 'MultiPolygon') {
    for (const poly of geojson.coordinates) rings.push(...poly);
  }
  if (!rings.length) return null;
  // Largest ring by bbox area = the main property outline (drops sliver fragments).
  let best = null;
  let bestArea = -1;
  for (const ring of rings) {
    const lats = ring.map((c) => c[1]);
    const lngs = ring.map((c) => c[0]);
    const area = (Math.max(...lats) - Math.min(...lats)) * (Math.max(...lngs) - Math.min(...lngs));
    if (area > bestArea) {
      bestArea = area;
      best = ring;
    }
  }
  if (!best || best.length < 3) return null;
  return simplifyOutline(best.map((c) => [c[1], c[0]]));
}

// ---- Address labels ----
// Nominatim labels read "920, Moreno Avenue, Community Center, Palo Alto, …":
// a comma after the house number and a neighbourhood before the city.

/** "920 Moreno Avenue, Palo Alto" from a Nominatim result's address parts, or '' without a street. */
function streetLabel(address = {}) {
  const street = [address.house_number, address.road || address.pedestrian || address.footway].filter(Boolean).join(' ');
  const city = address.city || address.town || address.village || address.hamlet || '';
  return street ? [street, city].filter(Boolean).join(', ') : '';
}

/**
 * A saved or looked-up address for display: "920, Moreno Avenue, Palo Alto"
 * becomes "920 Moreno Avenue, Palo Alto". Leaves other text alone.
 */
export function cleanAddress(text) {
  return String(text || '').replace(/^(\s*\d+[a-z]?(?:-\d+[a-z]?)?),\s+/i, '$1 ');
}

// California first: EcoEstate scans US properties, and its parcel maps,
// rebates and plant lists are Californian, so suggestions lean there.
const CA_CENTER = { lat: 36.8, lon: -119.4 };
const CA_VIEWBOX = '-124.48,42.01,-114.13,32.53'; // west,north,east,south (Nominatim)
const US_BBOX = '-125,24,-66,50'; // the contiguous US (Photon: west,south,east,north)

// A suggestion from Photon (OpenStreetMap search built for type-as-you-go).
function photonHit(f) {
  const p = f.properties || {};
  const [lng, lat] = f.geometry?.coordinates || [];
  const street = [p.housenumber, p.street || (p.housenumber ? '' : p.name)].filter(Boolean).join(' ');
  const place = p.city || p.town || p.village || p.district || p.county || '';
  const short = [street || p.name, place].filter(Boolean).join(', ');
  const label = [street || p.name, place, [p.state, p.postcode].filter(Boolean).join(' '), p.country].filter(Boolean).join(', ');
  return {
    label,
    short,
    lat,
    lng,
    osm: p.osm_type && p.osm_id ? `${String(p.osm_type)[0].toUpperCase()}${p.osm_id}` : null,
    zip: p.postcode || '',
    city: place,
    state: p.state || '',
    countryCode: String(p.countrycode || '').toUpperCase(),
    country: p.country || '',
    isAddress: Boolean(p.housenumber),
  };
}

function nominatimHit(hit) {
  const a = hit.address || {};
  const street = streetLabel(a);
  return {
    // An address reads like Photon's ("716 North Northcape Avenue, San Dimas,
    // California 91773, United States"); other places keep Nominatim's name.
    label: a.house_number && street ? [street, [a.state, a.postcode].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ') : hit.display_name,
    short: streetLabel(hit.address),
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    // OpenStreetMap ID (e.g. "R12409275"): lets the lawn API use a campus's or park's whole outline.
    osm: hit.osm_type && hit.osm_id ? `${hit.osm_type[0].toUpperCase()}${hit.osm_id}` : null,
    zip: hit.address?.postcode || '',
    city: hit.address?.city || hit.address?.town || hit.address?.village || '',
    state: hit.address?.state || '',
    countryCode: (hit.address?.country_code || '').toUpperCase(),
    country: hit.address?.country || '',
    isAddress: Boolean(hit.address?.house_number),
  };
}

const DIRECTIONS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'north', 'south', 'east', 'west']);

// Nominatim's usage policy: at most one request a second. Suggestions wait
// their turn, and a query already asked is answered from memory.
let nominatimAt = 0;
const nominatimSeen = new Map();
async function nominatimSuggest(q) {
  if (nominatimSeen.has(q)) return nominatimSeen.get(q);
  const wait = nominatimAt + 1100 - Date.now();
  nominatimAt = Math.max(Date.now(), nominatimAt + 1100);
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: 'json', limit: '8', addressdetails: '1', countrycodes: 'us', viewbox: CA_VIEWBOX, bounded: '0', q })}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const hits = ((await res.json()) || []).map(nominatimHit);
  if (nominatimSeen.size > 100) nominatimSeen.clear();
  nominatimSeen.set(q, hits);
  return hits;
}

/**
 * Address suggestions as the user types: US places only, California's
 * first, street addresses before other places, up to 6. Photon (good with
 * half-typed addresses), and Nominatim when Photon lacks the typed house.
 */
export async function autocompleteAddresses(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  // A house number typed first, and the street's name (its first word that
  // isn't N, S, E or W): "716 N Northcape Ave" → 716, "northcape".
  const number = q.match(/^(\d+[a-z]?)\b/i)?.[1]?.toLowerCase();
  const word = number ? (q.slice(number.length).toLowerCase().match(/[a-z0-9]+/g) || []).find((w) => !DIRECTIONS.has(w.replace(/\.$/, ''))) || '' : '';
  const withNumber = (h) => new RegExp(`^${number}\\b`, 'i').test(h.label);
  const onStreet = (h) => !word || h.label.toLowerCase().includes(word);
  let hits = [];
  try {
    const url = `https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: '12', lang: 'en', bbox: US_BBOX, lat: String(CA_CENTER.lat), lon: String(CA_CENTER.lon), location_bias_scale: '0.3' })}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (res.ok) hits = ((await res.json())?.features || []).map(photonHit);
  } catch {
    hits = [];
  }
  // Photon often has the street but not the house (716 N Northcape Ave, San
  // Dimas: OpenStreetMap maps the house, Photon's copy only the street), so
  // Nominatim is asked too whenever the typed house isn't among Photon's.
  const houseMissing = number && word.length >= 3 && !hits.some((h) => h.isAddress && withNumber(h) && onStreet(h));
  if (houseMissing || !hits.some((h) => h.countryCode === 'US')) {
    try {
      hits = [...(await nominatimSuggest(q)), ...hits];
    } catch {
      // Photon's suggestions stand.
    }
  }
  // A house number typed first: only results with that number, when any have
  // it, and of those the ones on the typed street.
  const numbered = number ? hits.filter(withNumber) : [];
  if (numbered.length) hits = numbered.some(onStreet) ? numbered.filter(onStreet) : numbered;
  const seen = new Set();
  return hits
    .filter((h) => h.countryCode === 'US' && Number.isFinite(h.lat) && Number.isFinite(h.lng))
    .filter((h) => (seen.has(h.label) ? false : seen.add(h.label)))
    .map((h, i) => ({ h, rank: (h.state === 'California' ? 0 : 2) + (h.isAddress ? 0 : 1), i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, 6)
    .map(({ h }) => h);
}

export async function reverseGeocodeLocation(center) {
  if (!Array.isArray(center) || !center.every(Number.isFinite)) return null;
  const [lat, lng] = center;
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&zoom=10&lat=${lat}&lon=${lng}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const { address = {} } = await response.json();
  return { countryCode: (address.country_code || '').toUpperCase(), country: address.country || '', state: address.state || '', city: address.city || address.town || address.village || '', zip: address.postcode || '' };
}

export async function geocodeAddress(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&extratags=1&polygon_geojson=1&countrycodes=us&viewbox=${CA_VIEWBOX}&bounded=0&q=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return null;
  const hit = data[0];
  const geometry = outlineFromGeoJSON(hit.geojson);
  const category = hit.category || hit.class || '';
  // Address polygons are often roofs, not parcels (for example 280 Machado Ln).
  const isBuilding = category === 'building' || hit.addresstype === 'building' || (hit.extratags?.building && hit.extratags.building !== 'no') || ['house', 'apartments', 'detached', 'commercial', 'industrial'].includes(hit.type);
  const isSite = !isBuilding && ['leisure', 'amenity', 'landuse'].includes(category) && !['residential', 'commercial', 'industrial', 'retail'].includes(hit.type);
  const outline = isSite ? geometry : null;
  return {
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    label: hit.display_name,
    short: streetLabel(hit.address),
    zip: hit.address?.postcode || '',
    city: hit.address?.city || hit.address?.town || hit.address?.village || '',
    state: hit.address?.state || '',
    countryCode: (hit.address?.country_code || '').toUpperCase(),
    country: hit.address?.country || '',
    outline,
    outlineKind: outline ? 'site' : 'unknown',
    buildingOutline: isBuilding ? geometry : null,
    areaSqft: outline ? Math.round(polygonAreaSqFt(outline)) : 0,
  };
}
// ---- GeoJSON <-> Leaflet ----
// GeoJSON positions are [lng, lat]; the map components here use [lat, lng].

/** Every polygon (as GeoJSON coordinate rings) inside a geometry, Feature or FeatureCollection. */
export function geoJsonPolygons(geo) {
  if (!geo) return [];
  if (geo.type === 'FeatureCollection') return (geo.features || []).flatMap((f) => geoJsonPolygons(f));
  if (geo.type === 'Feature') return geoJsonPolygons(geo.geometry);
  if (geo.type === 'Polygon') return [geo.coordinates];
  if (geo.type === 'MultiPolygon') return geo.coordinates;
  return [];
}

/** Outer ring of each polygon as [lat, lng] points, without the repeated closing point. */
export function geoJsonOuterRings(geo) {
  return geoJsonPolygons(geo)
    .map((rings) => {
      const pts = (rings[0] || []).map(([lng, lat]) => [lat, lng]);
      const [first, last] = [pts[0], pts[pts.length - 1]];
      return first && last && first[0] === last[0] && first[1] === last[1] ? pts.slice(0, -1) : pts;
    })
    .filter((pts) => pts.length >= 3);
}

/** [lat, lng] outlines to a GeoJSON FeatureCollection of closed polygons. */
export function outlinesToFeatureCollection(outlines) {
  return {
    type: 'FeatureCollection',
    features: (outlines || [])
      .filter((pts) => Array.isArray(pts) && pts.length >= 3)
      .map((pts) => {
        const ring = pts.map(([lat, lng]) => [lng, lat]);
        return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } };
      }),
  };
}
