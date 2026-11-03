import { plantById } from '@/data/nativePlants';

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function polyAreaLocal(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function projectOrigin(project) {
  const b = project?.boundary;
  if (Array.isArray(b) && b.length && Array.isArray(b[0]) && b[0].length >= 3) {
    const polys = Array.isArray(b[0][0]) ? b : [b];
    const all = polys.flat();
    const minLat = Math.min(...all.map((p) => p[0]));
    const maxLat = Math.max(...all.map((p) => p[0]));
    const minLng = Math.min(...all.map((p) => p[1]));
    const latC = (minLat + maxLat) / 2;
    const cosLat = Math.cos((latC * Math.PI) / 180) || 0.0001;
    return { minLat, minLng, cosLat };
  }
  return null;
}

export function preparePolys(project) {
  const origin = projectOrigin(project);
  if (origin) {
    const { minLat, minLng, cosLat } = origin;
    const b = project?.boundary;
    const polys = Array.isArray(b[0][0]) ? b : [b];
    return polys
      .map((poly) => poly.map((p) => [(p[1] - minLng) * 364000 * cosLat, (p[0] - minLat) * 364000]))
      .filter((poly) => poly.length >= 3);
  }
  const area = project?.breakdown?.turf || project?.totalSqft || 1200;
  const side = Math.sqrt(area);
  return [[[0, 0], [side, 0], [side, side], [0, side]]];
}

// Building footprints (one polygon per roofed structure) in the same local
// coordinate space as preparePolys, so they can be extruded into 3D in the
// design model. Returns [] when the autoscan stored no buildings.
export function prepareBuildings(project) {
  const origin = projectOrigin(project);
  const buildings = project?.buildings;
  if (!origin || !Array.isArray(buildings) || !buildings.length) return [];
  const { minLat, minLng, cosLat } = origin;
  // Measured heights from the lawn scan (project.buildingHeightsFt, same order)
  // ride along on each footprint as .heightFt; null means "estimate it".
  const heights = Array.isArray(project?.buildingHeightsFt) ? project.buildingHeightsFt : [];
  return buildings
    .map((poly, i) => {
      if (!Array.isArray(poly) || poly.length < 3 || !Array.isArray(poly[0]) || poly[0].length < 2) return null;
      const pts = poly.map((p) => [(p[1] - minLng) * 364000 * cosLat, (p[0] - minLat) * 364000]);
      pts.heightFt = Number(heights[i]) > 0 ? Number(heights[i]) : null;
      // { color, shape, mapped shape and materials, grid } from the scan, when known.
      const roof = project?.buildingRoofs?.[i] || null;
      pts.roof = roof && { ...roof, grid: planGrid(roof.grid, origin) };
      return pts;
    })
    .filter(Boolean);
}

// A roof's lidar height map (lon/lat cells, decimetres; see the lawn API's
// roofHeightMap) in plan feet: { x0, y0, dx, dy, cols, rows, h (feet) }.
function planGrid(g, { minLat, minLng, cosLat }) {
  if (!g || !(g.cols >= 2) || !(g.rows >= 2) || !Array.isArray(g.h) || g.h.length !== g.cols * g.rows) return null;
  return {
    x0: (g.lon0 - minLng) * 364000 * cosLat,
    y0: (g.lat0 - minLat) * 364000,
    dx: g.dLon * 364000 * cosLat,
    dy: g.dLat * 364000,
    cols: g.cols,
    rows: g.rows,
    h: g.h.map((v) => (Number(v) || 0) * 0.328084),
  };
}

/**
 * What the scan knew about each roof, for an edited list of outlines: an
 * unchanged outline keeps its roof, anything new or reshaped gets null.
 */
export function carryBuildingRoofs(newBuildings, oldBuildings, oldRoofs) {
  const byShape = new Map((oldBuildings || []).map((ring, i) => [JSON.stringify(ring), oldRoofs?.[i] ?? null]));
  return (newBuildings || []).map((ring) => byShape.get(JSON.stringify(ring)) ?? null);
}

/**
 * Heights for an edited list of building outlines: an outline that wasn't
 * changed keeps its measured height, anything new or reshaped gets null.
 */
export function carryBuildingHeights(newBuildings, oldBuildings, oldHeights) {
  const byShape = new Map((oldBuildings || []).map((ring, i) => [JSON.stringify(ring), oldHeights?.[i] ?? null]));
  return (newBuildings || []).map((ring) => byShape.get(JSON.stringify(ring)) ?? null);
}

// Property (lot) outline in the same local coordinate space as preparePolys, so it
// can be used as the model's outer footprint. Returns null when no lot is stored.
export function prepareLot(project) {
  const origin = projectOrigin(project);
  const lot = project?.lotOutline;
  if (!origin || !Array.isArray(lot) || lot.length < 3 || !Array.isArray(lot[0]) || lot[0].length < 2) return null;
  const { minLat, minLng, cosLat } = origin;
  return lot.map((p) => [(p[1] - minLng) * 364000 * cosLat, (p[0] - minLat) * 364000]);
}

export function prepareTrees(project) {
  const origin = projectOrigin(project);
  const trees = project?.trees;
  if (!origin || !Array.isArray(trees) || !trees.length) return [];
  const { minLat, minLng, cosLat } = origin;
  return trees
    .map((t) => {
      const ll = t?.latLng;
      if (!Array.isArray(ll) || ll.length < 2 || typeof ll[0] !== 'number' || typeof ll[1] !== 'number') return null;
      return {
        x: (ll[1] - minLng) * 364000 * cosLat,
        y: (ll[0] - minLat) * 364000,
        radiusFt: Math.max(2, Number(t?.radiusFt) || 4),
        heightFt: Number(t?.heightFt) > 0 ? Number(t.heightFt) : null, // measured canopy height, when scanned
      };
    })
    .filter(Boolean);
}

// Existing hardscape paths (walkways/driveways) as polygons in the same local
// coordinate space as preparePolys. Returns [] when the scan stored none.
export function preparePaths(project) {
  const origin = projectOrigin(project);
  const paths = project?.paths;
  if (!origin || !Array.isArray(paths) || !paths.length) return [];
  const { minLat, minLng, cosLat } = origin;
  return paths
    .map((p) => {
      const poly = p?.polygonLatLng;
      if (!Array.isArray(poly) || poly.length < 3 || !Array.isArray(poly[0]) || poly[0].length < 2) return null;
      const pts = poly.map((ll) => [(ll[1] - minLng) * 364000 * cosLat, (ll[0] - minLat) * 364000]);
      // Road or path type and street name (from the lawn scan) ride along on the outline.
      pts.kind = p.kind || 'footway';
      pts.name = p.name || null;
      return pts;
    })
    .filter(Boolean);
}

// Planting layout. Every lawn gets its share of the planting list (by area)
// and the plants spread evenly over all of it, edge to edge, with no bare
// patches or crowding:
// - rows and drifts: a grid (square for rows, staggered for drifts) along the
//   lawn's longest edge, its spacing fitted so the plants fill the shape;
// - clusters and scatter: natural, irregular spacing (best-candidate sampling).
// The large plants (shrubs and trees) take the spots furthest from each other
// first; the rest are given out by pattern: rows in bands, drifts in diagonal
// sweeps, clusters in small groups of one species, scatter mixed through.
// Render counts are capped so huge lawns don't freeze the browser; the
// planting-list quantities stay exact. Each spot carries `spacing`, the
// distance to its neighbours, so plants can be drawn wide enough to meet.
const rotateP = (p, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};
const polyAngle = (poly) => {
  let best = 0, bestLen = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len > bestLen) { bestLen = len; best = Math.atan2(y2 - y1, x2 - x1); }
  }
  return best;
};

