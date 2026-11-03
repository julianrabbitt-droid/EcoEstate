// Property lines from free county assessor parcel services (ArcGIS REST).
// Same approach as the app's SLO County lookup, extended to every California
// county that publishes a public parcel layer. The list lives in
// counties.json, generated and verified by scripts/discover-counties.mjs.
// Assessor maps are for tax purposes, not a legal survey.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import turfArea from '@turf/area';
import { LRU } from './lru.js';

const SQM_TO_SQFT = 10.7639;

// Situs (street) address formats for layers that carry one.
const ADDRESS = {
  'san-francisco': (a) => [a.from_address_num, a.street_name, a.street_type].filter(Boolean).join(' '),
  'santa-barbara': (a) => [a.Situs1, a.Situs2].map((s) => (s || '').trim()).filter(Boolean).join(', '),
  'los-angeles': (a) => [a.SitusHouseNo, a.SitusDirection, a.SitusStreet].map((s) => String(s ?? '').trim()).filter(Boolean).join(' '),
};

// Extents are each county's bounding box; where boxes overlap, the smaller
// (more specific) county is tried first until one returns a parcel.
export const COUNTIES = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'counties.json'), 'utf8'))
  .filter((c) => c.url)
  .map((c) => ({ ...c, address: ADDRESS[c.key] }))
  .sort((a, b) => (a.extent[2] - a.extent[0]) * (a.extent[3] - a.extent[1]) - (b.extent[2] - b.extent[0]) * (b.extent[3] - b.extent[1]));

// Parcels by ID, and which parcel each looked-up point fell in.
const parcelCache = new LRU(500);
const pointCache = new LRU(2000);
const pointKey = (lat, lon) => `${lat.toFixed(5)},${lon.toFixed(5)}`;

function field(attrs, name) {
  const k = Object.keys(attrs).find((key) => key.toLowerCase() === name);
  return k ? attrs[k] : undefined;
}

// The county's parcel number, else the layer's object ID. A parcel with
// neither gets an ID from its outline, so unrelated parcels never share one
// (and with it a cached lawn scan).
function parcelId(county, attrs, geometry) {
  const id = [attrs[county.idField], field(attrs, String(county.idField).toLowerCase()), field(attrs, 'apn'), field(attrs, 'ain'), field(attrs, 'objectid'), field(attrs, 'fid')]
    .find((v) => v !== undefined && v !== null && String(v).trim() !== '');
  if (id !== undefined) return `${county.key}:${id}`;
  return `${county.key}:geom-${crypto.createHash('sha1').update(JSON.stringify(geometry.coordinates)).digest('hex').slice(0, 16)}`;
}

// Socrata open-data APIs (San Francisco) take a SoQL spatial filter and
// return GeoJSON directly.
async function querySocrata(county, lat, lon) {
  const where = `intersects(${county.geometryField}, 'POINT (${lon} ${lat})')${county.where ? ` AND ${county.where}` : ''}`;
  const r = await fetch(`${county.url}?${new URLSearchParams({ $where: where, $limit: '2' })}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const data = await r.json();
  if (data.features?.length !== 1 || !data.features[0].geometry) return null;
  const { properties: attrs = {}, geometry } = data.features[0];
  return {
    id: parcelId(county, attrs, geometry),
    address: county.address?.(attrs) || null,
    areaSqft: Math.round(turfArea(geometry) * SQM_TO_SQFT),
    geometry,
    source: county.label,
  };
}

async function queryCounty(county, lat, lon) {
  if (county.type === 'socrata') return querySocrata(county, lat, lon);
  const params = new URLSearchParams({
    f: 'json',
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    // All fields (one record's attributes), so the object ID is there when the parcel number isn't.
    outFields: '*',
    returnGeometry: 'true',
    resultRecordCount: '2',
  });
  const r = await fetch(`${county.url}/query?${params}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const data = await r.json();
  // Stacked or ambiguous matches (condos, overlapping records) can't be resolved
  // from a point, so they fall through to the estimated boundary.
  if (data.error || data.features?.length !== 1) return null;
  return esriParcel(county, data.features[0]);
}

function esriParcel(county, { attributes: attrs = {}, geometry }) {
  const rings = (geometry?.rings ?? []).filter((ring) => ring.length >= 4);
  if (!rings.length) return null;

  // Esri rings: outer rings are clockwise, holes counter-clockwise. Group holes
  // with the outer ring that precedes them.
  const polygons = [];
  for (const ring of rings) {
    const signed = ring.reduce((s, [x1, y1], i) => {
      const [x2, y2] = ring[(i + 1) % ring.length];
      return s + (x2 - x1) * (y2 + y1);
    }, 0);
    if (signed > 0 || !polygons.length) polygons.push([ring]);
    else polygons[polygons.length - 1].push(ring);
  }
  const geom = polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons };
  return {
    id: parcelId(county, attrs, geom),
    address: county.address?.(attrs) || null,
    areaSqft: Math.round(turfArea(geom) * SQM_TO_SQFT),
    geometry: geom,
    source: county.label,
  };
}

