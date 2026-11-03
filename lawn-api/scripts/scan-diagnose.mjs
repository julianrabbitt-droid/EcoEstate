// Checks of one scan against its own survey layers, shared by the city test
// and the rescans of single homes (scripts/rescan.mjs).
import { polygonsOf, rasterize } from '../lib/grid.js';
import { png } from './render.mjs';

// What may be wrong with a scan, measured against its own survey layers
// (square feet unless noted): green ground left out of the lawn, lawn that
// isn't green, paving over plants or roofs, lawn on a roof or in a pool, pool
// water missed, and bare ground left unclaimed.
export function diagnose(r) {
  const d = r.debug;
  if (!d) return null;
  const { grid, naip, ndvi, parcel, roofs, trees, canopy, tall } = d;
  const n = grid.w * grid.h;
  const pxSqft = grid.res * grid.res * 10.7639;
  const raster = (fc) => rasterize(grid, (fc?.features || []).flatMap((f) => polygonsOf(f.geometry)));
  const lawn = raster(r.lawn);
  const paved = raster(r.paved);
  const pools = raster(r.pools);
  const sum = { missedGreen: 0, missedRough: 0, missedLumpy: 0, missedSmall: 0, missedOther: 0, lawnLumpy: 0, lawnBrown: 0, pavedGreen: 0, pavedOnRoof: 0, lawnOnRoof: 0, lawnInPool: 0, blueMissed: 0, bareUnclaimed: 0, lot: 0, roof: 0, tree: 0 };
  for (let k = 0; k < n; k++) {
    if (!parcel[k]) continue;
    sum.lot++;
    const roof = roofs[k] > 0;
    if (roof) sum.roof++;
    if (trees[k]) sum.tree++;
    const [R, G, B] = [naip.red[k], naip.green[k], naip.blue[k]];
    const low = !tall?.[k] && (!canopy.known[k] || canopy.height[k] < 1.5);
    if (lawn[k] && roof) sum.lawnOnRoof++;
    if (lawn[k] && pools[k]) sum.lawnInPool++;
    if (paved[k] && roof) sum.pavedOnRoof++;
    if (paved[k] && ndvi[k] >= 0.25) sum.pavedGreen++;
    if (lawn[k] && ndvi[k] < 0.12) sum.lawnBrown++;
    if (lawn[k] && d.measured?.known[k] && !d.measured.flat[k]) sum.lawnLumpy++;
    if (roof || trees[k] || lawn[k] || pools[k]) continue;
    if (low && ndvi[k] >= 0.3) {
      sum.missedGreen++;
      // Why it was left out: a crown-like texture, the laser seeing groundcover
      // or beds (not mown grass), kept as green but dropped as a fragment, or
      // none of those (thresholds, shade, the majority filter).
      if (d.rough?.[k]) sum.missedRough++;
      else if (d.measured?.known[k] && !d.measured.flat[k]) sum.missedLumpy++;
      else if (d.green?.[k]) sum.missedSmall++;
      else sum.missedOther++;
    }
    if (!paved[k] && B > R * 1.3 && G > R * 1.45 && B > 80 && ndvi[k] < 0) sum.blueMissed++; // turquoise: pool water, not blue-grey shade
    if (!paved[k] && low && ndvi[k] < 0.12 && (R + G + B) / 3 > 90) sum.bareUnclaimed++;
  }
  const out = {};
  for (const [k, v] of Object.entries(sum)) out[k] = Math.round(v * pxSqft);
  // How regular the paving is: area over the area of a circle with its perimeter (1 = round, small = ragged).
  out.pavedRagged = (r.paved?.features || []).filter((f) => {
    const ring = polygonsOf(f.geometry)[0]?.[0] || [];
    let per = 0;
    for (let i = 1; i < ring.length; i++) per += Math.hypot((ring[i][0] - ring[i - 1][0]) * 111320 * Math.cos((ring[i][1] * Math.PI) / 180), (ring[i][1] - ring[i - 1][1]) * 110540);
    const areaM2 = f.properties.areaSqft / 10.7639;
    return per > 0 && (4 * Math.PI * areaM2) / (per * per) < 0.18;
  }).length;
  out.res = grid.res;
  out.houses = diagnoseHouses(r, pxSqft);
  return out;
}

