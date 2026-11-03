import * as THREE from 'three';
import { photo } from '@/lib/photoTextures';

// Plain buildings from scanned footprints: walls and a roof, nothing else.
// The outline (noisy: jagged edges, slivers, odd angles) is squared up to its
// main direction and rebuilt from rectangles that follow its wings and bays,
// each with walls and a simple hip, gable or flat roof. Where lidar surveyed
// the roof (roof.grid), each wing takes its measured wall height, pitch and
// ridge direction from it; a large building of unusual shape (a stadium, an
// arched hangar, a sawtooth factory) follows its footprint exactly under the
// measured roof itself. Plan coordinates are feet with x east and y north; the
// returned group uses the 3D view's frame (z = -north).

const MAX_BLOCKS = 10;
const BLOCK_MIN_SQFT = 30; // smaller leftovers (scan slivers) are dropped…
const BLOCK_MIN_SHARE = 0.02; // …as are pieces under this share of the footprint
const STORY_FT = 10;
const MIN_EAVE_FT = 8.5;
const OVERHANG_FT = 1.2;
const PITCH = 5 / 12; // rise per run, a common residential roof

export const WALL_COLORS = {
  white: 0xf2efe9, beige: 0xe8dcc6, tan: 0xcfa978, cream: 0xefe6d4,
  gray: 0x9a9a96, brown: 0x6e5642, brick: 0x9a5a45, red: 0x9c4b3a,
  blue: 0x6b7d8f, green: 0x6f8175, yellow: 0xd8c47a,
};
const ROOF_COLORS = {
  flat: 0x5b5b58, gable: 0x4b4540, hip: 0x4b4540, shed: 0x4b4540, mansard: 0x3a3a3a, unknown: 0x4b4540,
};

const area = (pts) => Math.abs(pts.reduce((s, p, i) => {
  const q = pts[(i + 1) % pts.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;

function insidePoly([x, y], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Main direction of a footprint: edge angles folded into 0-90° and averaged,
// weighted by edge length, so a slightly crooked outline still squares up.
function mainAngle(pts) {
  let sx = 0;
  let sy = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]) * 4; // period 90°
    sx += Math.cos(a) * len;
    sy += Math.sin(a) * len;
  });
  return Math.atan2(sy, sx) / 4;
}

// Largest all-filled rectangle in a 0/1 grid (histogram method).
function largestRect(grid, w, h) {
  const heights = new Int32Array(w);
  let best = { area: 0 };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) heights[i] = grid[j * w + i] ? heights[i] + 1 : 0;
    const stack = [];
    for (let i = 0; i <= w; i++) {
      const cur = i < w ? heights[i] : 0;
      let start = i;
      while (stack.length && stack[stack.length - 1][1] >= cur) {
        const [s, hh] = stack.pop();
        const a = hh * (i - s);
        if (a > best.area) best = { area: a, i0: s, i1: i, j0: j - hh + 1, j1: j + 1 };
        start = s;
      }
      stack.push([start, cur]);
    }
  }
  return best;
}

/**
 * Squared-up blocks for a footprint: [{ cx, cy, w, d, angle }] in plan feet,
 * w along the main direction, d across it. Largest first.
 */
