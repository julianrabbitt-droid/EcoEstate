// USDA NAIP aerial imagery (red, green, blue, near-infrared) from Microsoft
// Planetary Computer: STAC search for the newest survey, a free anonymous SAS
// token for the blob storage, and windowed reads of the Cloud-Optimized
// GeoTIFFs with geotiff.js so only the pixels around the property are fetched.
import { fromUrl } from 'geotiff';
import { affineTo, crsForEpsg } from './grid.js';
import { ApiError, UpstreamError } from './errors.js';

const STAC_SEARCH = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
const SAS_URL = 'https://planetarycomputer.microsoft.com/api/sas/v1/token/naip';

let sas = null; // { token, expires }
const tiffs = new Map(); // href -> { token, tiff }

async function sasToken() {
  if (sas && sas.expires - Date.now() > 5 * 60 * 1000) return sas.token;
  let r;
  try {
    r = await fetch(SAS_URL, { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new UpstreamError('imagery', 'network');
  }
  if (!r.ok) throw new UpstreamError('imagery', r.status);
  const data = await r.json();
  sas = { token: data.token, expires: Date.parse(data['msft:expiry']) };
  return sas.token;
}

async function openTiff(href) {
  const token = await sasToken();
  const cached = tiffs.get(href);
  if (cached?.token === token) return cached.tiff;
  let tiff;
  try {
    tiff = await fromUrl(`${href}?${token}`);
  } catch {
    throw new UpstreamError('imagery', 'open');
  }
  tiffs.set(href, { token, tiff });
  return tiff;
}

const epsgOf = (item) => item.properties['proj:epsg'] ?? Number(String(item.properties['proj:code'] ?? '').replace('EPSG:', ''));
const yearOf = (item) => Number(item.properties['naip:year'] ?? item.properties.datetime.slice(0, 4));

/** The most recent NAIP survey covering a lon/lat box: [{ href, epsg, date }]. */
export async function findNaip(box) {
  const [w, s, e, n] = box;
  let r;
  try {
    r = await fetch(STAC_SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collections: ['naip'],
        intersects: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
        sortby: [{ field: 'datetime', direction: 'desc' }],
        limit: 50,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new UpstreamError('imagery', 'network');
  }
  if (!r.ok) throw new UpstreamError('imagery', r.status);
  const items = (await r.json()).features ?? [];
  if (!items.length) throw new ApiError(404, 'imagery_not_found', 'No aerial imagery is available for this location.');
  const year = Math.max(...items.map(yearOf));
  return items
    .filter((it) => yearOf(it) === year)
    .map((it) => ({ href: it.assets.image.href, epsg: epsgOf(it), gsd: it.properties.gsd, date: it.properties.datetime.slice(0, 10) }));
}

// Cloud-Optimized GeoTIFFs carry reduced-resolution copies (overviews). For a
// coarse grid (large properties), read the coarsest one that is still at least
// as detailed as the grid instead of every full-resolution pixel.
async function pickLevel(tiff, targetRes) {
  const base = await tiff.getImage(0);
  const [ox, oy] = base.getOrigin();
  const [bx, by] = base.getResolution();
  let best = { image: base, ox, oy, rx: bx, ry: by };
  const count = await tiff.getImageCount();
  for (let i = 1; i < count; i++) {
    const image = await tiff.getImage(i);
    const scale = base.getWidth() / image.getWidth();
    if (Math.abs(bx) * scale > targetRes * 1.05) break; // overviews get coarser as i grows
    best = { image, ox, oy, rx: bx * scale, ry: by * scale };
  }
  return best;
}

/**
 * Read NAIP bands onto the grid. Returns { red, nir, rgb, dates } where red/nir
 * are Uint8 per pixel (0 = no data) and rgb is interleaved for previews.
 */
export async function readNaip(grid, items) {
  const n = grid.w * grid.h;
  const bands = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)];
  const filled = new Uint8Array(n);
  const dates = new Set();

  for (const item of items) {
    const { image, ox, oy, rx, ry } = await pickLevel(await openTiff(item.href), grid.res);
    const W = image.getWidth();
    const H = image.getHeight();
    const toItem = affineTo(grid, crsForEpsg(item.epsg));
    // Item pixel coordinates of every grid pixel, and the window that covers them.
    const ci = new Float64Array(n);
    const cj = new Float64Array(n);
    let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for (let j = 0; j < grid.h; j++) {
      for (let i = 0; i < grid.w; i++) {
        const [x, y] = toItem(i, j);
        const col = (x - ox) / rx;
        const row = (y - oy) / ry;
        const k = j * grid.w + i;
        ci[k] = col;
        cj[k] = row;
        c0 = Math.min(c0, col); c1 = Math.max(c1, col); r0 = Math.min(r0, row); r1 = Math.max(r1, row);
      }
    }
    const win = [Math.max(0, Math.floor(c0)), Math.max(0, Math.floor(r0)), Math.min(W, Math.ceil(c1) + 1), Math.min(H, Math.ceil(r1) + 1)];
    if (win[0] >= win[2] || win[1] >= win[3]) continue;
    let data;
    try {
      data = await image.readRasters({ window: win, interleave: false });
    } catch {
      throw new UpstreamError('imagery', 'read');
    }
    const ww = win[2] - win[0];
    let used = false;
    for (let k = 0; k < n; k++) {
      if (filled[k]) continue;
      const col = Math.floor(ci[k]) - win[0];
      const row = Math.floor(cj[k]) - win[1];
      if (col < 0 || row < 0 || col >= ww || row >= win[3] - win[1]) continue;
      const p = row * ww + col;
      if (!data[0][p] && !data[1][p] && !data[2][p] && !data[3][p]) continue; // NAIP no-data
      for (let b = 0; b < 4; b++) bands[b][k] = data[b][p];
      filled[k] = 1;
      used = true;
    }
    if (used) dates.add(item.date);
  }
  return { red: bands[0], green: bands[1], blue: bands[2], nir: bands[3], filled, dates: [...dates].sort() };
}
