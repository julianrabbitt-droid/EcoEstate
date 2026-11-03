import * as THREE from 'three';

// The Payoff step's 3D picture: what the garden gives back, standing in front
// of the property. Money saved is a stack of cash bundles; water saved is a
// block of water at its true volume (7.48 gallons to a cubic foot), one layer
// per year. Both sit on level pads out front, toward the street, one to each
// side, so the garden between them stays in view (and in Real 3D they stand
// where Google's trees and cars are already cleared away).

const GAL_PER_FT3 = 7.48052;
const BUNDLE = { w: 3.4, h: 0.6, d: 1.5 }; // a bill bundle, drawn about 6x real size so it reads from the street
const PER_COLUMN = 20; // a tower, about 12 ft, roughly a storey of the house beside it
const MAX_BUNDLES = 60;
const DENOMS = [10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const GAP_FT = 6; // between the house (or the lot line) and a stack
const VIEW_FT = 40; // Real 3D is cleared from each piece out toward the street, so the view of it is open

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

// A floating label: a bone tag with one bold line in ink and smaller ones.
export function tagSprite(lines, width) {
  const W = 640;
  const H = 72 + 46 * (lines.length - 1) + 26;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(251, 250, 247, 0.94)';
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 28);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillStyle = i ? '#5d6159' : '#141613';
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


// What the money could buy, drawn at real size beside the cash: the priciest
// of these the savings cover. Prices are rough, for scale, not quotes.
export const PURCHASES = [
  { min: 15000, name: 'a used electric car', price: 15000, model: 'car' },
  { min: 1500, name: 'an e-bike', price: 1500, model: 'ebike' },
  { min: 450, name: 'a new bike', price: 500, model: 'bike' },
  { min: 200, name: 'a garden bench', price: 300, model: 'bench' },
  { min: 0, name: 'a cedar birdhouse', price: 60, model: 'birdhouse' },
];
export const purchaseFor = (dollars) => PURCHASES.find((p) => dollars >= p.min) || PURCHASES[PURCHASES.length - 1];

const mat = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function tube(a, b, r, material) {
  const [va, vb] = [new THREE.Vector3(...a), new THREE.Vector3(...b)];
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 10), material);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  m.castShadow = true;
  return m;
}
function wheel(r, width, x, y, z, rubber, hub) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(r - width / 2, width / 2, 10, 32), rubber);
  g.add(tyre);
  if (hub) g.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, width * 0.8, 20).rotateX(Math.PI / 2), hub));
  g.position.set(x, y, z);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// Long side along local x, front along +z; standing on y = 0. Feet.
function purchaseModel(kind) {
  const g = new THREE.Group();
  const rubber = mat(0x1d1f1c, 0.9);
  if (kind === 'bike' || kind === 'ebike') {
    const frame = mat(kind === 'ebike' ? 0x2f6f8f : 0xb5532c, 0.35, 0.4);
    const metal = mat(0x8c8f8a, 0.3, 0.8);
    const r = 1.15;
    const [rear, frontX] = [-1.75, 1.75];
    g.add(wheel(r, kind === 'ebike' ? 0.22 : 0.12, rear, r, 0, rubber, null));
    g.add(wheel(r, kind === 'ebike' ? 0.22 : 0.12, frontX, r, 0, rubber, null));
    const bb = [-0.2, 1.0, 0]; // bottom bracket
    const seat = [-0.75, 2.75, 0];
    const head = [1.15, 2.7, 0];
    for (const [a, b] of [[[rear, r, 0], bb], [[rear, r, 0], seat], [bb, seat], [bb, head], [seat, head], [head, [frontX, r, 0]]]) g.add(tube(a, b, 0.07, frame));
    g.add(tube(seat, [-0.85, 3.15, 0], 0.05, metal));
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.16, 0.32), rubber);
    saddle.position.set(-0.85, 3.25, 0);
    g.add(saddle);
    g.add(tube(head, [1.05, 3.35, 0], 0.05, metal));
    g.add(tube([1.05, 3.35, -0.75], [1.05, 3.35, 0.75], 0.05, metal));
    if (kind === 'ebike') {
      const battery = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.38, 0.32), mat(0x2b2d2a, 0.5));
      battery.position.set(0.5, 1.75, 0);
      battery.rotation.z = Math.atan2(2.7 - 1.0, 1.15 + 0.2);
      g.add(battery);
    }
  } else if (kind === 'car') {
    const paint = mat(0xe9e6dd, 0.3, 0.2);
    const glass = mat(0x22302c, 0.15, 0.3);
    const body = new THREE.Mesh(new THREE.BoxGeometry(14.2, 2.3, 6), paint);
    body.position.y = 2.15;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.9, 5.4), glass);
    cabin.position.set(-0.6, 4.2, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.25, 5.2), paint);
    roof.position.set(-0.7, 5.2, 0);
    for (const m of [body, cabin, roof]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    const hub = mat(0xa7aaa4, 0.35, 0.7);
    for (const x of [-4.6, 4.6]) for (const z of [-3.05, 3.05]) g.add(wheel(1.15, 0.7, x, 1.15, z, rubber, hub));
  } else if (kind === 'birdhouse') {
    const cedar = mat(0xa8774e, 0.8);
    const roofMat = mat(0x5b4a3b, 0.7);
    g.add(tube([0, 0, 0], [0, 5, 0], 0.12, mat(0x6d5a48, 0.9)));
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1), cedar);
    box.position.y = 5.6;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.7, 4), roofMat);
    roof.position.y = 6.55;
    roof.rotation.y = Math.PI / 4;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), mat(0x1d1f1c, 1));
    hole.position.set(0, 5.75, 0.51);
    for (const m of [box, roof]) { m.castShadow = true; g.add(m); }
    g.add(hole);
  } else {
    const wood = mat(0x9a6b45, 0.85);
    const iron = mat(0x2b2d2a, 0.5, 0.6);
    for (let k = 0; k < 4; k++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 0.32), wood);
      slat.position.set(0, 1.5, -0.6 + k * 0.4);
      g.add(slat);
    }
    for (let k = 0; k < 3; k++) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 0.1), wood);
      back.position.set(0, 2.0 + k * 0.42, -0.85);
      g.add(back);
    }
    for (const x of [-2.2, 2.2]) {
      g.add(tube([x, 0, 0.6], [x, 1.5, 0.6], 0.07, iron));
      g.add(tube([x, 0, -0.75], [x, 3.0, -0.9], 0.07, iron));
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  return g;
}

