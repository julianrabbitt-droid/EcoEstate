// Lawn detection from NAIP: green vegetation (NDVI) inside the property,
// minus trees, vectorized into lawn polygons. Trees are removed two ways:
//  - the canopy height map (anything over ~1 m), grown slightly so crown
//    edges the map draws too small are removed too;
//  - texture in the imagery itself: tree crowns are lumpy (sunlit and shaded
//    leaves), mown turf is smooth. This catches trees the canopy map misses.
import turfArea from '@turf/area';
import simplify from '@turf/simplify';
import { contours } from 'd3-contour';
import { readCanopy } from './canopy.js';
import { lidarPoints, LIDAR_CLASS } from './lidar.js';
import { ApiError } from './errors.js';
import { buildingsInBox, segmentsInBox } from './buildings.js';
import { forEachPixel, makeGrid, polygonsOf, rasterize, rasterizeLabels } from './grid.js';
import { findNaip, readNaip } from './naip.js';
import { osmLawnShapes, PATH_WIDTH_M } from './osmLawns.js';
import { dilate, distanceTo, erode, labelRegions, localStats } from './raster.js';
import { regionShape } from './shapes.js';
import { separateLayers } from './layers.js';
import { buildingsOnParcel, describeBuildings, describeNearbyRoads, describePaths, detectTrees, NEARBY } from './structures.js';

const SQM_TO_SQFT = 10.7639;

export const SETTINGS = {
  // Paving on the property (driveways, patios, walks): bare, flat ground that
  // isn't lawn, a roof, a tree or a pool, in patches at least this big.
  paveNdviMax: 0.2, // concrete reads a little green in some surveys; lawn and shrubs are excluded already
  paveMinBrightness: 60, // darker is deep shadow, not pavement
  paveOpenM: 0.9, // specks and thin seams narrower than about twice this are dropped
  paveMinSqft: 80,
  ndviMin: 0.2, // NDVI at or above this counts as green (healthy turf is usually 0.3+)
  // Aerial photos are flown mid-morning to early afternoon, never with the sun
  // straight overhead, so houses and trees cast shadows across lawns. Shaded
  // grass is dim in every band and its NDVI drops; a dark pixel with a lower
  // NDVI still counts as lawn when it adjoins lawn found in the sun.
  shadowNir: 85, // near-infrared at or below this (0-255) is in shade
  shadowNdviMin: 0.1,
  shadowReachPx: 6, // how far shaded lawn can extend from sunlit lawn
  canopyMaxM: 1, // taller than this is a tree, shrub or building, not lawn
  // Where USGS lidar covers the property its measured layers decide (see
  // lidarHeights): low clutter rules lawn out, canopy overhead doesn't, and
  // grass under a canopy is found from the laser's brightness on the ground.
  lidarMaxResM: 1, // only on house-sized grids; campuses keep the canopy map
  lidarMaxAgeYears: 3, // ignore lidar this much older than the aerial photo
  understoryMinM: 0.6, // lidar returns between this…
  canopyMinM: 2, // …and this above ground are shrubs, hedges or clutter: not lawn…
  understoryShare: 0.25, // …when they're at least this share of the returns around a cell
  grassCalibrationMinPx: 10, // open lawn and bare pixels needed to calibrate grass brightness
  grassContrast: 1.4, // open lawn must be at least this much brighter than bare ground
  underCanopyReachM: 10, // grass under trees counts when within this of open lawn…
  underCanopyAloneM2: 15, // …or in a patch at least this big (~160 sq ft) on its own
  groundcoverMinM: 0.2, // returns between this and understoryMinM above ground…
  groundcoverShare: 0.12, // …at more than this share of a spot's returns mean groundcover or beds, not grass
  // Dormant lawn. California's 2022 survey was flown in a drought, and many
  // lawns that were watered less show only faintly green. A spot that was green,
  // smooth lawn in the survey before, and is still faintly green, flat and no
  // brighter than dry grass now, is a dormant lawn, not bare ground.
  dormantNdviMin: 0.1, // still at least this green in the newest survey…
  dormantPrevNdviMin: 0.22, // …and at least this green in the one before
  dormantMaxBrightness: 165, // brighter than this (mean of red, green, blue) is paving or bare soil
  dormantMaxYears: 4, // the previous survey must be this recent
  // Lawn brown in both surveys (a dry year after a dry year): the laser still
  // tells grass from bare soil by how brightly the ground reflects it. Open,
  // flat ground as bright as the calibrated grass, faintly green and no
  // brighter than dry grass in the photo, counts in patches at least this big.
  lidarDormantNdviMin: 0.05,
  lidarDormantMinM2: 25, // ~270 sq ft
  // Lidar older than the photo can describe a yard that has since changed (a
  // rebuild, a new lawn, a tree taken down). Where the newer photo shows smooth
  // turf (tree crowns and shrubs are never this smooth), the photo decides.
  staleTurfNdviMin: 0.25,
  staleTurfMaxTexturePct: 3,
  canopyGrowM: 0.6, // extend the canopy mask ~1 pixel: the map sits slightly off NAIP in places
  minLawnSqft: 50, // drop fragments smaller than this…
  minLawnPx: 12, // …or than this many pixels, whichever is larger (matters on coarse grids)
  minHoleSqft: 25, // fill gaps smaller than this inside a lawn
  textureRadiusPx: 3, // window for the tree texture check (7x7 px, ~4 m at 0.6 m)
  // Near-infrared variation among neighbouring green pixels, as % of their mean.
  // Calibrated on 8 test sites (scripts/calibrate.mjs): open turf mostly 1-3%,
  // tree crowns mostly above 3-4%. Only judged where most of the window is
  // vegetation, and only coherent rough patches are removed, so narrow strips
  // and patchy lawns (mixed grass/pavement/dry pixels) aren't mistaken for trees.
  maxTexturePct: 5,
  textureMinCover: 0.6, // share of the window that must be vegetation
  roughPatchShare: 0.6, // share of nearby pixels that must be rough
  maxPixels: 4_000_000, // grid size limit; larger properties are measured at a coarser resolution
  maxResM: 2.4, // coarsest resolution allowed (~23 km² at maxPixels); beyond this the property is refused
  minBoxFill: 0.02, // a property needing a coarser grid must cover at least this share of its bounding box (no far-apart slivers)
  bridgeM: 1.5, // join lawn pieces split by gaps narrower than ~2× this (paths, edging), never across trees or roofs
  linkGapM: 3, // link large lawn pieces across gaps up to ~2× this (sidewalks, paths) into one region
  linkMinSqft: 2000, // only pieces at least this big are linked (keeps home lawns apart across driveways)
  scatteredMaxSqft: 500, // isolated patches smaller than this…
  scatteredShare: 0.001, // …and than this share of the property are grouped as "scattered patches"
  templateMinGreen: 0.5, // use a mapped (OpenStreetMap) lawn shape when imagery shows at least this share of it green
  templateMinSqft: 1000,
  // Street trees: the canopy between the property line and a bordering road
  // (planting strip, sidewalk, overhanging neighbours) is shown in the 3D model.
  streetReachM: 20, // only this far out from the property line
  streetSlackM: 2, // how far off the straight line from property to road a tree may stand
  streetMaxResM: 1, // skipped on campuses and parks measured at a coarse grid
  neighbourRingM: 6, // trees this close to the property line on any side are included too
};

