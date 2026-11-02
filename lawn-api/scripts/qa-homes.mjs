// Accuracy check for lawn detection on a random sample of homes, judged by eye
// against sharper, more recent aerial photos than the NAIP the detector uses.
//
//   node scripts/qa-homes.mjs [count] [seed]
//
// For each home writes previews/<QA_OUT|qa>/home-<n>.png with three panels:
// the Esri World Imagery photo of the lot, the same photo with the detected
// lawn outlined (green) and the property line (yellow), and the NAIP overlay
// from preview.mjs (lawn green, trees purple/blue, buildings cyan, crowns
// magenta). results.json holds the numbers. Imagery is only looked at here; it
// is never fed into detection. No street addresses are used or stored.
//
// QA_ONLY="3,18" reruns just those homes (same sample, same numbering);
// QA_POINTS="lat,lon;lat,lon" checks particular points instead.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import turfArea from '@turf/area';
import { buildingsInBox } from '../lib/buildings.js';
import { geocode } from '../lib/geocode.js';
import { refineLocation } from '../lib/addressPoint.js';
import { findCountyParcel } from '../lib/parcels.js';
import { estimateParcel } from '../lib/estimate.js';
import { detectLawn, SETTINGS } from '../lib/lawn.js';
import { polygonsOf } from '../lib/grid.js';
import { blank, decodePng, fit, overlay, paste, png } from './render.mjs';

// Palo Alto residential neighbourhoods, [west, south, east, north].
const AREAS = {
  'Old Palo Alto': [-122.152, 37.432, -122.138, 37.442],
  'Crescent Park': [-122.162, 37.447, -122.148, 37.457],
  Duveneck: [-122.139, 37.443, -122.126, 37.452],
  Midtown: [-122.131, 37.424, -122.115, 37.434],
  'Barron Park': [-122.143, 37.408, -122.13, 37.418],
  'South Palo Alto': [-122.118, 37.413, -122.103, 37.423],
  'College Terrace': [-122.152, 37.421, -122.141, 37.428],
  'Palo Verde': [-122.108, 37.425, -122.096, 37.433],
  'Green Acres': [-122.128, 37.399, -122.117, 37.407],
  'Downtown North': [-122.168, 37.446, -122.158, 37.452],
};
const COUNT = Number(process.argv[2] || 100);
const SEED = Number(process.argv[3] || 11);
const OUT = path.join(import.meta.dirname, '..', 'previews', process.env.QA_OUT || 'qa');
const ONLY = (process.env.QA_ONLY || '').split(',').filter(Boolean).map(Number);
const PANEL = 440;

function random(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const centre = (g) => {
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
  const pts = ring.slice(0, -1);
  return [pts.reduce((a, p) => a + p[1], 0) / pts.length, pts.reduce((a, p) => a + p[0], 0) / pts.length];
};

async function sample() {
  const rand = random(SEED);
  const names = Object.keys(AREAS);
  const homes = [];
  for (const [idx, name] of names.entries()) {
    const want = Math.floor(COUNT / names.length) + (idx < COUNT % names.length ? 1 : 0);
    const houses = (await buildingsInBox(AREAS[name])).filter((b) => {
      const m2 = turfArea(b.geometry);
      return m2 >= 120 && m2 <= 450;
    });
    for (let i = houses.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [houses[i], houses[j]] = [houses[j], houses[i]];
    }
    for (const b of houses.slice(0, want)) homes.push({ area: name, point: centre(b.geometry) });
  }
  return homes;
}

// ---- Esri photo of the same ground ----

// Esri's cached tiles (zoom 20, ~0.12 m per pixel here) stitched over the box.
// Tiles are JPEG; macOS sips turns each into a PNG we can read.
const TILE_DIR = path.join(os.tmpdir(), 'ecoestate-qa-tiles');
async function tile(z, x, y) {
  fs.mkdirSync(TILE_DIR, { recursive: true });
  const png = path.join(TILE_DIR, `${z}-${x}-${y}.png`);
  if (!fs.existsSync(png)) {
    let r;
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
      if (r?.ok) break;
      await new Promise((done) => setTimeout(done, 1000 * (attempt + 1)));
    }
    if (!r?.ok) throw new Error(`esri tile ${r?.status ?? 'unreachable'}`);
    const jpg = png.replace(/png$/, 'jpg');
    fs.writeFileSync(jpg, Buffer.from(await r.arrayBuffer()));
    execFileSync('sips', ['-s', 'format', 'png', jpg, '--out', png], { stdio: 'ignore' });
  }
  return decodePng(fs.readFileSync(png));
}