const MAX_PLANTS = 1200;
const STRUCT_FT = 5; // plants this wide or wider are placed first, apart
// Small seeded random numbers, so a layout is the same every time it's drawn.
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const edgeDist = (x, y, poly) => {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const ex = bx - ax;
    const ey = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, Math.hypot(x - ax - t * ex, y - ay - t * ey));
  }
  return d;
};

// n spots spread evenly inside poly (already turned to its long edge).
function spotsIn(poly, n, pattern, random) {
  if (n <= 0) return [];
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const area = polyAreaLocal(poly);
  const inside = (x, y, margin) => inPoly(x, y, poly) && edgeDist(x, y, poly) >= margin;
  const grid = (pitch) => {
    const pts = [];
    const stagger = pattern === 'drifts';
    const rows = Math.ceil((y1 - y0) / pitch) + 1;
    const cols = Math.ceil((x1 - x0) / pitch) + 1;
    for (let r = 0; r < rows; r++) {
      const off = stagger && r % 2 ? pitch / 2 : 0;
      for (let c = 0; c < cols; c++) {
        const x = x0 + pitch / 2 + c * pitch + off;
        const y = y0 + pitch / 2 + r * pitch;
        if (inside(x, y, pitch * 0.3)) pts.push({ x, y });
      }
    }
    return pts;
  };
  let pts = [];
  if (pattern === 'rows' || pattern === 'drifts') {
    // The widest spacing that still fits all n, then trimmed to exactly n.
    let [lo, hi] = [0.3, Math.max(1, Math.sqrt(area / n) * 2)];
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (grid(mid).length >= n) lo = mid;
      else hi = mid;
    }
    pts = grid(lo);
    if (pts.length > n) pts = Array.from({ length: n }, (_, k) => pts[Math.floor((k * pts.length) / n)]);
  }
  // Natural spacing (or topping up a grid): each new spot is the best of a few
  // random candidates, the one furthest from every spot so far and the edge.
  const margin = Math.min(Math.sqrt(area / n) * 0.3, 1.5);
  let guard = 0;
  while (pts.length < n && guard++ < n * 40) {
    let best = null;
    for (let k = 0; k < 40; k++) {
      const x = x0 + random() * (x1 - x0);
      const y = y0 + random() * (y1 - y0);
      if (!inside(x, y, margin)) continue;
      let d = edgeDist(x, y, poly) * 2;
      for (const p of pts) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
      if (!best || d > best.d) best = { x, y, d };
    }
    if (best) pts.push({ x: best.x, y: best.y });
  }
  return fillGaps(pts, poly, Math.sqrt(area / n), inside);
}

