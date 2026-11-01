const logicalSize = 640;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function ringArea(ring) {
  return Math.abs(ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
}

export function normalizeRing(value) {
  if (!Array.isArray(value) || value.length > 128) return [];
  const ring = [];
  for (const p of value) {
    if (typeof p?.x !== 'number' || typeof p?.y !== 'number' || !Number.isFinite(p.x + p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return [];
    if (!ring.length || Math.hypot(p.x - ring.at(-1).x, p.y - ring.at(-1).y) > 0.00001) ring.push({ x: p.x, y: p.y });
  }
  if (ring.length > 1 && Math.hypot(ring[0].x - ring.at(-1).x, ring[0].y - ring.at(-1).y) < 0.00001) ring.pop();
  if (ring.length < 3 || ringArea(ring) < 0.000001) return [];
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue;
      const c = ring[j], d = ring[(j + 1) % ring.length];
      if (cross(a, b, c) * cross(a, b, d) < -1e-12 && cross(c, d, a) * cross(c, d, b) < -1e-12) return [];
    }
  }
  return ring;
}

export function bounds(ring) {
  return { left: Math.min(...ring.map(p => p.x)), right: Math.max(...ring.map(p => p.x)), top: Math.min(...ring.map(p => p.y)), bottom: Math.max(...ring.map(p => p.y)) };
}

export function touchesEdge(ring) {
  if (!ring.length) return false;
  const b = bounds(ring);
  return b.left < 0.045 || b.top < 0.045 || b.right > 0.955 || b.bottom > 0.955;
}

function mercator(latLng, zoom) {
  const world = 256 * 2 ** zoom;
  const [lat, lng] = latLng;
  const x = ((lng + 180) / 360) * world;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world;
  return [x, y, world];
}

export function framePoint(frame, point) {
  const [cx, cy] = mercator([frame.lat, frame.lng], frame.zoom);
  const [px] = mercator([0, frame.lng], frame.zoom); // unused
  void px;
  const x = cx + (point.x - 0.5) * logicalSize;
  const y = cy + (point.y - 0.5) * logicalSize;
  const [, , world] = mercator([0, 0], frame.zoom);
  return [Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / world))) * (180 / Math.PI), (x / world) * 360 - 180];
}

export function latLngToFrame(frame, latLng) {
  const [cx, cy, world] = mercator([frame.lat, frame.lng], frame.zoom);
  const [px, py] = mercator(latLng, frame.zoom);
  return { x: 0.5 + (px - cx) / logicalSize, y: 0.5 + (py - cy) / logicalSize };
}

export function squareFeetPerFrame(frame) {
  const feet = (156543.033928 * Math.cos((frame.lat * Math.PI) / 180)) / 2 ** frame.zoom * logicalSize / 0.3048;
  return feet * feet; // scale=2 raises image resolution, not geographic coverage.
}

export function overviewFrame(lat, lng, recordSqft) {
  const spanMeters = Math.max(260, Math.sqrt((recordSqft || 0) * 0.09290304 * 3) * 1.8);
  const zoom = clamp(Math.floor(Math.log2((156543.033928 * Math.cos((lat * Math.PI) / 180) * logicalSize) / spanMeters)), 12, 18);
  return { lat, lng, zoom };
}

// Frame the satellite view to fit an authoritative public-data outline (e.g. a campus or park).
export function frameForOutline(outline) {
  const lats = outline.map((p) => p[0]);
  const lngs = outline.map((p) => p[1]);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const cosLat = Math.cos((lat * Math.PI) / 180) || 0.0001;
  const spanMeters = Math.max((Math.max(...lats) - Math.min(...lats)) * 111320, (Math.max(...lngs) - Math.min(...lngs)) * 111320 * cosLat) * 1.12;
  const zoom = clamp(Math.floor(Math.log2((156543.033928 * cosLat * logicalSize) / spanMeters)), 12, 18);
  return { lat, lng, zoom };
}

export function fitFrame(frame, ring, clipped = false) {
  if (!ring.length) return { ...frame, zoom: Math.max(12, frame.zoom - 1) };
  const b = bounds(ring);
  const [lat, lng] = framePoint(frame, { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });
  const extent = Math.max(b.right - b.left, b.bottom - b.top, 0.02);
  const zoom = clipped ? frame.zoom - 1 : Math.floor(frame.zoom + Math.log2(0.68 / extent));
  return { lat, lng, zoom: clamp(zoom, 12, 20) };
}

function intervals(ring, y) {
  const xs = [];
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length];
    if ((p.y > y) !== (q.y > y)) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y || 1e-12));
  });
  xs.sort((a, b) => a - b);
  const spans = [];
  for (let i = 0; i + 1 < xs.length; i += 2) spans.push([xs[i], xs[i + 1]]);
  return spans;
}

function featureIntervals(feature, y) {
  let spans = intervals(feature.polygon, y);
  for (const hole of feature.holes || []) {
    for (const [left, right] of intervals(hole, y)) {
      spans = spans.flatMap(([a, b]) => (b <= left || a >= right ? [[a, b]] : [[a, Math.min(b, left)], [Math.max(a, right), b]].filter(([l, r]) => r > l)));
    }
  }
  return spans;
}

// Integrate clipped interval unions: concave parcels, holes, and overlapping lawns
// are handled without inventing area or counting the same ground twice.
export function areaInsideLot(features, lot) {
  if (!features.length || !lot.length) return 0;
  const b = bounds(lot), dy = (b.bottom - b.top) / 768;
  let area = 0;
  for (let row = 0; row < 768; row++) {
    const y = b.top + (row + 0.5) * dy;
    const parcel = intervals(lot, y);
    const spans = features.flatMap((f) => featureIntervals(f, y)).flatMap(([a, z]) => parcel.map(([l, r]) => [Math.max(a, l), Math.min(z, r)]).filter(([l, r]) => r > l)).sort((a, z) => a[0] - z[0]);
    let left = 0, right = 0;
    for (const [a, z] of spans) {
      if (a > right) { area += (right - left) * dy; left = a; right = z; } else right = Math.max(right, z);
    }
    area += (right - left) * dy;
  }
  return area;
}