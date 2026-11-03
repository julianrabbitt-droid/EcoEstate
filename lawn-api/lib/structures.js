// Buildings and trees on a property, with heights from data:
//  - Building footprints from Overture Maps. Height, in order of preference:
//    Overture's recorded height; its floor count; the canopy height model's
//    reading over the roof (when it covers most of the footprint); otherwise
//    an estimate from footprint size. Each building says which was used.
//  - Trees from the canopy height model (Meta): crowns are local height peaks;
//    height is the measured peak, crown radius follows the typical height to
//    crown ratio, limited so neighbouring crowns don't overlap.
import turfArea from '@turf/area';
import buffer from '@turf/buffer';
import difference from '@turf/difference';
import intersect from '@turf/intersect';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { pixelCenter, polygonsOf } from './grid.js';

const M_TO_FT = 3.28084;
const SQM_TO_SQFT = 10.7639;
const FLOOR_M = 3.2;
const ROOF_M = 1.2;

export const STRUCTURES = {
  minTreeM: 3, // shorter woody plants are shrubs, not trees
  crownPerHeight: 0.28, // crown radius ≈ 0.28 × height
  minCrownM: 1.5,
  maxCrownM: 9,
  maxTrees: 800, // the tallest are kept on very large properties
  maxBuildings: 600, // the largest are kept on very large properties
  maxPaths: 1500,
};

const centroid = (geometry) => {
  const ring = polygonsOf(geometry)[0]?.[0] ?? [];
  const pts = ring.slice(0, -1);
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
};

/** Overture buildings whose centre lies on the parcel. */
export function buildingsOnParcel(buildings, parcelGeometry) {
  return buildings
    .filter((b) => booleanPointInPolygon(centroid(b.geometry), parcelGeometry))
    .map((b) => ({ ...b, areaM2: turfArea(b.geometry) }))
    .sort((a, b) => b.areaM2 - a.areaM2)
    .slice(0, STRUCTURES.maxBuildings);
}

