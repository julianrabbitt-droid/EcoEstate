// Boundaries of named places (a campus, park, school, golf course…) from
// OpenStreetMap via Nominatim. A place like UCSB spans many county parcels, so
// its mapped outline is the property to scan, not the one parcel its point
// lands in. Geocodio only handles street addresses, so typed place names that
// it can't find are looked up here too.
//
// Nominatim's usage policy: identify the app and stay under ~1 request/second.
// Lookups are cached, and only made for named places.
import turfArea from '@turf/area';
import { LRU } from './lru.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'EcoEstate lawn API (https://ecoestate.org)';
const SQM_TO_SQFT = 10.7639;

// Kinds of places whose outline is a property; cities, counties, roads,
// buildings and street addresses are not.
const PROPERTY_CLASSES = new Set(['amenity', 'leisure', 'landuse', 'tourism', 'historic', 'club']);
// Smaller outlines are usually one building (a shop, a church hall), where the
// county parcel is the better property line.
const MIN_AREA_M2 = 2000;
const MAX_AREA_M2 = 20_000_000; // 20 km²; larger outlines are almost certainly not one property

const cache = new LRU(200); // query -> Promise<results> (outlines can be large, so only the recent ones)
let last = 0;
let queue = Promise.resolve(); // requests take turns, at least 1.1 s apart

function nextTurn() {
  const turn = queue.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
  });
  queue = turn;
  return turn;
}

async function request(key) {
  await nextTurn();
  const r = await fetch(`${NOMINATIM}${key}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Nominatim returned ${r.status}`);
  return r.json();
}

function nominatim(path, params) {
  const key = `${path}?${new URLSearchParams(params)}`;
  if (!cache.has(key)) {
    // Concurrent lookups of the same place share one request; failures aren't kept.
    const lookup = request(key).catch((err) => {
      if (cache.get(key) === lookup) cache.delete(key);
      throw err;
    });
    cache.set(key, lookup);
  }
  return cache.get(key);
}

function toPlace(hit) {
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  const place = { lat, lon, label: hit.display_name, countryCode: (hit.address?.country_code || '').toUpperCase(), boundary: null };
  const g = hit.geojson;
  if (PROPERTY_CLASSES.has(hit.class) && g && (g.type === 'Polygon' || g.type === 'MultiPolygon')) {
    const m2 = turfArea(g);
    if (m2 >= MIN_AREA_M2 && m2 <= MAX_AREA_M2) {
      place.boundary = {
        id: `osm:${hit.osm_type[0].toUpperCase()}${hit.osm_id}`,
        address: hit.display_name,
        areaSqft: Math.round(m2 * SQM_TO_SQFT),
        geometry: g,
        source: 'OpenStreetMap',
      };
    }
  }
  return place;
}

/** A place picked by OpenStreetMap ID, e.g. "W123456" or "R7890". */
export async function placeById(osmId) {
  if (!/^[NWR]\d+$/.test(osmId)) return null;
  const [hit] = await nominatim('/lookup', { osm_ids: osmId, format: 'json', polygon_geojson: '1', addressdetails: '1' });
  return toPlace(hit);
}

/** A typed place name, e.g. "Greer Park, Palo Alto" (US only). */
export async function placeByName(query) {
  const [hit] = await nominatim('/search', { q: query, format: 'json', polygon_geojson: '1', addressdetails: '1', countrycodes: 'us', limit: '1' });
  return toPlace(hit);
}
