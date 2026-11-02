// Puts a geocoded point on the right property. Geocoders often place a house
// number by interpolating along the street, which can land on a neighbour, the
// street itself, or (for big sites) a different parcel. Counties and cities
// publish address points placed on each property; Overture collects them. When
// one with the same house number and street is near the geocoded point, its
// position is used instead.
import { addressesInBox } from './buildings.js';
import { osmAddress } from './places.js';

const SEARCH_M = 400; // look this far around the geocoded point
const OSM_MAX_M = 1000; // an OpenStreetMap match further than this from the geocode is a different place

const SUFFIX = {
  street: 'st', avenue: 'ave', av: 'ave', road: 'rd', drive: 'dr', boulevard: 'blvd', lane: 'ln', court: 'ct',
  place: 'pl', terrace: 'ter', circle: 'cir', highway: 'hwy', parkway: 'pkwy', square: 'sq', trail: 'trl',
  expressway: 'expy', alley: 'aly', crescent: 'cres', plaza: 'plz', point: 'pt', mount: 'mt', saint: 'st',
};
const SUFFIXES = new Set([...Object.values(SUFFIX), 'way', 'loop', 'walk', 'path', 'row', 'real', 'mall']);
const DIRECTION = { north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw' };
const DIRECTIONS = new Set(Object.values(DIRECTION));
const UNIT = /\s+(?:apt|apartment|unit|ste|suite|#|bldg|building|fl|floor|rm|room)\b.*$/i;

const tokens = (street) =>
  street.toLowerCase().replace(/[.,'’]/g, ' ').replace(/#/g, ' # ').split(/\s+/).filter(Boolean).map((t) => SUFFIX[t] ?? DIRECTION[t] ?? t);

/** House number and street of a one-line address, or null without a house number. */
export function parseAddress(text) {
  const first = String(text || '').split(',')[0].replace(UNIT, '').trim();
  const m = first.match(/^(\d+[a-z]?)(?:-\d+[a-z]?)?\s+(.+)$/i);
  return m ? { number: m[1].toLowerCase(), street: tokens(m[2]) } : null;
}

// "N California Ave" matches "CALIFORNIA AVE" and "California Avenue"; a
// direction or suffix only has to agree when both sides give one.
function sameStreet(a, b) {
  const split = (t) => ({
    dir: t.filter((x, i) => DIRECTIONS.has(x) && (i === 0 || i === t.length - 1) && t.length > 1),
    suffix: t.length > 1 && SUFFIXES.has(t.at(-1)) ? t.at(-1) : null,
    core: t.filter((x, i) => !(DIRECTIONS.has(x) && (i === 0 || i === t.length - 1) && t.length > 1) && !(i === t.length - 1 && t.length > 1 && SUFFIXES.has(x))).join(' '),
  });
  const x = split(a);
  const y = split(b);
  if (!x.core || x.core !== y.core) return false;
  if (x.suffix && y.suffix && x.suffix !== y.suffix) return false;
  if (x.dir.length && y.dir.length && x.dir.join() !== y.dir.join()) return false;
  return true;
}

const metres = (a, b) => {
  const dy = (a.lat - b.lat) * 110540;
  const dx = (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

/**
 * The published address point for `address` near { lat, lon }, or null when
 * none matches. Returns { lat, lon, movedM } (how far it is from the input).
 */
export async function addressPoint(address, { lat, lon }) {
  const want = parseAddress(address);
  if (!want || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const dLat = SEARCH_M / 110540;
  const dLon = SEARCH_M / (111320 * Math.cos((lat * Math.PI) / 180));
  const points = await addressesInBox([lon - dLon, lat - dLat, lon + dLon, lat + dLat]);
  let best = null;
  for (const p of points) {
    if (p.number.toLowerCase() !== want.number || !sameStreet(want.street, tokens(p.street))) continue;
    const d = metres(p, { lat, lon });
    if (d <= SEARCH_M && (!best || d < best.movedM)) best = { lat: p.lat, lon: p.lon, movedM: Math.round(d) };
  }
  return best;
}

/**
 * A geocoded location ({ lat, lon, accuracy, … }) moved onto the property: the
 * published address point when there is one; otherwise, for a position the
 * geocoder estimated along the street, OpenStreetMap's spot for the same house
 * number (it often maps the building or site, e.g. a library). Unchanged when
 * neither is found.
 */
export async function refineLocation(address, location) {
  const point = await addressPoint(address, location).catch((err) => {
    console.warn(`address points unavailable: ${err.message}`);
    return null;
  });
  if (point) return { ...location, lat: point.lat, lon: point.lon, accuracy: 'address_point', movedM: point.movedM };
  if (location.accuracy === 'rooftop') return location;
  const want = parseAddress(address);
  const osm = want ? await osmAddress(address, want.number).catch(() => null) : null;
  if (osm && metres(osm, location) <= OSM_MAX_M) return { ...location, lat: osm.lat, lon: osm.lon, accuracy: 'osm_address', movedM: Math.round(metres(osm, location)) };
  return location;
}