function percentile(values, p) {
  const s = Float64Array.from(values).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function buildingHeight(b, roof, lidarRoof) {
  // Measured by lidar over this footprint (see lawn.js): the most direct.
  if (lidarRoof?.heightM && !lidarRoof.source) return { heightM: lidarRoof.heightM, source: 'lidar' };
  if (Number(b.height) > 1) return { heightM: Number(b.height), source: 'overture_height' };
  if (Number(b.floors) >= 1) return { heightM: Number(b.floors) * FLOOR_M + ROOF_M, source: 'overture_floors' };
  // Built since the survey: like-sized houses around it, as lidar measured them.
  if (lidarRoof?.heightM) return { heightM: lidarRoof.heightM, source: lidarRoof.source };
  // Canopy height model over the roof: only trusted when it reads most of the
  // footprint as raised (trees overhanging a roof cover only part of it).
  if (roof && roof.pixels >= 4 && roof.heights.length / roof.pixels >= 0.6) {
    const h = percentile(roof.heights, 0.75);
    // A house-sized roof reading taller than ~50 ft is a tree over it.
    if (h >= 2.5 && h <= (b.areaM2 < 600 ? 15 : 80)) return { heightM: h, source: 'canopy_height_model' };
  }
  // Footprint size: small footprints are usually one storey, large ones more.
  const floors = b.areaM2 < 220 ? 1 : b.areaM2 < 900 ? 2 : 3;
  return { heightM: floors * FLOOR_M + ROOF_M, source: 'footprint_estimate' };
}

/**
 * Buildings as a FeatureCollection with heightFt, heightSource, areaSqft and,
 * when the photo covers them, roofColor (the median colour of the roof in the
 * aerial photo, '#rrggbb') and roofShape ('flat' or 'pitched', from how much
 * the canopy height model varies across the roof).
 * `labels` is rasterizeLabels() over `buildings` (same order).
 */
const GARAGE_USES = new Set(['garage', 'garages', 'carport', 'parking']);

export function describeBuildings(buildings, labels, canopy, naip = null, lidarRoofs = null, roofMaps = null) {
  // Canopy heights and photo colours over each roof, gathered in one pass.
  const roofs = buildings.map(() => ({ pixels: 0, heights: [], r: [], g: [], b: [] }));
  for (let k = 0; k < labels.length; k++) {
    const roof = roofs[labels[k] - 1];
    if (!roof) continue;
    roof.pixels++;
    if (canopy.known[k] && canopy.height[k] >= 2) roof.heights.push(canopy.height[k]);
    if (naip?.filled[k]) {
      roof.r.push(naip.red[k]);
      roof.g.push(naip.green[k]);
      roof.b.push(naip.blue[k]);
    }
  }
  const hex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  const look = (roof) => {
    const out = {};
    if (roof.r.length >= 6) out.roofColor = `#${hex(percentile(roof.r, 0.5))}${hex(percentile(roof.g, 0.5))}${hex(percentile(roof.b, 0.5))}`;
    if (roof.heights.length >= 8) out.roofShape = percentile(roof.heights, 0.9) - percentile(roof.heights, 0.1) >= 1.2 ? 'pitched' : 'flat';
    return out;
  };
  return {
    type: 'FeatureCollection',
    features: buildings.map((b, i) => {
      const { heightM, source } = buildingHeight(b, roofs[i], lidarRoofs?.[i]);
      // Mapped details, when someone recorded them.
      const mapped = {};
      if (GARAGE_USES.has(String(b.use || '').toLowerCase())) mapped.use = 'garage';
      else if (b.use) mapped.use = String(b.use);
      if (b.roofShape) mapped.mappedRoofShape = String(b.roofShape);
      if (b.roofMaterial) mapped.roofMaterial = String(b.roofMaterial);
      if (b.facadeMaterial) mapped.facadeMaterial = String(b.facadeMaterial);
      if (b.facadeColor) mapped.facadeColor = String(b.facadeColor);
      // The roof's surveyed shape, a lidar height map (see lawn.js).
      if (roofMaps?.[i]) mapped.roofGrid = roofMaps[i];
      return {
        type: 'Feature',
        geometry: b.geometry,
        properties: { id: b.id, heightFt: Math.round(heightM * M_TO_FT), heightSource: source, areaSqft: Math.round(b.areaM2 * SQM_TO_SQFT), ...(b.completed ? { completed: true } : {}), ...look(roofs[i]), ...mapped },
      };
    }),
  };
}

/**
 * Tree crowns from the canopy height grid: [{ lat, lon, heightFt, radiusFt }].
 * `include` marks pixels that can hold a tree (on the parcel, not a roof).
 */
export function detectTrees(grid, canopy, include) {
  const { w, h, res } = grid;
  const H = canopy.height;
  const tall = (k) => include[k] && canopy.known[k] && H[k] >= STRUCTURES.minTreeM;
  const r = Math.max(1, Math.round(2.5 / res));

  // Local height peaks (ties broken by position so a flat top yields one peak).
  const peaks = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!tall(k)) continue;
      let isPeak = true;
      for (let dj = -r; dj <= r && isPeak; dj++) {
        const y = j + dj;
        if (y < 0 || y >= h) continue;
        for (let di = -r; di <= r; di++) {
          const x = i + di;
          if (x < 0 || x >= w || (!di && !dj)) continue;
          const q = y * w + x;
          if (H[q] > H[k] || (H[q] === H[k] && q < k)) {
            isPeak = false;
            break;
          }
        }
      }
      if (isPeak) peaks.push({ i, j, heightM: H[k] });
    }
  }

  // Tallest first; skip peaks inside an accepted tree's crown.
  peaks.sort((a, b) => b.heightM - a.heightM);
  const crown = (hm) => Math.min(STRUCTURES.maxCrownM, Math.max(STRUCTURES.minCrownM, STRUCTURES.crownPerHeight * hm));
  const trees = [];
  for (const p of peaks) {
    const radiusM = crown(p.heightM);
    let nearest = Infinity;
    let inside = false;
    for (const t of trees) {
      const d = Math.hypot(t.i - p.i, t.j - p.j) * res;
      nearest = Math.min(nearest, d);
      if (d < Math.max(t.radiusM, radiusM) * 0.8) {
        inside = true;
        break;
      }
    }
    if (inside) continue;
    trees.push({ ...p, radiusM: Math.min(radiusM, nearest * 0.6) });
    if (trees.length >= STRUCTURES.maxTrees) break;
  }
  // Earlier, shorter neighbours may have been added before a later peak; trim
  // every crown to 60% of the distance to its nearest neighbour.
  for (const t of trees) {
    for (const o of trees) {
      if (o === t) continue;
      const d = Math.hypot(t.i - o.i, t.j - o.j) * res;
      t.radiusM = Math.min(t.radiusM, Math.max(STRUCTURES.minCrownM, d * 0.6));
    }
  }
  return trees.map((t) => {
    const [lon, lat] = grid.toLonLat(pixelCenter(grid, t.i, t.j));
    return { lat: Number(lat.toFixed(7)), lon: Number(lon.toFixed(7)), heightFt: Math.round(t.heightM * M_TO_FT), radiusFt: Math.round(t.radiusM * M_TO_FT * 10) / 10 };
  });
}