// Narrow arms and odd corners can still be left bare (a grid can't reach into
// them): while some part of the lawn is well over one spacing from every plant,
// move the most crowded plant there. Skipped past a few hundred plants, where
// the spacing is too fine for gaps to show.
function fillGaps(pts, poly, pitch, inside) {
  if (pts.length < 2 || pts.length > 500) return pts;
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const step = pitch / 2;
  const samples = [];
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) if (inside(x, y, 0)) samples.push([x, y]);
  }
  for (let iter = 0; iter < Math.min(60, pts.length); iter++) {
    let far = null;
    for (const [x, y] of samples) {
      let d = Infinity;
      for (const p of pts) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
      if (!far || d > far.d) far = { x, y, d };
    }
    if (!far || far.d <= pitch * 1.15) break;
    let crowded = -1;
    let tight = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = 0; j < pts.length; j++) {
        if (i === j) continue;
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d < tight) [tight, crowded] = [d, i];
      }
    }
    if (tight >= far.d) break; // nothing is more crowded than the gap is bare
    pts[crowded] = { x: far.x, y: far.y };
  }
  return pts;
}

// Whole numbers that add up to total, in proportion to weights.
function apportion(weights, total) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w * total) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => {
    if (left-- > 0) out[i]++;
  });
  return out;
}

