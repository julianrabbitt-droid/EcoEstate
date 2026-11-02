// Clean before/after images of public properties for the website and outreach:
// the USDA NAIP photo (public domain), and the same photo with only the lawn
// found (green) and the property line (yellow). Prints each one's numbers.
//
//   node scripts/showcase.mjs <outDir> "<slug>|<address>" ...
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { geocode } from '../lib/geocode.js';
import { refineLocation } from '../lib/addressPoint.js';
import { findCountyParcel } from '../lib/parcels.js';
import { detectLawn } from '../lib/lawn.js';
import { polygonsOf, rasterize } from '../lib/grid.js';
import { blank, fit, paste, png } from './render.mjs';

const [outDir, ...sites] = process.argv.slice(2);
const SIZE = 640;

function edges(mask, w, h, width = 1) {
  const out = new Uint8Array(mask.length);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!mask[k]) continue;
      if (i === 0 || j === 0 || i === w - 1 || j === h - 1 || !mask[k - 1] || !mask[k + 1] || !mask[k - w] || !mask[k + w]) {
        for (let dj = 1 - width; dj < width; dj++) for (let di = 1 - width; di < width; di++) {
          const x = i + di;
          const y = j + dj;
          if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = 1;
        }
      }
    }
  }
  return out;
}

fs.mkdirSync(outDir, { recursive: true });
for (const site of sites) {
  const [slug, address] = site.split('|');
  const found = await geocode(address);
  const loc = await refineLocation(address, found);
  const parcel = await findCountyParcel(loc.lat, loc.lon);
  const result = await detectLawn(parcel.geometry, { debug: true });
  const { grid, naip } = result.debug;
  const { w, h } = grid;
  const lawn = rasterize(grid, result.lawn.features.flatMap((f) => polygonsOf(f.geometry)));
  const lawnEdge = edges(lawn, w, h);
  const lot = edges(result.debug.parcel, w, h, Math.max(1, Math.round(Math.max(w, h) / 400)));
  const photo = blank(w, h);
  const marked = blank(w, h);
  for (let k = 0; k < w * h; k++) {
    const px = [naip.red[k], naip.green[k], naip.blue[k]];
    photo.rgb.set(px, k * 3);
    let m = px;
    if (lawn[k]) m = px.map((v, c) => Math.round(v * 0.45 + [70, 200, 70][c] * 0.55));
    if (lawnEdge[k]) m = [150, 255, 120];
    if (lot[k]) m = [255, 225, 40];
    marked.rgb.set(m, k * 3);
  }
  const a = fit(photo, SIZE);
  const b = fit(marked, SIZE);
  const sheet = blank(a.w * 2 + 12, a.h, 255);
  paste(sheet, a, 0, 0);
  paste(sheet, b, a.w + 12, 0);
  const file = path.join(outDir, `${slug}.png`);
  fs.writeFileSync(file, png(sheet));
  // The API's default impact model (server.js): 45 in/yr reference ET, turf 0.8 → natives 0.3.
  const gallons = Math.round(result.totalSqft * 45 * (0.8 - 0.3) * 0.623);
  console.log(JSON.stringify({ slug, address, lawnSqft: result.totalSqft, lotSqft: parcel.areaSqft, gallons, survey: result.surveyDate, file }));
}