export function blocksFor(points) {
  const angle = mainAngle(points);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const rot = points.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
  const xs = rot.map((p) => p[0]);
  const ys = rot.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const total = area(points);
  // About 4,000 cells whatever the size, never finer than 1 ft.
  const cell = Math.max(1, Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000));
  const w = Math.max(1, Math.ceil((x1 - x0) / cell));
  const h = Math.max(1, Math.ceil((y1 - y0) / cell));
  const grid = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) grid[j * w + i] = insidePoly([x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell], rot) ? 1 : 0;
  }
  const blocks = [];
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  while (blocks.length < MAX_BLOCKS) {
    const r = largestRect(grid, w, h);
    const sqft = r.area * cell * cell;
    // Wings and bays are kept so the model has the scanned shape; only slivers are dropped.
    if (!r.area || sqft < Math.max(BLOCK_MIN_SQFT, total * (blocks.length ? BLOCK_MIN_SHARE : 0))) break;
    for (let j = r.j0; j < r.j1; j++) for (let i = r.i0; i < r.i1; i++) grid[j * w + i] = 0;
    const lx = x0 + ((r.i0 + r.i1) / 2) * cell;
    const ly = y0 + ((r.j0 + r.j1) / 2) * cell;
    const bw = (r.i1 - r.i0) * cell;
    const bd = (r.j1 - r.j0) * cell;
    // Keep w as the long side so ridges run lengthwise.
    const long = bw >= bd;
    blocks.push({
      cx: lx * cosA - ly * sinA,
      cy: lx * sinA + ly * cosA,
      w: long ? bw : bd,
      d: long ? bd : bw,
      angle: long ? angle : angle + Math.PI / 2,
    });
  }
  if (!blocks.length) {
    // Too thin for the grid: fall back to its squared bounding box.
    const lx = (x0 + x1) / 2;
    const ly = (y0 + y1) / 2;
    blocks.push({ cx: lx * cosA - ly * sinA, cy: lx * sinA + ly * cosA, w: Math.max(x1 - x0, 4), d: Math.max(y1 - y0, 4), angle });
  }
  return blocks;
}

// ---- Surface textures, drawn once per look and tiled in real-world feet ----
const texCache = new Map();
function canvasTexture(key, sizeFt, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  draw(c.getContext('2d'), 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.sizeFt = sizeFt;
  texCache.set(key, t);
  return t;
}
const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const shade = (n, f) => {
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
};
// Lap siding: boards 6 in tall with a shadow line under each.
function sidingTexture(color) {
  return canvasTexture(`siding:${color}`, 4, (ctx, S) => {
    const r = rand(color % 997 + 3);
    const boards = 8;
    for (let i = 0; i < boards; i++) {
      const y = (i * S) / boards;
      ctx.fillStyle = shade(color, 0.97 + r() * 0.06);
      ctx.fillRect(0, y, S, S / boards);
      const grad = ctx.createLinearGradient(0, y + S / boards - 5, 0, y + S / boards);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y + S / boards - 5, S, 5);
    }
  });
}
// Stucco: fine mottled plaster.
function stuccoTexture(color) {
  return canvasTexture(`stucco:${color}`, 3, (ctx, S) => {
    ctx.fillStyle = hex(color);
    ctx.fillRect(0, 0, S, S);
    const r = rand(color % 991 + 7);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
      const d = 1 + r() * 3;
      ctx.fillRect(r() * S, r() * S, d, d);
    }
  });
}
// Running-bond brick with mortar joints.
function brickTexture(color) {
  return canvasTexture(`brick:${color}`, 2.5, (ctx, S) => {
    ctx.fillStyle = '#cfc8bc';
    ctx.fillRect(0, 0, S, S);
    const r = rand(color % 983 + 11);
    const rows = 11;
    const bh = S / rows;
    for (let j = 0; j < rows; j++) {
      const off = j % 2 ? bh * 1.5 : 0;
      for (let x = -off; x < S; x += bh * 3) {
        ctx.fillStyle = shade(color, 0.85 + r() * 0.3);
        ctx.fillRect(x + 1.5, j * bh + 1.5, bh * 3 - 3, bh - 3);
      }
    }
  });
}
// Asphalt shingles: staggered tabs with dark gaps and granule speckle.
function shingleTexture(color) {
  return canvasTexture(`shingle:${color}`, 4, (ctx, S) => {
    const r = rand(color % 977 + 13);
    const rows = 10;
    const rh = S / rows;
    for (let j = 0; j < rows; j++) {
      const off = j % 2 ? rh * 1.4 : 0;
      for (let x = -off; x < S; x += rh * 2.8) {
        ctx.fillStyle = shade(color, 0.82 + r() * 0.36);
        ctx.fillRect(x, j * rh, rh * 2.8 - 2, rh);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, (j + 1) * rh - 2, S, 2);
    }
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(r() * S, r() * S, 1.5, 1.5);
    }
  });
}
const STUCCO_COLORS = new Set(['beige', 'tan', 'cream', 'yellow']);
function wallTexture(wallColor, color) {
  if (wallColor === 'brick' || wallColor === 'red') return brickTexture(color);
  if (STUCCO_COLORS.has(wallColor)) return stuccoTexture(color);
  return sidingTexture(color);
}