export function arrangePlants(polys, entries, pattern = 'drifts') {
  const beds = (polys || []).filter((p) => p.length >= 3);
  if (!beds.length) return [];
  const items = entries
    .map((e) => {
      const plant = plantById(e.speciesId);
      if (!plant) return null;
      const clearance = Math.max(plant.spacing || 1, plant.w || 1);
      return { plant, speciesId: e.speciesId, qty: Math.max(1, Math.round(e.quantity || 1)), clearance };
    })
    .filter(Boolean);
  if (!items.length) return [];

  // Drawn counts: the list's quantities, scaled down together past MAX_PLANTS.
  const listed = items.reduce((a, it) => a + it.qty, 0);
  const drawn = apportion(items.map((it) => it.qty), Math.min(listed, MAX_PLANTS)).map((n) => Math.max(1, n));
  const areas = beds.map(polyAreaLocal);
  // Plants per lawn by area (every lawn gets at least one while there are
  // enough to go round), then each species dealt across the lawns in turn, so
  // a few big shrubs don't all land in the largest lawn.
  const total = drawn.reduce((a, b) => a + b, 0);
  const order = areas.map((a, bi) => [a, bi]).sort((a, b) => b[0] - a[0]).map(([, bi]) => bi);
  const seeded = order.slice(0, Math.min(total, beds.length));
  const bedCount = apportion(areas, total - seeded.length);
  seeded.forEach((bi) => bedCount[bi]++);
  const perBed = items.map(() => beds.map(() => 0));
  const remaining = drawn.slice();
  const room = bedCount.slice();
  while (remaining.some((c) => c > 0)) {
    const si = remaining.indexOf(Math.max(...remaining));
    const bi = room.indexOf(Math.max(...room));
    perBed[si][bi]++;
    remaining[si]--;
    room[bi]--;
  }
  const placed = [];

  beds.forEach((poly, bi) => {
    const angle = polyAngle(poly);
    const rPoly = poly.map((p) => rotateP(p, -angle));
    const left = items.map((_, si) => perBed[si][bi]);
    const n = left.reduce((a, b) => a + b, 0);
    if (!n) return;
    const random = rng(bi * 7919 + n * 31 + pattern.length);
    const spots = spotsIn(rPoly, n, pattern, random);
    const spacing = Math.sqrt(areas[bi] / Math.max(1, spots.length));
    const free = new Set(spots.map((_, k) => k));
    const take = (k, si) => {
      free.delete(k);
      left[si]--;
      const [x, y] = rotateP([spots[k].x, spots[k].y], angle);
      placed.push({ x, y, plant: items[si].plant, speciesId: items[si].speciesId, spacing });
    };

    // 1) Large plants: each takes the free spot furthest from the large ones
    // already placed (and from the edge), so they stand apart.
    const anchors = [];
    items.forEach((it, si) => {
      if (it.clearance < STRUCT_FT) return;
      while (left[si] > 0 && free.size) {
        let [best, bestD] = [-1, -1];
        for (const k of free) {
          let d = edgeDist(spots[k].x, spots[k].y, rPoly) * 1.5;
          for (const a of anchors) d = Math.min(d, Math.hypot(a.x - spots[k].x, a.y - spots[k].y));
          if (d > bestD) [bestD, best] = [d, k];
        }
        anchors.push(spots[best]);
        take(best, si);
      }
    });

    // 2) The rest, by pattern.
    const order = [...free];
    if (pattern === 'rows' || pattern === 'drifts') {
      // Bands: rows run along the lawn, drifts sweep diagonally across it; each
      // species gets several bands spread through, so none owns one end.
      const key = (p) => (pattern === 'rows' ? p.y : p.x * 0.7 + p.y);
      order.sort((a, b) => key(spots[a]) - key(spots[b]) || spots[a].x - spots[b].x);
      const bands = Math.max(1, Math.round(order.length / Math.max(1, items.length * 6)));
      const chunks = [];
      left.forEach((c, si) => apportion(Array(bands).fill(1), c).forEach((m, b) => chunks.push({ si, m, b })));
      chunks.sort((a, b) => a.b - b.b || a.si - b.si);
      let k = 0;
      chunks.forEach(({ si, m }) => {
        for (let t = 0; t < m && k < order.length; t++) take(order[k++], si);
      });
    } else if (pattern === 'clusters') {
      // Groups of 3 to 7 of one species, each grown outward from a free spot;
      // species take turns, the one with the most left first.
      while (free.size && left.some((c) => c > 0)) {
        const start = spots[[...free][Math.floor(random() * free.size)]];
        const si = left.indexOf(Math.max(...left));
        const size = Math.min(left[si], 3 + Math.floor(random() * 5));
        const dist = (k) => Math.hypot(spots[k].x - start.x, spots[k].y - start.y);
        [...free].sort((a, b) => dist(a) - dist(b)).slice(0, size).forEach((k) => take(k, si));
      }
    } else {
      // Scatter: species mixed through at random, in their proportions.
      const seq = [];
      left.forEach((c, si) => { for (let t = 0; t < c; t++) seq.push(si); });
      for (let k = seq.length - 1; k > 0; k--) {
        const r = Math.floor(random() * (k + 1));
        [seq[k], seq[r]] = [seq[r], seq[k]];
      }
      order.forEach((k, idx) => { if (idx < seq.length) take(k, seq[idx]); });
    }
  });
  return placed;
}
