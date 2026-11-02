import * as THREE from 'three';

// Conventional low-poly buildings from scanned footprints. Scanned outlines are
// noisy (jagged edges, slivers, odd angles), so each one is squared up to its
// main direction and rebuilt from at most a few rectangles, each with walls,
// a hip, gable or flat roof with eaves, windows on every floor and, on the main
// block, a front door facing the street. Plan coordinates are feet with x east
// and y north; the returned group uses the 3D view's frame (z = -north).

const MAX_BLOCKS = 4;
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
    // Small leftovers (bay windows, scan slivers) are dropped so the result reads as a conventional building.
    if (!r.area || sqft < Math.max(60, total * (blocks.length ? 0.1 : 0))) break;
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

const WINDOW_GEO = new THREE.PlaneGeometry(3, 4);
const DOOR_GEO = new THREE.PlaneGeometry(3.4, 7);
// Windows and doors stand slightly proud of the wall and are drawn with a depth
// bias, so they never fight the wall for the same pixels (shimmer) as the camera moves.
const proud = (units) => ({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: units });
const GLASS = new THREE.MeshStandardMaterial({ color: 0x2f3b45, roughness: 0.25, metalness: 0.3, ...proud(-4) });
const FRAME = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.8, ...proud(-2) });
const DOOR = new THREE.MeshStandardMaterial({ color: 0x5a3f2c, roughness: 0.7, ...proud(-2) });
const FRAME_GEO = new THREE.PlaneGeometry(3.6, 4.6);
const MULLION_V = new THREE.PlaneGeometry(0.16, 4);
const MULLION_H = new THREE.PlaneGeometry(3, 0.16);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const TRIM = new THREE.MeshStandardMaterial({ color: 0xf3f0e8, roughness: 0.75 });
const FOUNDATION = new THREE.MeshStandardMaterial({ color: 0x8f8b84, roughness: 1 });
const MULLION = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.8, ...proud(-6) });
/** Shared geometries and materials, so the 3D view's disposal can skip them. */
export const HOUSE_SHARED = [WINDOW_GEO, DOOR_GEO, GLASS, FRAME, DOOR, FRAME_GEO, MULLION_V, MULLION_H, BOX, TRIM, FOUNDATION, MULLION];

/**
 * A conventional building for a footprint.
 * @param {number[][]} points plan feet, x east / y north
 * @param {number|null} heightFt measured overall height, or null to estimate
 * @param {object} opts { wallColor, roofType, front: [x, y] plan point the front door should face }
 */
