// Building footprints from Overture Maps (which merges Microsoft, Google and
// OpenStreetMap buildings). The latest release is found through Overture's
// STAC catalog; each GeoParquet file and row group carries bounding-box
// statistics, so only the few MB of rows near the address are downloaded.
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const STAC_ROOT = 'https://stac.overturemaps.org/catalog.json';
const INDEX_TTL = 24 * 3600 * 1000;

let index = null; // { release, files: [{ bbox, url }], loadedAt }
const footers = new Map(); // url -> { file, metadata, starts }

async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);
  return r.json();
}

async function loadIndex() {
  if (index && Date.now() - index.loadedAt < INDEX_TTL) return index;
  const root = await json(STAC_ROOT);
  const latest = root.links.find((l) => l.rel === 'child' && l.latest) ?? root.links.filter((l) => l.rel === 'child').at(-1);
  const releaseUrl = new URL(latest.href, STAC_ROOT);
  const release = releaseUrl.pathname.split('/').filter(Boolean)[0];
  const collection = await json(new URL('buildings/building/collection.json', releaseUrl).href);
  const itemUrls = collection.links.filter((l) => l.rel === 'item').map((l) => new URL(l.href, collection.links.find((x) => x.rel === 'self')?.href ?? releaseUrl).href);
  const files = [];
  for (let i = 0; i < itemUrls.length; i += 64) {
    const items = await Promise.all(itemUrls.slice(i, i + 64).map(json));
    for (const it of items) files.push({ bbox: it.bbox, url: it.assets.aws?.href ?? Object.values(it.assets)[0].href });
  }
  if (index?.release !== release) footers.clear();
  index = { release, files, loadedAt: Date.now() };
  return index;
}

async function footer(url) {
  if (!footers.has(url)) {
    const file = await asyncBufferFromUrl({ url });
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
  const { files } = await loadIndex();
  const [w, s, e, n] = box;
  const candidates = files.filter(({ bbox: [fw, fs, fe, fn] }) => fw <= e && fe >= w && fs <= n && fn >= s);
  const out = new Map();
  for (const { url } of candidates) {
    const { file, metadata, starts } = await footer(url);
    const cols = metadata.row_groups[0].columns.map((c) => c.meta_data.path_in_schema.join('.'));
    const ix = ['bbox.xmin', 'bbox.xmax', 'bbox.ymin', 'bbox.ymax'].map((name) => cols.indexOf(name));
    for (const [i, rg] of metadata.row_groups.entries()) {
      const [xmin, xmax, ymin, ymax] = ix.map((j, k) => Number(rg.columns[j].meta_data.statistics[k % 2 ? 'max_value' : 'min_value']));
      if (!overlaps({ xmin, xmax, ymin, ymax }, box)) continue;
      const rows = await parquetReadObjects({
        file,
        metadata,
        columns: ['id', 'bbox', 'geometry', 'height', 'num_floors'],
        rowStart: starts[i],
        rowEnd: starts[i] + Number(rg.num_rows),
        compressors,
      });
      for (const row of rows) {
        if (overlaps(row.bbox, box) && row.geometry && /Polygon$/.test(row.geometry.type)) {
          out.set(row.id, { id: row.id, geometry: row.geometry, height: row.height ?? null, floors: row.num_floors ?? null });
        }
      }
    }
  }
  return [...out.values()];
}