/** The county parcel containing a point, or null outside coverage. */
// A point in no parcel is usually in the street: a geocoder that doesn't know
// the house puts its number along the street's centre line, and pins get
// dropped on the sidewalk. The property is then the nearest parcel within
// NEAR_M, on the address's own street where the county records addresses.
const NEAR_M = 30;

async function countyParcelsNear(county, lat, lon) {
  const dLat = NEAR_M / 110540;
  const dLon = NEAR_M / (111320 * Math.cos((lat * Math.PI) / 180));
  const [w, s, e, n] = [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
  if (county.type === 'socrata') {
    const box = `POLYGON ((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
    const where = `intersects(${county.geometryField}, '${box}')${county.where ? ` AND ${county.where}` : ''}`;
    const r = await fetch(`${county.url}?${new URLSearchParams({ $where: where, $limit: '80' })}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.features || []).filter((f) => f.geometry).map(({ properties: attrs = {}, geometry }) => ({
      id: parcelId(county, attrs, geometry),
      address: county.address?.(attrs) || null,
      areaSqft: Math.round(turfArea(geometry) * SQM_TO_SQFT),
      geometry,
      source: county.label,
    }));
  }
  const params = new URLSearchParams({
    f: 'json',
    geometry: JSON.stringify({ xmin: w, ymin: s, xmax: e, ymax: n, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    resultRecordCount: '80',
  });
  const r = await fetch(`${county.url}/query?${params}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return [];
  const data = await r.json();
  return data.error ? [] : (data.features || []).map((f) => esriParcel(county, f)).filter(Boolean);
}

// Metres from a point to the nearest edge of a polygon's outer rings.
function edgeDistanceM(geometry, lat, lon) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110540;
  const rings = geometry.type === 'Polygon' ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]);
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = [(ring[i - 1][0] - lon) * kx, (ring[i - 1][1] - lat) * ky];
      const [bx, by] = [(ring[i][0] - lon) * kx, (ring[i][1] - lat) * ky];
      const [dx, dy] = [bx - ax, by - ay];
      const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

// The street's name words from an address ("129 Page St, San Francisco" → PAGE),
// to compare with a parcel's situs address.
const STREET_TYPES = new Set(['ST', 'STREET', 'AVE', 'AVENUE', 'AV', 'RD', 'ROAD', 'DR', 'DRIVE', 'LN', 'LANE', 'WAY', 'BLVD', 'CT', 'COURT', 'PL', 'PLACE', 'TER', 'CIR', 'HWY', 'PKWY']);
const DIRECTIONS = new Set(['N', 'S', 'E', 'W', 'NORTH', 'SOUTH', 'EAST', 'WEST']);
function streetWords(address) {
  const words = String(address || '').split(',')[0].toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (/^\d/.test(words[0] || '')) words.shift();
  return words.filter((w) => !STREET_TYPES.has(w) && !DIRECTIONS.has(w));
}

/**
 * For a point in no parcel (see NEAR_M): the nearest parcel within NEAR_M,
 * preferring those on the address's street. null when there's none.
 */
export async function findNearbyCountyParcel(lat, lon, address) {
  const want = streetWords(address);
  const counties = COUNTIES.filter(({ extent: [w, s, e, n] }) => lon >= w && lon <= e && lat >= s && lat <= n);
  for (const county of counties) {
    try {
      const near = (await countyParcelsNear(county, lat, lon))
        .map((p) => ({ p, m: edgeDistanceM(p.geometry, lat, lon) }))
        .filter((c) => c.m <= NEAR_M)
        .sort((a, b) => a.m - b.m);
      if (!near.length) continue;
      const onStreet = want.length ? near.filter(({ p }) => p.address && want.every((w) => streetWords(p.address).includes(w))) : [];
      const { p: parcel, m } = onStreet[0] || near[0];
      parcelCache.set(parcel.id, parcel);
      pointCache.set(pointKey(lat, lon), parcel.id);
      return { ...parcel, nearestM: Math.round(m * 10) / 10 };
    } catch (err) {
      console.warn(`${county.key} nearby parcel lookup failed: ${err.message}`);
    }
  }
  return null;
}

export async function findCountyParcel(lat, lon) {
  const cached = parcelCache.get(pointCache.get(pointKey(lat, lon)));
  if (cached) return cached;

  const counties = COUNTIES.filter(({ extent: [w, s, e, n] }) => lon >= w && lon <= e && lat >= s && lat <= n);
  for (const county of counties) {
    try {
      const parcel = await queryCounty(county, lat, lon);
      if (parcel) {
        parcelCache.set(parcel.id, parcel);
        pointCache.set(pointKey(lat, lon), parcel.id);
        return parcel;
      }
    } catch (err) {
      console.warn(`${county.key} parcel lookup failed: ${err.message}`);
    }
  }
  return null;
}
