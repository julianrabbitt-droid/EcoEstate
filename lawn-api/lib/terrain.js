// The ground's height around a property, for the 3D model: USGS 3D Elevation
// Program bare earth (1 m lidar where flown), one small raster over the lot
// and the street and yards around it. Fetched here, alongside the scan,
// because the service takes 5-20 s for a new area: too long for the browser
// to wait on while the model appears, so it used to fall back to coarse
// global terrain, which put hillside yards and streets feet off.
import { fromArrayBuffer } from 'geotiff';
import { LRU } from './lru.js';

const EXPORT = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';
const MARGIN_M = 30; // past the lot: the street, the far parkway and the street trees the model draws
const CELLS = 48; // across the longer side (~2 m on a house lot)
const TIMEOUT_MS = 25000;

// One request per property box, shared: a scan that stops waiting leaves it
// running, and the 3D view's own request for the same box (GET /v1/terrain)
// picks up its answer. Failures aren't kept, so a later request tries again.
const requests = new LRU(300);

/**
 * Bare-earth heights over a lon/lat box plus a margin, or null when the
 * service fails. { west, south, east, north, cols, rows, base (m), h } with h
 * row-major from the north-west corner, in decimetres above base.
 */
export function terrainGrid(box) {
  const key = box.map((v) => Number(v).toFixed(5)).join(',');
  let req = requests.get(key);
  if (!req) {
    req = fetchGrid(box.map(Number)).then((grid) => {
      if (!grid) requests.delete(key);
      return grid;
    });
    requests.set(key, req);
  }
  return req;
}

async function fetchGrid([w, s, e, n]) {
  const lat = (s + n) / 2;
  const dLon = MARGIN_M / (111320 * Math.cos((lat * Math.PI) / 180));
  const dLat = MARGIN_M / 110540;
  const box = [w - dLon, s - dLat, e + dLon, n + dLat];
  const widthM = (box[2] - box[0]) * 111320 * Math.cos((lat * Math.PI) / 180);
  const heightM = (box[3] - box[1]) * 110540;
  const cols = widthM >= heightM ? CELLS : Math.max(8, Math.round((CELLS * widthM) / heightM));
  const rows = heightM >= widthM ? CELLS : Math.max(8, Math.round((CELLS * heightM) / widthM));
  const params = new URLSearchParams({
    bbox: box.join(','), bboxSR: '4326', imageSR: '4326', size: `${cols},${rows}`,
    format: 'tiff', pixelType: 'F32', interpolation: 'RSP_BilinearInterpolation', f: 'image',
  });
  try {
    // The service sometimes answers 504 for a new area; once more then.
    let res = await fetch(`${EXPORT}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status >= 500) res = await fetch(`${EXPORT}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const image = await (await fromArrayBuffer(await res.arrayBuffer())).getImage();
    if (image.getWidth() !== cols || image.getHeight() !== rows) return null;
    const [data] = await image.readRasters();
    const ok = Array.from(data).filter((v) => Number.isFinite(v) && v > -500 && v < 9000);
    if (ok.length < 0.8 * data.length) return null; // mostly no data: off the survey, or water
    const mean = ok.reduce((a, v) => a + v, 0) / ok.length;
    const vals = Array.from(data, (v) => (Number.isFinite(v) && v > -500 && v < 9000 ? v : mean));
    const base = Math.floor(Math.min(...vals));
    return {
      west: Number(box[0].toFixed(7)),
      south: Number(box[1].toFixed(7)),
      east: Number(box[2].toFixed(7)),
      north: Number(box[3].toFixed(7)),
      cols,
      rows,
      base,
      h: vals.map((v) => Math.round((v - base) * 10)),
    };
  } catch {
    return null;
  }
}