// Split a centre line into open pieces before widening it. A path that loops
// around a lawn would otherwise widen into a ring whose hole (the lawn) is lost
// wherever only outer edges are kept, filling the whole lawn in as path.
const MAX_PIECE_POINTS = 24;
function openPieces(line) {
  const closed = line.length > 2 && line[0][0] === line.at(-1)[0] && line[0][1] === line.at(-1)[1];
  const max = closed ? Math.min(MAX_PIECE_POINTS, Math.max(2, Math.ceil(line.length / 3) + 1)) : MAX_PIECE_POINTS;
  const pieces = [];
  for (let i = 0; i < line.length - 1; i += max - 1) pieces.push(line.slice(i, i + max));
  return pieces.filter((piece) => piece.length >= 2);
}

function widen(p) {
  return openPieces(p.line).map((coordinates) => buffer({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }, p.widthM / 2, { units: 'meters' }));
}

/**
 * Mapped paths as paved shapes on the property: each centre line widened to
 * its width (in open pieces, so loops stay thin) and clipped to the parcel.
 * FeatureCollection of Polygons with { kind, name, widthFt }.
 */
export function describePaths(paths, parcelGeometry) {
  const parcel = { type: 'Feature', properties: {}, geometry: parcelGeometry };
  const features = [];
  for (const p of paths) {
    for (const widened of widen(p)) {
      let clipped;
      try {
        clipped = widened && intersect({ type: 'FeatureCollection', features: [widened, parcel] });
      } catch {
        continue;
      }
      if (!clipped) continue;
      for (const coordinates of polygonsOf(clipped.geometry)) {
        features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates }, properties: { kind: p.kind, name: p.name ?? null, widthFt: Math.round(p.widthM * M_TO_FT) } });
      }
    }
  }
  return { type: 'FeatureCollection', features: features.slice(0, STRUCTURES.maxPaths) };
}

/**
 * Roads and paths bordering the property (within NEARBY.withinM of its line),
 * drawn outside it for orientation. They all end along one even perimeter, the
 * property line pushed out by NEARBY.extendM, so they stop together in a tidy
 * frame instead of at ragged or boxy cut-offs. Never overlaps the property.
 * FeatureCollection of Polygons with { kind, name, widthFt, nearby: true }.
 */
export const NEARBY = { withinM: 25, extendM: 30 };

export function describeNearbyRoads(paths, parcelGeometry) {
  const parcel = { type: 'Feature', properties: {}, geometry: parcelGeometry };
  let reach;
  try {
    reach = buffer(parcel, NEARBY.withinM, { units: 'meters' });
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }
  // The perimeter they're drawn within: the property line pushed out evenly.
  let frame;
  try {
    frame = buffer(parcel, NEARBY.extendM, { units: 'meters' });
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }

  const features = [];
  for (const p of paths) {
    for (const road of widen(p)) {
      try {
        if (!road || !intersect({ type: 'FeatureCollection', features: [road, reach] })) continue; // not bordering
        const inFrame = intersect({ type: 'FeatureCollection', features: [road, frame] });
        const outside = inFrame && difference({ type: 'FeatureCollection', features: [inFrame, parcel] });
        if (!outside) continue;
        for (const coordinates of polygonsOf(outside.geometry)) {
          if (turfArea({ type: 'Polygon', coordinates }) < 5) continue;
          features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coordinates[0]] }, properties: { kind: p.kind, name: p.name ?? null, widthFt: Math.round(p.widthM * M_TO_FT), nearby: true } });
        }
      } catch {
        /* skip road pieces with invalid geometry */
      }
    }
  }
  return { type: 'FeatureCollection', features: features.slice(0, STRUCTURES.maxPaths) };
}