// The scanned and modelled house against the survey (USGS lidar): how much of
// the footprint really is building, building just outside it the footprint
// missed, the height used against the lidar roof, and the roof's shape (levels,
// flat share) and the lot's slope, for sorting scans by house type.
function diagnoseHouses(r, pxSqft) {
  const d = r.debug;
  const { grid, lidar, roofs, ndvi, parcel, under, ownCount } = d;
  const measured = d.measuredB || d.measured;
  if (!lidar || !measured) return null;
  const { w, h } = grid;
  const n = w * h;
  const top = new Float32Array(n).fill(-Infinity); // highest non-plant return above the ground, per cell
  const hit = new Uint8Array(n); // cells the survey reached at all (plants and ground included)
  const NOISE = new Set([7, 18]);
  // Surveys that class buildings: only those returns are building (an
  // unclassed branch over a roof isn't); others leave buildings unclassed.
  const classed = lidar.cls.some((c) => c === 6);
  const PLANTS = new Set([3, 4, 5, 9]);
  const isBuilding = (c) => (classed ? c === 6 : !PLANTS.has(c) && c !== 2);
  for (let k = 0; k < lidar.count; k++) {
    if (NOISE.has(lidar.cls[k])) continue;
    const [X, Y] = grid.fromLonLat([lidar.x[k], lidar.y[k]]);
    const i = Math.floor((X - grid.x0) / grid.res);
    const j = Math.floor((grid.y0 - Y) / grid.res);
    if (i < 0 || j < 0 || i >= w || j >= h) continue;
    const c = j * w + i;
    const g = measured.ground[c];
    if (Number.isNaN(g)) continue;
    hit[c] = 1;
    if (isBuilding(lidar.cls[k])) top[c] = Math.max(top[c], lidar.z[k] - g);
  }
  const own = (c) => roofs[c] >= 1 && roofs[c] <= ownCount;
  // A ring around the own footprints, from 1.2 m (past the eaves) to 3 m out,
  // not on another building: building there is a part the footprint missed.
  const ringPx = Math.max(1, Math.round(3 / grid.res));
  const eavesPx = Math.max(1, Math.round(1.2 / grid.res));
  const within = (px) => {
    const out = new Uint8Array(n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!own(j * w + i)) continue;
      for (let dj = -px; dj <= px; dj++) for (let di = -px; di <= px; di++) {
        const x = i + di;
        const y = j + dj;
        if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = 1;
      }
    }
    return out;
  };
  const outer = within(ringPx);
  const eaves = within(eavesPx);
  const ring = Uint8Array.from(outer, (v, c) => (v && !eaves[c] && !roofs[c] ? 1 : 0));
  let spill = 0;
  for (let c = 0; c < n; c++) if (ring[c] && parcel[c] && top[c] >= 2.5 && ndvi[c] < 0.2) spill++;
  let groundMin = Infinity;
  let groundMax = -Infinity;
  for (let c = 0; c < n; c++) {
    if (!parcel[c] || Number.isNaN(measured.ground[c])) continue;
    groundMin = Math.min(groundMin, measured.ground[c]);
    groundMax = Math.max(groundMax, measured.ground[c]);
  }
  const houses = (r.buildings?.features || []).map((f, bi) => {
    const label = bi + 1;
    let cells = 0;
    let built = 0;
    const heights = [];
    for (let c = 0; c < n; c++) {
      if (roofs[c] !== label) continue;
      // Only cells the survey hit: sparse surveys (2 points a square metre)
      // leave many cells empty, which isn't ground showing through.
      if (!hit[c]) continue;
      cells++;
      if (top[c] >= 2) { built++; heights.push(top[c]); }
    }
    heights.sort((a, b) => a - b);
    // As the scanner measures it: high on the roof, lower where the survey
    // doesn't class buildings (its trees are unclassed too).
    const lidarTopFt = heights.length ? heights[Math.floor((classed ? 0.95 : 0.8) * (heights.length - 1))] * 3.28084 : null;
    const g = f.properties.roofGrid;
    let levels = null;
    let flatShare = null;
    if (g) {
      const hs = g.h.map((v) => v / 10).filter((v) => v > 2);
      // Distinct roof levels: clusters of heights over 2.5 m apart holding 12%+ of the roof.
      const bins = new Map();
      hs.forEach((v) => bins.set(Math.round(v / 2.5), (bins.get(Math.round(v / 2.5)) || 0) + 1));
      const big = [...bins.entries()].filter(([, c]) => c >= 0.12 * hs.length).map(([b]) => b).sort((a, b) => a - b);
      levels = big.filter((b, i) => i === 0 || b - big[i - 1] >= 1).length;
      let flat = 0;
      let tot = 0;
      for (let j = 1; j < g.rows - 1; j++) for (let i = 1; i < g.cols - 1; i++) {
        const v = g.h[j * g.cols + i] / 10;
        if (v < 2) continue;
        tot++;
        const gx = (g.h[j * g.cols + i + 1] - g.h[j * g.cols + i - 1]) / 20;
        const gy = (g.h[(j + 1) * g.cols + i] - g.h[(j - 1) * g.cols + i]) / 20;
        if (Math.hypot(gx, gy) / (g.dLat * 110540) < 0.09) flat++;
      }
      flatShare = tot ? Math.round((flat / tot) * 100) / 100 : null;
    }
    return {
      sqft: f.properties.areaSqft,
      heightFt: f.properties.heightFt,
      heightSource: f.properties.heightSource,
      lidarTopFt: lidarTopFt && Math.round(lidarTopFt),
      heightErrFt: lidarTopFt ? Math.round(f.properties.heightFt - lidarTopFt) : null,
      coverage: cells ? Math.round((built / cells) * 100) / 100 : null,
      levels,
      flatShare,
      roofColor: f.properties.roofColor || null,
      surveyed: Boolean(g),
    };
  });
  return { houses, spillSqft: Math.round(spill * pxSqft), lotReliefFt: Number.isFinite(groundMax) ? Math.round((groundMax - groundMin) * 3.28084) : null, underKnown: Boolean(under?.length) };
}


