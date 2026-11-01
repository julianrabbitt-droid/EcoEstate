// Runs lawn detection on a random sample of homes and writes a contact sheet.
//
//   node scripts/test-homes.mjs [count] [seed]
//
// Homes are house-sized building footprints (Overture) drawn evenly from the
// residential neighbourhoods below; each is tested at its centre point, the
// way a rooftop geocode lands. No street addresses are used or stored.
// Writes previews/homes/sheet-<n>.png (overlays), sheet-<n>-photos.png (plain
// imagery, same order) and results.csv.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import turfArea from '@turf/area';
import { buildingsInBox } from '../lib/buildings.js';
import { findCountyParcel } from '../lib/parcels.js';
import { estimateParcel } from '../lib/estimate.js';
import { detectLawn, SETTINGS } from '../lib/lawn.js';
import { blank, fit, overlay, paste, png } from './render.mjs';

// Palo Alto residential neighbourhoods, [west, south, east, north].
const AREAS = {
  'Old Palo Alto': [-122.152, 37.432, -122.138, 37.442],
  'Crescent Park': [-122.162, 37.447, -122.148, 37.457],
  Duveneck: [-122.139, 37.443, -122.126, 37.452],
  Midtown: [-122.131, 37.424, -122.115, 37.434],
  'Barron Park': [-122.143, 37.408, -122.13, 37.418],
  'South Palo Alto': [-122.118, 37.413, -122.103, 37.423],
};
const COUNT = Number(process.argv[2] || 100);
const SEED = Number(process.argv[3] || 7);
const OUT = path.join(import.meta.dirname, '..', 'previews', process.env.HOMES_OUT || 'homes');
const TILE = 220;
const PER_SHEET = 50;

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
  const { photo, marked } = overlay(result, parcel, source);
  // Full-size side-by-side for homes listed in HOMES_DETAIL (e.g. "3,18,25").
  if ((process.env.HOMES_DETAIL || '').split(',').map(Number).includes(n)) {
    const size = Math.max(photo.w, photo.h) * 3;
    const pair = blank(photo.w * 3 * 2 + 16, photo.h * 3);
    paste(pair, fit(photo, size), 0, 0);
    paste(pair, fit(marked, size), photo.w * 3 + 16, 0);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `home-${n}.png`), png(pair));
  }
  return {
    n,
    area: home.area,
    source,
    lotSqft: parcel.areaSqft,
    lawnSqft: result.totalSqft,
    lawns: result.lawn.features.length,
    lawnShare: parcel.areaSqft ? result.totalSqft / parcel.areaSqft : 0,
    surveyDate: result.surveyDate,
    seconds: (Date.now() - t) / 1000,
    photo: fit(photo, TILE - 8),
    marked: fit(marked, TILE - 8),
  };
}

// Experiment overrides, e.g. CANOPY_GROW_M=0.
if (process.env.CANOPY_GROW_M) SETTINGS.canopyGrowM = Number(process.env.CANOPY_GROW_M);

const homes = await sample();
console.log(`sampled ${homes.length} homes`);
const results = new Array(homes.length);
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < homes.length) {
      const i = next++;
      try {
        results[i] = await test(homes[i], i + 1);
      } catch (err) {
        results[i] = { n: i + 1, area: homes[i].area, error: err.code || err.message };
      }
      const r = results[i];
      console.log(`#${String(i + 1).padStart(3)} ${r.area.padEnd(16)} ${r.error ? `ERROR ${r.error}` : `${r.source.padEnd(9)} lot ${String(r.lotSqft).padStart(6)}  lawn ${String(r.lawnSqft).padStart(5)}  ${r.seconds.toFixed(1)}s`}`);
    }
  })
);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'results.csv'),
  ['n,area,source,lot_sqft,lawn_sqft,lawn_polygons,lawn_share,survey_date,seconds,error']
    .concat(results.map((r) => [r.n, r.area, r.source ?? '', r.lotSqft ?? '', r.lawnSqft ?? '', r.lawns ?? '', r.lawnShare?.toFixed(3) ?? '', r.surveyDate ?? '', r.seconds?.toFixed(1) ?? '', r.error ?? ''].join(',')))
    .join('\n') + '\n'
);

// Contact sheets, 10 per row. Tile n sits at the same spot on both sheets.
for (let s = 0; s * PER_SHEET < results.length; s++) {
  const chunk = results.slice(s * PER_SHEET, (s + 1) * PER_SHEET);
  for (const kind of ['marked', 'photo']) {
    const sheet = blank(TILE * 10, TILE * Math.ceil(chunk.length / 10), 245);
    chunk.forEach((r, i) => {
      const x = (i % 10) * TILE + 4;
      const y = Math.floor(i / 10) * TILE + 4;
      if (r[kind]) paste(sheet, r[kind], x, y);
    });
    const name = `sheet-${s * PER_SHEET + 1}-${s * PER_SHEET + chunk.length}${kind === 'photo' ? '-photos' : ''}.png`;
    fs.writeFileSync(path.join(OUT, name), png(sheet));
  }
}

const ok = results.filter((r) => !r.error);
const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
console.log(`\n${ok.length}/${results.length} measured · county ${ok.filter((r) => r.source === 'county').length} · estimated ${ok.filter((r) => r.source === 'estimated').length}`);
console.log(`median lot ${median(ok.map((r) => r.lotSqft))} sq ft · median lawn ${median(ok.map((r) => r.lawnSqft))} sq ft · no lawn found: ${ok.filter((r) => r.lawnSqft === 0).length} · median time ${median(ok.map((r) => r.seconds)).toFixed(1)}s`);