function widen([w, s, e, n], metres) {
  const dLat = metres / 110540;
  const dLon = metres / (111320 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return [w - dLon, s - dLat, e + dLon, n + dLat];
}

function lonLatBox(geometry) {
  const pts = polygonsOf(geometry).flat(2);
  return [
    Math.min(...pts.map((p) => p[0])),
    Math.min(...pts.map((p) => p[1])),
    Math.max(...pts.map((p) => p[0])),
    Math.max(...pts.map((p) => p[1])),
  ];
}

// 3x3 majority vote: removes speckle and fills single-pixel gaps.
function majority(mask, w, h) {
  const out = new Uint8Array(mask.length);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let sum = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const x = i + di;
          const y = j + dj;
          if (x >= 0 && y >= 0 && x < w && y < h) sum += mask[y * w + x];
        }
      }
      out[j * w + i] = sum >= 5 ? 1 : 0;
    }
  }
  return out;
}

const ringAreaSqft = (ring) => turfArea({ type: 'Polygon', coordinates: [ring] }) * SQM_TO_SQFT;

/**
 * Trees just outside the property, from the canopy map on a grid widened past
 * it: any within neighbourRingM of the property line on any side (their crowns
 * often hang over it), plus those between the property line and a bordering
 * road. A road-side spot counts when going from the property to a road through
 * it is barely longer than the shortest way across, so the neighbours' front
 * yards to either side are left out. The 3D view models these so it can hide
 * the real trees there whole instead of slicing them at the property line.
 */
async function findStreetTrees(grid, box, parcelGeometry, nearbyRoads, nearbyBuildings) {
  try {
    const wide = makeGrid(grid.epsg, grid.res, box, SETTINGS.streetReachM + 5);
    const { w, h } = wide;
    const parcel = rasterize(wide, polygonsOf(parcelGeometry));
    const roofs = rasterizeLabels(wide, nearbyBuildings.map((b) => b.geometry));
    const roads = rasterizeLabels(wide, nearbyRoads.features.map((f) => f.geometry));
    const fromParcel = distanceTo(parcel, w, h);
    const reachPx = SETTINGS.streetReachM / wide.res;
    const slackPx = SETTINGS.streetSlackM / wide.res;
    const include = new Uint8Array(w * h);
    const ringPx = SETTINGS.neighbourRingM / wide.res;
    for (let k = 0; k < w * h; k++) if (!parcel[k] && !roofs[k] && fromParcel[k] <= ringPx) include[k] = 1;
    for (let label = 1; label <= nearbyRoads.features.length; label++) {
      const fromRoad = distanceTo(Uint8Array.from(roads, (v) => (v === label ? 1 : 0)), w, h);
      let gap = Infinity;
      for (let k = 0; k < w * h; k++) gap = Math.min(gap, fromParcel[k] + fromRoad[k]);
      if (gap > reachPx) continue;
      for (let k = 0; k < w * h; k++) {
        if (!parcel[k] && !roofs[k] && fromParcel[k] <= reachPx && fromParcel[k] + fromRoad[k] <= gap + slackPx) include[k] = 1;
      }
    }
    const canopy = await readCanopy(wide);
    return detectTrees(wide, canopy, include).map((t) => ({ ...t, street: true }));
  } catch (err) {
    console.warn(`street trees unavailable: ${err.message}`);
    return [];
  }
}