// A triangle soup (flat shaded) from quads and triangles given as plan-space
// points with heights: [x, y, z] where y is height and z is north. UVs are in
// feet along each face (horizontal, then up the face), divided by the
// texture's tile size, so siding and shingles keep a real-world scale.
function solid(faces, material, tileFt = 4) {
  const pos = [];
  const uv = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const uAxis = new THREE.Vector3();
  const vAxis = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const f of faces) {
    const pts = f.map(([x, y, n]) => new THREE.Vector3(x, y, -n));
    a.copy(pts[0]); b.copy(pts[1]); c.copy(pts[2]);
    nrm.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    uAxis.crossVectors(up, nrm);
    if (uAxis.lengthSq() < 1e-6) uAxis.set(1, 0, 0);
    uAxis.normalize();
    vAxis.crossVectors(nrm, uAxis).normalize();
    if (vAxis.y < 0) vAxis.negate();
    const tris = pts.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
    for (const t of tris) {
      for (const i of t) {
        pos.push(pts[i].x, pts[i].y, pts[i].z);
        uv.push(pts[i].dot(uAxis) / tileFt, pts[i].dot(vAxis) / tileFt);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Roof faces over a w × d block centred on the origin (local axes), ridge along x. */
function roofFaces(type, w, d, eave, rise) {
  const W = w / 2 + OVERHANG_FT;
  const D = d / 2 + OVERHANG_FT;
  const top = eave + rise;
  if (type === 'flat') {
    const y = eave + 0.6;
    return { roof: [[[-W, y, -D], [W, y, -D], [W, y, D], [-W, y, D]]], gables: [] };
  }
  if (type === 'gable') {
    const roof = [
      [[-W, eave, -D], [W, eave, -D], [W, top, 0], [-W, top, 0]],
      [[W, eave, D], [-W, eave, D], [-W, top, 0], [W, top, 0]],
    ];
    const gw = w / 2;
    const gd = d / 2;
    const gables = [
      [[-gw, eave, gd], [-gw, eave, -gd], [-gw, eave + rise * (gd / D), 0]],
      [[gw, eave, -gd], [gw, eave, gd], [gw, eave + rise * (gd / D), 0]],
    ];
    return { roof, gables };
  }
  // Hip: ridge shortened by the depth so all four sides slope equally.
  const r = Math.max(0, W - D);
  return {
    roof: [
      [[-W, eave, -D], [W, eave, -D], [r, top, 0], [-r, top, 0]],
      [[W, eave, D], [-W, eave, D], [-r, top, 0], [r, top, 0]],
      [[-W, eave, D], [-W, eave, -D], [-r, top, 0]],
      [[W, eave, -D], [W, eave, D], [r, top, 0]],
    ],
    gables: [],
  };
}

const SURVEYED_MIN_SQFT = 20000; // larger buildings with a surveyed roof (arenas, hangars) are drawn as surveyed; a courtyard block of 8,000 sq ft read as spikes
const MAX_PITCH = 14 / 12;
// A block whose quarter most level slopes less than this (rise per run) has a
// flat roof: measured flat roofs read 0.07 at most with their lidar noise,
// pitched ones 0.11 and up (2 in 12 is 0.17).
const FLAT_GRADIENT = 0.09;

// Wall and roof materials: the wall colour (or the mapped facade colour) with
// a photographed relief (CC0, Poly Haven) for its look, plaster for stucco,
// painted boards for siding, real brick for brick; the roof in its colour from
// the aerial photo, clay tile on stucco houses as on most California
// Mediterranean homes, or where mappers recorded tile.
function houseMaterials(type, scannedWall, roof) {
  const facade = (() => {
    try {
      return roof?.facadeColor ? new THREE.Color(roof.facadeColor).getHex() : null;
    } catch {
      return null;
    }
  })();
  // The roof's own colour from the aerial photo (brightened a little: the
  // survey is taken from high up, through haze), else a typical one.
  const scanned = roof?.color ? new THREE.Color(roof.color) : null;
  if (scanned) scanned.multiplyScalar(1.15);
  const roofHex = scanned ? scanned.getHex() : ROOF_COLORS[type] ?? ROOF_COLORS.unknown;
  // Clay's warmth, judged on the photo's own (sRGB) values: three's colours are
  // linear, which stretches every ratio and made grey-brown shingles read as clay.
  const srgb = scanned ? scanned.getRGB(new THREE.Color(), THREE.SRGBColorSpace) : null;
  const terracotta = srgb ? srgb.r > srgb.g * 1.12 && srgb.r > srgb.b * 1.2 : false;
  // Walls not seen yet (Street View is checked at the design step): under a
  // clay tile roof, cream stucco, as such houses are nearly always built.
  const wallColor = scannedWall || (terracotta && !facade ? 'cream' : undefined);
  const wallHex = facade ?? WALL_COLORS[wallColor] ?? WALL_COLORS.gray;
  const wallTex = wallTexture(wallColor, wallHex);
  const roofTex = type === 'flat' ? stuccoTexture(roofHex) : shingleTexture(roofHex);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.95, side: THREE.DoubleSide });
  const wallTile = wallTex.userData.sizeFt;
  const roofTile = roofTex.userData.sizeFt;
  const material = String(roof?.facadeMaterial || '').toLowerCase();
  const look = material === 'brick' || wallColor === 'brick' || wallColor === 'red'
    ? 'brick'
    : /plaster|stucco|concrete|cement|stone/.test(material) || (!material && STUCCO_COLORS.has(wallColor))
      ? 'stucco'
      : 'siding';
  const wallPhoto = { brick: 'brick_wall_001', stucco: 'beige_wall_002', siding: 'brown_planks_05' }[look];
  wallMat.normalMap = photo(wallPhoto, 'nor_gl', wallTile);
  if (look === 'brick') wallMat.map = photo('brick_wall_001', 'diffuse', wallTile);
  const roofMaterial = String(roof?.material || '').toLowerCase();
  if (type !== 'flat' && (/tile|clay/.test(roofMaterial) || (!roofMaterial && (scanned ? terracotta : look === 'stucco')))) {
    roofMat.map = photo('clay_roof_tiles_02', 'diffuse', roofTile);
    roofMat.normalMap = photo('clay_roof_tiles_02', 'nor_gl', roofTile);
  }
  return { wallMat, roofMat, wallTile, roofTile };
}

// The part of a polygon inside an axis-aligned rectangle (Sutherland–Hodgman:
// the rectangle is convex, so clipping by its four sides in turn is exact).
function clipToRect(pts, x0, x1, y0, y1) {
  let out = pts;
  const edges = [
    [(p) => p[0] >= x0, (a, b) => (x0 - a[0]) / (b[0] - a[0])],
    [(p) => p[0] <= x1, (a, b) => (x1 - a[0]) / (b[0] - a[0])],
    [(p) => p[1] >= y0, (a, b) => (y0 - a[1]) / (b[1] - a[1])],
    [(p) => p[1] <= y1, (a, b) => (y1 - a[1]) / (b[1] - a[1])],
  ];
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      const ia = inside(a);
      const ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = cut(a, b);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    if (out.length < 3) return [];
  }
  return out;
}

