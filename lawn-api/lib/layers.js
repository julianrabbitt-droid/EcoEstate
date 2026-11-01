// Keeps a scan's layers from overlapping. Precedence, top to bottom:
// buildings, then roads and paths, then lawn. Each lower layer has the higher
// ones cut out of it, so lawn never runs under a path or roof and a path never
// runs through a building.
import turfArea from '@turf/area';
import difference from '@turf/difference';
import union from '@turf/union';
import { polygonsOf } from './grid.js';

const SQM_TO_SQFT = 10.7639;

function bboxOf(geometry) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const rings of polygonsOf(geometry)) {
    for (const [x, y] of rings[0]) {
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
    }
  }
  return [w, s, e, n];
}
const touches = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const asFeature = (geometry) => ({ type: 'Feature', properties: {}, geometry });

// `feature` minus the given cutters (or every cutter whose bounding box overlaps
// it when no list is given); null if nothing is left.
function cut(feature, cutters, only = null) {
  const box = bboxOf(feature.geometry);
  const candidates = only ? only.map((i) => cutters[i]).filter(Boolean) : cutters;
  const hits = candidates.filter((c) => touches(box, c.box)).map((c) => asFeature(c.geometry));
  if (!hits.length) return feature.geometry;
  try {
    const blocker = hits.length > 1 ? union({ type: 'FeatureCollection', features: hits }) : hits[0];
    const rest = blocker ? difference({ type: 'FeatureCollection', features: [feature, blocker] }) : feature;
    return rest?.geometry ?? null;
  } catch {
    // The polygon library occasionally fails on near-degenerate edges; cut one
    // shape at a time instead, skipping only the ones that still fail.
    let rest = feature;
    for (const hit of hits) {
      try {
        rest = difference({ type: 'FeatureCollection', features: [rest, hit] });
      } catch {
        continue;
      }
      if (!rest) return null;
    }
    return rest.geometry;
  }
}

/**
 * Cut buildings out of paths, and buildings plus paths out of lawn. Takes and
 * returns FeatureCollections; lawn and path properties are kept, with lawn
 * `outlineSqft` updated (its measured `areaSqft` already excludes roofs and paths).
 *
 * `hits` (optional) says which shapes actually touch: hits.path[i] = building
 * indexes touching path i; hits.lawn[i] = { buildings, paths } touching lawn i.
 * Without it every shape with an overlapping bounding box is tried (slow when
 * a large property has hundreds of paths).
 */
export function separateLayers({ lawn, paths, buildings, hits = null }) {
  const withBox = (f) => ({ geometry: f.geometry, box: bboxOf(f.geometry) });
  const roofs = buildings.features.map(withBox);

  const pathFeatures = [];
  for (const [i, f] of paths.features.entries()) {
    if (hits && !hits.path[i]?.length) {
      pathFeatures.push(f);
      continue;
    }
    const geometry = cut(f, roofs, hits?.path[i]);
    if (geometry && turfArea(geometry) > 0.5) pathFeatures.push({ ...f, geometry });
  }

  // Paths keep their index (a path cut away entirely leaves a gap) so hit lists line up.
  const pathByIndex = paths.features.map((f) => pathFeatures.find((p) => p.properties === f.properties) ?? null);
  const pathBlockers = pathByIndex.map((f) => (f ? withBox(f) : null));
  const lawnFeatures = [];
  for (const [i, f] of lawn.features.entries()) {
    let geometry;
    if (hits) {
      const touching = [...(hits.lawn[i]?.buildings ?? []).map((b) => roofs[b]), ...(hits.lawn[i]?.paths ?? []).map((p) => pathBlockers[p])].filter(Boolean);
      geometry = touching.length ? cut(f, touching) : f.geometry;
    } else {
      geometry = cut(f, [...roofs, ...pathBlockers.filter(Boolean)]);
    }
    if (!geometry) continue;
    const outlineSqft = Math.round(turfArea(geometry) * SQM_TO_SQFT);
    if (outlineSqft < 1) continue;
    lawnFeatures.push({ ...f, geometry, properties: { ...f.properties, ...(f.properties.outlineSqft !== undefined ? { outlineSqft } : {}) } });
  }

  return {
    lawn: { type: 'FeatureCollection', features: lawnFeatures },
    paths: { type: 'FeatureCollection', features: pathFeatures },
  };
}
