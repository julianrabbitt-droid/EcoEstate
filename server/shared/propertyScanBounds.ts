import { areaInsideLot, normalizeRing, ringArea } from './propertyGeometry.ts';

const epsilon = 1e-8;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

function containsPoint(point, ring) {
  let inside = false;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const edge = subtract(b, a), offset = subtract(point, a);
    const dot = offset.x * edge.x + offset.y * edge.y;
    if (Math.abs(cross(edge, offset)) < epsilon && dot >= -epsilon && dot <= edge.x ** 2 + edge.y ** 2 + epsilon) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}

// Check entire edges, not just vertices: an edge can cut across a concave lot.
export function ringWithinLot(ring, lot) {
  if (ring.length < 3 || lot.length < 3 || !ring.every(point => containsPoint(point, lot))) return false;
  return ring.every((a, i) => {
    const b = ring[(i + 1) % ring.length], direction = subtract(b, a);
    const cuts = [0, 1];
    lot.forEach((c, j) => {
      const d = lot[(j + 1) % lot.length], edge = subtract(d, c);
      const denominator = cross(direction, edge);
      if (Math.abs(denominator) < 1e-12) return;
      const offset = subtract(c, a);
      const t = cross(offset, edge) / denominator, u = cross(offset, direction) / denominator;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
    });
    cuts.sort((x, y) => x - y);
    return cuts.slice(1).every((end, j) => {
      const t = (cuts[j] + end) / 2;
      return containsPoint({ x: a.x + t * direction.x, y: a.y + t * direction.y }, lot);
    });
  });
}

// Clip only the detail-view search mask, never expand the original property.
export function clipToFrame(ring, rectangle = [0, 0, 1, 1]) {
  const [left, top, right, bottom] = rectangle;
  let result = ring;
  for (const [axis, value, sign] of [['x', left, 1], ['x', right, -1], ['y', top, 1], ['y', bottom, -1]]) {
    const input = result;
    result = [];
    input.forEach((b, i) => {
      const a = input[(i + input.length - 1) % input.length];
      const aInside = (a[axis] - value) * sign >= 0;
      const bInside = (b[axis] - value) * sign >= 0;
      if (aInside !== bInside) {
        const t = (value - a[axis]) / (b[axis] - a[axis]);
        const point = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        point[axis] = value;
        result.push(point);
      }
      if (bInside) result.push(b);
    });
  }
  return normalizeRing(result.map(p => ({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) })));
}

export function boundaryIsRoof(lot, roof) {
  if (lot.length < 3 || roof.length < 3) return false;
  return areaInsideLot([{ polygon: roof, holes: [] }], lot) / ringArea(lot) > 0.8;
}