// A surface from triangles of [x, height, north] points, textured from above
// (feet / tile size) so the roof's pattern runs on unbroken across its facets.
function topSurface(tris, material, tileFt) {
  const pos = [];
  const uv = [];
  for (const t of tris) {
    for (const [x, y, n] of t) {
      pos.push(x, y, -n);
      uv.push(x / tileFt, n / tileFt);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Height (ft, above the average ground under the building) at a plan point,
// bilinear between the survey's cell centres.
function gridSampler({ x0, y0, dx, dy, cols, rows, h }) {
  const cell = (i, j) => h[Math.max(0, Math.min(rows - 1, j)) * cols + Math.max(0, Math.min(cols - 1, i))];
  return (x, y) => {
    const u = Math.max(0, Math.min(cols - 1, (x - x0) / dx - 0.5));
    const v = Math.max(0, Math.min(rows - 1, (y - y0) / dy - 0.5));
    const i = Math.min(cols - 2, Math.floor(u));
    const j = Math.min(rows - 2, Math.floor(v));
    const fu = u - i;
    const fv = v - j;
    return cell(i, j) * (1 - fu) * (1 - fv) + cell(i + 1, j) * fu * (1 - fv) + cell(i, j + 1) * (1 - fu) * fv + cell(i + 1, j + 1) * fu * fv;
  };
}

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
};

// What the survey says about one block: its walls' height and its roof's rise
// above them (ft, above the average ground under the building), and whether
// the roof is flat, a gable (ridge high to both ends) or a hip (ridge stopping
// short). swap: the ridge runs across the block, not along it. Null where the
// survey saw nothing roof-high there.
function surveyBlock(b, heightAt) {
  const c = Math.cos(b.angle);
  const sn = Math.sin(b.angle);
  const at = (u, v) => heightAt(b.cx + u * c - v * sn, b.cy + u * sn + v * c);
  const step = Math.max(1, Math.min(b.w, b.d) / 10);
  const all = [];
  const edge = [];
  for (let u = -b.w / 2 + step / 2; u < b.w / 2; u += step) {
    for (let v = -b.d / 2 + step / 2; v < b.d / 2; v += step) {
      const h = at(u, v);
      all.push(h);
      if (Math.abs(u) > b.w / 2 - 2.5 || Math.abs(v) > b.d / 2 - 2.5) edge.push(h);
    }
  }
  if (all.length < 6) return null;
  const top = pct(all, 0.95);
  const eave = pct(edge.length ? edge : all, 0.2);
  if (top < 6) return null;
  if (top - eave < 2) return { type: 'flat', eave: pct(all, 0.6), rise: 0 };
  // Flat roofs at more than one level (a city block's flats, with light wells,
  // parapets and a lower back) vary as much in height as a pitched one, but
  // are level between their steps: most of a pitched roof slopes, and only a
  // flat one has a good share of level ground (gradient over 4 ft).
  const grads = [];
  for (let u = -b.w / 2 + 2.5; u < b.w / 2 - 2.5; u += step) {
    for (let v = -b.d / 2 + 2.5; v < b.d / 2 - 2.5; v += step) {
      if (at(u, v) >= 6) grads.push(Math.hypot(at(u + 2, v) - at(u - 2, v), at(u, v + 2) - at(u, v - 2)) / 4);
    }
  }
  if (grads.length >= 8 && pct(grads, 0.25) < FLAT_GRADIENT) return { type: 'flat', eave: pct(all, 0.6), rise: 0 };
  // The ridge line's height along the block, and across it.
  const line = (f, len) => {
    const vals = [];
    for (let t = -len / 2 + 1; t <= len / 2 - 1; t += step) vals.push(f(t));
    return vals.length ? vals.reduce((a, x) => a + x, 0) / vals.length : 0;
  };
  const along = line((t) => at(t, 0), b.w);
  const across = line((t) => at(0, t), b.d);
  const swap = across > along + 1;
  const len = swap ? b.d : b.w;
  const ends = swap ? (at(0, len / 2 - 1.5) + at(0, -len / 2 + 1.5)) / 2 : (at(len / 2 - 1.5, 0) + at(-len / 2 + 1.5, 0)) / 2;
  return { type: ends - eave > 0.6 * (top - eave) ? 'gable' : 'hip', eave, rise: top - eave, swap };
}

// Does the surveyed height map reach over the whole footprint? (An outline
// the user redrew may not; the squared-up model stands in then.)
function gridCovers(grid, points) {
  if (!grid || !(grid.cols >= 2) || !(grid.rows >= 2) || !Array.isArray(grid.h) || grid.h.length !== grid.cols * grid.rows) return false;
  const { x0, y0, dx, dy, cols, rows } = grid;
  return points.every(([x, y]) => x >= x0 - dx && x <= x0 + (cols + 1) * dx && y >= y0 - dy && y <= y0 + (rows + 1) * dy);
}

/**
 * The building as lidar surveyed it: walls straight up the footprint's own
 * edges, under a roof that is the measured height map, cut to the footprint.
 * grid: { x0, y0, dx, dy (plan feet), cols, rows, h (feet above the average
 * ground under the building, row 0 south) }. Ground-level stretches inside
 * the outline (a courtyard, a stadium's field) stay open; steep facets (the
 * step between a garage and a two-storey wing) take the wall material.
 */
function surveyedHouse(points, grid, groundAt, wallColor, roof) {
  const { x0, y0, dx, dy, cols, rows } = grid;
  const heightAt = gridSampler(grid);
  // The roof is measured above the average ground under the building, which
  // is where the 3D view levels its pad.
  const samples = [...points, [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length]];
  const base = groundAt ? samples.reduce((s, [x, y]) => s + groundAt(x, y), 0) / samples.length : 0;
  const ground = (x, y) => (groundAt ? Math.min(groundAt(x, y), base) : base) - 0.3;
  const roofY = (x, y) => base + Math.max(0, heightAt(x, y));
  const OPEN_FT = 3; // lower than this inside the outline is ground, left open

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const roofTris = [];
  const stepTris = [];
  let flat = 0;
  let pitched = 0;
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (let j = Math.max(0, Math.floor((minY - y0) / dy)); j <= Math.min(rows - 1, Math.floor((maxY - y0) / dy)); j++) {
    for (let i = Math.max(0, Math.floor((minX - x0) / dx)); i <= Math.min(cols - 1, Math.floor((maxX - x0) / dx)); i++) {
      const X0 = x0 + i * dx;
      const Y0 = y0 + j * dy;
      const piece = clipToRect(points, X0, X0 + dx, Y0, Y0 + dy);
      if (piece.length < 3 || area(piece) < 1e-4) continue;
      const tris = THREE.ShapeUtils.triangulateShape(piece.map(([x, y]) => new THREE.Vector2(x, y)), []);
      for (const t of tris) {
        const tri = t.map((k) => [piece[k][0], roofY(piece[k][0], piece[k][1]), piece[k][1]]);
        if (tri.every((p) => p[1] - base < OPEN_FT)) continue;
        v.set(tri[1][0] - tri[0][0], tri[1][1] - tri[0][1], tri[0][2] - tri[1][2]);
        w.set(tri[2][0] - tri[0][0], tri[2][1] - tri[0][1], tri[0][2] - tri[2][2]);
        const nrm = v.cross(w).normalize();
        const a = area([[tri[0][0], tri[0][2]], [tri[1][0], tri[1][2]], [tri[2][0], tri[2][2]]]);
        if (Math.abs(nrm.y) < 0.45) stepTris.push(tri);
        else {
          roofTris.push(tri);
          if (Math.abs(nrm.y) > 0.985) flat += a;
          else pitched += a;
        }
      }
    }
  }
  if (!roofTris.length) return null;
  const { wallMat, roofMat, wallTile, roofTile } = houseMaterials(flat > pitched * 1.5 ? 'flat' : 'hip', wallColor, roof);

  // Walls along each edge, split where the edge crosses the grid so their
  // tops meet the roof's edge exactly.
  const walls = [];
  for (let k = 0; k < points.length; k++) {
    const p = points[k];
    const q = points[(k + 1) % points.length];
    const ts = [0, 1];
    for (const [a, b, o, d] of [[p[0], q[0], x0, dx], [p[1], q[1], y0, dy]]) {
      if (Math.abs(b - a) < 1e-9) continue;
      const lo = Math.ceil((Math.min(a, b) - o) / d);
      const hi = Math.floor((Math.max(a, b) - o) / d);
      for (let g = lo; g <= hi; g++) {
        const t = (o + g * d - a) / (b - a);
        if (t > 0 && t < 1) ts.push(t);
      }
    }
    ts.sort((a, b) => a - b);
    for (let m = 0; m + 1 < ts.length; m++) {
      if (ts[m + 1] - ts[m] < 1e-6) continue;
      const A = [p[0] + (q[0] - p[0]) * ts[m], p[1] + (q[1] - p[1]) * ts[m]];
      const B = [p[0] + (q[0] - p[0]) * ts[m + 1], p[1] + (q[1] - p[1]) * ts[m + 1]];
      const tA = roofY(...A);
      const tB = roofY(...B);
      if (tA - base < OPEN_FT && tB - base < OPEN_FT) continue;
      walls.push([[A[0], ground(...A), A[1]], [B[0], ground(...B), B[1]], [B[0], tB, B[1]], [A[0], tA, A[1]]]);
    }
  }
  const group = new THREE.Group();
  group.add(topSurface(roofTris, roofMat, roofTile));
  if (walls.length || stepTris.length) group.add(solid([...walls, ...stepTris], wallMat, wallTile));
  group.userData.surveyed = true;
  return group;
}

/**
 * A plain building for a footprint: walls and a roof.
 * @param {number[][]} points plan feet, x east / y north
 * @param {number|null} heightFt measured overall height, or null to estimate
 * @param {object} opts { wallColor, roofType, groundAt, roof }
 */
// groundAt(x, y): ground height (ft) at plan (x, y). With it, each block of
// the house stands on the lowest ground under its own corners, so on a hillside
// the house steps down the slope (like a split-level) instead of one floor
// level burying the uphill side; the group's y is then 0. The measured height
// is the roof above the ground beside it, so the roof sits that high over the
// block's average ground: the downhill walls run down past it (the extra
// storey of a walkout).
// roof: { color: '#rrggbb', shape: 'flat' | 'pitched', grid } measured by the
// scan, plus what mappers recorded: mappedShape (OpenStreetMap's roof:shape),
// material (roof:material), facadeMaterial and facadeColor.
export function buildHouse(points, heightFt, { wallColor, roofType, groundAt = null, roof = null } = {}) {
  const total = area(points);
  const heightAt = gridCovers(roof?.grid, points) ? gridSampler(roof.grid) : null;
  if (heightAt && total > SURVEYED_MIN_SQFT) {
    const surveyed = surveyedHouse(points, roof.grid, groundAt, wallColor, roof);
    if (surveyed) return surveyed;
  }
  const group = new THREE.Group();
  const big = total > 8000; // shops, schools, apartment blocks: flat roofs read as conventional
  // Each block as the survey measured it, its ridge turned to run the way the survey found.
  const blocks = blocksFor(points).map((b) => {
    const s = heightAt && surveyBlock(b, heightAt);
    if (!s) return { ...b, survey: null };
    return s.swap ? { ...b, w: b.d, d: b.w, angle: b.angle + Math.PI / 2, survey: s } : { ...b, survey: s };
  });
  // A shape someone mapped beats one read from the canopy model.
  const mapped = { gabled: 'gable', hipped: 'hip', pyramidal: 'hip', half_hipped: 'hip', gambrel: 'gable', mansard: 'hip', flat: 'flat', skillion: 'flat', saltbox: 'gable' }[String(roof?.mappedShape || '').toLowerCase()];
  const guessed = big ? 'flat' : mapped || (roofType === 'flat' || roof?.shape === 'flat' ? 'flat' : roofType === 'gable' ? 'gable' : 'hip');
  // The house's look follows its biggest block.
  const type = blocks[0].survey?.type || guessed;
  const { wallMat, roofMat, wallTile, roofTile } = houseMaterials(type, wallColor, roof);

  // One eave height for the blocks the survey didn't measure, so they join cleanly.
  const main = blocks[0];
  const rise = type === 'flat' ? 0 : Math.min(9, (main.d / 2) * PITCH);
  let sharedEave;
  if (heightFt > 0) sharedEave = Math.max(MIN_EAVE_FT, heightFt - rise);
  else sharedEave = Math.max(1, Math.min(4, Math.round(total / 1600))) * STORY_FT - 1;
  // Surveyed heights are above the average ground under the building, where
  // the 3D view levels its pad.
  const samples = [...points, [points.reduce((a, p) => a + p[0], 0) / points.length, points.reduce((a, p) => a + p[1], 0) / points.length]];
  const base = groundAt ? samples.reduce((a, [x, y]) => a + groundAt(x, y), 0) / samples.length : 0;

  blocks.forEach((b) => {
    const block = new THREE.Group();
    const s = b.survey;
    const blockType = s ? s.type : type;
    let blockBase = 0;
    let eave = sharedEave;
    if (groundAt) {
      const c = Math.cos(b.angle);
      const sn = Math.sin(b.angle);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [b.cx + ((u * b.w) / 2) * c - ((v * b.d) / 2) * sn, b.cy + ((u * b.w) / 2) * sn + ((v * b.d) / 2) * c]);
      const grounds = [...corners, [b.cx, b.cy]].map(([x, y]) => groundAt(x, y));
      blockBase = Math.min(...grounds);
      const mean = grounds.reduce((a, g) => a + g, 0) / grounds.length;
      eave = sharedEave + Math.min(30, mean - blockBase); // the walkout storey, at most a few floors
    }
    if (s) eave = Math.max(6, base + s.eave - blockBase);
    block.position.set(b.cx, blockBase, -b.cy);
    block.rotation.y = b.angle;
    const hw = b.w / 2;
    const hd = b.d / 2;
    const walls = [
      [[-hw, 0, -hd], [hw, 0, -hd], [hw, eave, -hd], [-hw, eave, -hd]],
      [[hw, 0, -hd], [hw, 0, hd], [hw, eave, hd], [hw, eave, -hd]],
      [[hw, 0, hd], [-hw, 0, hd], [-hw, eave, hd], [hw, eave, hd]],
      [[-hw, 0, hd], [-hw, 0, -hd], [-hw, eave, -hd], [-hw, eave, hd]],
    ];
    const blockRise = blockType === 'flat' ? 0 : s ? Math.min(s.rise, (b.d / 2) * MAX_PITCH) : Math.min(rise, (b.d / 2) * PITCH);
    const { roof: faces, gables } = roofFaces(blockType, b.w, b.d, eave, blockRise);
    block.add(solid([...walls, ...gables], wallMat, wallTile));
    block.add(solid(faces, roofMat, roofTile));
    if (blockType === 'flat') {
      // A low parapet so flat roofs don't look unfinished.
      const p = 2;
      block.add(solid([
        [[-hw, eave, -hd], [hw, eave, -hd], [hw, eave + p, -hd], [-hw, eave + p, -hd]],
        [[hw, eave, -hd], [hw, eave, hd], [hw, eave + p, hd], [hw, eave + p, -hd]],
        [[hw, eave, hd], [-hw, eave, hd], [-hw, eave + p, hd], [hw, eave + p, hd]],
        [[-hw, eave, hd], [-hw, eave, -hd], [-hw, eave + p, -hd], [-hw, eave + p, hd]],
      ], wallMat, wallTile));
    }
    group.add(block);
  });

  return group;
}
