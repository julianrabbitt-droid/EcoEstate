// Scan many homes across a city and record how each scan went, for checking
// the scanner before outreach to that city. Homes are drawn from Overture's
// address points in small boxes spread over the city (one per box), scanned on
// the county parcel at the point (no paid geocoding), and kept when they look
// like a house lot: one to three buildings on under half an acre.
//
//   node scripts/city-test.mjs <slug> <west,south,east,north> <count> <outDir>
//
// Writes <outDir>/<slug>.jsonl (one line per home: lawn, paving, buildings,
// roads, trees, seconds, or the error) and <outDir>/<slug>/<n>.json scan files
// in the API's shape, which scripts/layout-check.mjs (repo root) reads.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { addressesInBox } from '../lib/buildings.js';
import { findCountyParcel } from '../lib/parcels.js';
import { detectLawn } from '../lib/lawn.js';

const [slug, bboxArg, countArg, outDir] = process.argv.slice(2);
const [west, south, east, north] = bboxArg.split(',').map(Number);
const count = Number(countArg) || 100;
const MAX_LOT_SQFT = 21780; // half an acre
fs.mkdirSync(path.join(outDir, slug), { recursive: true });
const log = fs.createWriteStream(path.join(outDir, `${slug}.jsonl`), { flags: 'a' });

// Seeded, so a rerun tests the same homes.
let seed = ([...slug].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7) % 2147483646) + 1; // never 0, which this generator can't leave
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const seen = new Set();
let done = 0;
let tries = 0;
while (done < count && tries < count * 8) {
  tries++;
  const x = west + random() * (east - west);
  const y = south + random() * (north - south);
  const box = [x - 0.0012, y - 0.0009, x + 0.0012, y + 0.0009];
  let points;
  try {
    points = await addressesInBox(box);
  } catch {
    continue;
  }
  const homes = points.filter((p) => !p.unit);
  const pick = homes[Math.floor(random() * homes.length)];
  if (!pick) continue;
  const address = `${pick.number} ${pick.street}`;
  if (seen.has(address)) continue;
  seen.add(address);
  const t = Date.now();
  const row = { address, lat: pick.lat, lon: pick.lon };
  try {
    const parcel = await findCountyParcel(pick.lat, pick.lon);
    if (!parcel || parcel.areaSqft > MAX_LOT_SQFT) continue;
    const r = await detectLawn(parcel.geometry);
    const ownBuildings = r.buildings?.features?.length || 0;
    if (ownBuildings < 1 || ownBuildings > 3) continue;
    Object.assign(row, {
      ok: true,
      lotSqft: parcel.areaSqft,
      lawnSqft: r.totalSqft,
      lawnAreas: r.lawn.features.length,
      pavedSqft: r.paved.features.reduce((a, f) => a + f.properties.areaSqft, 0),
      buildings: ownBuildings,
      heightFt: r.buildings.features[0]?.properties?.heightFt ?? null,
      heightSource: r.buildings.features[0]?.properties?.heightSource ?? null,
      pools: r.pools?.features?.length || 0,
      fences: r.fences?.features?.length || 0,
      roads: r.nearbyRoads?.features?.length || 0,
      trees: r.trees.length,
      survey: r.surveyDate,
      seconds: Math.round((Date.now() - t) / 100) / 10,
    });
    done++;
    fs.writeFileSync(path.join(outDir, slug, `${done}.json`), JSON.stringify({ address, location: { lat: pick.lat, lon: pick.lon }, parcel, lawnSqft: r.totalSqft, lawn: r.lawn, paved: r.paved, buildings: r.buildings, trees: r.trees, nearbyRoads: r.nearbyRoads }));
  } catch (err) {
    Object.assign(row, { ok: false, error: err.message, seconds: Math.round((Date.now() - t) / 100) / 10 });
    done++;
  }
  log.write(`${JSON.stringify(row)}\n`);
  console.log(slug, done, row.ok ? `${row.lawnSqft} sq ft lawn, ${row.pavedSqft} paved, ${row.seconds}s` : `FAILED ${row.error}`, address);
}
log.end();
process.exit(0);