export function buildHouse(points, heightFt, { wallColor, roofType, front } = {}) {
  const group = new THREE.Group();
  const total = area(points);
  const blocks = blocksFor(points);
  const big = total > 8000; // shops, schools, apartment blocks: flat roofs read as conventional
  const type = big || roofType === 'flat' ? 'flat' : roofType === 'gable' ? 'gable' : 'hip';
  const wallHex = WALL_COLORS[wallColor] ?? WALL_COLORS.gray;
  const roofHex = ROOF_COLORS[type] ?? ROOF_COLORS.unknown;
  const wallTex = wallTexture(wallColor, wallHex);
  const roofTex = type === 'flat' ? stuccoTexture(roofHex) : shingleTexture(roofHex);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.95, side: THREE.DoubleSide });
  const wallTile = wallTex.userData.sizeFt;
  const roofTile = roofTex.userData.sizeFt;

  // One eave height for the whole building so the blocks join cleanly.
  const main = blocks[0];
  const rise = type === 'flat' ? 0 : Math.min(9, (main.d / 2) * PITCH);
  let eave;
  if (heightFt > 0) eave = Math.max(MIN_EAVE_FT, heightFt - rise);
  else eave = Math.max(1, Math.min(4, Math.round(total / 1600))) * STORY_FT - 1;
  const floors = Math.max(1, Math.min(8, Math.round((eave + 1) / STORY_FT)));

  // Which block side faces the street, for the door.
  let doorDone = !front;

  blocks.forEach((b, bi) => {
    const block = new THREE.Group();
    block.position.set(b.cx, 0, -b.cy);
    block.rotation.y = b.angle;
    const hw = b.w / 2;
    const hd = b.d / 2;
    const walls = [
      [[-hw, 0, -hd], [hw, 0, -hd], [hw, eave, -hd], [-hw, eave, -hd]],
      [[hw, 0, -hd], [hw, 0, hd], [hw, eave, hd], [hw, eave, -hd]],
      [[hw, 0, hd], [-hw, 0, hd], [-hw, eave, hd], [hw, eave, hd]],
      [[-hw, 0, hd], [-hw, 0, -hd], [-hw, eave, -hd], [-hw, eave, hd]],
    ];
    const blockRise = type === 'flat' ? 0 : Math.min(rise, (b.d / 2) * PITCH);
    const { roof, gables } = roofFaces(type, b.w, b.d, eave, blockRise);
    block.add(solid([...walls, ...gables], wallMat, wallTile));
    block.add(solid(roof, roofMat, roofTile));
    // Concrete foundation band, white corner boards and fascia along the eaves.
    const base = new THREE.Mesh(BOX, FOUNDATION);
    base.scale.set(b.w + 0.3, 1.2, b.d + 0.3);
    base.position.y = 0.45;
    block.add(base);
    for (const [cxx, czz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
      const post = new THREE.Mesh(BOX, TRIM);
      post.scale.set(0.45, eave, 0.45);
      post.position.set(cxx, eave / 2, -czz);
      block.add(post);
    }
    if (type !== 'flat') {
      const W2 = hw + OVERHANG_FT;
      const D2 = hd + OVERHANG_FT;
      for (const [len, x, z, ry] of [[2 * W2, 0, D2, 0], [2 * W2, 0, -D2, 0], [2 * D2, W2, 0, Math.PI / 2], [2 * D2, -W2, 0, Math.PI / 2]]) {
        const fascia = new THREE.Mesh(BOX, TRIM);
        fascia.scale.set(len, 0.55, 0.15);
        fascia.position.set(x, eave - 0.2, z);
        fascia.rotation.y = ry;
        block.add(fascia);
      }
    }
    if (type === 'flat') {
      // A low parapet so flat roofs don't look unfinished.
      const p = 2;
      block.add(solid([
        [[-hw, eave, -hd], [hw, eave, -hd], [hw, eave + p, -hd], [-hw, eave + p, -hd]],
        [[hw, eave, -hd], [hw, eave, hd], [hw, eave + p, hd], [hw, eave + p, -hd]],
        [[hw, eave, hd], [-hw, eave, hd], [-hw, eave + p, hd], [hw, eave + p, hd]],
        [[-hw, eave, hd], [-hw, eave, -hd], [-hw, eave + p, -hd], [-hw, eave + p, hd]],
      ], wallMat, wallTile));
    }

    // Windows along each side, one row per floor, skipping spots covered by another block.
    const local2plan = (lx, ln) => {
      const c = Math.cos(b.angle);
      const s = Math.sin(b.angle);
      return [b.cx + lx * c - ln * s, b.cy + lx * s + ln * c];
    };
    const coveredByOther = (lx, ln) => {
      const [px, py] = local2plan(lx, ln);
      return blocks.some((o, oi) => {
        if (oi === bi) return false;
        const c = Math.cos(-o.angle);
        const s = Math.sin(-o.angle);
        const dx = px - o.cx;
        const dy = py - o.cy;
        const u = dx * c - dy * s;
        const v = dx * s + dy * c;
        return Math.abs(u) < o.w / 2 + 0.5 && Math.abs(v) < o.d / 2 + 0.5;
      });
    };
    // Sides as (start, along, outward normal) in block-local plan coords (x along w, n across).
    const sides = [
      { o: [-hw, -hd], t: [1, 0], nrm: [0, -1], len: b.w },
      { o: [hw, -hd], t: [0, 1], nrm: [1, 0], len: b.d },
      { o: [hw, hd], t: [-1, 0], nrm: [0, 1], len: b.w },
      { o: [-hw, hd], t: [0, -1], nrm: [-1, 0], len: b.d },
    ];
    // The side whose outward normal points most toward the street gets the door.
    let doorSide = -1;
    if (!doorDone && bi === 0) {
      const [fx, fy] = front;
      let bestDot = -Infinity;
      sides.forEach((sd, si) => {
        const [mx, my] = local2plan(sd.o[0] + (sd.t[0] * sd.len) / 2, sd.o[1] + (sd.t[1] * sd.len) / 2);
        const [nx, ny] = local2plan(sd.o[0] + (sd.t[0] * sd.len) / 2 + sd.nrm[0], sd.o[1] + (sd.t[1] * sd.len) / 2 + sd.nrm[1]);
        const dot = (nx - mx) * (fx - mx) + (ny - my) * (fy - my);
        if (dot > bestDot) { bestDot = dot; doorSide = si; }
      });
    }
    sides.forEach((sd, si) => {
      const count = Math.floor((sd.len - 4) / 9);
      if (count < 1) return;
      const step = sd.len / (count + 1);
      const yaw = Math.atan2(sd.nrm[0], sd.nrm[1]); // plane faces +z before rotation; local z is -n
      for (let k = 1; k <= count; k++) {
        const along = k * step;
        const lx = sd.o[0] + sd.t[0] * along + sd.nrm[0] * 0.12;
        const ln = sd.o[1] + sd.t[1] * along + sd.nrm[1] * 0.12;
        if (coveredByOther(lx + sd.nrm[0], ln + sd.nrm[1])) continue;
        const isDoor = si === doorSide && k === Math.ceil(count / 2);
        for (let f = 0; f < floors; f++) {
          if (isDoor && f === 0) {
            const door = new THREE.Mesh(DOOR_GEO, DOOR);
            door.position.set(lx, 3.5, -ln);
            door.rotation.y = Math.PI - yaw;
            block.add(door);
            doorDone = true;
            continue;
          }
          const y = f * STORY_FT + 4.6;
          if (y + 2.5 > eave) break;
          const frame = new THREE.Mesh(FRAME_GEO, FRAME);
          frame.position.set(lx, y, -ln);
          frame.rotation.y = Math.PI - yaw;
          const glass = new THREE.Mesh(WINDOW_GEO, GLASS);
          glass.position.set(lx + sd.nrm[0] * 0.08, y, -(ln + sd.nrm[1] * 0.08));
          glass.rotation.y = Math.PI - yaw;
          // Divided-light mullions and a sill, as on a typical double-hung window.
          const mv = new THREE.Mesh(MULLION_V, MULLION);
          const mh = new THREE.Mesh(MULLION_H, MULLION);
          for (const m of [mv, mh]) {
            m.position.set(lx + sd.nrm[0] * 0.14, y, -(ln + sd.nrm[1] * 0.14));
            m.rotation.y = Math.PI - yaw;
          }
          const sill = new THREE.Mesh(BOX, TRIM);
          sill.scale.set(Math.abs(sd.t[0]) * 3.9 + Math.abs(sd.t[1]) * 0.35, 0.18, Math.abs(sd.t[1]) * 3.9 + Math.abs(sd.t[0]) * 0.35);
          sill.position.set(lx + sd.nrm[0] * 0.2, y - 2.35, -(ln + sd.nrm[1] * 0.2));
          block.add(frame, glass, mv, mh, sill);
        }
      }
    });
    group.add(block);
  });
  return group;
}