/**
 * What lidar says about each grid cell. Ground is the mean of ground-classed
 * returns (filled into gaps, such as under roofs, from the cells around).
 * Returns then sort by height above it:
 *  - obstacle: returns between understoryMinM and canopyMinM (shrubs, hedges,
 *    walls, cars, play sets); nothing grows on the ground there.
 *  - canopy: returns above canopyMinM (tree crowns, eaves). On its own it
 *    doesn't rule out lawn: the laser also reaches the ground beneath.
 *  - groundInt: the mean laser brightness of the ground returns; the laser is
 *    near-infrared, which grass reflects strongly and mulch, soil and asphalt
 *    don't, so it can tell grass under a canopy the photo can't see.
 * A lone return is ignored (birds, wires): a cell needs support from its neighbours.
 */
export function lidarHeights(grid, pts) {
  const { w, h, res } = grid;
  const n = w * h;
  const sum = new Float64Array(n);
  const isum = new Float64Array(n);
  const icnt = new Uint32Array(n);
  const cnt = new Uint32Array(n);
  const px = new Int32Array(pts.count).fill(-1);
  for (let k = 0; k < pts.count; k++) {
    const [X, Y] = grid.fromLonLat([pts.x[k], pts.y[k]]);
    const i = Math.floor((X - grid.x0) / res);
    const j = Math.floor((grid.y0 - Y) / res);
    if (i < 0 || j < 0 || i >= w || j >= h) continue;
    const c = j * w + i;
    px[k] = c;
    if (pts.cls[k] === LIDAR_CLASS.ground) {
      sum[c] += pts.z[k];
      cnt[c]++;
      // Brightness only from pulses that hit nothing but the ground: under leaves
      // a pulse's energy is split, so its ground return is dimmer whatever the surface.
      if (pts.nret[k] === 1) { isum[c] += pts.int[k]; icnt[c]++; }
    }
  }
  const ground = new Float32Array(n).fill(NaN);
  const groundInt = new Float32Array(n).fill(NaN);
  for (let c = 0; c < n; c++) {
    if (cnt[c]) ground[c] = sum[c] / cnt[c];
    if (icnt[c]) groundInt[c] = isum[c] / icnt[c];
  }
  // Fill ground gaps (roofs, dense shrubs) from neighbouring ground, a ring at a time.
  for (let pass = 0; pass < 60; pass++) {
    let filled = 0;
    const next = ground.slice();
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const c = j * w + i;
        if (!Number.isNaN(ground[c])) continue;
        let s = 0;
        let m = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const x = i + di;
          const y = j + dj;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const v = ground[y * w + x];
          if (!Number.isNaN(v)) { s += v; m++; }
        }
        if (m) { next[c] = s / m; filled++; }
      }
    }
    ground.set(next);
    if (!filled) break;
  }
  const low = new Uint16Array(n);
  const high = new Uint16Array(n);
  const nearGround = new Uint16Array(n); // returns just above the ground: groundcover and bed plantings, not mown grass
  const all = new Uint16Array(n);
  const any = new Uint8Array(n);
  // Buildings are handled by their footprints; their walls and eaves would
  // otherwise ring every house and swallow narrow side lawns.
  const skip = new Set([LIDAR_CLASS.ground, LIDAR_CLASS.building, LIDAR_CLASS.noise, LIDAR_CLASS.highNoise, LIDAR_CLASS.water]);
  for (let k = 0; k < pts.count; k++) {
    const c = px[k];
    if (c < 0) continue;
    any[c] = 1;
    if (pts.cls[k] !== LIDAR_CLASS.noise && pts.cls[k] !== LIDAR_CLASS.highNoise) all[c]++;
    if (skip.has(pts.cls[k]) || Number.isNaN(ground[c])) continue;
    const above = pts.z[k] - ground[c];
    if (above >= SETTINGS.canopyMinM) high[c]++;
    else if (above > SETTINGS.understoryMinM) low[c]++;
    else if (above > SETTINGS.groundcoverMinM) nearGround[c]++;
  }
  const obstacle = new Uint8Array(n);
  const canopy = new Uint8Array(n);
  const flat = new Uint8Array(n);
  const known = new Uint8Array(n);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let lo = 0;
      let hi = 0;
      let tot = 0;
      let near = 0;
      let seen = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const x = i + di;
        const y = j + dj;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const q = y * w + x;
        lo += low[q];
        hi += high[q];
        tot += all[q];
        near += nearGround[q];
        seen |= any[q];
      }
      const c = j * w + i;
      // Dense low returns: a shrub or hedge, not a few low branches over open ground.
      obstacle[c] = low[c] && lo >= 3 && lo >= SETTINGS.understoryShare * tot ? 1 : 0;
      canopy[c] = hi >= 2 ? 1 : 0;
      // Mown grass leaves almost nothing between ~8 in and 2 ft; groundcover, ivy and beds do.
      flat[c] = tot && near <= SETTINGS.groundcoverShare * tot ? 1 : 0;
      known[c] = seen;
    }
  }
  return { known, obstacle, canopy, flat, groundInt };
}

