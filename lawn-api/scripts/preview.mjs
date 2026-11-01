// Renders lawn detections over the NAIP imagery so accuracy can be judged by eye.
//
//   node scripts/preview.mjs "123 Main St, Santa Barbara, CA" "34.42,-119.70" ...
//
// Writes previews/<slug>.png: left = NAIP photo, right = detected lawn (green),
// removed by the canopy map (purple), removed as tree texture (blue), property
// line (yellow, or orange when estimated), building footprint (cyan).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { geocode } from '../lib/geocode.js';
import { findCountyParcel } from '../lib/parcels.js';
import { estimateParcel } from '../lib/estimate.js';
import { placeByName } from '../lib/places.js';
import { detectLawn } from '../lib/lawn.js';
import { blank, fit, overlay, paste, png } from './render.mjs';

const OUT = path.join(import.meta.dirname, '..', 'previews');
const SCALE = 2;

async function run(input) {
  // "box:west,south,east,north" previews a rectangle (to zoom into part of a campus).
  if (input.startsWith('box:')) {
    const [w, sth, e, n] = input.slice(4).split(',').map(Number);
    const geometry = { type: 'Polygon', coordinates: [[[w, sth], [e, sth], [e, n], [w, n], [w, sth]]] };
    return render(input, { lat: (sth + n) / 2, lon: (w + e) / 2, label: input }, { id: input, areaSqft: 0, geometry }, 'place');
  }
  // "place:UCSB" previews a named place's whole outline, as the app does when one is picked.
  if (input.startsWith('place:')) {
    const place = await placeByName(input.slice(6));
    if (!place?.boundary) throw new Error('no place outline found');
    return render(input, { lat: place.lat, lon: place.lon, label: place.label }, place.boundary, 'place');
  }
  const m = input.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  const loc = m ? { lat: Number(m[1]), lon: Number(m[2]), label: input } : await geocode(input);
  if (!loc) throw new Error('address not found');
  let parcel = await findCountyParcel(loc.lat, loc.lon);
  let source = 'county';
  if (!parcel) {
    parcel = await estimateParcel(loc.lat, loc.lon);
    source = 'estimated';
  }
  return render(input, loc, parcel, source);
}

async function render(input, loc, parcel, source) {
  const t = Date.now();
  const result = await detectLawn(parcel.geometry, { debug: true });
  const { photo, marked } = overlay(result, parcel, source);
  const size = Math.max(photo.w, photo.h) * SCALE;
  const sheet = blank(photo.w * SCALE * 2 + 16, photo.h * SCALE);
  paste(sheet, fit(photo, size), 0, 0);
  paste(sheet, fit(marked, size), photo.w * SCALE + 16, 0);
  fs.mkdirSync(OUT, { recursive: true });
  const slug = input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const file = path.join(OUT, `${slug}.png`);
  fs.writeFileSync(file, png(sheet));

  console.log(JSON.stringify({
    input, geocoded: loc.label, accuracy: loc.accuracy, parcelSource: source, parcelId: parcel.id, parcelSqft: parcel.areaSqft,
    lawnSqft: result.totalSqft, lawns: result.lawn.features.length, rectangles: result.lawn.features.filter((f) => f.geometry.coordinates[0].length <= 6).length, buildings: result.buildings.features.length, heightSources: Object.entries(result.buildings.features.reduce((m, f) => ((m[f.properties.heightSource] = (m[f.properties.heightSource] || 0) + 1), m), {})).map(([k, v]) => `${k}:${v}`).join(' '), trees: result.trees.length, mappedShapes: result.templatesUsed, surveyDate: result.surveyDate,
    canopyCoverage: Number(result.canopyCoverage.toFixed(2)), naipMs: result.debug.naip.ms, canopyMs: result.debug.canopy.ms, seconds: (Date.now() - t) / 1000, file: path.relative(process.cwd(), file),
  }));
}

for (const input of process.argv.slice(2)) {
  try {
    await run(input);
  } catch (err) {
    console.log(JSON.stringify({ input, error: err.code || err.name, message: err.message }));
  }
}
