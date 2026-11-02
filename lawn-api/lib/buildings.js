// Building footprints and road/path segments from Overture Maps (which merges
// Microsoft, Google and OpenStreetMap data). The latest release is found
// through Overture's STAC catalog; each GeoParquet file and row group carries
// bounding-box statistics, so only the few MB of rows near the address are
// downloaded.
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { LRU } from './lru.js';

const STAC_ROOT = 'https://stac.overturemaps.org/catalog.json';
const INDEX_TTL = 24 * 3600 * 1000;
const RETRY_MS = 10 * 60 * 1000; // after a failed refresh, keep the old index this long before trying again
const READ_TIMEOUT_MS = 30000;

const BUILDINGS = 'buildings/building';
const SEGMENTS = 'transportation/segment';
const indexes = new Map(); // collection -> { release, files: [{ bbox, url }], loadedAt }
const indexLoads = new Map(); // collection -> Promise<index> while (re)loading, shared by concurrent callers
const footers = new LRU(64); // url -> { file, metadata, starts }

// fetch for hyparquet's range requests, with a timeout on each one.
function timedFetch(url, init = {}) {
  const timeout = AbortSignal.timeout(READ_TIMEOUT_MS);
  return fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
}

async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);
  return r.json();
}

async function loadIndex(collectionPath = BUILDINGS) {
  const index = indexes.get(collectionPath);
  if (index && Date.now() - index.loadedAt < INDEX_TTL) return index;
  if (!indexLoads.has(collectionPath)) {
    indexLoads.set(
      collectionPath,
      fetchIndex(collectionPath)
        .catch((err) => {
          const old = indexes.get(collectionPath);
          if (!old) throw err;
          console.warn(`${collectionPath} index refresh failed, still using ${old.release}: ${err.message}`);
          const kept = { ...old, loadedAt: Date.now() - INDEX_TTL + RETRY_MS };
          indexes.set(collectionPath, kept);
          return kept;
        })
        .finally(() => indexLoads.delete(collectionPath))
    );
  }
  return indexLoads.get(collectionPath);
}

async function fetchIndex(collectionPath) {
  const root = await json(STAC_ROOT);
  const latest = root.links.find((l) => l.rel === 'child' && l.latest) ?? root.links.filter((l) => l.rel === 'child').at(-1);
  const releaseUrl = new URL(latest.href, STAC_ROOT);
  const release = releaseUrl.pathname.split('/').filter(Boolean)[0];
  const collection = await json(new URL(`${collectionPath}/collection.json`, releaseUrl).href);
  const itemUrls = collection.links.filter((l) => l.rel === 'item').map((l) => new URL(l.href, collection.links.find((x) => x.rel === 'self')?.href ?? releaseUrl).href);
  const files = [];
  for (let i = 0; i < itemUrls.length; i += 64) {
    const items = await Promise.all(itemUrls.slice(i, i + 64).map(json));
    for (const it of items) files.push({ bbox: it.bbox, url: it.assets.aws?.href ?? Object.values(it.assets)[0].href });
  }
  if (indexes.get(collectionPath)?.release !== release) footers.clear();
  const index = { release, files, loadedAt: Date.now() };
  indexes.set(collectionPath, index);
  return index;
}

async function footer(url) {
  if (!footers.has(url)) {
    const file = await asyncBufferFromUrl({ url, fetch: timedFetch });
    const metadata = await parquetMetadataAsync(file);
    const starts = [];
    let n = 0;
    for (const rg of metadata.row_groups) {
      starts.push(n);
      n += Number(rg.num_rows);
    }
    footers.set(url, { file, metadata, starts });
  }
  return footers.get(url);
}

const overlaps = (b, [w, s, e, n]) => b.xmin <= e && b.xmax >= w && b.ymin <= n && b.ymax >= s;

/**
 * Building footprints whose bounding box overlaps [west, south, east, north].
 * Returns [{ id, geometry, height, floors }]: GeoJSON Polygon/MultiPolygon
 * geometries, with Overture's recorded height (m) and floor count where known.
 */
export async function buildingsInBox(box) {
  const out = new Map();
  for (const row of await rowsInBox(BUILDINGS, box, ['id', 'bbox', 'geometry', 'height', 'num_floors'])) {
    if (row.geometry && /Polygon$/.test(row.geometry.type)) {
      out.set(row.id, { id: row.id, geometry: row.geometry, height: row.height ?? null, floors: row.num_floors ?? null });
    }
  }
  return [...out.values()];
}

// Overture road classes (and the subclasses that matter for yards) mapped to
// the OpenStreetMap highway kinds the rest of the scan uses.
const SEGMENT_KIND = {
  motorway: 'primary', trunk: 'primary', primary: 'primary', secondary: 'secondary', tertiary: 'tertiary',
  residential: 'residential', living_street: 'living_street', unclassified: 'unclassified', service: 'service',
  pedestrian: 'pedestrian', footway: 'footway', steps: 'steps', path: 'path', track: 'track', cycleway: 'cycleway', bridleway: 'bridleway',
};

/**
 * Roads, driveways, sidewalks and footpaths whose bounding box overlaps
 * [west, south, east, north], in the same shape as the OpenStreetMap paths:
 * [{ kind, name, widthM: null, line: [[lon, lat]…] }] (the caller fills in a
 * typical width for the kind).
 */
export async function segmentsInBox(box) {
  const out = new Map();
  for (const row of await rowsInBox(SEGMENTS, box, ['id', 'bbox', 'geometry', 'subtype', 'class', 'names'])) {
    if (row.subtype !== 'road' || row.geometry?.type !== 'LineString' || row.geometry.coordinates.length < 2) continue;
    const kind = SEGMENT_KIND[row.class];
    if (!kind) continue;
    out.set(row.id, { kind, name: row.names?.primary || null, widthM: null, line: row.geometry.coordinates.map(([x, y]) => [x, y]) });
  }
  return [...out.values()];
}

async function rowsInBox(collectionPath, box, columns) {
  const { files } = await loadIndex(collectionPath);
  const [w, s, e, n] = box;
  const candidates = files.filter(({ bbox: [fw, fs, fe, fn] }) => fw <= e && fe >= w && fs <= n && fn >= s);
  const out = [];
  for (const { url } of candidates) {
    const { file, metadata, starts } = await footer(url);
    const cols = metadata.row_groups[0].columns.map((c) => c.meta_data.path_in_schema.join('.'));
    const ix = ['bbox.xmin', 'bbox.xmax', 'bbox.ymin', 'bbox.ymax'].map((name) => cols.indexOf(name));
    for (const [i, rg] of metadata.row_groups.entries()) {
      const [xmin, xmax, ymin, ymax] = ix.map((j, k) => Number(rg.columns[j].meta_data.statistics[k % 2 ? 'max_value' : 'min_value']));
      if (!overlaps({ xmin, xmax, ymin, ymax }, box)) continue;
      const rows = await parquetReadObjects({ file, metadata, columns, rowStart: starts[i], rowEnd: starts[i] + Number(rg.num_rows), compressors });
      for (const row of rows) if (row.bbox && overlaps(row.bbox, box)) out.push(row);
    }
  }
  return out;
}