// Grass under a canopy: ground returns at least about as bright as the
// open lawn in view, calibrated per scan against lawn the photo can see (and
// against bare ground, when there is some). null when there's too little open
// lawn to calibrate.
function grassBrightness(measured, ndvi, open) {
  const lawn = [];
  const bare = [];
  for (let k = 0; k < ndvi.length; k++) {
    if (!open[k] || !measured.known[k] || measured.canopy[k] || measured.obstacle[k] || Number.isNaN(measured.groundInt[k])) continue;
    if (ndvi[k] >= 0.15) lawn.push(measured.groundInt[k]); // drought-stressed lawn included
    else if (ndvi[k] < 0.1) bare.push(measured.groundInt[k]);
  }
  if (lawn.length < SETTINGS.grassCalibrationMinPx) return null;
  if (bare.length < SETTINGS.grassCalibrationMinPx) return null;
  const median = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  const lawnMed = median(lawn);
  const bareMed = median(bare);
  // Some surveys normalise brightness so grass and bare ground look alike;
  // without a clear difference, brightness can't find grass.
  if (lawnMed < SETTINGS.grassContrast * bareMed) return null;
  return { min: Math.max((lawnMed + bareMed) / 2, lawnMed * 0.7), max: lawnMed * 1.6 }; // much brighter than lawn is usually concrete
}

/**
 * Detect lawn inside a parcel (GeoJSON Polygon/MultiPolygon in lon/lat).
 * Returns { lawn, totalSqft, surveyDate, buildings, trees }, plus the raster
 * layers in `debug` when options.debug is set.
 */
