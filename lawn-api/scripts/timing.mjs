// Where a scan's time goes: each data source timed on its own, then the whole
// detection, for one address.   node scripts/timing.mjs "<address>"
import 'dotenv/config';
import { geocode } from '../lib/geocode.js';
import { refineLocation } from '../lib/addressPoint.js';
import { findCountyParcel } from '../lib/parcels.js';
import { findNaip, readNaip } from '../lib/naip.js';
import { readCanopy } from '../lib/canopy.js';
import { lidarPoints } from '../lib/lidar.js';
import { buildingsInBox, segmentsInBox } from '../lib/buildings.js';
import { osmLawnShapes } from '../lib/osmLawns.js';
import { makeGrid } from '../lib/grid.js';
import { detectLawn } from '../lib/lawn.js';

const address = process.argv[2];
const time = async (label, fn) => {
  const t = Date.now();
  try {
    const r = await fn();
    console.log(`${label.padEnd(16)} ${String(Date.now() - t).padStart(6)} ms`);
    return r;
  } catch (err) {
    console.log(`${label.padEnd(16)} ${String(Date.now() - t).padStart(6)} ms  FAILED ${err.message}`);
    return null;
  }
};
const found = await time('geocode', () => geocode(address));
const loc = await time('address point', () => refineLocation(address, found));
const parcel = await time('parcel', () => findCountyParcel(loc.lat, loc.lon));
const ring = parcel.geometry.type === 'Polygon' ? parcel.geometry.coordinates[0] : parcel.geometry.coordinates[0][0];
const box = [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))];
const items = await time('naip search', () => findNaip(box));
const grid = makeGrid(items[0].epsg, items[0].gsd || 0.6, box);
const wide = [box[0] - 0.0005, box[1] - 0.0005, box[2] + 0.0005, box[3] + 0.0005];
await Promise.all([
  time('naip read', () => readNaip(grid, items)),
  time('naip previous', () => readNaip(grid, items.filter((it) => it.year !== items[0].year).slice(0, 1))),
  time('canopy', () => readCanopy(grid)),
  time('lidar', () => lidarPoints(box)),
  time('buildings', () => buildingsInBox(box)),
  time('road segments', () => segmentsInBox(wide)),
  time('osm lawns', () => osmLawnShapes(wide)),
]);
await time('detect (warm)', () => detectLawn(parcel.geometry));
process.exit(0);
