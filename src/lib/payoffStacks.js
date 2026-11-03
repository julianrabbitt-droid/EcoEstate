import * as THREE from 'three';

// The Payoff step's 3D picture: what the garden gives back, standing in front
// of the property. Money saved is a stack of cash bundles; water saved is a
// block of water at its true volume (7.48 gallons to a cubic foot), one layer
// per year. Both sit on level pads out front, toward the street, one to each
// side, so the garden between them stays in view (and in Real 3D they stand
// where Google's trees and cars are already cleared away).

const GAL_PER_FT3 = 7.48052;
const BUNDLE = { w: 3.4, h: 0.6, d: 1.5 }; // a bill bundle, drawn about 6x real size so it reads from the street
const PER_COLUMN = 10;
const MAX_BUNDLES = 60;
const DENOMS = [10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const GAP_FT = 3; // between the front lot line and a stack
const MID_GAP_FT = 4; // at least this far either side of the middle of the lot

// How many bundles, and what each stands for: the smallest bundle that keeps
// the pile to 60, so small savings still make a pile and big ones never tower.
export function cashPlan(dollars) {
  const denom = DENOMS.find((d) => dollars / d <= MAX_BUNDLES) || DENOMS[DENOMS.length - 1];
  return { denom, count: Math.max(0, Math.round(dollars / denom)) };
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// The top bill: green paper, a border, a portrait oval and the denomination.
function billTexture(denom) {
  return canvasTex(512, 228, (ctx, w, h) => {
    ctx.fillStyle = '#8fae7f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#34502f';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, w - 56, h - 56);
    ctx.fillStyle = '#7c9b6c';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, 58, 74, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#34502f';
    ctx.stroke();
    ctx.fillStyle = '#25391f';
    ctx.font = '700 54px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = denom >= 1000 ? `$${denom / 1000}k` : `$${denom}`;
    ctx.fillText(label, 92, 64);
    ctx.fillText(label, w - 92, h - 64);
    ctx.font = '600 22px Georgia, serif';
    ctx.fillText('EcoEstate savings', w / 2, h - 40);
  });
}

// The bundle's edges: stacked paper, with the band around its middle.
function edgeTexture() {
  return canvasTex(256, 64, (ctx, w, h) => {
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = y % 6 ? '#b3c4a2' : '#8ea47e';
      ctx.fillRect(0, y, w, 3);
    }
    ctx.fillStyle = '#d6c48f';
    ctx.fillRect(w * 0.42, 0, w * 0.16, h);
  });
}

// A floating label: a dark glass tag with one bold line and smaller ones.
export function tagSprite(lines, width) {
  const W = 640;
  const H = 72 + 46 * (lines.length - 1) + 26;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(13, 22, 17, 0.88)';
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 28);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillStyle = i ? '#c9d6c3' : '#ffffff';
    ctx.font = i ? '500 30px "Inter Tight", Helvetica, Arial, sans-serif' : '600 46px "Inter Tight", Helvetica, Arial, sans-serif';
    ctx.fillText(line, W / 2, 50 + i * 46);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false }));
  sprite.scale.set(width, (width * H) / W, 1);
  sprite.renderOrder = 20;
  sprite.userData.halfHeight = (width * H) / W / 2;
  return sprite;
}

// A level stone pad under a stack, deep enough to meet sloping ground.
function pad(w, d, lowest, highest) {
  const h = highest - lowest + 0.95; // reaches down past a curb to the road
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x9c9a90, roughness: 0.95 }));
  mesh.position.y = lowest - 0.6 + h / 2;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return { mesh, top: lowest - 0.6 + h };
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');

/**
 * dollars, gallons: saved over `years`. lotPts: the lot in scene feet [[x, z]].
 * front: { dx, dz }, the unit direction from the property toward its street.
 * at(x, z): ground height. Returns { group, items, bounds } where items are
 * the bundles and water layers in the order they appear ({ obj, at: 0..1 }),
 * and bounds frames the lot and both stacks for the camera.
 */
