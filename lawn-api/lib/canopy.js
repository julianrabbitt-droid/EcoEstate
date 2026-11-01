// Meta global ~1 m canopy height maps, public on AWS as Cloud-Optimized
// GeoTIFFs in Web Mercator, one file per quadkey tile. Values are canopy
// height in metres (uint8).
//   v1: Meta + World Resources Institute (2024), zoom-9 tiles, ~2018-2020 imagery
//   v2: Meta DINOv3 (2026), zoom-10 tiles, newer imagery
import { fromUrl } from 'geotiff';
import { UpstreamError } from './errors.js';
import { affineTo } from './grid.js';

const VERSIONS = {
  // v1 files are stored as full-width rows, so a window spans many rows; 1 MB
  // blocks keep that to a handful of requests instead of hundreds. v2 files are
  // tiled, and large blocks would make it download far more than it needs.
  v1: { base: 'https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm', zoom: 9, nodata: 255, options: { blockSize: 1 << 20 } },
  v2: { base: 'https://dataforgood-fb-data.s3.amazonaws.com/forests/v2/global/dinov3_global_chm_v2_ml3/chm', zoom: 10, nodata: null, options: {} },
};
const WORLD = 20037508.342789244;
const tiffs = new Map(); // url -> Promise<GeoTIFF | null>

function quadkey(tx, ty, zoom) {
  let q = '';
  for (let z = zoom; z > 0; z--) {
    const m = 1 << (z - 1);
    q += String((tx & m ? 1 : 0) + (ty & m ? 2 : 0));
  }
  return q;
}

function openTile(url, options) {
  if (!tiffs.has(url)) {
    tiffs.set(url, fromUrl(url, options).then((t) => t.getImage().then(() => t)).catch(() => null));
  }
  return tiffs.get(url);
}

/**
 * Canopy height (m) for every grid pixel, or null where the map has no data.
 * Returns { height: Uint8Array, known: Uint8Array }.
 */
export async function readCanopy(grid, version = process.env.CANOPY_VERSION || 'v2') {
  const { base, zoom, nodata, options } = VERSIONS[version];
  const n = grid.w * grid.h;
  const height = new Uint8Array(n);
  const known = new Uint8Array(n);
  const toMerc = affineTo(grid, 'EPSG:3857');
  const tileSize = (2 * WORLD) / 2 ** zoom;

  // Group pixels by the quadkey tile they fall in.
  const groups = new Map();
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
      const [x, y] = toMerc(i, j);
      const tx = Math.floor((x + WORLD) / tileSize);
      const ty = Math.floor((WORLD - y) / tileSize);
      const q = quadkey(tx, ty, zoom);
      if (!groups.has(q)) groups.set(q, []);
      groups.get(q).push([j * grid.w + i, x, y]);
    }
  }

  for (const [q, pixels] of groups) {
    const tiff = await openTile(`${base}/${q}.tif`, options);
    if (!tiff) continue;
    const image = await tiff.getImage();
    const [ox, oy] = image.getOrigin();
    const [rx, ry] = image.getResolution();
    const cols = pixels.map(([, x]) => Math.floor((x - ox) / rx));
    const rows = pixels.map(([, , y]) => Math.floor((y - oy) / ry));
    let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for (let idx = 0; idx < cols.length; idx++) {
      c0 = Math.min(c0, cols[idx]); c1 = Math.max(c1, cols[idx]);
      r0 = Math.min(r0, rows[idx]); r1 = Math.max(r1, rows[idx]);
    }
    const win = [Math.max(0, c0), Math.max(0, r0), Math.min(image.getWidth(), c1 + 1), Math.min(image.getHeight(), r1 + 1)];
    if (win[0] >= win[2] || win[1] >= win[3]) continue;
    let band;
    try {
      [band] = await image.readRasters({ window: win });
    } catch {
      throw new UpstreamError('imagery', 'canopy read');
    }
    const ww = win[2] - win[0];
    pixels.forEach(([k], idx) => {
      const c = cols[idx] - win[0];
      const r = rows[idx] - win[1];
      if (c < 0 || r < 0 || c >= ww || r >= win[3] - win[1]) return;
      const v = band[r * ww + c];
      if (v === nodata) return;
      height[k] = v;
      known[k] = 1;
    });
  }
  return { height, known };
}