const SIZE = { birdhouse: [1.2, 1.2], bench: [5.2, 2.2], bike: [6, 1.6], ebike: [6, 1.6], car: [14.6, 7.4] }; // footprint [long, deep]

/**
 * dollars, gallons: saved over `years`. lotPts: the lot in scene feet [[x, z]];
 * house: the main building's outline there, if known. front: { dx, dz }, the
 * unit direction from the property toward its street. at(x, z): ground height.
 * The water stands on one side of the house and the cash (with what it could
 * buy) on the other, their fronts in line with the house front, so the three
 * read as one row from the street. Without a house they stand at the front
 * corners of the lot. Returns { group, items, zones, bounds }: items are the bundles
 * and water layers in the order they appear ({ obj, at: 0..1 }); zones are
 * their footprints with room around them ([[x, z] x 4] each); bounds
 * frames the house and everything beside it for the camera.
 */
export function createPayoffStacks({ dollars, gallons, years, lotPts, house, front, at }) {
  const group = new THREE.Group();
  group.userData.payoff = true;
  const items = [];
  const f = front && Math.hypot(front.dx, front.dz) > 0 ? front : { dx: 0, dz: 1 };
  const s = { dx: -f.dz, dz: f.dx }; // across the front
  const lot = lotPts?.length >= 3 ? lotPts : [[-30, -30], [30, -30], [30, 30], [-30, 30]];
  const anchor = house?.length >= 3 ? house : lot;
  const c = anchor.reduce((a, p) => [a[0] + p[0] / anchor.length, a[1] + p[1] / anchor.length], [0, 0]);
  const along = (p, v) => (p[0] - c[0]) * v.dx + (p[1] - c[1]) * v.dz;
  const frontLine = Math.max(...anchor.map((p) => along(p, f)));
  const minS = Math.min(...anchor.map((p) => along(p, s)));
  const maxS = Math.max(...anchor.map((p) => along(p, s)));
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
  const framed = [...anchor];
  const labels = []; // { sprite, top } lined up at one height afterwards
  // Where each piece stands, with room around it: Real 3D clears Google's
  // trees, cars and neighbours' walls there so nothing stands in them.
  const zones = [];
  const zone = (s0, s1, f0, f1) => zones.push([place(s0, f0), place(s1, f0), place(s1, f1), place(s0, f1)]);

  // Money: a tower of bundles beside the house, filled column by column.
  const { denom, count } = cashPlan(dollars);
  if (count > 0) {
    const cols = Math.ceil(count / PER_COLUMN);
    const across = Math.max(1, Math.ceil(Math.sqrt(cols)));
    const deep = Math.ceil(cols / across);
    const w = across * (BUNDLE.w + 0.25) + 1.2;
    const d = deep * (BUNDLE.d + 0.25) + 1.2;
    const sideAt = minS - GAP_FT - w / 2;
    const [x, z] = place(sideAt, frontLine - d / 2);
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
      const jitter = Math.sin(k * 12.9898) * 0.05;
      b.position.set(
        (gx - (across - 1) / 2) * (BUNDLE.w + 0.25) + jitter,
        base.top + BUNDLE.h / 2 + level * BUNDLE.h,
        (gz - (deep - 1) / 2) * (BUNDLE.d + 0.25) - jitter,
      );
      b.rotation.y = jitter * 0.5;
      b.castShadow = true;
      b.receiveShadow = true;
      stack.add(b);
      items.push({ obj: b, at: (k + 1) / count });
    }
    const label = tagSprite([`$${fmt(dollars)} saved`, `${years} year${years === 1 ? '' : 's'} · each bundle $${fmt(denom)}`], 16);
    stack.add(label);
    labels.push({ sprite: label, top: base.top + Math.min(count, PER_COLUMN) * BUNDLE.h });
    group.add(stack);
    framed.push(place(sideAt - w / 2, frontLine), place(sideAt + w / 2, frontLine - d));
    zone(sideAt - w / 2 - 3, sideAt + w / 2 + 3, frontLine - d - 3, frontLine + VIEW_FT);

    // What it could buy, at real size, just outside the cash and a little
    // toward the street, turned a touch to show its side.
    const buy = purchaseFor(dollars);
    const [len, dep] = SIZE[buy.model];
    const objSide = sideAt - w / 2 - 3 - len / 2;
    const [ox, oz] = place(objSide, frontLine + dep / 2 + 1);
    const [olo, ohi] = lowHigh(ox, oz, len / 2, dep / 2);
    const obj = purchaseModel(buy.model);
    obj.position.set(ox, ohi > olo + 1.5 ? olo : (olo + ohi) / 2, oz);
    obj.rotation.y = facing + 0.35; // side on to the street, turned a little
    obj.visible = false;
    group.add(obj);
    items.push({ obj, at: 1 });
    const objLabel = tagSprite([`That buys ${buy.name}`, `about $${fmt(buy.price)}, drawn to scale`], 13);
    objLabel.position.set(ox, 0, oz);
    group.add(objLabel);
    labels.push({ sprite: objLabel, top: obj.position.y + ({ car: 5.4, birdhouse: 7 }[buy.model] || 3.6), world: true });
    framed.push(place(objSide - len / 2, frontLine + dep + 1), place(objSide + len / 2, frontLine));
    zone(objSide - len / 2 - 3, objSide + len / 2 + 3, frontLine - 2, frontLine + VIEW_FT);
  }

  // Water: the true volume beside the house on the other side, a clear blue
  // block of layers, one per year (or per month for a single year).
  const ft3 = Math.max(0, gallons) / GAL_PER_FT3;
  if (ft3 > 1) {
    const side = Math.cbrt(ft3);
    const layers = years <= 1 ? 12 : Math.min(30, Math.round(years));
    const layerH = side / layers;
    const sideAt = maxS + GAP_FT + side / 2 + 0.6;
    const [x, z] = place(sideAt, frontLine - side / 2 - 0.6);
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
      m.add(new THREE.LineSegments(edges, edgeMat));
      block.add(m);
      items.push({ obj: m, at: (k + 1) / layers });
    }
    const unit = years <= 1 ? 'month' : 'year';
    const label = tagSprite([`${fmt(gallons)} gallons`, `${years} year${years === 1 ? '' : 's'} · each layer one ${unit}, true size`], 16);
    block.add(label);
    labels.push({ sprite: label, top: base.top + side });
    group.add(block);
    framed.push(place(sideAt + side / 2 + 0.6, frontLine), place(sideAt - side / 2, frontLine - side - 1.2));
    zone(sideAt - side / 2 - 3.6, sideAt + side / 2 + 3.6, frontLine - side - 4.2, frontLine + VIEW_FT);
  }

  // The cash and water labels in one row, just above the taller of the two;
  // the purchase's label sits just above it.
  const row = Math.max(0, ...labels.filter((l) => !l.world).map((l) => l.top)) + 2.5;
  for (const l of labels) {
    if (l.world) l.sprite.position.y = l.top + 1.5 + l.sprite.userData.halfHeight;
    else l.sprite.position.set(0, row + l.sprite.userData.halfHeight, 0);
  }

  const xs = framed.map((p) => p[0]);
  const zs = framed.map((p) => p[1]);
  const bx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const bz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const radius = Math.max(20, ...framed.map((p) => Math.hypot(p[0] - bx, p[1] - bz)));
  const height = Math.max(0, ...labels.map((l) => l.sprite.position.y + l.sprite.userData.halfHeight)) - Math.min(...anchor.map(([x, z]) => at(x, z)));
  return { group, items, zones, bounds: { x: bx, z: bz, radius, height } };
}
