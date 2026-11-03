// Lawn-to-native API
// One call: address in -> lawn square footage, lawn polygons, and conversion impact out.
// Runs on free data only (the Geocodio key is the one credential).
//
// Pipeline:  address --(Geocodio)--> lat/lon --(county parcel map, or an estimate around the
//            Overture building footprint)--> property line --(NAIP NDVI minus Meta/WRI canopy
//            height)--> lawn polygons
//
// Endpoints
//   GET  /health
//   GET  /v1/lawn?address=...     full lookup (main endpoint); optional osm=W123 (a picked place) or lat/lon (a picked point)
//   GET  /v1/locate?address=...   where an address is, for the app to confirm before scanning
//   POST /v1/lawn                 same, for a property line the user adjusted
//   POST /v1/area                 square footage + impact for a polygon your app supplies (e.g. user-drawn or edited)

import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import turfArea from '@turf/area';
import { ApiError, ConfigError, UpstreamError } from './lib/errors.js';
import { geocode } from './lib/geocode.js';
import { addressPoint, refineLocation } from './lib/addressPoint.js';
import { COUNTIES, findCountyParcel } from './lib/parcels.js';
import { estimateParcel } from './lib/estimate.js';
import { placeById, placeByName } from './lib/places.js';
import { detectLawn } from './lib/lawn.js';
import { buildingsInBox, segmentsInBox } from './lib/buildings.js';
import { mergeLawns } from './lib/merge.js';
import { LRU } from './lib/lru.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*' }));

const PORT = process.env.PORT || 3000;
const SQM_TO_SQFT = 10.7639;
const GALLONS_PER_SQFT_INCH = 0.623;

// Optional shared secret so only your app can call the API. Set APP_API_KEY in .env and send it as x-api-key.
app.use('/v1', (req, res, next) => {
  const required = process.env.APP_API_KEY;
  if (required && req.get('x-api-key') !== required) return fail(res, 401, 'unauthorized', 'Missing or invalid x-api-key header.');
  next();
});

// Lawn detections by parcel ID, so repeat lookups don't re-read imagery. Swap for Redis/DB in production.
const lawnCache = new LRU(200);
const PENDING_CACHE_MS = 15 * 60 * 1000;
// Scans in progress by parcel ID: identical requests share one scan.
const inFlight = new Map();

// A full-size scan holds several hundred MB of rasters, so only a few run at
// once (LAWN_MAX_CONCURRENT, default 1); a few more wait their turn and the
// rest are turned away until one finishes.
const MAX_CONCURRENT = Math.max(1, Math.floor(Number(process.env.LAWN_MAX_CONCURRENT)) || 1);
const MAX_WAITING = 8;
let running = 0;
const waiting = []; // resolve callbacks, oldest first

async function limited(task) {
  if (running < MAX_CONCURRENT) running++;
  else if (waiting.length >= MAX_WAITING) throw new ApiError(503, 'busy', 'The lawn scanner is busy with other properties. Try again in a minute.');
  else await new Promise((resolve) => waiting.push(resolve)); // the finishing scan hands over its slot
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    geocoder: 'geocodio',
    geocoderConfigured: Boolean(process.env.GEOCODIO_API_KEY),
    parcels: COUNTIES.map((c) => c.key),
    lawnDetection: 'naip',
  });
});