async function esriPhoto(lonLatBox, maxSize) {
  // The most detailed zoom that doesn't need more than about twice the panel's pixels.
  let z = Number(process.env.QA_MAXZOOM || 20); // some areas only have imagery to zoom 18
  while (z > 14 && ((lonLatBox[2] - lonLatBox[0]) / 360) * 2 ** z * 256 > 2 * maxSize) z--;
  const n = 2 ** z;
  const gx = (lon) => ((lon + 180) / 360) * n * 256;
  const gy = (lat) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n * 256;
  const [x0, x1] = [gx(lonLatBox[0]), gx(lonLatBox[2])];
  const [y0, y1] = [gy(lonLatBox[3]), gy(lonLatBox[1])];
  const out = blank(Math.ceil(x1 - x0), Math.ceil(y1 - y0), 0);
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor(y1 / 256); ty++) {
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor(x1 / 256); tx++) {
      paste(out, await tile(z, tx, ty), Math.round(tx * 256 - x0), Math.round(ty * 256 - y0));
    }
  }
  const img = Math.max(out.w, out.h) > maxSize ? fit(out, maxSize) : out;
  const sx = img.w / out.w;
  const sy = img.h / out.h;
  return { img, toPx: ([lon, lat]) => [(gx(lon) - x0) * sx, (gy(lat) - y0) * sy] };
}

function drawRings(img, toPx, rings, color, width = 1) {
  const dot = (x, y) => {
    for (let dy = -width + 1; dy < width; dy++) {
      for (let dx = -width + 1; dx < width; dx++) {
        const i = Math.round(x) + dx;
        const j = Math.round(y) + dy;
        if (i >= 0 && j >= 0 && i < img.w && j < img.h) img.rgb.set(color, (j * img.w + i) * 3);
      }
    }
  };
  for (const ring of rings) {
    for (let k = 1; k < ring.length; k++) {
      const [ax, ay] = toPx(ring[k - 1]);
      const [bx, by] = toPx(ring[k]);
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let s = 0; s <= steps; s++) dot(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
    }
  }
}

