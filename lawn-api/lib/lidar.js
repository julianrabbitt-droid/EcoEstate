// USGS 3DEP airborne lidar: laser points measured from a plane, each labelled
// by USGS as ground, vegetation, building, water, etc. Public domain, served as
// Entwine Point Tiles (EPT) in the public usgs-lidar-public AWS bucket, with an
// index of every project's footprint kept by Hobu (the bucket's maintainer).
//
// lidarPoints(box) returns the points over a property from the newest project
// covering it: { x, y (lon/lat), z (m), cls (class code), int (laser return
// brightness, near-infrared), nret (returns from that pulse), count, source, year },
// or null where there is no lidar.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import proj4 from 'proj4';
import { Las } from 'copc';

const INDEX_URL = 'https://raw.githubusercontent.com/hobuinc/usgs-lidar/master/boundaries/resources.geojson';
const CACHE_DIR = path.join(import.meta.dirname, '..', '.cache', 'lidar');
const INDEX_DAYS = 30;
const FETCH_TIMEOUT_MS = 20000;
const MAX_NODES = 120; // a property never needs more; stops runaway reads on odd projects
const toMerc = proj4('EPSG:4326', 'EPSG:3857');
const fromMerc = proj4('EPSG:3857', 'EPSG:4326');

// LAS classification codes used by USGS.
export const LIDAR_CLASS = { ground: 2, lowVeg: 3, medVeg: 4, highVeg: 5, building: 6, noise: 7, water: 9, highNoise: 18 };

async function fetchWithTimeout(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

// Files are cached on disk by URL: project metadata and point tiles never change.
async function cached(url, kind) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + (kind === 'json' ? '.json' : '.laz'));
  if (fs.existsSync(file)) return kind === 'json' ? JSON.parse(fs.readFileSync(file, 'utf8')) : new Uint8Array(fs.readFileSync(file));
  const res = await fetchWithTimeout(url);
  if (kind === 'json') {
    const data = await res.json();
    fs.writeFileSync(file, JSON.stringify(data));
    return data;
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

const yearOf = (name) => {
  const years = (name.match(/20\d{2}/g) || []).map(Number);
  const b = name.match(/_B(\d{2})$/); // "_B23": a 2023 batch
  if (b) years.push(2000 + Number(b[1]));
  return years.length ? Math.max(...years) : 0;
};

function bboxOf(geometry) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]);
    } else c.forEach(walk);
  };
  walk(geometry.coordinates);
  return [w, s, e, n];
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inGeometry(pt, geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.some((rings) => inRing(pt, rings[0]) && !rings.slice(1).some((h) => inRing(pt, h)));
}

let indexPromise = null;
async function loadIndex() {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const file = path.join(CACHE_DIR, 'index.geojson');
    let text;
    if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < INDEX_DAYS * 864e5) text = fs.readFileSync(file, 'utf8');
    else {
      text = await (await fetchWithTimeout(INDEX_URL)).text();
      fs.writeFileSync(file, text);
    }
    return JSON.parse(text).features.map((f) => ({
      name: f.properties.name,
      url: f.properties.url,
      year: yearOf(f.properties.name),
      bbox: bboxOf(f.geometry),
      geometry: f.geometry,
    }));
  })();
  indexPromise.catch(() => { indexPromise = null; });
  return indexPromise;
}