// ---------- Main endpoint ----------
app.get('/v1/lawn', async (req, res) => {
  const address = String(req.query.address || '').trim();
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const hasPoint = req.query.lat !== undefined && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (!address && !hasPoint && !req.query.osm) return fail(res, 400, 'missing_address', 'Pass an address, e.g. /v1/lawn?address=123 Main St, Springfield, IL');

  try {
    // 1. A named place picked in the app (campus, park…): its mapped outline is the property.
    let place = req.query.osm ? await placeById(String(req.query.osm)).catch(() => null) : null;
    let location = place && { lat: place.lat, lon: place.lon, label: address || place.label };
    // 2. A point picked in the app, else 3. the address via Geocodio, else 4. a place name.
    if (!location && hasPoint) location = { lat, lon, label: address || `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
    if (!location) {
      let geocodeError = null;
      res.set('x-usage', 'geocodio=1'); // a paid Geocodio lookup, reported to the app for cost tracking
      location = await geocode(address).catch((err) => {
        if (err instanceof ApiError) {
          geocodeError = err;
          return null;
        }
        throw err;
      });
      if (location) location = await refineLocation(address, location);
      if (!location) {
        place = await placeByName(address).catch(() => null);
        if (place && place.countryCode && place.countryCode !== 'US') place = null;
        if (place) location = { lat: place.lat, lon: place.lon, label: address };
      }
      if (!location && geocodeError) throw geocodeError;
    }
    if (!location) return fail(res, 404, 'address_not_found', 'That address wasn’t found. Add the city and state, or check the spelling.');

    let parcel = place?.boundary ?? null;
    let parcelSource = 'place';
    if (!parcel) {
      parcel = await findCountyParcel(location.lat, location.lon);
      parcelSource = 'county';
    }
    if (!parcel) {
      parcel = await estimateParcel(location.lat, location.lon);
      parcelSource = 'estimated';
    }
    res.json(await lawnResponse({ address: location.label, location, parcel, parcelSource, query: req.query }));
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- Re-measure inside a property line the user adjusted ----------
// Body: { "parcel": <GeoJSON Polygon | MultiPolygon | Feature>, "address"?: string, "location"?: { lat, lon }, "assumptions"?: {...} }
// Where an address is, before scanning: the app shows this point for the
// person to confirm. With lat/lon (the app's own lookup) only the published
// address point is checked, quickly; without, the address is geocoded too.
//   GET /v1/locate?address=...[&lat=..&lon=..]
app.get('/v1/locate', async (req, res) => {
  const address = String(req.query.address || '').trim();
  if (!address) return fail(res, 400, 'missing_address', 'Pass an address.');
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  try {
    if (req.query.lat !== undefined && Number.isFinite(lat) && Number.isFinite(lon)) {
      const point = await Promise.race([addressPoint(address, { lat, lon }), new Promise((done) => setTimeout(() => done(null), 4000))]).catch(() => null);
      return res.json(point ? { lat: point.lat, lon: point.lon, accuracy: 'address_point', movedM: point.movedM } : { lat, lon, accuracy: 'unchanged', movedM: 0 });
    }
    res.set('x-usage', 'geocodio=1');
    const found = await geocode(address);
    if (!found) return fail(res, 404, 'address_not_found', 'That address wasn’t found. Add the city and state, or check the spelling.');
    const location = await refineLocation(address, found);
    res.json({ lat: location.lat, lon: location.lon, label: location.label, accuracy: location.accuracy, movedM: location.movedM ?? 0, city: location.city, state: location.state, zip: location.zip });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/v1/lawn', async (req, res) => {
  const { address = null, location = null, assumptions = {} } = req.body ?? {};
  const geometry = req.body?.parcel?.type === 'Feature' ? req.body.parcel.geometry : req.body?.parcel;
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
    return fail(res, 400, 'missing_geometry', 'Send the property line as a GeoJSON Polygon in "parcel".');
  }
  if (!validPolygons(geometry)) {
    return fail(res, 400, 'invalid_geometry', 'The property line must be a GeoJSON Polygon of closed [longitude, latitude] rings.');
  }
  let areaSqft;
  try {
    areaSqft = Math.round(turfArea(geometry) * SQM_TO_SQFT);
  } catch {
    return fail(res, 400, 'invalid_geometry', 'The geometry isn’t valid GeoJSON.');
  }
  const id = `user:${crypto.createHash('sha1').update(JSON.stringify(geometry.coordinates)).digest('hex').slice(0, 16)}`;
  try {
    res.json(await lawnResponse({ address, location, parcel: { id, address, areaSqft, geometry }, parcelSource: 'user', query: assumptions }));
  } catch (err) {
    handleError(res, err);
  }
});

// Polygon / MultiPolygon coordinates: at least one polygon, each made of
// closed rings of 4+ [lon, lat] positions within the world's bounds.
function validPolygons(geometry) {
  const position = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  const ring = (r) => Array.isArray(r) && r.length >= 4 && r.every(position) && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1];
  const polygon = (rings) => Array.isArray(rings) && rings.length > 0 && rings.every(ring);
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return Array.isArray(polygons) && polygons.length > 0 && polygons.every(polygon);
}

async function lawnResponse({ address, location, parcel, parcelSource, query }) {
  let detection = lawnCache.get(parcel.id);
  // A scan made without OpenStreetMap's lawn shapes (its servers down) is
  // reused for a while, then redone in case they're back.
  if (detection?.templatesPending && Date.now() - detection.cachedAt > PENDING_CACHE_MS) detection = null;
  const cached = Boolean(detection);
  if (!detection) {
    if (!inFlight.has(parcel.id)) {
      const scan = limited(() => detectLawn(parcel.geometry))
        .then((result) => {
          // With canopy tiles that failed to load, let the next scan redo it.
          if (!result.canopyIncomplete) lawnCache.set(parcel.id, { ...result, cachedAt: Date.now() });
          return result;
        })
        .finally(() => inFlight.delete(parcel.id));
      inFlight.set(parcel.id, scan);
    }
    detection = await inFlight.get(parcel.id);
  }
  return {
    address,
    location: location ? { lat: location.lat, lon: location.lon } : null,
    parcel: { id: parcel.id, address: parcel.address, areaSqft: parcel.areaSqft, geometry: parcel.geometry },
    parcelSource,
    lawn: detection.lawn,
    lawnSqft: detection.totalSqft,
    surveyDate: detection.surveyDate,
    method: 'naip',
    buildings: detection.buildings,
    trees: detection.trees,
    lidar: detection.lidar,
    dormant: detection.dormant,
    paths: detection.paths,
    paved: detection.paved,
    pools: detection.pools,
    fences: detection.fences,
    groundImage: detection.groundImage,
    nearbyRoads: detection.nearbyRoads,
    impact: impact(detection.totalSqft, query),
    cached,
  };
}

// ---------- Area-only endpoint (for user-drawn or edited outlines) ----------
// Body: { "geometry": <GeoJSON Polygon | MultiPolygon | FeatureCollection>, "assumptions": { ...optional } }
// Overlapping or touching lawns are merged first, so shared areas aren't counted
// twice; "lawn" returns the merged groups (one mulch bed each).
app.post('/v1/area', (req, res) => {
  const { geometry, assumptions = {} } = req.body ?? {};
  if (!geometry) return fail(res, 400, 'missing_geometry', 'Send a GeoJSON geometry in the request body.');
  const parts =
    geometry.type === 'FeatureCollection' ? (Array.isArray(geometry.features) ? geometry.features.map((f) => f?.geometry) : [])
    : geometry.type === 'Feature' ? [geometry.geometry]
    : [geometry];
  if (!parts.every((g) => g && ['Polygon', 'MultiPolygon'].includes(g.type) && validPolygons(g))) {
    return fail(res, 400, 'invalid_geometry', 'Outlines must be GeoJSON Polygons of closed [longitude, latitude] rings.');
  }
  let lawn;
  try {
    lawn = mergeLawns(geometry);
  } catch {
    return fail(res, 400, 'invalid_geometry', 'The geometry isn’t valid GeoJSON.');
  }
  const sqft = lawn.features.reduce((s, f) => s + f.properties.areaSqft, 0);
  res.json({ lawnSqft: sqft, lawn, impact: impact(sqft, assumptions) });
});

// ---------- Impact model ----------
// Water use = area × reference ET (in/yr) × plant factor × 0.623 gal per sq ft per inch.
// Savings come from the drop in plant factor from turf to native plantings.
// Every assumption can be overridden per request (query params on GET, "assumptions" on POST).
function impact(sqft, overrides = {}) {
  const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
  const a = {
    et0Inches: num(overrides.et0Inches, Number(process.env.DEFAULT_ET0_INCHES ?? 45)),
    turfFactor: num(overrides.turfFactor, 0.8),
    nativeFactor: num(overrides.nativeFactor, 0.3),
    // Typical US residential water price when none is set ($6.50 per 1,000 gal,
    // the same rate the app's payoff estimates use).
    waterPricePer1000Gal: num(overrides.waterPricePer1000Gal, Number(process.env.DEFAULT_WATER_PRICE) || 6.5),
    rebatePerSqft: num(overrides.rebatePerSqft, Number(process.env.DEFAULT_REBATE_PER_SQFT ?? 0)),
  };
  const gallonsSavedPerYear = Math.round(sqft * a.et0Inches * (a.turfFactor - a.nativeFactor) * GALLONS_PER_SQFT_INCH);
  return {
    gallonsSavedPerYear,
    dollarsSavedPerYear: Math.round((gallonsSavedPerYear / 1000) * a.waterPricePer1000Gal),
    estimatedRebate: Math.round(sqft * a.rebatePerSqft),
    assumptions: a,
  };
}

// ---------- Errors ----------
const UPSTREAM_MESSAGES = {
  geocoder: 'The address lookup service didn’t respond correctly. Try again shortly.',
  imagery: 'The aerial imagery service didn’t respond correctly. Try again shortly.',
  buildings: 'The building map service didn’t respond correctly. Try again shortly.',
};

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({ error: { code, message }, ...extra });
}

function handleError(res, err) {
  if (err instanceof ApiError) return fail(res, err.status, err.code, err.message);
  if (err instanceof ConfigError) return fail(res, 501, 'not_configured', `${err.message} Set ${err.envVar} in .env.`);
  if (err instanceof UpstreamError) {
    console.error(err.message, err.detail ?? '');
    if (err.service === 'geocoder' && (err.status === 401 || err.status === 403)) {
      return fail(res, 502, 'geocoder_error', 'The address lookup service rejected the API key. Check GEOCODIO_API_KEY in .env.');
    }
    return fail(res, 502, `${err.service}_error`, UPSTREAM_MESSAGES[err.service] ?? `The ${err.service} service didn’t respond correctly. Try again shortly.`);
  }
  console.error(err);
  fail(res, 500, 'internal_error', 'Something went wrong processing this property.');
}

app.listen(PORT, () => {
  console.log(`Lawn-to-native API on http://localhost:${PORT}`);
  // Load Overture's address, building and road indexes now, so the first scan
  // after a restart doesn't wait for them (a tiny box in the ocean reads no rows).
  addressPoint('1 Warm Up St', { lat: 0, lon: 0 }).catch(() => {});
  buildingsInBox([-140, 0, -139.999, 0.001]).catch(() => {});
  segmentsInBox([-140, 0, -139.999, 0.001]).catch(() => {});
});
