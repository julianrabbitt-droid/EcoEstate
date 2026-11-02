import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Prepared plant models for the 3D garden. Every plant of a form (grass,
// groundcover, shrub, flower, tree) is built from the same template: textured
// "leaf cards" (flat cut-out pictures of leaves, blades or blooms, the way games
// draw foliage) arranged into the plant's shape, so each one reads as a real
// plant and they all look consistent. Templates are unit-sized (1 ft wide and
// tall) and scaled to each species' width and height; the textures are drawn
// once and tinted per species. Three detail levels keep big gardens smooth.

const DETAIL = { high: 1.6, normal: 1, low: 0.4 };
const texCache = new Map();
const geoCache = new Map();
const matCache = new Map();
let markShared = (x) => x;
/** Tell the module how the 3D view marks reusable GPU resources (so disposal skips them). */
export function setSharedMarker(fn) {
  markShared = fn;
}

const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---- Textures (grayscale-ish, tinted by the material colour) ----
function canvasTex(key, size, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  markShared(t);
  texCache.set(key, t);
  return t;
}
const grey = (l, a = 1) => `rgba(${l},${l},${l},${a})`;

// A spray of broad leaves: each an ellipse with a darker midrib, lighter and
// darker leaves mixed so the cluster has depth.
const leafSpray = () =>
  canvasTex('leaves', 256, (ctx, S) => {
    const r = rand(11);
    for (let i = 0; i < 46; i++) {
      const x = S * (0.12 + r() * 0.76);
      const y = S * (0.12 + r() * 0.76);
      const len = S * (0.09 + r() * 0.08);
      const a = r() * Math.PI * 2;
      const l = Math.round(150 + r() * 105);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = grey(l);
      ctx.beginPath();
      ctx.ellipse(0, 0, len, len * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = grey(Math.round(l * 0.62), 0.9);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-len * 0.9, 0);
      ctx.lineTo(len * 0.9, 0);
      ctx.stroke();
      ctx.restore();
    }
  });

// Grass blades fanning up from the bottom edge, tapering to points.
const bladeFan = () =>
  canvasTex('blades', 256, (ctx, S) => {
    const r = rand(23);
    for (let i = 0; i < 38; i++) {
      const bx = S * (0.35 + r() * 0.3);
      const tipX = S * (0.05 + r() * 0.9);
      const tipY = S * (0.02 + r() * 0.35);
      const wBase = 3 + r() * 4;
      ctx.fillStyle = grey(Math.round(140 + r() * 115));
      ctx.beginPath();
      ctx.moveTo(bx - wBase, S);
      ctx.quadraticCurveTo((bx + tipX) / 2 - wBase, S * 0.55, tipX, tipY);
      ctx.quadraticCurveTo((bx + tipX) / 2 + wBase, S * 0.55, bx + wBase, S);
      ctx.closePath();
      ctx.fill();
    }
  });

// A flower head: a ring of petals around a darker eye.
const bloom = () =>
  canvasTex('bloom', 128, (ctx, S) => {
    const c = S / 2;
    const petals = 9;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(a);
      ctx.fillStyle = grey(235 + (i % 2) * 15);
      ctx.beginPath();
      ctx.ellipse(S * 0.22, 0, S * 0.2, S * 0.085, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(120,90,40,1)';
    ctx.beginPath();
    ctx.arc(c, c, S * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });

// Bark: vertical fissures over a mid-brown.
const bark = () =>
  canvasTex('bark', 128, (ctx, S) => {
    ctx.fillStyle = '#6b5442';
    ctx.fillRect(0, 0, S, S);
    const r = rand(31);
    for (let i = 0; i < 70; i++) {
      ctx.strokeStyle = r() > 0.5 ? 'rgba(30,20,12,0.45)' : 'rgba(150,125,100,0.25)';
      ctx.lineWidth = 1 + r() * 2;
      const x = r() * S;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (r() - 0.5) * 10, S);
      ctx.stroke();
    }
  });

// ---- Template geometry ----
// A card of size w x h, its bottom-centre at the origin, then rotated/placed.
function card(w, h, { x = 0, y = 0, z = 0, yaw = 0, tilt = 0, roll = 0, centred = false } = {}) {
  const g = new THREE.PlaneGeometry(w, h);
  if (!centred) g.translate(0, h / 2, 0);
  g.rotateX(tilt);
  g.rotateZ(roll);
  g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
}

// Cards scattered over an ellipsoid shell, facing outward with some randomness:
// the standard way to build a dense, rounded mass of foliage.
function shell(count, { cy, rx, ry, size, seed }) {
  const r = rand(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    // Even-ish spread over the sphere (golden-angle spiral), jittered.
    const t = (i + 0.5) / count;
    const phi = Math.acos(1 - 2 * t);
    const theta = i * 2.39996 + r() * 0.6;
    const nx = Math.sin(phi) * Math.cos(theta);
    const ny = Math.cos(phi);
    const nz = Math.sin(phi) * Math.sin(theta);
    const depth = 0.75 + r() * 0.3;
    const s = size * (0.8 + r() * 0.45);
    const g = new THREE.PlaneGeometry(s, s);
    // Face outward from the centre, then a little random spin.
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(nx, ny, nz), new THREE.Vector3(0, 1, 0));
    g.rotateZ(r() * Math.PI * 2);
    g.applyMatrix4(m);
    g.translate(nx * rx * depth, cy + ny * ry * depth, nz * rx * depth);
    out.push(g);
  }
  return out;
}

const n = (base, detail) => Math.max(2, Math.round(base * DETAIL[detail]));

function buildTemplate(form, detail) {
  const key = `${form}:${detail}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const parts = { leaf: [], bloom: [], wood: [], core: [] };
  if (form === 'grass') {
    const blades = n(6, detail);
    for (let i = 0; i < blades; i++) {
      const yaw = (i / blades) * Math.PI;
      parts.leaf.push(card(1, 1, { yaw, tilt: (i % 2 ? 1 : -1) * 0.12 }));
    }
  } else if (form === 'groundcover') {
    const r = rand(5);
    const leaves = n(10, detail);
    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * Math.PI * 2;
      const d = 0.15 + r() * 0.25;
      parts.leaf.push(card(0.55, 0.55, { x: Math.cos(a) * d, y: 0.05 + r() * 0.25, z: Math.sin(a) * d, yaw: a, tilt: -1.15 - r() * 0.3, centred: true }));
    }
    parts.core.push(new THREE.SphereGeometry(0.32, 8, 5).scale(1, 0.45, 1).translate(0, 0.12, 0));
  } else if (form === 'shrub') {
    parts.leaf.push(...shell(n(28, detail), { cy: 0.52, rx: 0.5, ry: 0.46, size: 0.42, seed: 7 }));
    parts.core.push(new THREE.SphereGeometry(0.4, 10, 7).scale(1, 0.95, 1).translate(0, 0.5, 0));
  } else if (form === 'flower') {
    const r = rand(9);
    const base = n(8, detail);
    for (let i = 0; i < base; i++) {
      const a = (i / base) * Math.PI * 2;
      parts.leaf.push(card(0.42, 0.5, { x: Math.cos(a) * 0.12, z: Math.sin(a) * 0.12, yaw: a, tilt: -0.55 }));
    }
    const stems = n(5, detail);
    for (let i = 0; i < stems; i++) {
      const a = (i / stems) * Math.PI * 2 + r();
      const d = 0.08 + r() * 0.22;
      const top = 0.65 + r() * 0.35;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      parts.wood.push(new THREE.CylinderGeometry(0.008, 0.012, top, 4).translate(x, top / 2, z));
      // Two crossed cards so the bloom reads from any angle, plus one facing up.
      const s = 0.2 + r() * 0.08;
      parts.bloom.push(card(s, s, { x, y: top, z, yaw: a, centred: true }));
      parts.bloom.push(card(s, s, { x, y: top, z, yaw: a + Math.PI / 2, centred: true }));
      parts.bloom.push(card(s, s, { x, y: top + 0.01, z, tilt: -Math.PI / 2, centred: true }));
    }
  } else {
    // tree: tapered trunk, a few limbs, layered crown
    parts.wood.push(new THREE.CylinderGeometry(0.035, 0.06, 0.6, 8).translate(0, 0.3, 0));
    const limbs = detail === 'low' ? 0 : 4;
    for (let i = 0; i < limbs; i++) {
      const a = (i / limbs) * Math.PI * 2 + 0.5;
      const limb = new THREE.CylinderGeometry(0.012, 0.025, 0.3, 5).translate(0, 0.15, 0);
      limb.rotateZ(0.7);
      limb.rotateY(a);
      limb.translate(0, 0.5, 0);
      parts.wood.push(limb);
    }
    parts.leaf.push(...shell(n(46, detail), { cy: 0.7, rx: 0.48, ry: 0.28, size: 0.3, seed: 13 }));
    parts.leaf.push(...shell(n(18, detail), { cy: 0.82, rx: 0.3, ry: 0.16, size: 0.26, seed: 17 }));
    parts.core.push(new THREE.SphereGeometry(0.4, 10, 7).scale(1, 0.55, 1).translate(0, 0.7, 0));
  }
  const merged = {};
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    // Plane and cylinder geometries carry the same attributes; drop the index so they merge.
    merged[k] = markShared(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))));
  }
  geoCache.set(key, merged);
  return merged;
}

function materials(leafColor, bloomColor, form) {
  const key = `${form}:${leafColor.getHexString()}:${bloomColor.getHexString()}`;
  if (matCache.has(key)) return matCache.get(key);
  const leafMap = form === 'grass' ? bladeFan() : leafSpray();
  const mats = {
    leaf: markShared(new THREE.MeshStandardMaterial({ map: leafMap, color: leafColor, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82 })),
    bloom: markShared(new THREE.MeshStandardMaterial({ map: bloom(), color: bloomColor, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 })),
    wood: markShared(new THREE.MeshStandardMaterial({ map: bark(), color: form === 'tree' ? 0xffffff : leafColor.clone().multiplyScalar(0.8), roughness: 0.95 })),
    // A darker inner mass so you never see daylight straight through a shrub.
    core: markShared(new THREE.MeshStandardMaterial({ color: leafColor.clone().multiplyScalar(0.45), roughness: 1 })),
  };
  matCache.set(key, mats);
  return mats;
}

/**
 * A unit-sized plant model (scale by width, height, width).
 * @param {string} form grass | groundcover | shrub | flower | tree
 * @param {THREE.Color} leafColor foliage tint
 * @param {THREE.Color} bloomColor flower tint
 * @param {'high'|'normal'|'low'} detail
 */
export function plantModel(form, leafColor, bloomColor, detail = 'normal', shadows = true) {
  const known = ['grass', 'groundcover', 'shrub', 'flower', 'tree'];
  const f = known.includes(form) ? form : 'shrub';
  const geo = buildTemplate(f, detail);
  const mats = materials(leafColor, bloomColor, f);
  const g = new THREE.Group();
  for (const part of ['core', 'wood', 'leaf', 'bloom']) {
    if (!geo[part]) continue;
    const m = new THREE.Mesh(geo[part], mats[part]);
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    g.add(m);
  }
  return g;
}