// What decided each pixel, as a picture over the survey photo: lawn, rough
// green (crown-like texture), groundcover or beds by the laser, green dropped
// as a fragment, trees, shrubs, roofs, paving, pools and bare ground. Returns
// { png, west, south, east, north } for laying it over the scan.
export function reasonImage(r) {
  const d = r.debug;
  const { grid, naip, ndvi, parcel, roofs, trees, rough, green, measured, tall, ownCount } = d;
  const { w, h } = grid;
  const raster = (fc) => rasterize(grid, (fc?.features || []).flatMap((f) => polygonsOf(f.geometry)));
  const lawn = raster(r.lawn);
  const paved = raster(r.paved);
  const pools = raster(r.pools);
  const rgb = new Uint8Array(w * h * 3);
  const COLORS = {
    lawn: [70, 230, 60], rough: [255, 150, 30], lumpy: [190, 90, 255], small: [255, 240, 60],
    tree: [20, 110, 40], shrub: [130, 140, 40], roof: [230, 40, 40], otherRoof: [120, 30, 30],
    paved: [170, 170, 170], pool: [0, 220, 255], bare: [205, 170, 120],
  };
  for (let k = 0; k < w * h; k++) {
    const gray = (naip.red[k] + naip.green[k] + naip.blue[k]) / 3;
    let c = null;
    if (pools[k]) c = COLORS.pool;
    else if (roofs[k]) c = roofs[k] <= ownCount ? COLORS.roof : COLORS.otherRoof;
    else if (lawn[k]) c = COLORS.lawn;
    else if (paved[k]) c = COLORS.paved;
    else if (trees[k]) c = tall[k] ? COLORS.tree : COLORS.shrub;
    else if (rough?.[k]) c = COLORS.rough;
    else if (ndvi[k] >= 0.2 && measured?.known[k] && !measured.flat[k]) c = COLORS.lumpy;
    else if (green?.[k]) c = COLORS.small;
    else if (ndvi[k] < 0.12 && gray > 90) c = COLORS.bare;
    const a = parcel[k] ? 0.55 : 0.18;
    for (let b = 0; b < 3; b++) {
      const base = [naip.red[k], naip.green[k], naip.blue[k]][b] * (parcel[k] ? 1 : 0.55);
      rgb[k * 3 + b] = c ? Math.round(base * (1 - a) + c[b] * a) : Math.round(base);
    }
  }
  const [west, north] = grid.toLonLat([grid.x0, grid.y0]);
  const [east, south] = grid.toLonLat([grid.x0 + w * grid.res, grid.y0 - h * grid.res]);
  return { png: png({ w, h, rgb }), west, south, east, north };
}
