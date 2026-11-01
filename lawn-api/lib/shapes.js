// Snaps lawns that are nearly rectangular (playing fields, quads, courtyards)
// to clean rectangles. Detection from imagery leaves ragged edges and nibbles
// where paths, shadows and tree edges cross a lawn; real lawns are usually
// simple shapes.
import turfArea from '@turf/area';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import intersect from '@turf/intersect';
import simplify from '@turf/simplify';

const SQM_TO_SQFT = 10.7639;
export const RECTANGLE = {
  minSqft: 1500, // smaller lawns keep their traced shape
};

function localFrame([lon0, lat0]) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  return { to: ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky], back: ([x, y]) => [lon0 + x / kx, lat0 + y / ky] };
}

// Andrew's monotone chain.
function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Smallest rotated rectangle around a ring (lon/lat), as a closed lon/lat ring. */
export function minAreaRectangle(ring) {
  const frame = localFrame(ring[0]);
  const h = hull(ring.map(frame.to));
  if (h.length < 3) return null;
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const [ax, ay] = h[i];
    const [bx, by] = h[(i + 1) % h.length];
    const len = Math.hypot(bx - ax, by - ay);
    if (!len) continue;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [x, y] of h) {
      const u = x * ux + y * uy;
      const v = -x * uy + y * ux;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) best = { area, ux, uy, minU, maxU, minV, maxV };
  }
  const { ux, uy, minU, maxU, minV, maxV } = best;
  const corner = (u, v) => frame.back([u * ux - v * uy, u * uy + v * ux]);
  const r = [corner(minU, minV), corner(maxU, minV), corner(maxU, maxV), corner(minU, maxV)];
  return [...r, r[0]];
}

/**
 * Shape for one consolidated lawn region: its rectangle when the lawn inside
 * fills at least `minFill` of it (and no building sits in it), else the traced
 * outline simplified in proportion to its size. `lawnSqft` is the measured
 * lawn area, so paths or gaps bridged into the outline don't count toward fill.
 */
export function regionShape(geometry, lawnSqft, parcelGeometry, buildingCentroids, { minFill = 0.75, resM = 0.6 } = {}) {
  const outlineM2 = turfArea(geometry);
  if (lawnSqft >= RECTANGLE.minSqft) {
    const rect = minAreaRectangle(geometry.coordinates[0]);
    if (rect) {
      const rectFeature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [rect] } };
      const fill = lawnSqft / SQM_TO_SQFT / turfArea(rectFeature);
      if (fill >= minFill && !buildingCentroids.some((c) => booleanPointInPolygon(c, rectFeature))) {
        try {
          const clipped = intersect({ type: 'FeatureCollection', features: [rectFeature, { type: 'Feature', properties: {}, geometry: parcelGeometry }] });
          if (clipped?.geometry.type === 'Polygon') return { geometry: clipped.geometry, shape: 'rectangle' };
        } catch {
          /* fall through to the outline */
        }
      }
    }
  }
  // Bigger regions tolerate coarser simplification (2% of their size, 1 pixel to 3 m).
  const toleranceM = Math.min(3, Math.max(resM, 0.02 * Math.sqrt(outlineM2)));
  return { geometry: simplify({ type: 'Feature', properties: {}, geometry }, { tolerance: toleranceM / 111320, highQuality: true }).geometry, shape: 'outline' };
}