// Every EPT node whose footprint overlaps the box, at every depth (points are
// spread across depths, so all of them together give the full density).
async function nodesFor(base, ept, [x0, y0, x1, y1]) {
  const [bx0, by0, , bx1, by1] = ept.bounds;
  const hierarchy = {};
  const loadHierarchy = async (key) => Object.assign(hierarchy, await cached(`${base}ept-hierarchy/${key}.json`, 'json'));
  await loadHierarchy('0-0-0-0');
  const keys = [];
  const visit = async (d, x, y, z) => {
    const key = `${d}-${x}-${y}-${z}`;
    let count = hierarchy[key];
    if (count === undefined) return;
    if (count === -1) {
      await loadHierarchy(key);
      count = hierarchy[key];
    }
    const sx = (bx1 - bx0) / 2 ** d;
    const sy = (by1 - by0) / 2 ** d;
    const nx0 = bx0 + x * sx;
    const ny0 = by0 + y * sy;
    if (nx0 > x1 || nx0 + sx < x0 || ny0 > y1 || ny0 + sy < y0) return;
    if (count > 0) keys.push(key);
    if (keys.length > MAX_NODES) throw new Error('too many lidar tiles for this area');
    for (let i = 0; i < 8; i++) await visit(d + 1, 2 * x + (i & 1), 2 * y + ((i >> 1) & 1), 2 * z + ((i >> 2) & 1));
  };
  await visit(0, 0, 0, 0);
  return keys;
}

async function readProject(entry, lonLatBox) {
  const ept = await cached(entry.url, 'json');
  if (ept.dataType !== 'laszip') return null;
  const base = entry.url.replace(/ept\.json$/, '');
  const [w, s, e, n] = lonLatBox;
  const [x0, y0] = toMerc.forward([w, s]);
  const [x1, y1] = toMerc.forward([e, n]);
  const keys = await nodesFor(base, ept, [x0, y0, x1, y1]);
  const out = { x: [], y: [], z: [], cls: [], int: [], nret: [] };
  // A few downloads at a time.
  for (let i = 0; i < keys.length; i += 6) {
    const bufs = await Promise.all(keys.slice(i, i + 6).map((k) => cached(`${base}ept-data/${k}.laz`, 'laz')));
    for (const buf of bufs) {
      const header = Las.Header.parse(buf);
      const data = await Las.PointData.decompressFile(buf);
      const view = Las.View.create(data, header);
      const gx = view.getter('X');
      const gy = view.getter('Y');
      const gz = view.getter('Z');
      const gc = view.getter('Classification');
      const gi = view.getter('Intensity');
      const gn = view.getter('NumberOfReturns');
      for (let k = 0; k < view.pointCount; k++) {
        const px = gx(k);
        const py = gy(k);
        if (px < x0 || px > x1 || py < y0 || py > y1) continue;
        const [lon, lat] = fromMerc.forward([px, py]);
        out.x.push(lon);
        out.y.push(lat);
        out.z.push(gz(k));
        out.cls.push(gc(k));
        out.int.push(gi(k));
        out.nret.push(gn(k));
      }
    }
  }
  return { x: Float64Array.from(out.x), y: Float64Array.from(out.y), z: Float32Array.from(out.z), cls: Uint8Array.from(out.cls), int: Uint16Array.from(out.int), nret: Uint8Array.from(out.nret), count: out.x.length };
}

/** Lidar points over [west, south, east, north] from the newest covering USGS project, or null. */
export async function lidarPoints(lonLatBox) {
  const index = await loadIndex();
  const [w, s, e, n] = lonLatBox;
  const centre = [(w + e) / 2, (s + n) / 2];
  const candidates = index
    .filter((p) => p.bbox[0] <= centre[0] && centre[0] <= p.bbox[2] && p.bbox[1] <= centre[1] && centre[1] <= p.bbox[3])
    .filter((p) => inGeometry(centre, p.geometry))
    .sort((a, b) => b.year - a.year);
  for (const entry of candidates.slice(0, 3)) {
    try {
      const pts = await readProject(entry, lonLatBox);
      // A real survey has several points per square metre; a handful means a gap or edge.
      const areaM2 = (e - w) * 111320 * Math.cos((centre[1] * Math.PI) / 180) * (n - s) * 110540;
      if (pts && pts.count >= Math.max(200, areaM2 * 0.5)) return { ...pts, source: entry.name, year: entry.year };
    } catch (err) {
      console.warn(`lidar ${entry.name}: ${err.message}`);
    }
  }
  return null;
}
