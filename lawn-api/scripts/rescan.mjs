// Rescan homes from a city-test log with the current scanner and print the
// checks, to try a change on the homes it should fix before a whole run.
//
//   node scripts/rescan.mjs <log.jsonl> <n,n,...> [outDir]
//
// n is the home's line in the log (from 1). With outDir, the scans are written
// there as <n>.json and <n>.png in the API's shape, like city-test.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { findCountyParcel } from '../lib/parcels.js';
import { detectLawn } from '../lib/lawn.js';
import { diagnose, reasonImage } from './scan-diagnose.mjs';

const [logPath, which, outDir] = process.argv.slice(2);
const rows = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (outDir) fs.mkdirSync(outDir, { recursive: true });
for (const n of which.split(',').map(Number)) {
  const row = rows[n - 1];
  if (!row) continue;
  const t = Date.now();
  try {
    const parcel = await findCountyParcel(row.lat, row.lon);
    const r = await detectLawn(parcel.geometry, { debug: true });
    const diag = diagnose(r);
    const { houses, ...lawnChecks } = diag;
    const out = {
      n,
      address: row.address,
      lawn: [row.lawnSqft, r.totalSqft],
      pools: [row.poolSqft, (r.pools?.features || []).map((f) => f.properties.areaSqft)],
      paved: [row.pavedSqft, r.paved.features.reduce((a, f) => a + f.properties.areaSqft, 0)],
      lidar: r.lidar?.source,
      lawnChecks,
      houses: houses?.houses?.map((h) => ({ sqft: h.sqft, ft: h.heightFt, lidarFt: h.lidarTopFt, cov: h.coverage, src: h.heightSource, levels: h.levels })),
      spill: houses?.spillSqft,
      seconds: (Date.now() - t) / 1000,
    };
    console.log(JSON.stringify(out));
    if (outDir) {
      const { debug: _debug, ...api } = r;
      const why = reasonImage(r);
      fs.writeFileSync(path.join(outDir, `${n}.why.png`), why.png);
      fs.writeFileSync(path.join(outDir, `${n}.json`), JSON.stringify({ ...api, whyImage: { west: why.west, south: why.south, east: why.east, north: why.north }, address: row.address, location: { lat: row.lat, lon: row.lon }, parcel, lawnSqft: r.totalSqft, groundImage: r.groundImage ? { west: r.groundImage.west, south: r.groundImage.south, east: r.groundImage.east, north: r.groundImage.north } : null }));
      if (r.groundImage?.png) fs.writeFileSync(path.join(outDir, `${n}.png`), Buffer.from(r.groundImage.png, 'base64'));
    }
  } catch (err) {
    console.log(JSON.stringify({ n, address: row.address, error: err.message }));
  }
}
process.exit(0);
