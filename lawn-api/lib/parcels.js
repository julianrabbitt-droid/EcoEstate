// Property lines from free county assessor parcel services (ArcGIS REST).
// Same approach as the app's SLO County lookup, extended to every California
// county that publishes a public parcel layer. The list lives in
// counties.json, generated and verified by scripts/discover-counties.mjs.
// Assessor maps are for tax purposes, not a legal survey.
import fs from 'node:fs';
import path from 'node:path';
import turfArea from '@turf/area';

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
const parcelCache = new Map();
const pointCache = new Map();
const pointKey = (lat, lon) => `${lat.toFixed(5)},${lon.toFixed(5)}`;

function field(attrs, name) {
  const k = Object.keys(attrs).find((key) => key.toLowerCase() === name);
  return k ? attrs[k] : undefined;
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
    id: `${county.key}:${attrs[county.idField]}`,
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
    outFields: county.address || !county.idField ? '*' : county.idField,
    returnGeometry: 'true',
    resultRecordCount: '2',
  });
  const r = await fetch(`${county.url}/query?${params}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const data = await r.json();
  // Stacked or ambiguous matches (condos, overlapping records) can't be resolved
  // from a point, so they fall through to the estimated boundary.
  if (data.error || data.features?.length !== 1) return null;
  const { attributes: attrs = {}, geometry } = data.features[0];
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
  const apn = attrs[county.idField] ?? field(attrs, 'apn') ?? field(attrs, 'ain') ?? field(attrs, 'objectid');
  return {
    id: `${county.key}:${apn}`,
    address: county.address?.(attrs) || null,
    areaSqft: Math.round(turfArea(geom) * SQM_TO_SQFT),
    geometry: geom,
    source: county.label,
  };
}

/** The county parcel containing a point, or null outside coverage. */
export async function findCountyParcel(lat, lon) {
  const cachedId = pointCache.get(pointKey(lat, lon));
  if (cachedId) return parcelCache.get(cachedId);

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