async function test(home, n) {
  const [lat, lon] = home.point;
  const t = Date.now();
  let parcel = await findCountyParcel(lat, lon);
  let source = 'county';
  if (!parcel) {
    parcel = await estimateParcel(lat, lon);
    source = 'estimated';
  }
  const result = await detectLawn(parcel.geometry, { debug: true });
  const seconds = (Date.now() - t) / 1000;
  const { marked } = overlay(result, parcel, source);
  const { grid } = result.debug;
  // The detection grid's extent in lon/lat, so the Esri photo shows the same ground.
  const corners = [
    grid.toLonLat([grid.x0, grid.y0]),
    grid.toLonLat([grid.x0 + grid.w * grid.res, grid.y0]),
    grid.toLonLat([grid.x0, grid.y0 - grid.h * grid.res]),
    grid.toLonLat([grid.x0 + grid.w * grid.res, grid.y0 - grid.h * grid.res]),
  ];
  const box = [Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1]))];
  const sheet = blank(PANEL * 3 + 16, PANEL, 255);
  try {
    const { img, toPx } = await esriPhoto(box, PANEL * 2);
    const plain = fit(img, PANEL);
    const lined = { w: img.w, h: img.h, rgb: img.rgb.slice() };
    drawRings(lined, toPx, polygonsOf(parcel.geometry).flat(), [255, 230, 0], 2);
    drawRings(lined, toPx, result.lawn.features.flatMap((f) => polygonsOf(f.geometry)).flat(), [20, 255, 40], 2);
    for (const b of result.buildings.features) drawRings(lined, toPx, polygonsOf(b.geometry).flat(), [0, 200, 255], 1);
    paste(sheet, plain, 0, 0);
    paste(sheet, fit(lined, PANEL), PANEL + 8, 0);
  } catch (err) {
    console.warn(`#${n} esri: ${err.message}`);
  }
  paste(sheet, fit(marked, PANEL), PANEL * 2 + 16, 0);
  fs.writeFileSync(path.join(OUT, `home-${n}.png`), png(sheet));
  return {
    n,
    area: home.area,
    point: home.point.map((v) => Number(v.toFixed(6))),
    source,
    lotSqft: parcel.areaSqft,
    lawnSqft: result.totalSqft,
    lawns: result.lawn.features.length,
    underCanopySqft: result.lidar?.underCanopySqft ?? null,
    lidar: result.lidar ? `${result.lidar.source}${result.lidar.grassCalibrated ? '' : ' (uncalibrated)'}` : null,
    surveyDate: result.surveyDate,
    seconds,
  };
}

for (const [k, v] of Object.entries(process.env)) {
  // Experiment overrides: QA_SET_underCanopyReachM=6 sets SETTINGS.underCanopyReachM.
  if (k.startsWith('QA_SET_')) SETTINGS[k.slice(7)] = Number(v);
}

fs.mkdirSync(OUT, { recursive: true });
// QA_POINTS="34.11451,-117.80084;37.4474,-122.1423" checks these points instead of a sample;
// QA_ADDRESSES="250 Hamilton Ave, Palo Alto, CA|1100 Anacapa St, Santa Barbara, CA" checks
// addresses, located the way the API does (geocoded, then moved onto the address point).
async function located(address) {
  const found = await geocode(address);
  if (!found) throw new Error(`not found: ${address}`);
  const loc = await refineLocation(address, found);
  return { area: address.split(',')[0], point: [loc.lat, loc.lon] };
}
const homes = process.env.QA_ADDRESSES
  ? await Promise.all(process.env.QA_ADDRESSES.split('|').map(located))
  : process.env.QA_POINTS
    ? process.env.QA_POINTS.split(';').map((p) => ({ area: 'Point', point: p.split(',').map(Number) }))
    : await sample();
console.log(`sampled ${homes.length} homes`);
const file = path.join(OUT, 'results.json');
const results = ONLY.length && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : new Array(homes.length).fill(null);
const todo = homes.map((_, i) => i).filter((i) => !ONLY.length || ONLY.includes(i + 1));
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < todo.length) {
      const i = todo[next++];
      try {
        results[i] = await test(homes[i], i + 1);
      } catch (err) {
        results[i] = { n: i + 1, area: homes[i].area, point: homes[i].point, error: err.code || err.message };
      }
      const r = results[i];
      console.log(`#${String(i + 1).padStart(3)} ${r.area.padEnd(16)} ${r.error ? `ERROR ${r.error}` : `${r.source.padEnd(9)} lot ${String(r.lotSqft).padStart(6)}  lawn ${String(r.lawnSqft).padStart(5)}  under trees ${String(r.underCanopySqft ?? '-').padStart(5)}  ${r.seconds.toFixed(1)}s`}`);
    }
  })
);
fs.writeFileSync(file, JSON.stringify(results, null, 1));

const ok = results.filter((r) => r && !r.error);
const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
console.log(`\n${ok.length}/${results.length} measured · median lawn ${median(ok.map((r) => r.lawnSqft))} sq ft · none found ${ok.filter((r) => r.lawnSqft === 0).length} · median time ${median(ok.map((r) => r.seconds)).toFixed(1)}s`);