export async function detectLawn(parcelGeometry, { debug = false } = {}) {
  const box = lonLatBox(parcelGeometry);
  const items = await findNaip(box);
  // Full NAIP detail (0.6 m) for normal lots; campuses and parks get a coarser
  // grid so the whole property fits in maxPixels.
  const nativeRes = items[0].gsd || 0.6;
  let grid = makeGrid(items[0].epsg, nativeRes, box);
  if (grid.w * grid.h > SETTINGS.maxPixels) {
    // Pieces far apart (or a long diagonal sliver) would make a full-size grid
    // of almost nothing but empty space.
    if (turfArea(parcelGeometry) < SETTINGS.minBoxFill * grid.w * grid.h * nativeRes * nativeRes) {
      throw new ApiError(400, 'parcel_too_spread', 'The parts of this property line are too far apart to measure together. Outline each part separately.');
    }
    const res = Math.ceil(nativeRes * Math.sqrt((grid.w * grid.h) / SETTINGS.maxPixels) * 10) / 10;
    if (res > SETTINGS.maxResM) {
      throw new ApiError(422, 'parcel_too_large', 'This property is too large to measure automatically. Outline the lawn by hand instead.');
    }
    grid = makeGrid(items[0].epsg, res, box);
  }

  const parcel = rasterize(grid, polygonsOf(parcelGeometry));
  const t0 = Date.now();
  let templates = [];
  let mappedPaths = [];
  let lidar = null;
  const lidarLoad = grid.res <= SETTINGS.lidarMaxResM
    ? lidarPoints(widen(box, 3)).catch((err) => {
        console.warn(`lidar unavailable: ${err.message}`);
        return null;
      })
    : Promise.resolve(null);
  // The survey before the newest, for lawns that were dormant when it was flown.
  const prevItems = items.filter((it) => it.year !== items[0].year && it.year >= items[0].year - SETTINGS.dormantMaxYears);
  const prevLoad = prevItems.length
    ? readNaip(grid, prevItems).catch((err) => {
        console.warn(`previous survey unavailable: ${err.message}`);
        return null;
      })
    : Promise.resolve(null);
  const [naip, canopy, nearbyBuildings] = await Promise.all([
    readNaip(grid, items).then((r) => ((r.ms = Date.now() - t0), r)),
    readCanopy(grid).then((r) => ((r.ms = Date.now() - t0), r)),
    buildingsInBox(box).catch((err) => {
      console.warn(`building footprints unavailable: ${err.message}`);
      return [];
    }),
    // A little wider than the property, to include the roads that border it.
    osmLawnShapes(widen(box, NEARBY.extendM + NEARBY.withinM)),
    // Overture's copy of the same roads and paths, read from files rather than
    // a shared server, for when OpenStreetMap's servers are slow or down.
    segmentsInBox(widen(box, NEARBY.extendM + NEARBY.withinM)).catch((err) => {
      console.warn(`road segments unavailable: ${err.message}`);
      return [];
    }),
  ]).then(([a, b, c, osm, segments]) => {
    // null = OpenStreetMap features still downloading (see osmLawns.js).
    templates = osm === null ? null : osm.lawns;
    // Overture adds driveways and service roads OpenStreetMap's live copy may
    // lack (and stands in while its servers are down); use the fuller set.
    const overture = segments.map((p) => ({ ...p, widthM: PATH_WIDTH_M[p.kind] ?? 2 }));
    mappedPaths = osm?.paths && osm.paths.length >= overture.length ? osm.paths : overture;
    return [a, b, c];
  });
  lidar = await lidarLoad;
  const prevNaip = await prevLoad;
  // A survey much older than the aerial photo describes a different yard.
  const naipYear = Number(String(naip.dates.at(-1) || '').slice(0, 4)) || 0;
  if (lidar && naipYear && lidar.year && lidar.year < naipYear - SETTINGS.lidarMaxAgeYears) lidar = null;
  const measured = lidar ? lidarHeights(grid, lidar) : null;
  const measuredHasBuildings = lidar ? lidar.cls.some((c) => c === LIDAR_CLASS.building) : false;
  // Buildings on the parcel first (their labels are used for roof heights),
  // then neighbours whose roofs overhang it.
  const ownBuildings = buildingsOnParcel(nearbyBuildings, parcelGeometry);
  const ownIds = new Set(ownBuildings.map((b) => b.id));
  const roofLabels = rasterizeLabels(grid, [...ownBuildings, ...nearbyBuildings.filter((b) => !ownIds.has(b.id))].map((b) => b.geometry));
  // Mapped roads and paths on the property: never lawn, and lawn is never linked across them.
  const pathShapes = describePaths(mappedPaths, parcelGeometry);
  const pathMask = rasterizeLabels(grid, pathShapes.features.map((f) => f.geometry));
  if (!naip.dates.length) throw new ApiError(404, 'imagery_not_found', 'No aerial imagery is available for this location.');

  const n = grid.w * grid.h;
  const { w, h } = grid;
  const ndvi = new Float32Array(n);
  const vegetation = new Uint8Array(n);
  const tall = new Uint8Array(n);
  const usable = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const r = naip.red[k];
    const nir = naip.nir[k];
    ndvi[k] = r + nir ? (nir - r) / (nir + r) : 0;
    usable[k] = parcel[k] && naip.filled[k] && !roofLabels[k] && !pathMask[k] ? 1 : 0;
  }
  // Calibrated on everything in view, neighbours' yards included: a lot whose
  // lawn is all under trees has no open lawn of its own to learn from.
  const inView = Uint8Array.from(naip.filled, (v, k) => (v && !roofLabels[k] && !pathMask[k] ? 1 : 0));
  // Surveys that don't label buildings leave walls and eaves in the vegetation
  // returns; ignore lidar right at the mapped footprints there.
  if (measured && !measuredHasBuildings) {
    const nearRoof = dilate(Uint8Array.from(roofLabels, (v) => (v ? 1 : 0)), w, h, Math.round(1.5 / grid.res));
    for (let k = 0; k < n; k++) if (nearRoof[k]) { measured.canopy[k] = 0; measured.obstacle[k] = 0; }
  }
  const grassInt = measured ? grassBrightness(measured, ndvi, inView) : null;
  // Smooth turf in a photo newer than the lidar (see staleTurf* above).
  let newerTurf = null;
  if (measured && lidar.year && naipYear > lidar.year) {
    const turfLike = Uint8Array.from(ndvi, (v, k) => (usable[k] && v >= SETTINGS.staleTurfNdviMin ? 1 : 0));
    const tex = localStats(naip.nir, turfLike, w, h, SETTINGS.textureRadiusPx);
    const win = (2 * SETTINGS.textureRadiusPx + 1) ** 2;
    newerTurf = Uint8Array.from(turfLike, (v, k) =>
      v && tex.count[k] >= SETTINGS.textureMinCover * win && (100 * tex.std[k]) / tex.mean[k] <= SETTINGS.staleTurfMaxTexturePct ? 1 : 0);
  }
  const underCanopy = new Uint8Array(n);
  const underGrass = new Uint8Array(n); // grass-bright ground under a canopy: a candidate, confirmed below
  let underCanopyPx = 0;
  for (let k = 0; k < n; k++) {
    if (newerTurf?.[k]) {
      tall[k] = 0; // the newer photo shows open turf: whatever the old survey saw is gone
    } else if (measured?.known[k]) {
      tall[k] = measured.obstacle[k];
      // Without a brightness calibration lidar can't judge grass under a canopy;
      // fall back to the photo and the canopy map there, as without lidar.
      if (measured.canopy[k] && !measured.obstacle[k] && !grassInt) {
        tall[k] = canopy.known[k] && canopy.height[k] > SETTINGS.canopyMaxM ? 1 : 0;
      } else if (measured.canopy[k] && !measured.obstacle[k]) {
        // The photo only sees leaves here; the ground's laser brightness decides.
        underCanopy[k] = 1;
        const g = measured.groundInt[k];
        underGrass[k] = usable[k] && grassInt && measured.flat[k] && g >= grassInt.min && g <= grassInt.max ? 1 : 0;
        vegetation[k] = 0;
        continue;
      }
    } else {
      tall[k] = canopy.known[k] && canopy.height[k] > SETTINGS.canopyMaxM ? 1 : 0;
    }
    vegetation[k] = usable[k] && ndvi[k] >= SETTINGS.ndviMin ? 1 : 0;
  }
  const trees = dilate(tall, w, h, Math.round(SETTINGS.canopyGrowM / grid.res));
  // Texture is measured over vegetation only, so a lawn's edge against
  // pavement or a roof doesn't count as rough.
  const texture = localStats(naip.nir, vegetation, w, h, SETTINGS.textureRadiusPx);
  const windowPx = (2 * SETTINGS.textureRadiusPx + 1) ** 2;
  const roughPx = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    roughPx[k] =
      vegetation[k] &&
      texture.count[k] >= SETTINGS.textureMinCover * windowPx &&
      (100 * texture.std[k]) / texture.mean[k] > SETTINGS.maxTexturePct ? 1 : 0;
  }
  const roughShare = localStats(roughPx, vegetation, w, h, 2).mean;
  const rough = new Uint8Array(n);
  let green = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    // Under a canopy the photo's texture is the crown's, not the ground's.
    rough[k] = vegetation[k] && !underCanopy[k] && roughShare[k] >= SETTINGS.roughPatchShare ? 1 : 0;
    green[k] = vegetation[k] && !trees[k] && !rough[k] ? 1 : 0;
  }
  green = majority(green, w, h);

  // Shaded lawn: dark, faintly green pixels that connect to sunlit lawn.
  const shade = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    shade[k] =
      !green[k] && parcel[k] && naip.filled[k] && !roofLabels[k] && !pathMask[k] && !trees[k] &&
      naip.nir[k] <= SETTINGS.shadowNir && ndvi[k] >= SETTINGS.shadowNdviMin ? 1 : 0;
  }
  for (let step = 0; step < SETTINGS.shadowReachPx; step++) {
    const grown = dilate(green, w, h, 1);
    let added = 0;
    for (let k = 0; k < n; k++) {
      if (shade[k] && grown[k] && !green[k]) {
        green[k] = 1;
        added++;
      }
    }
    if (!added) break;
  }
  // Dormant lawn: green and smooth in the previous survey, still faintly green
  // and no brighter than dry grass in the newest, never on trees, shrubs,
  // roofs or paths. Its edges are pulled in a pixel, since two surveys never
  // line up exactly and a lawn's edge could otherwise spill onto a driveway.
  let dormantPx = 0;
  if (prevNaip) {
    const prevGreen = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      const pr = prevNaip.red[k];
      const pn = prevNaip.nir[k];
      prevGreen[k] = prevNaip.filled[k] && pr + pn && (pn - pr) / (pn + pr) >= SETTINGS.dormantPrevNdviMin ? 1 : 0;
    }
    const prevTexture = localStats(prevNaip.nir, prevGreen, w, h, SETTINGS.textureRadiusPx);
    const prevSmooth = Uint8Array.from(prevGreen, (v, k) =>
      v && !(prevTexture.count[k] >= SETTINGS.textureMinCover * windowPx && (100 * prevTexture.std[k]) / prevTexture.mean[k] > SETTINGS.maxTexturePct) ? 1 : 0);
    const wasLawn = erode(prevSmooth, w, h, 1);
    for (let k = 0; k < n; k++) {
      if (green[k] || !wasLawn[k] || !usable[k] || trees[k] || rough[k] || underCanopy[k]) continue;
      const bright = (naip.red[k] + naip.green[k] + naip.blue[k]) / 3;
      if (ndvi[k] >= SETTINGS.dormantNdviMin && bright <= SETTINGS.dormantMaxBrightness) {
        green[k] = 1;
        dormantPx++;
      }
    }
  }
  // Lawn dry in both surveys, found by the laser's brightness on open, flat ground.
  if (measured && grassInt) {
    const cand = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      if (green[k] || !usable[k] || !measured.known[k] || measured.canopy[k] || measured.obstacle[k] || !measured.flat[k] || trees[k] || rough[k]) continue;
      const g = measured.groundInt[k];
      const bright = (naip.red[k] + naip.green[k] + naip.blue[k]) / 3;
      if (g >= grassInt.min && g <= grassInt.max && ndvi[k] >= SETTINGS.lidarDormantNdviMin && bright <= SETTINGS.dormantMaxBrightness) cand[k] = 1;
    }
    const opened = dilate(erode(cand, w, h, 1), w, h, 1); // drop one-pixel lines (curbs, path edges)
    const pieces = labelRegions(Uint8Array.from(opened, (v, k) => v & cand[k]), w, h);
    const minPx = SETTINGS.lidarDormantMinM2 / (grid.res * grid.res);
    for (let k = 0; k < n; k++) {
      if (pieces.labels[k] && pieces.sizes[pieces.labels[k]] >= minPx) {
        green[k] = 1;
        dormantPx++;
      }
    }
  }
  // Lawn under trees. Groundcover, shrub beds and ivy reflect the laser like
  // grass, so a grass-bright patch under a canopy counts only when it carries on
  // from open lawn the photo confirms (lawns run under tree edges), or when it
  // is big enough to be a lawn in its own right.
  if (measured) {
    const reach = Math.round(SETTINGS.underCanopyReachM / grid.res);
    for (let step = 0; step < reach; step++) {
      const grown = dilate(green, w, h, 1);
      let added = 0;
      for (let k = 0; k < n; k++) {
        if (underGrass[k] && grown[k] && !green[k]) {
          green[k] = 1;
          added++;
          underCanopyPx++;
        }
      }
      if (!added) break;
    }
    const rest = Uint8Array.from(underGrass, (v, k) => (v && !green[k] ? 1 : 0));
    const pieces = labelRegions(rest, w, h);
    const minPx = SETTINGS.underCanopyAloneM2 / (grid.res * grid.res);
    for (let k = 0; k < n; k++) {
      if (rest[k] && pieces.sizes[pieces.labels[k]] >= minPx) {
        green[k] = 1;
        underCanopyPx++;
      }
    }
  }
  // Bridge narrow gaps (paths, edging, shadow lines) so one lawn isn't cut into
  // pieces. A closing (grow then shrink) only adds pixels inside narrow gaps,
  // and never on trees, roofs, lumpy vegetation or off the property.
  const bridgePx = Math.max(1, Math.round(SETTINGS.bridgeM / grid.res));
  const closed = erode(dilate(green, w, h, bridgePx), w, h, bridgePx);
  for (let k = 0; k < n; k++) {
    green[k] = (green[k] || closed[k]) && parcel[k] && naip.filled[k] && !trees[k] && !rough[k] && !roofLabels[k] && !pathMask[k] ? 1 : 0;
  }

  // Mapped lawn shapes: where imagery confirms enough of a mapped grass area or
  // sports field is green lawn, take its whole outline (minus trees and roofs)
  // instead of the fragments. Artificial turf isn't green, so it's left out.
  let templatesUsed = 0;
  if (templates?.length) {
    const labels = rasterizeLabels(grid, templates);
    const total = new Float64Array(templates.length);
    const greenCount = new Float64Array(templates.length);
    for (let k = 0; k < n; k++) {
      const t = labels[k] - 1;
      if (t < 0 || !parcel[k]) continue;
      total[t]++;
      greenCount[t] += green[k];
    }
    const minPx = SETTINGS.templateMinSqft / SQM_TO_SQFT / (grid.res * grid.res);
    const accepted = Uint8Array.from(total, (tot, t) => (tot >= minPx && greenCount[t] / tot >= SETTINGS.templateMinGreen ? 1 : 0));
    templatesUsed = accepted.reduce((a, v) => a + v, 0);
    for (let k = 0; k < n; k++) {
      const t = labels[k] - 1;
      if (t >= 0 && accepted[t] && parcel[k] && naip.filled[k] && !trees[k] && !roofLabels[k] && !pathMask[k]) green[k] = 1;
    }
  }

  // Consolidate into lawn regions. Large lawn pieces separated by narrow gaps
  // (paths, sidewalks, shadow lines) are linked into one region, never through
  // trees, roofs or off the property. Small pieces aren't linked, so a home's
  // front lawns stay separate either side of a driveway.
  const pxSqft = grid.res * grid.res * SQM_TO_SQFT;
  const pieces = labelRegions(green, w, h);
  const big = Uint8Array.from(pieces.labels, (l) => (l && pieces.sizes[l] * pxSqft >= SETTINGS.linkMinSqft ? 1 : 0));
  const linkPx = Math.max(1, Math.round(SETTINGS.linkGapM / grid.res));
  // Small pieces within reach of a large region are absorbed into it.
  const nearBig = dilate(big, w, h, linkPx);
  const absorbed = new Uint8Array(pieces.sizes.length);
  for (let k = 0; k < n; k++) if (nearBig[k] && pieces.labels[k]) absorbed[pieces.labels[k]] = 1;
  const joining = Uint8Array.from(pieces.labels, (l) => (l && absorbed[l] ? 1 : 0));
  const linked = erode(dilate(joining, w, h, linkPx), w, h, linkPx);
  const regionMask = Uint8Array.from(green, (v, k) => (v || (linked[k] && parcel[k] && !roofLabels[k] && !trees[k] && !pathMask[k]) ? 1 : 0));

  // Outline each region. d3-contour's coordinates are in pixel units from the grid's top-left.
  const [multi] = contours().size([w, h]).thresholds([0.5])(Float64Array.from(regionMask));
  const toLonLat = ([x, y]) => grid.toLonLat([grid.x0 + x * grid.res, grid.y0 - y * grid.res]);
  const outlines = multi.coordinates.map((rings) => {
    const [outer, ...holes] = rings.map((ring) => ring.map(toLonLat));
    return { type: 'Polygon', coordinates: [outer, ...holes.filter((hole) => ringAreaSqft(hole) >= SETTINGS.minHoleSqft)] };
  });

  // Each region's area is its measured lawn pixels, not its outline, so bridged
  // paths and gaps don't inflate the total.
  const regionOf = rasterizeLabels(grid, outlines);
  const lawnPx = new Float64Array(outlines.length);
  for (let k = 0; k < n; k++) if (green[k] && regionOf[k]) lawnPx[regionOf[k] - 1]++;

  const buildingCentres = ownBuildings.map((b) => {
    const ring = polygonsOf(b.geometry)[0][0].slice(0, -1);
    return [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
  });
  const minSqft = Math.max(SETTINGS.minLawnSqft, SETTINGS.minLawnPx * pxSqft);
  // Isolated patches below this size (scaled to the property, so a home's
  // small lawns never count) are shown together as one "scattered" layer.
  const parcelSqft = parcel.reduce((a, v) => a + v, 0) * pxSqft;
  const scatteredBelow = Math.min(SETTINGS.scatteredMaxSqft, SETTINGS.scatteredShare * parcelSqft);
  const features = [];
  const scattered = [];
  let scatteredSqft = 0;
  outlines.forEach((geometry, i) => {
    const lawnSqft = lawnPx[i] * pxSqft;
    if (lawnSqft < minSqft) return;
    if (lawnSqft < scatteredBelow) {
      scattered.push(geometry.coordinates);
      scatteredSqft += lawnSqft;
      return;
    }
    const { geometry: shaped, shape } = regionShape(geometry, lawnSqft, parcelGeometry, buildingCentres, { resM: grid.res });
    features.push({
      type: 'Feature',
      geometry: shaped,
      properties: { kind: 'region', areaSqft: Math.round(lawnSqft), outlineSqft: Math.round(turfArea(shaped) * SQM_TO_SQFT), shape, confidence: null },
    });
  });
  features.sort((a, b) => b.properties.areaSqft - a.properties.areaSqft);
  if (scattered.length) {
    features.push({
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: scattered },
      properties: { kind: 'scattered', areaSqft: Math.round(scatteredSqft), patches: scattered.length, confidence: null },
    });
  }
  // Buildings over roads and paths over lawn: cut each higher layer out of the
  // ones below so nothing overlaps (simplified and rectangle outlines can
  // otherwise stray onto a path or roof).
  const buildingLayer = describeBuildings(ownBuildings, roofLabels, canopy);
  // Which roofs and paths actually touch each lawn region and path, from the
  // rasters (pixels within 2 of each other count, to catch sub-pixel overlaps),
  // so only those are cut. Each path is walked over its own pixels, so crossing
  // paths can't hide one another.
  const lawnLabels = rasterizeLabels(grid, features.map((f) => f.geometry));
  const hits = { lawn: features.map(() => ({ buildings: new Set(), paths: new Set() })), path: pathShapes.features.map(() => new Set()) };
  const ownCount = ownBuildings.length;
  const NEAR = [];
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) NEAR.push(dj * w + di);
  const near = (k) => NEAR.map((d) => k + d).filter((q) => q >= 0 && q < n);
  for (let k = 0; k < n; k++) {
    const l = lawnLabels[k] - 1;
    if (l < 0) continue;
    for (const q of near(k)) {
      const roof = roofLabels[q] - 1;
      if (roof >= 0 && roof < ownCount) hits.lawn[l].buildings.add(roof);
    }
  }
  pathShapes.features.forEach((f, p) => {
    forEachPixel(grid, f.geometry, (k) => {
      for (const q of near(k)) {
        const l = lawnLabels[q] - 1;
        if (l >= 0) hits.lawn[l].paths.add(p);
        const roof = roofLabels[q] - 1;
        if (roof >= 0 && roof < ownCount) hits.path[p].add(roof);
      }
    });
  });
  const layers = separateLayers({
    lawn: { type: 'FeatureCollection', features },
    paths: pathShapes,
    buildings: buildingLayer,
    hits: { lawn: hits.lawn.map((x) => ({ buildings: [...x.buildings], paths: [...x.paths] })), path: hits.path.map((x) => [...x]) },
  });
  const lawn = layers.lawn;

  // Paving: bare, flat, not green, not under a tree, not pool water.
  const paveMask = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (!usable[k] || green[k] || trees[k] || tall[k]) continue;
    const [r, g, b] = [naip.red[k], naip.green[k], naip.blue[k]];
    if (ndvi[k] >= SETTINGS.paveNdviMax || (r + g + b) / 3 < SETTINGS.paveMinBrightness) continue;
    if (b > r * 1.15 && b > g * 1.05) continue; // pool water
    if (measured?.known[k] && !measured.flat[k]) continue;
    paveMask[k] = 1;
  }
  const paveOpen = Math.max(1, Math.round(SETTINGS.paveOpenM / grid.res));
  const pavePieces = labelRegions(dilate(erode(paveMask, w, h, paveOpen), w, h, paveOpen), w, h);
  const paveKeep = Float64Array.from(pavePieces.labels, (l) => (l && pavePieces.sizes[l] * pxSqft >= SETTINGS.paveMinSqft ? 1 : 0));
  const [paveMulti] = contours().size([w, h]).thresholds([0.5])(paveKeep);
  const paved = {
    type: 'FeatureCollection',
    features: paveMulti.coordinates
      .map((rings) => ({ type: 'Polygon', coordinates: [rings[0].map(toLonLat)] }))
      .map((geometry) => {
        const simple = simplify({ type: 'Feature', properties: {}, geometry }, { tolerance: 0.000004, highQuality: true }).geometry;
        return { type: 'Feature', geometry: simple, properties: { kind: 'paved', areaSqft: Math.round(turfArea(simple) * SQM_TO_SQFT) } };
      })
      .filter((f) => f.properties.areaSqft >= SETTINGS.paveMinSqft),
  };

  const onParcelNotRoof = Uint8Array.from(parcel, (v, k) => (v && !roofLabels[k] ? 1 : 0));
  const nearbyRoads = describeNearbyRoads(mappedPaths, parcelGeometry);
  const streetTrees = grid.res <= SETTINGS.streetMaxResM ? await findStreetTrees(grid, box, parcelGeometry, nearbyRoads, nearbyBuildings) : [];
  const result = {
    lawn,
    totalSqft: lawn.features.reduce((s, f) => s + f.properties.areaSqft, 0),
    surveyDate: naip.dates.at(-1),
    canopyCoverage: canopy.known.reduce((s, v) => s + v, 0) / n,
    // USGS lidar used for heights, when the property is covered.
    lidar: lidar ? { source: lidar.source, year: lidar.year, points: lidar.count, grassCalibrated: Boolean(grassInt), underCanopySqft: Math.round(underCanopyPx * grid.res * grid.res * SQM_TO_SQFT) } : null,
    // Lawn that was dormant (faintly green) in the newest survey, found from the one before.
    dormant: prevNaip || grassInt ? { previousSurvey: prevNaip?.dates.at(-1) ?? null, sqft: Math.round(dormantPx * grid.res * grid.res * SQM_TO_SQFT) } : null,
    templatesUsed,
    // Mapped shapes weren't ready in time; callers shouldn't cache this result.
    templatesPending: templates === null,
    // Some canopy tiles couldn't be loaded, so trees there weren't removed; don't cache either.
    canopyIncomplete: canopy.failedTiles > 0,
    buildings: buildingLayer,
    trees: [...detectTrees(grid, canopy, onParcelNotRoof), ...streetTrees],
    paths: layers.paths,
    paved,
    nearbyRoads,
  };
  if (debug) result.debug = { grid, naip, canopy, ndvi, parcel, green, trees, rough, roofs: roofLabels, measured, newerTurf, underCanopy, tall, grassInt, prevNaip, usable };
  return result;
}
