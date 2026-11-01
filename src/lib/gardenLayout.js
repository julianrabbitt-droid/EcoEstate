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
      return pts;
    })
    .filter(Boolean);
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

// Existing mature trees kept from the scan: canopy centers in the same local
// coordinate space as preparePolys, each with a canopy radius in feet.
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

// Lattice planting: every lawn gets a clean, regular grid aligned to its own
// longest edge, filling corner to corner. Structural plants (shrubs/trees with a
// mature clearance >= 5 ft) form a coarse lattice at their real clearance so
// canopies never touch; groundcover/flower/grass species form one fine lattice
// whose pitch matches the requested density, with species repeating in a fixed
// cycle so the blend is a regular lattice, never a wavy drift. Render counts
// are capped (by widening pitch) so huge lawns don't freeze the browser; the
// planting-list quantities stay exact.
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

  const STRUCT = 5;
  const MAX_STRUCT_PER_SP = 350;
  const MAX_FILL = 1200;
  const bedAreas = beds.map(polyAreaLocal);
  const totalArea = bedAreas.reduce((s, a) => s + a, 0) || 1;
  const placed = [];

  beds.forEach((poly, bi) => {
    const area = bedAreas[bi];
    const angle = polyAngle(poly);
    const rPoly = poly.map((p) => rotateP(p, -angle));
    const xs = rPoly.map((p) => p[0]);
    const ys = rPoly.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const lattice = (pitch, inset) => {
      const pts = [];
      const cols = Math.max(1, Math.floor((maxX - minX) / pitch));
      const rowsN = Math.max(1, Math.floor((maxY - minY) / pitch));
      const ox = minX + ((maxX - minX) - cols * pitch) / 2 + pitch / 2;
      const oy = minY + ((maxY - minY) - rowsN * pitch) / 2 + pitch / 2;
      for (let r = 0; r < rowsN; r++) {
        for (let c = 0; c < cols; c++) {
          const x = ox + c * pitch;
          const y = oy + r * pitch;
          if (!inPoly(x, y, rPoly)) continue;
          if (inset > 0 && (!inPoly(x + inset, y, rPoly) || !inPoly(x - inset, y, rPoly) || !inPoly(x, y + inset, rPoly) || !inPoly(x, y - inset, rPoly))) continue;
          pts.push({ x, y });
        }
      }
      return pts;
    };
    const back = (p) => rotateP([p.x, p.y], angle);
    const reserved = [];

    // 1) Structural lattice at (at least) mature clearance, corner to corner.
    // On smaller lawns, skip a large plant if its mature canopy wouldn't leave
    // room for the fill rows — require the bed's narrow side to be at least 3x
    // the plant's clearance before placing it.
    const minDim = Math.min(maxX - minX, maxY - minY);
    items.filter((it) => it.clearance >= STRUCT).forEach((it) => {
      if (minDim < it.clearance * 3) return;
      const want = (it.qty * area) / totalArea;
      const pitch = Math.max(it.clearance, Math.sqrt(area / Math.max(1, Math.min(want, MAX_STRUCT_PER_SP))));
      const pts = lattice(pitch, pitch * 0.25);
      pts.forEach((p) => {
        if (reserved.some((rr) => Math.hypot(rr.x - p.x, rr.y - p.y) < pitch * 0.85)) return;
        const w = back(p);
        placed.push({ x: w[0], y: w[1], plant: it.plant, speciesId: it.speciesId });
        reserved.push({ x: p.x, y: p.y, r: pitch * 0.5 });
      });
    });

    // 2) Mixed fill: a staggered (brick) lattice where the species index advances
    // diagonally (row + column) so the blend reads as intersecting diagonal bands
    // of color rather than horizontal ribbons. Species interleave weighted by
    // their share so the visual mix tracks the planting-list quantities;
    // structural canopies (reserved) are skipped so the low fill weaves around
    // the anchors.
    const fill = items.filter((it) => it.clearance < STRUCT);
    if (fill.length) {
      const fillCount = fill.reduce((s, it) => s + (it.qty * area) / totalArea, 0);
      const effective = Math.min(fillCount, MAX_FILL);
      const pitch = Math.max(0.5, Math.sqrt(area / Math.max(1, effective)));
      const shares = fill.map((it) => (it.qty * area) / totalArea / Math.max(1, fillCount));
      const L = Math.max(8, Math.min(60, Math.round(effective)));
      const remain = fill.map((_, i) => ({ i, n: Math.max(1, Math.round(shares[i] * L)) }));
      const cycle = [];
      while (remain.some((r) => r.n > 0)) {
        remain.sort((a, b) => b.n - a.n);
        for (const r of remain) { if (r.n > 0) { cycle.push(r.i); r.n--; } }
      }
      if (!cycle.length) cycle.push(0);
      const cols = Math.max(1, Math.floor((maxX - minX) / pitch));
      const rowsN = Math.max(1, Math.floor((maxY - minY) / pitch));
      const ox = minX + ((maxX - minX) - cols * pitch) / 2 + pitch / 2;
      const oy = minY + ((maxY - minY) - rowsN * pitch) / 2 + pitch / 2;
      const inset = pitch * 0.2;
      const stagger = pattern === 'drifts';
      const pickIndex = (r, c) => {
        if (pattern === 'rows') return r % cycle.length;
        if (pattern === 'clusters') return (Math.floor(r / 2) + Math.floor(c / 2)) % cycle.length;
        if (pattern === 'scatter') {
          // deterministic per-cell hash so the scatter is stable across renders
          const h = (r * 73856093) ^ (c * 19349663);
          return (h >>> 0) % cycle.length;
        }
        return (r + c) % cycle.length; // drifts: diagonal bands
      };
      for (let r = 0; r < rowsN; r++) {
        // Stagger every other row by half a pitch for the drifts brick lattice;
        // rows/clusters/scatter stay aligned to the rotation for a clean grid.
        const rowOffset = stagger ? (r % 2) * (pitch / 2) : 0;
        for (let c = 0; c < cols; c++) {
          const x = ox + c * pitch + rowOffset;
          const y = oy + r * pitch;
          if (!inPoly(x, y, rPoly)) continue;
          if (inset > 0 && (!inPoly(x + inset, y, rPoly) || !inPoly(x - inset, y, rPoly) || !inPoly(x, y + inset, rPoly) || !inPoly(x, y - inset, rPoly))) continue;
          if (reserved.some((rr) => Math.hypot(rr.x - x, rr.y - y) < rr.r + pitch * 0.5)) continue;
          const sp = cycle[pickIndex(r, c)];
          const w = back({ x, y });
          placed.push({ x: w[0], y: w[1], plant: fill[sp].plant, speciesId: fill[sp].speciesId });
        }
      }
    }
  });
  return placed;
}