export function createPayoffStacks({ dollars, gallons, years, lotPts, front, at }) {
  const group = new THREE.Group();
  group.userData.payoff = true;
  const items = [];
  const f = front && Math.hypot(front.dx, front.dz) > 0 ? front : { dx: 0, dz: 1 };
  const s = { dx: -f.dz, dz: f.dx }; // across the front of the lot
  const pts = lotPts?.length >= 3 ? lotPts : [[-30, -30], [30, -30], [30, 30], [-30, 30]];
  const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
  const along = (p, v) => (p[0] - c[0]) * v.dx + (p[1] - c[1]) * v.dz;
  const maxF = Math.max(...pts.map((p) => along(p, f)));
  const minS = Math.min(...pts.map((p) => along(p, s)));
  const maxS = Math.max(...pts.map((p) => along(p, s)));
  const place = (sideOffset, frontOffset) => [c[0] + s.dx * sideOffset + f.dx * frontOffset, c[1] + s.dz * sideOffset + f.dz * frontOffset];
  const facing = Math.atan2(f.dx, f.dz); // local +z toward the street
  const lowHigh = (x, z, hw, hd) => {
    const hs = [];
    for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
      const [ox, oz] = [s.dx * u * hw + f.dx * v * hd, s.dz * u * hw + f.dz * v * hd];
      hs.push(at(x + ox, z + oz));
    }
    return [Math.min(...hs), Math.max(...hs)];
  };
  const framed = [...pts];

  // Money: bundles in columns of ten, filled one after another.
  const { denom, count } = cashPlan(dollars);
  if (count > 0) {
    const cols = Math.ceil(count / PER_COLUMN);
    const across = Math.min(cols, Math.max(1, Math.ceil(Math.sqrt(cols * 1.6))));
    const deep = Math.ceil(cols / across);
    const w = across * (BUNDLE.w + 0.25) + 1.2;
    const d = deep * (BUNDLE.d + 0.25) + 1.2;
    const [x, z] = place(Math.min(minS * 0.6, -(w / 2 + MID_GAP_FT)), maxF + GAP_FT + d / 2);
    const [lo, hi] = lowHigh(x, z, w / 2, d / 2);
    const base = pad(w, d, lo, hi);
    const stack = new THREE.Group();
    stack.position.set(x, 0, z);
    stack.rotation.y = facing;
    stack.add(base.mesh);
    const edge = edgeTexture();
    const sideMat = new THREE.MeshStandardMaterial({ map: edge, roughness: 0.85 });
    const topMat = new THREE.MeshStandardMaterial({ map: billTexture(denom), roughness: 0.8 });
    const bottomMat = new THREE.MeshStandardMaterial({ color: 0x8ea47e, roughness: 0.9 });
    const geo = new THREE.BoxGeometry(BUNDLE.w, BUNDLE.h, BUNDLE.d);
    const mats = [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat];
    for (let k = 0; k < count; k++) {
      const col = Math.floor(k / PER_COLUMN);
      const level = k % PER_COLUMN;
      const [gx, gz] = [col % across, Math.floor(col / across)];
      const b = new THREE.Mesh(geo, mats);
      const jitter = Math.sin(k * 12.9898) * 0.06;
      b.position.set(
        (gx - (across - 1) / 2) * (BUNDLE.w + 0.25) + jitter,
        base.top + BUNDLE.h / 2 + level * BUNDLE.h,
        (gz - (deep - 1) / 2) * (BUNDLE.d + 0.25) - jitter,
      );
      b.rotation.y = jitter * 0.6;
      b.castShadow = true;
      b.receiveShadow = true;
      stack.add(b);
      items.push({ obj: b, at: (k + 1) / count });
    }
    const top = base.top + Math.min(count, PER_COLUMN) * BUNDLE.h;
    const label = tagSprite([`$${fmt(dollars)} saved`, `${years} year${years === 1 ? '' : 's'} · each bundle $${fmt(denom)}`], Math.max(14, w * 1.6));
    label.position.set(0, top + 2.2 + label.userData.halfHeight, 0);
    stack.add(label);
    group.add(stack);
    framed.push([x - w, z - d], [x + w, z + d]);
  }

  // Water: the true volume, as a block of clear blue layers, one per year
  // (or per month for a single year).
  const ft3 = Math.max(0, gallons) / GAL_PER_FT3;
  if (ft3 > 1) {
    const side = Math.cbrt(ft3);
    const layers = years <= 1 ? 12 : Math.min(30, Math.round(years));
    const layerH = side / layers;
    const [x, z] = place(Math.max(maxS * 0.6, side / 2 + 0.6 + MID_GAP_FT), maxF + GAP_FT + side / 2 + 0.6);
    const [lo, hi] = lowHigh(x, z, side / 2 + 0.6, side / 2 + 0.6);
    const base = pad(side + 1.2, side + 1.2, lo, hi);
    const block = new THREE.Group();
    block.position.set(x, 0, z);
    block.rotation.y = facing;
    block.add(base.mesh);
    const water = new THREE.MeshPhysicalMaterial({ color: 0x3d8fd6, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.58, clearcoat: 1, depthWrite: false });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xc4e6ff, transparent: true, opacity: 0.55 });
    const gap = Math.min(0.12, layerH * 0.15);
    const geo = new THREE.BoxGeometry(side, Math.max(0.05, layerH - gap), side);
    const edges = new THREE.EdgesGeometry(geo);
    for (let k = 0; k < layers; k++) {
      const m = new THREE.Mesh(geo, water);
      m.position.y = base.top + layerH * k + layerH / 2;
      m.renderOrder = 2;
      const line = new THREE.LineSegments(edges, edgeMat);
      m.add(line);
      block.add(m);
      items.push({ obj: m, at: (k + 1) / layers });
    }
    const unit = years <= 1 ? 'month' : 'year';
    const label = tagSprite([`${fmt(gallons)} gallons`, `${years} year${years === 1 ? '' : 's'} · each layer one ${unit}, true size`], Math.max(14, side * 1.3));
    label.position.set(0, base.top + side + 2.2 + label.userData.halfHeight, 0);
    block.add(label);
    group.add(block);
    framed.push([x - side, z - side], [x + side, z + side]);
  }

  const xs = framed.map((p) => p[0]);
  const zs = framed.map((p) => p[1]);
  const bx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const bz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const radius = Math.max(20, ...framed.map((p) => Math.hypot(p[0] - bx, p[1] - bz)));
  return { group, items, bounds: { x: bx, z: bz, radius } };
}
