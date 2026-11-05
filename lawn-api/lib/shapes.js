// Simple shapes for lawns. Detection from imagery leaves ragged edges and
// nibbles where paths, shadows and tree edges cross a lawn; real lawns are
// rectangles, ovals, simple polygons and smooth curves. These make those
// candidates in the scan grid's pixel units (lawn.js picks the simplest that
// fits the lawn found).
import simplify from '@turf/simplify';

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

/** Smallest rotated rectangle around points in a flat frame, as a closed ring. */
export function minRectangle(points) {
  const h = hull(points);
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
  const corner = (u, v) => [u * ux - v * uy, u * uy + v * ux];
  const r = [corner(minU, minV), corner(maxU, minV), corner(maxU, maxV), corner(minU, maxV)];
  return [...r, r[0]];
}

// ---- Simple lawn shapes, in the scan grid's pixel units ----
// Lawns are traced pixel by pixel, which leaves staircase edges and nibbles;
// real lawns are rectangles, ovals, simple polygons and smooth curves. These
// make those candidates (lawn.js picks the simplest that fits the lawn found).

/** The ellipse with the same centre and spread as a set of pixel centres, as a closed ring. */
export function ellipseOf(pixels, steps = 36) {
  const n = pixels.length;
  if (n < 6) return null;
  let mx = 0;
  let my = 0;
  for (const [x, y] of pixels) { mx += x; my += y; }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pixels) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  sxx /= n;
  syy /= n;
  sxy /= n;
  // A uniformly filled ellipse with semi-axes a, b has variances a²/4 and b²/4 along them.
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(1e-6, tr / 2 - disc);
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const [a, b] = [2 * Math.sqrt(l1) + 0.25, 2 * Math.sqrt(l2) + 0.25];
  const ring = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const [u, v] = [a * Math.cos(t), b * Math.sin(t)];
    ring.push([mx + u * Math.cos(angle) - v * Math.sin(angle), my + u * Math.sin(angle) + v * Math.cos(angle)]);
  }
  ring.push(ring[0]);
  return ring;
}

/** Douglas-Peucker on a closed ring at `tol` (same units), still closed. */
export function simplifyRing(ring, tol) {
  const g = simplify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }, { tolerance: tol, highQuality: true }).geometry;
  return g.coordinates[0];
}

/** Chaikin corner cutting: a polygon's corners rounded into a smooth closed curve. */
export function smoothRing(ring, rounds = 3) {
  let pts = ring.slice(0, -1);
  for (let r = 0; r < rounds; r++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      next.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    pts = next;
  }
  return [...pts, pts[0]];
}

/** Whether a closed ring crosses itself. */
export function selfIntersects(ring) {
  const n = ring.length - 1;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) {
    const [a, b] = [ring[i], ring[i + 1]];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // the two edges meeting at the first point
      const [c, d] = [ring[j], ring[j + 1]];
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
    }
  }
  return false;
}

/**
 * Every pixel whose centre lies inside a closed ring (pixel units, the grid's
 * top-left at 0, 0), row by row: visit(k) with k = row * w + column.
 */
export function eachPixelIn(ring, w, h, visit) {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [, y] of ring) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const xs = [];
  for (let j = Math.max(0, Math.floor(y0)); j <= Math.min(h - 1, Math.ceil(y1)); j++) {
    const yc = j + 0.5;
    xs.length = 0;
    for (let e = 0; e < ring.length - 1; e++) {
      const [ax, ay] = ring[e];
      const [bx, by] = ring[e + 1];
      if ((ay > yc) !== (by > yc)) xs.push(ax + ((yc - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((p, q) => p - q);
    for (let m = 0; m + 1 < xs.length; m += 2) {
      for (let i = Math.max(0, Math.ceil(xs[m] - 0.5)); i <= Math.min(w - 1, Math.floor(xs[m + 1] - 0.5)); i++) visit(j * w + i);
    }
  }
}

/**
 * A polygon squared up to an axis (ux, uy): each edge turned to run along it
 * or across it, so a lawn beside a house reads as a clean L or U. Null when
 * that leaves too few sides.
 */
export function squareUp(ring, ux, uy) {
  const pts = ring.slice(0, -1).map(([x, y]) => [x * ux + y * uy, -x * uy + y * ux]);
  const n = pts.length;
  if (n < 4) return null;
  let edges = [];
  for (let i = 0; i < n; i++) {
    const [a, b] = [pts[i], pts[(i + 1) % n]];
    const [du, dv] = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(du, dv);
    if (!len) continue;
    const alongU = Math.abs(du) >= Math.abs(dv);
    edges.push({ alongU, len, at: alongU ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2 });
  }
  // Runs of edges along the same axis become one side (length-weighted).
  for (let pass = 0; pass < 2 && edges.length > 1; pass++) {
    const merged = [];
    for (const e of edges) {
      const last = merged.at(-1);
      if (last && last.alongU === e.alongU) {
        last.at = (last.at * last.len + e.at * e.len) / (last.len + e.len);
        last.len += e.len;
      } else merged.push({ ...e });
    }
    if (merged.length > 1 && merged[0].alongU === merged.at(-1).alongU) {
      const [first, last] = [merged[0], merged.pop()];
      first.at = (first.at * first.len + last.at * last.len) / (first.len + last.len);
      first.len += last.len;
    }
    edges = merged;
  }
  if (edges.length < 4 || edges.length % 2) return null;
  const out = [];
  for (let i = 0; i < edges.length; i++) {
    const [e, f] = [edges[i], edges[(i + 1) % edges.length]];
    const [u, v] = e.alongU ? [f.at, e.at] : [e.at, f.at];
    out.push([u * ux - v * uy, u * uy + v * ux]);
  }
  return [...out, out[0]];
}

/** How many of a closed ring's corners point inward. */
export function inwardCorners(ring) {
  const pts = ring.slice(0, -1);
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1];
  let count = 0;
  for (let i = 0; i < n; i++) {
    const [a, b, c] = [pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n]];
    const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (turn * area < 0) count++;
  }
  return count;
}

/** How many of a closed ring's corners are sharper than `deg` degrees (spikes). */
export function sharpCorners(ring, deg = 35) {
  const pts = ring.slice(0, -1);
  const n = pts.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const [a, b, c] = [pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n]];
    const [ux, uy, vx, vy] = [a[0] - b[0], a[1] - b[1], c[0] - b[0], c[1] - b[1]];
    const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
    if (Math.acos(Math.max(-1, Math.min(1, cos))) < (deg * Math.PI) / 180) count++;
  }
  return count;
}
