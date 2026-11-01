// Approximate property boundary for addresses outside county parcel coverage:
// a rectangle around the building footprint at the address, aligned with the
// house, extended into the yards and stopped halfway to neighbouring houses.
// It is a starting point the user is asked to adjust, not a property line.
import turfArea from '@turf/area';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { buildingsInBox } from './buildings.js';
import { ApiError } from './errors.js';

const SQM_TO_SQFT = 10.7639;
const SEARCH_M = 90; // look for buildings this far around the address
const MATCH_M = 40; // the house must be within this distance of the address point
const MIN_HOUSE_M2 = 40; // smaller footprints are sheds or garages
const MIN_NEIGHBOR_M2 = 60;

function localFrame(lat0, lon0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  return {
    toXY: ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky],
    toLonLat: ([x, y]) => [lon0 + x / kx, lat0 + y / ky],
  };
}

const outerRings = (g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]));

function distanceToRing(p, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)));
  }
  return best;
}

// Direction of the footprint's longest edge, so the box follows the house.
function orientation(ring) {
  let best = 0;
  let angle = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const dx = ring[i + 1][0] - ring[i][0];
    const dy = ring[i + 1][1] - ring[i][1];
    const len = Math.hypot(dx, dy);
    if (len > best) {
      best = len;
      angle = Math.atan2(dy, dx);
    }
  }
  return angle;
}

export async function estimateParcel(lat, lon) {
  const dLat = SEARCH_M / 110540;
  const dLon = SEARCH_M / (111320 * Math.cos((lat * Math.PI) / 180));
  const buildings = await buildingsInBox([lon - dLon, lat - dLat, lon + dLon, lat + dLat]);

  const frame = localFrame(lat, lon);
  const point = [0, 0];
  const shapes = buildings.map((b) => ({
    ...b,
    rings: outerRings(b.geometry).map((r) => r.map(frame.toXY)),
    areaM2: turfArea(b.geometry),
  }));

  const containing = shapes.find((s) => booleanPointInPolygon([lon, lat], s.geometry));
  const house =
    containing ??
    shapes
      .filter((s) => s.areaM2 >= MIN_HOUSE_M2)
      .map((s) => ({ s, d: Math.min(...s.rings.map((r) => distanceToRing(point, r))) }))
      .filter(({ d }) => d <= MATCH_M)
      .sort((a, b) => a.d - b.d)[0]?.s;
  if (!house) {
    throw new ApiError(404, 'parcel_not_found', 'No property boundary or building was found at this address.');
  }

  // Work in a frame rotated to the house's main axis.
  const theta = orientation(house.rings[0]);
  const cos = Math.cos(-theta);
  const sin = Math.sin(-theta);
  const rot = ([x, y]) => [x * cos - y * sin, x * sin + y * cos];
  const unrot = ([x, y]) => [x * Math.cos(theta) - y * Math.sin(theta), x * Math.sin(theta) + y * Math.cos(theta)];
  const box = (rings) => {
    const pts = rings.flat().map(rot);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };

  const h = box(house.rings);
  const margin = Math.max(6, Math.min(20, 0.5 * Math.sqrt(house.areaM2)));
  let [left, right, bottom, top] = [h.x0 - margin, h.x1 + margin, h.y0 - margin, h.y1 + margin];
  for (const nb of shapes) {
    if (nb === house || nb.areaM2 < MIN_NEIGHBOR_M2) continue;
    const b = box(nb.rings);
    const overlapsY = b.y0 < h.y1 + margin && b.y1 > h.y0 - margin;
    const overlapsX = b.x0 < h.x1 + margin && b.x1 > h.x0 - margin;
    if (overlapsY && b.x0 >= h.x1) right = Math.min(right, (h.x1 + b.x0) / 2);
    if (overlapsY && b.x1 <= h.x0) left = Math.max(left, (h.x0 + b.x1) / 2);
    if (overlapsX && b.y0 >= h.y1) top = Math.min(top, (h.y1 + b.y0) / 2);
    if (overlapsX && b.y1 <= h.y0) bottom = Math.max(bottom, (h.y0 + b.y1) / 2);
  }

  const corners = [[left, bottom], [right, bottom], [right, top], [left, top]].map((p) => frame.toLonLat(unrot(p)));
  const geometry = { type: 'Polygon', coordinates: [[...corners, corners[0]]] };
  return {
    id: `est:${house.id}`,
    address: null,
    areaSqft: Math.round(turfArea(geometry) * SQM_TO_SQFT),
    geometry,
    source: 'Estimated from the building footprint (Overture Maps)',
    footprint: house.geometry,
  };
}
