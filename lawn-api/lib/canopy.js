// Meta global ~1 m canopy height maps, public on AWS as Cloud-Optimized
// GeoTIFFs in Web Mercator, one file per quadkey tile. Values are canopy
// height in metres (uint8).
//   v1: Meta + World Resources Institute (2024), zoom-9 tiles, ~2018-2020 imagery
//   v2: Meta DINOv3 (2026), zoom-10 tiles, newer imagery
import { fromUrl } from 'geotiff';
import { UpstreamError, withTimeout } from './errors.js';
import { affineTo } from './grid.js';
import { LRU } from './lru.js';

const VERSIONS = {
  // v1 files are stored as full-width rows, so a window spans many rows; 1 MB
  // blocks keep that to a handful of requests instead of hundreds. v2 files are
  // tiled, and large blocks would make it download far more than it needs.
  // Each open file keeps up to cacheSize blocks, so v1 holds at most ~16 MB per file.
  v1: { base: 'https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm', zoom: 9, nodata: 255, options: { blockSize: 1 << 20, cacheSize: 16 } },
  v2: { base: 'https://dataforgood-fb-data.s3.amazonaws.com/forests/v2/global/dinov3_global_chm_v2_ml3/chm', zoom: 10, nodata: null, options: {} },
};
const WORLD = 20037508.342789244;
const OPEN_TIMEOUT_MS = 30000;
const READ_TIMEOUT_MS = 120000;
const tiffs = new LRU(32); // url -> Promise<GeoTIFF | null>

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
    const open = fromUrl(url, options, AbortSignal.timeout(OPEN_TIMEOUT_MS)).then((t) => t.getImage().then(() => t));
    const tile = withTimeout(open, OPEN_TIMEOUT_MS, 'imagery', 'canopy open').catch(() => {
      // Not remembered, so the next scan tries this tile again.
      if (tiffs.get(url) === tile) tiffs.delete(url);
      return null;
    });
    tiffs.set(url, tile);
  }
  return tiffs.get(url);
}

/**
 * Canopy height (m) for every grid pixel, or null where the map has no data.
 * Returns { height: Uint8Array, known: Uint8Array, failedTiles }, where
 * failedTiles counts map tiles that couldn't be opened (their pixels are unknown).
 */
export async function readCanopy(grid, version = process.env.CANOPY_VERSION || 'v2') {
  const { base, zoom, nodata, options } = VERSIONS[version];
  const { w } = grid;
  const n = w * grid.h;
  const height = new Uint8Array(n);
  const known = new Uint8Array(n);
  const toMerc = affineTo(grid, 'EPSG:3857');
  const tileSize = (2 * WORLD) / 2 ** zoom;

  // Group pixels by the quadkey tile they fall in: the tile of every pixel,
  // then each tile's pixels (in row order) as one slice of `order`.
  const tileOf = new Int32Array(n);
  const tiles = []; // [{ tx, ty, count }] in order of first pixel
  const tileIndex = new Map(); // tx * 2^zoom + ty -> index in tiles
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < w; i++) {
      const [x, y] = toMerc(i, j);
      const tx = Math.floor((x + WORLD) / tileSize);
      const ty = Math.floor((WORLD - y) / tileSize);
      const key = tx * 2 ** zoom + ty;
      let t = tileIndex.get(key);
      if (t === undefined) {
        t = tiles.length;
        tileIndex.set(key, t);
        tiles.push({ tx, ty, count: 0 });
      }
      tiles[t].count++;
      tileOf[j * w + i] = t;
    }
  }
  const start = new Int32Array(tiles.length + 1);
  tiles.forEach((tile, t) => (start[t + 1] = start[t] + tile.count));
  const order = new Int32Array(n);
  const next = start.slice(0, tiles.length);
  for (let k = 0; k < n; k++) order[next[tileOf[k]]++] = k;

  let failedTiles = 0;
  for (const [t, { tx, ty }] of tiles.entries()) {
    const tiff = await openTile(`${base}/${quadkey(tx, ty, zoom)}.tif`, options);
    if (!tiff) {
      failedTiles++;
      continue;
    }
    const image = await tiff.getImage();
    const [ox, oy] = image.getOrigin();
    const [rx, ry] = image.getResolution();
    // Map column and row of grid pixel k (the same arithmetic in both passes).
    const cell = (k) => {
      const i = k % w;
      const [x, y] = toMerc(i, (k - i) / w);
      return [Math.floor((x - ox) / rx), Math.floor((y - oy) / ry)];
    };
    let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for (let p = start[t]; p < start[t + 1]; p++) {
      const [c, r] = cell(order[p]);
      c0 = Math.min(c0, c); c1 = Math.max(c1, c);
      r0 = Math.min(r0, r); r1 = Math.max(r1, r);
    }
    const win = [Math.max(0, c0), Math.max(0, r0), Math.min(image.getWidth(), c1 + 1), Math.min(image.getHeight(), r1 + 1)];
    if (win[0] >= win[2] || win[1] >= win[3]) continue;
    let band;
    try {
      // The tile server drops a read now and then: try twice more, a moment apart.
      for (let attempt = 0; ; attempt++) {
        try {
          [band] = await image.readRasters({ window: win, signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
          break;
        } catch (err) {
          if (attempt >= 2) throw err;
          await new Promise((done) => setTimeout(done, 700 * (attempt + 1)));
        }
      }
    } catch {
      throw new UpstreamError('imagery', 'canopy read');
    }
    const ww = win[2] - win[0];
    const wh = win[3] - win[1];
    for (let p = start[t]; p < start[t + 1]; p++) {
      const k = order[p];
      const [col, row] = cell(k);
      const c = col - win[0];
      const r = row - win[1];
      if (c < 0 || r < 0 || c >= ww || r >= wh) continue;
      const v = band[r * ww + c];
      if (v === nodata) continue;
      height[k] = v;
      known[k] = 1;
    }
  }
  return { height, known, failedTiles };
}
