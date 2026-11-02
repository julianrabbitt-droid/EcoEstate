// Hand-mapped features from OpenStreetMap via the Overpass API:
//  - lawn shapes (grass areas, sports pitches, village greens): campuses and
//    parks are mapped in detail, and those outlines are the familiar shapes
//    people recognise; the imagery decides which are actually green lawn;
//  - paths (footways, cycleways, plazas, steps) and roads (service roads,
//    streets) as centre lines with a width.
//
// Overpass is a free shared service and can take 30+ seconds when busy, so a
// scan waits only briefly: if the shapes aren't back yet, it goes ahead without
// them while the download finishes in the background for the next scan.
import fs from 'node:fs';
import path from 'node:path';
import { polygonsOf } from './grid.js';
import { LRU } from './lru.js';

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const USER_AGENT = 'EcoEstate lawn API (https://ecoestate.org)';
const WAIT_MS = 6000;
const CACHE_DIR = path.join(import.meta.dirname, '..', '.cache', 'osm-features-v2');
const CACHE_DAYS = 30;
const cache = new LRU(100); // bbox key -> { lawns, paths } (the recent ones; all are kept on disk across restarts)

// Typical paved width (m) when a path has no width tag.
export const PATH_WIDTH_M = {
  footway: 2, path: 1.8, cycleway: 3, pedestrian: 5, steps: 2, bridleway: 2.5, track: 3,
  service: 4.5, living_street: 5.5, residential: 7, unclassified: 6.5, tertiary: 8, secondary: 10, primary: 12,
};
export const ROAD_KINDS = new Set(['service', 'living_street', 'residential', 'unclassified', 'tertiary', 'secondary', 'primary']);

function fromDisk(key) {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    if (Date.now() - fs.statSync(file).mtimeMs > CACHE_DAYS * 864e5) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function toDisk(key, shapes) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(shapes));
  } catch {
    /* the in-memory cache still works */
  }
}
const inFlight = new Map(); // bbox key -> Promise<shapes>

function parse(data) {
  const shapes = [];
  const paths = [];
  for (const el of data.elements ?? []) {
    const highway = el.tags?.highway;
    if (el.type === 'way' && highway && el.geometry?.length >= 2) {
      const width = Number.parseFloat(el.tags.width);
      paths.push({
        kind: highway,
        name: el.tags.name || null,
        widthM: Number.isFinite(width) && width > 0 && width < 30 ? width : PATH_WIDTH_M[highway] ?? 2,
        line: el.geometry.map((p) => [p.lon, p.lat]),
      });
      continue;
    }
    if (el.type === 'way' && el.geometry?.length >= 4) {
      const ring = el.geometry.map((p) => [p.lon, p.lat]);
      const [a, b] = [ring[0], ring.at(-1)];
      if (a[0] === b[0] && a[1] === b[1]) shapes.push({ type: 'Polygon', coordinates: [ring] });
    } else if (el.type === 'relation') {
      const outers = (el.members ?? []).filter((m) => m.role === 'outer' && m.geometry?.length >= 4).map((m) => m.geometry.map((p) => [p.lon, p.lat]));
      const closed = outers.filter((ring) => ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]);
      if (closed.length) shapes.push({ type: 'MultiPolygon', coordinates: closed.map((ring) => [ring]) });
    }
  }
  return { lawns: shapes.filter((g) => polygonsOf(g).length), paths };
}

async function fetchFrom(endpoint, query) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error(`Overpass returned ${r.status}`);
  const data = await r.json();
  // An overloaded server can answer 200 with no elements and a "runtime
  // error" remark; that's a failure, not an empty area, so it's never cached.
  if (/error|timed out|timeout/i.test(data.remark || '')) throw new Error(`Overpass: ${data.remark}`);
  return parse(data);
}

/**
 * OSM features overlapping [west, south, east, north]: { lawns: GeoJSON
 * geometries, paths: [{ kind, widthM, line: [[lon, lat]…] }] }, or null if they
 * aren't available within a few seconds (cached for the next call once the
 * download finishes).
 */
// After both servers fail, scans stop waiting on them for a while (Overture's
// roads and paths stand in), instead of losing a few seconds every time.
const DOWN_MS = 10 * 60 * 1000;
let downUntil = 0;
export async function osmLawnShapes([w, s, e, n], { waitMs = WAIT_MS } = {}) {
  const key = [w, s, e, n].map((v) => v.toFixed(4)).join(',');
  if (!cache.has(key)) {
    const saved = fromDisk(key);
    if (saved) cache.set(key, saved);
  }
  if (cache.has(key)) return cache.get(key);
  if (!inFlight.has(key)) {
    const bbox = `${s},${w},${n},${e}`;
    const query = `[out:json][timeout:60];
(
  way["landuse"~"^(grass|village_green|recreation_ground)$"](${bbox});
  way["leisure"="pitch"]["surface"!~"artificial_turf|asphalt|concrete|clay|sand|tartan|dirt|gravel"](${bbox});
  relation["landuse"="grass"](${bbox});
  way["highway"~"^(footway|path|cycleway|pedestrian|steps|bridleway|track|service|living_street|residential|unclassified|tertiary|secondary|primary)$"](${bbox});
);
out geom;`;
    // Ask two servers at once; the first answer wins.
    const request = Promise.any(ENDPOINTS.map((ep) => fetchFrom(ep, query)))
      .then((shapes) => {
        cache.set(key, shapes);
        toDisk(key, shapes);
        return shapes;
      })
      .finally(() => inFlight.delete(key));
    request.catch(() => { downUntil = Date.now() + DOWN_MS; }); // a failed background download just means no shapes this time
    inFlight.set(key, request);
  }
  if (Date.now() < downUntil) return null; // still tried in the background, but not waited for
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), waitMs));
  return Promise.race([inFlight.get(key).catch(() => null), timeout]);
}
