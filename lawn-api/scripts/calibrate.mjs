// Prints how well texture and brightness separate trees from lawn, using the
// canopy map as rough labels: green pixels under >= 3 m canopy are "tree",
// green pixels with no canopy within ~4 m are "open" (mostly lawn).
//
//   node scripts/calibrate.mjs "address" ...
import 'dotenv/config';
import { geocode } from '../lib/geocode.js';
import { findCountyParcel } from '../lib/parcels.js';
import { estimateParcel } from '../lib/estimate.js';
import { detectLawn, SETTINGS } from '../lib/lawn.js';
import { localStats } from '../lib/raster.js';

const pct = (arr, ps) => {
  const s = Float64Array.from(arr).sort();
  return ps.map((p) => (s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1) : '-'));
};

const all = { tree: { std: [], vis: [], cv: [] }, open: { std: [], vis: [], cv: [] } };
for (const input of process.argv.slice(2)) {
  const loc = await geocode(input);
  const parcel = (await findCountyParcel(loc.lat, loc.lon)) ?? (await estimateParcel(loc.lat, loc.lon));
  const { debug } = await detectLawn(parcel.geometry, { debug: true });
  const { grid, naip, canopy, ndvi } = debug;
  const { w, h } = grid;
  const green = new Uint8Array(w * h);
  for (let k = 0; k < green.length; k++) green[k] = debug.parcel[k] && naip.filled[k] && ndvi[k] >= SETTINGS.ndviMin ? 1 : 0;
  const tall = Uint8Array.from(canopy.height, (v, k) => (canopy.known[k] && v >= 1 ? 1 : 0));
  const nearTall = localStats(tall, tall, w, h, 6).mean; // fraction of tall pixels within ~4 m
  const { std, mean } = localStats(naip.nir, green, w, h, SETTINGS.textureRadiusPx);
  for (let k = 0; k < green.length; k++) {
    if (!green[k]) continue;
    const vis = (naip.red[k] + naip.green[k] + naip.blue[k]) / 3;
    const cls = canopy.height[k] >= 3 ? 'tree' : nearTall[k] === 0 ? 'open' : null;
    if (!cls) continue;
    all[cls].std.push(std[k]);
    all[cls].vis.push(vis);
    all[cls].cv.push(mean[k] ? (100 * std[k]) / mean[k] : 0);
  }
}
const ps = [10, 25, 50, 75, 90];
for (const cls of ['tree', 'open']) {
  console.log(`${cls.padEnd(5)} n=${all[cls].std.length}  NIR texture p${ps.join('/p')}: ${pct(all[cls].std, ps).join(' / ')}   brightness: ${pct(all[cls].vis, ps).join(' / ')}   relative texture %: ${pct(all[cls].cv, ps).join(' / ')}`);
}
