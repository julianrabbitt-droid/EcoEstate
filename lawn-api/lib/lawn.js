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
import { ApiError } from './errors.js';
import { buildingsInBox } from './buildings.js';
import { forEachPixel, makeGrid, polygonsOf, rasterize, rasterizeLabels } from './grid.js';
import { findNaip, readNaip } from './naip.js';
import { osmLawnShapes } from './osmLawns.js';
import { dilate, erode, labelRegions, localStats } from './raster.js';
import { regionShape } from './shapes.js';
import { separateLayers } from './layers.js';
import { buildingsOnParcel, describeBuildings, describeNearbyRoads, describePaths, detectTrees, NEARBY } from './structures.js';

const SQM_TO_SQFT = 10.7639;

export const SETTINGS = {
  ndviMin: 0.2, // NDVI at or above this counts as green (healthy turf is usually 0.3+)
  canopyMaxM: 1, // taller than this is a tree, shrub or building, not lawn
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
  bridgeM: 1.5, // join lawn pieces split by gaps narrower than ~2× this (paths, edging), never across trees or roofs
  linkGapM: 3, // link large lawn pieces across gaps up to ~2× this (sidewalks, paths) into one region
  linkMinSqft: 2000, // only pieces at least this big are linked (keeps home lawns apart across driveways)
  scatteredMaxSqft: 500, // isolated patches smaller than this…
  scatteredShare: 0.001, // …and than this share of the property are grouped as "scattered patches"
  templateMinGreen: 0.5, // use a mapped (OpenStreetMap) lawn shape when imagery shows at least this share of it green
  templateMinSqft: 1000,
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
  const [naip, canopy, nearbyBuildings] = await Promise.all([
    readNaip(grid, items).then((r) => ((r.ms = Date.now() - t0), r)),
    readCanopy(grid).then((r) => ((r.ms = Date.now() - t0), r)),
    buildingsInBox(box).catch((err) => {
      console.warn(`building footprints unavailable: ${err.message}`);
      return [];
    }),
    // A little wider than the property, to include the roads that border it.
    osmLawnShapes(widen(box, NEARBY.extendM + NEARBY.withinM)),
  ]).then(([a, b, c, osm]) => {
    // null = OpenStreetMap features still downloading (see osmLawns.js).
    templates = osm === null ? null : osm.lawns;
    mappedPaths = osm?.paths ?? [];
    return [a, b, c];
  });
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
  for (let k = 0; k < n; k++) {
    const r = naip.red[k];
    const nir = naip.nir[k];
    ndvi[k] = r + nir ? (nir - r) / (nir + r) : 0;
    vegetation[k] = parcel[k] && naip.filled[k] && !roofLabels[k] && !pathMask[k] && ndvi[k] >= SETTINGS.ndviMin ? 1 : 0;
    tall[k] = canopy.known[k] && canopy.height[k] > SETTINGS.canopyMaxM ? 1 : 0;
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
    rough[k] = vegetation[k] && roughShare[k] >= SETTINGS.roughPatchShare ? 1 : 0;
    green[k] = vegetation[k] && !trees[k] && !rough[k] ? 1 : 0;
  }
  green = majority(green, w, h);
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

  const onParcelNotRoof = Uint8Array.from(parcel, (v, k) => (v && !roofLabels[k] ? 1 : 0));
  const result = {
    lawn,
    totalSqft: lawn.features.reduce((s, f) => s + f.properties.areaSqft, 0),
    surveyDate: naip.dates.at(-1),
    canopyCoverage: canopy.known.reduce((s, v) => s + v, 0) / n,
    templatesUsed,
    // Mapped shapes weren't ready in time; callers shouldn't cache this result.
    templatesPending: templates === null,
    buildings: buildingLayer,
    trees: detectTrees(grid, canopy, onParcelNotRoof),
    paths: layers.paths,
    nearbyRoads: describeNearbyRoads(mappedPaths, parcelGeometry),
  };
  if (debug) result.debug = { grid, naip, canopy, ndvi, parcel, green, trees, rough, roofs: roofLabels };
  return result;
}
