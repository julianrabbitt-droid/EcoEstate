import * as THREE from 'three';

// The Payoff step's 3D picture: what the garden gives back, standing in front
// of the property. Money saved is a stack of cash bundles; water saved is a
// block of water at its true volume (7.48 gallons to a cubic foot), one layer
// per year. Both sit on level pads in one row beside the house, on the same
// side, so they compare at a glance and the garden stays in view (and in Real
// 3D they stand where Google's trees and cars are already cleared away).

const GAL_PER_FT3 = 7.48052;
// One person's indoor water for a year: California's residential standard is
// 47 gallons a day (42 from 2030); 50 rounds in a little everyday outdoor use.
export const GAL_PER_PERSON_DAY = 50;
const GAL_PER_PERSON_YEAR = GAL_PER_PERSON_DAY * 365;
const PEOPLE_MAX_FIGURES = 40; // past this, each figure stands for 10, 100 or 1,000 people

/** How many people the water would serve for a year, and how many each figure stands for. */
export function peopleFor(gallons) {
  const people = Math.max(0, gallons) / GAL_PER_PERSON_YEAR;
  let unit = 1;
  while (people / unit > PEOPLE_MAX_FIGURES) unit *= 10;
  return { people, unit, figures: people > 0 ? Math.max(1, Math.round(people / unit)) : 0 };
}

// A person at true size (5 ft 7 in), facing +z, in one of a few outfits.
const OUTFITS = [[0x2f6f8f, 0x334155], [0xc4651d, 0x3f3a35], [0x4c8a2b, 0x2b3a4a], [0x7a63c4, 0x3a3a3a], [0xd9b44a, 0x4a3a2c], [0xc2456a, 0x2f3b45]];
const SKINS = [0xe7b48f, 0xc68c5f, 0x8d5a3b, 0xf0c8a4];
const personParts = {
  head: new THREE.SphereGeometry(0.42, 14, 10),
  torso: new THREE.CylinderGeometry(0.62, 0.5, 2.0, 12),
  leg: new THREE.CylinderGeometry(0.2, 0.17, 2.6, 8),
  arm: new THREE.CylinderGeometry(0.15, 0.13, 1.9, 8),
};
function person(k) {
  const g = new THREE.Group();
  const [shirtHex, pantsHex] = OUTFITS[k % OUTFITS.length];
  const skin = new THREE.MeshStandardMaterial({ color: SKINS[(k * 7) % SKINS.length], roughness: 0.6 });
  const shirt = new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: pantsHex, roughness: 0.8 });
  const head = new THREE.Mesh(personParts.head, skin);
  head.position.y = 5.2;
  const torso = new THREE.Mesh(personParts.torso, shirt);
  torso.position.y = 3.7;
  g.add(head, torso);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(personParts.leg, pants);
    leg.position.set(side * 0.24, 1.3, 0);
    const arm = new THREE.Mesh(personParts.arm, shirt);
    arm.position.set(side * 0.78, 3.6, 0);
    arm.rotation.z = side * 0.12;
    g.add(leg, arm);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(5.6 / 5.65);
  return g;
}
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
    // A long line shrinks to fit inside the tag rather than run off its edges.
    const font = (px) => `${i ? 500 : 600} ${px}px "Inter Tight", Helvetica, Arial, sans-serif`;
    const size = i ? 30 : 46;
    ctx.font = font(size);
    const room = W - 64;
    const wide = ctx.measureText(line).width;
    if (wide > room) ctx.font = font(Math.floor((size * room) / wide));
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


// What the savings could buy, drawn at real size beside the cash: the dearest
// thing on the ladder they cover (as many as they pay for, up to `most`), so
// a longer horizon or a bigger property reaches the next thing up. The low
// rungs are what a year saves on a typical lawn (a few hundred to a couple of
// thousand dollars): treats and gadgets everyone wants, then a trip, then
// cars. Prices are rough, for scale, not quotes. stack: drawn as one pile.
export const PURCHASES = [
  { min: 5000000, one: 'a private jet', many: 'private jets', price: 5000000, model: 'jet', most: 3 },
  { min: 2000000, one: 'a motor yacht', many: 'motor yachts', price: 2000000, model: 'yacht', most: 1 },
  { min: 350000, one: 'a small plane', many: 'small planes', price: 350000, model: 'plane', most: 3 },
  { min: 180000, one: 'a sailboat', many: 'sailboats', price: 180000, model: 'sailboat', most: 1 },
  { min: 90000, one: 'a luxury electric SUV', many: 'luxury electric SUVs', price: 90000, model: 'suv', most: 1 },
  { min: 45000, one: 'a new electric car', many: 'new electric cars', price: 45000, model: 'carNew', most: 1 },
  { min: 15000, one: 'a used electric car', many: 'used electric cars', price: 15000, model: 'car', most: 2 },
  { min: 7000, one: 'a hot tub', many: 'hot tubs', price: 7000, model: 'hottub', most: 1 },
  { min: 2500, one: 'a beach vacation for two', many: 'beach vacations for two', price: 2500, model: 'vacation', most: 2 },
  { min: 1000, one: 'a new phone', many: 'new phones', price: 1000, model: 'phone', most: 2 },
  { min: 600, one: 'a 65-inch TV', many: '65-inch TVs', price: 600, model: 'tv', most: 1 },
  { min: 240, one: 'a dinner out for two', many: 'dinners out for two', price: 120, model: 'dinner', most: 4 },
  { min: 0, one: 'a pizza night', many: 'pizza nights', price: 30, model: 'pizza', most: 8, stack: true },
];
export const purchaseFor = (dollars) => {
  const tier = PURCHASES.find((p) => dollars >= p.min) || PURCHASES[PURCHASES.length - 1];
  const count = Math.max(1, Math.min(tier.most, Math.floor(Math.max(0, dollars) / tier.price)));
  return { ...tier, count, name: count > 1 ? `${count} ${tier.many}` : tier.one };
};

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
function purchaseModel(kind, count = 1) {
  const g = new THREE.Group();
  const rubber = mat(0x1d1f1c, 0.9);
  if (kind === 'pizza') {
    // Takeaway boxes, one per pizza night, piled on the ground.
    const box = mat(0xd9c3a0, 0.85);
    const ink = mat(0xb0392e, 0.7);
    for (let k = 0; k < count; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.15, 1.35), box);
      b.position.y = 0.075 + k * 0.16;
      b.rotation.y = (k % 3 - 1) * 0.06;
      const logo = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), ink);
      logo.rotation.x = -Math.PI / 2;
      logo.position.y = 0.076;
      b.add(logo);
      g.add(b);
    }
  } else if (kind === 'dinner') {
    // A bistro table set for two: cloth, plates, glasses, a candle, two chairs.
    const cloth = mat(0xf4f1ea, 0.8);
    const iron = mat(0x2b2d2a, 0.5, 0.6);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.08, 32), cloth);
    top.position.y = 2.45;
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.5, 0.6, 32, 1, true), cloth);
    drape.position.y = 2.15;
    g.add(top, drape, tube([0, 0, 0], [0, 2.4, 0], 0.08, iron));
    const plate = mat(0xffffff, 0.3);
    const food = mat(0xb5652d, 0.7);
    const wine = new THREE.MeshPhysicalMaterial({ color: 0x6d1a2a, roughness: 0.1, transparent: true, opacity: 0.85 });
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.4, 0.04, 24), plate);
      p.position.set(side * 0.75, 2.51, 0);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), food);
      dish.scale.y = 0.4;
      dish.position.set(side * 0.75, 2.56, 0);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.3, 12), wine);
      glass.position.set(side * 0.7, 2.64, side * 0.55);
      g.add(p, dish, glass);
      // Chair, facing the table.
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.4), iron);
      seat.position.set(side * 2.2, 1.5, 0);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 1.4), iron);
      back.position.set(side * 2.85, 2.2, 0);
      g.add(seat, back);
      for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) g.add(tube([side * 2.2 + dx, 0, dz], [side * 2.2 + dx, 1.5, dz], 0.04, iron));
    }
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10), mat(0xfff6df, 0.6));
    candle.position.y = 2.69;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffc35a, emissive: 0xffa22e, emissiveIntensity: 1.5 }));
    flame.position.y = 2.93;
    g.add(candle, flame);
  } else if (kind === 'tv') {
    // A 65-inch screen (4.7 by 2.7 ft) on a low media console.
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.7, 1.5), mat(0x8a6446, 0.7));
    cabinet.position.y = 0.85;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.75, 2.75, 0.12), mat(0x1d1f1c, 0.3, 0.4));
    frame.position.set(0, 3.25, 0);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.6), new THREE.MeshStandardMaterial({ map: screenTexture(), emissive: 0xffffff, emissiveMap: screenTexture(), emissiveIntensity: 0.55, roughness: 0.2 }));
    screen.position.set(0, 3.25, 0.065);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.7), mat(0x1d1f1c, 0.3, 0.4));
    foot.position.y = 1.8;
    g.add(cabinet, frame, screen, foot, tube([0, 1.8, 0], [0, 2.2, 0], 0.12, mat(0x1d1f1c, 0.3, 0.4)));
  } else if (kind === 'phone') {
    // A new phone at true size (6 by 3 in), on a showroom plinth to be seen.
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.2, 1.6), mat(0xf2f0ea, 0.5));
    plinth.position.y = 1.6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.03), mat(0x2b3440, 0.25, 0.6));
    body.position.set(0, 3.55, 0);
    body.rotation.x = -0.25;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.47), new THREE.MeshStandardMaterial({ map: screenTexture(), emissive: 0xffffff, emissiveMap: screenTexture(), emissiveIntensity: 0.6, roughness: 0.2 }));
    screen.position.z = 0.016;
    body.add(screen);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.25), mat(0xc8ccd0, 0.3, 0.7));
    stand.position.set(0, 3.23, 0.02);
    g.add(plinth, body, stand);
  } else if (kind === 'vacation') {
    // Packed for the beach: two suitcases, an umbrella and a lounger.
    const cases = [[0x2f5f9f, -1.6], [0xd9682b, -0.2]];
    for (const [color, x] of cases) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.8), mat(color, 0.45, 0.1));
      c.position.set(x, 1.25, 0);
      const handle = tube([x - 0.3, 2.35, 0], [x + 0.3, 2.35, 0], 0.04, mat(0x2b2d2a, 0.5));
      g.add(c, handle);
      for (const dx of [-0.4, 0.4]) g.add(wheel(0.12, 0.08, x + dx, 0.12, 0.3, rubber, null));
    }
    g.add(tube([1.6, 0, 0], [1.6, 6.5, 0], 0.05, mat(0xd6d8d2, 0.4, 0.6)));
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.2, 12, 1, true), new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.8, side: THREE.DoubleSide }));
    canopy.position.set(1.6, 6.2, 0);
    g.add(canopy);
    // The lounger beside them, its back raised.
    const frameMat = mat(0xd6d8d2, 0.4, 0.6);
    const cloth = mat(0x2f8fa6, 0.8);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 1.9), cloth);
    seat.position.set(-0.4, 1.1, 1.9);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.9), cloth);
    back.position.set(1.85, 1.6, 1.9);
    back.rotation.z = 0.6;
    g.add(seat, back);
    for (const x of [-1.9, 1.1]) for (const z of [1.05, 2.75]) g.add(tube([x, 0, z], [x, 1.05, z], 0.05, frameMat));
  } else if (kind === 'hottub') {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(7.5, 3, 7.5), mat(0x6b5442, 0.8));
    shell.position.y = 1.5;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.25, 7.6), mat(0xd9d4c8, 0.5));
    rim.position.y = 3.05;
    const water = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.1, 6.6), new THREE.MeshPhysicalMaterial({ color: 0x3aa7c9, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }));
    water.position.y = 3.1;
    const steps = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1.4), mat(0x6b5442, 0.8));
    steps.position.set(0, 0.5, 4.4);
    g.add(shell, rim, water, steps);
  } else if (kind === 'sailboat') {
    // A 30 ft sloop on a cradle: white hull, mast, mainsail and jib.
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xf2f0ea, 0.3, 0.1));
    hull.scale.set(15, 5, 5);
    hull.rotation.x = Math.PI;
    hull.position.y = 6;
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3, 28), mat(0xc9a77c, 0.7));
    deck.scale.set(15, 1, 5);
    deck.position.y = 6.1;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(9, 2, 5.5), mat(0xf2f0ea, 0.35));
    cabin.position.set(-1, 7.2, 0);
    g.add(hull, deck, cabin);
    g.add(tube([2, 6, 0], [2, 44, 0], 0.25, mat(0xc8ccd0, 0.3, 0.8)));
    const sail = (pts) => new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))), new THREE.MeshStandardMaterial({ color: 0xfaf8f2, roughness: 0.8, side: THREE.DoubleSide }));
    const main = sail([[2, 9], [-10, 9], [2, 42]]);
    const jib = sail([[2.6, 9], [14, 8], [2.6, 38]]);
    g.add(main, jib);
    for (const x of [-8, 8]) g.add(tube([x, 0, 0], [x, 2.6, 0], 0.5, mat(0x6b5442, 0.8)));
  } else if (kind === 'plane') {
    // A four-seat high-wing plane (36 ft span) on its gear.
    const white = mat(0xf2f0ea, 0.35, 0.2);
    const stripe = mat(0x2f5f9f, 0.35, 0.2);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 18, 6, 16), white);
    body.rotation.z = Math.PI / 2;
    body.position.y = 5;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 36), white);
    wing.position.set(1.5, 7.6, 0);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 11), white);
    tail.position.set(-10.5, 5.6, 0);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5, 0.3), stripe);
    fin.position.set(-10.8, 8, 0);
    const cowl = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3, 16), white);
    cowl.rotation.z = -Math.PI / 2;
    cowl.position.set(12, 5, 0);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6.5, 0.6), mat(0x1d1f1c, 0.5));
    prop.position.set(13.6, 5, 0);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.6, 3.9), mat(0x22302c, 0.15, 0.3));
    glass.position.set(3.5, 6.6, 0);
    g.add(body, wing, tail, fin, cowl, prop, glass);
    for (const z of [-3.5, 3.5]) {
      g.add(tube([2, 3, 0], [3, 7.4, z * 2.6], 0.12, white)); // struts
      g.add(wheel(0.9, 0.5, 1.5, 0.9, z, rubber, null));
    }
    g.add(wheel(0.7, 0.4, 10.5, 0.7, 0, rubber, null));
  } else if (kind === 'yacht') {
    // An 80 ft motor yacht on cradles: navy hull, three white decks.
    const hull = new THREE.Mesh(new THREE.BoxGeometry(80, 9, 20), mat(0x1f2f45, 0.3, 0.3));
    hull.position.y = 7.5;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(10, 18, 4), mat(0x1f2f45, 0.3, 0.3));
    bow.rotation.set(0, Math.PI / 4, -Math.PI / 2);
    bow.scale.set(1, 1, 0.45);
    bow.position.set(48, 7.5, 0);
    const white = mat(0xf4f2ec, 0.35);
    const glass = mat(0x22302c, 0.12, 0.4);
    g.add(hull, bow);
    [[60, 7, 18, 15], [42, 6, 16, 21], [24, 5, 14, 26]].forEach(([len, h, w, y], k) => {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(len, h, w), white);
      deck.position.set(-6 - k * 4, y - h / 2 + 2.5, 0);
      const band = new THREE.Mesh(new THREE.BoxGeometry(len * 0.85, h * 0.4, w + 0.2), glass);
      band.position.set(-6 - k * 4, y - h / 2 + 3, 0);
      g.add(deck, band);
    });
    for (const x of [-25, 0, 25]) g.add(tube([x, 0, 0], [x, 3, 0], 1.2, mat(0x6b5442, 0.8)));
  } else if (kind === 'jet') {
    // A light business jet: swept wings, T-tail, engines at the back.
    const white = mat(0xf4f2ec, 0.3, 0.3);
    const grey = mat(0x8c939a, 0.4, 0.6);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(3.2, 44, 8, 20), white);
    body.rotation.z = Math.PI / 2;
    body.position.y = 7;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7, 20), white);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(28, 7, 0);
    const wingShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-9, 26), new THREE.Vector2(-13, 26), new THREE.Vector2(-10, 0)]);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape, { depth: 0.6, bevelEnabled: false }), white);
      wing.rotation.x = -Math.PI / 2;
      wing.scale.z = 1;
      wing.scale.y = side;
      wing.position.set(4, 5.5, 0);
      g.add(wing);
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.4, 8, 16), grey);
      engine.rotation.z = Math.PI / 2;
      engine.position.set(-16, 9.5, side * 4.8);
      g.add(engine);
    }
    const fin = new THREE.Mesh(new THREE.BoxGeometry(7, 9, 0.5), white);
    fin.position.set(-24, 13, 0);
    fin.rotation.z = 0.35;
    const tailplane = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 18), white);
    tailplane.position.set(-26, 17.4, 0);
    const windows = new THREE.Mesh(new THREE.BoxGeometry(26, 1, 6.5), mat(0x22302c, 0.12, 0.4));
    windows.position.set(2, 7.8, 0);
    g.add(body, nose, fin, tailplane, windows);
    for (const [x, z] of [[20, 0], [0, -4], [0, 4]]) {
      g.add(tube([x, 0.9, z], [x, 4.5, z], 0.25, grey));
      g.add(wheel(0.9, 0.5, x, 0.9, z, rubber, null));
    }
  } else if (kind === 'car' || kind === 'carNew' || kind === 'suv') {
    // A hatchback, or (suv) a longer, taller one riding higher.
    const suv = kind === 'suv';
    const paint = mat({ car: 0xe9e6dd, carNew: 0x8a2f2f, suv: 0x2d3a44 }[kind], 0.3, 0.2);
    const glass = mat(0x22302c, 0.15, 0.3);
    const [len, wid, lift] = suv ? [16, 6.6, 0.5] : [14.2, 6, 0];
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, 2.3 + lift, wid), paint);
    body.position.y = 2.15 + lift;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(suv ? 10 : 7.6, 1.9 + lift, wid - 0.6), glass);
    cabin.position.set(suv ? -1 : -0.6, 4.2 + lift * 1.5, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(suv ? 9 : 6.4, 0.25, wid - 0.8), paint);
    roof.position.set(suv ? -1.1 : -0.7, 5.2 + lift * 2, 0);
    for (const m of [body, cabin, roof]) { m.receiveShadow = true; g.add(m); }
    const hub = mat(0xa7aaa4, 0.35, 0.7);
    const r = suv ? 1.45 : 1.15;
    for (const x of suv ? [-5.3, 5.3] : [-4.6, 4.6]) for (const z of [-(wid / 2 + 0.05), wid / 2 + 0.05]) g.add(wheel(r, 0.75, x, r, z, rubber, hub));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// A bright, out-of-focus picture for the screens (a sunset over hills).
let screenTex = null;
function screenTexture() {
  if (screenTex) return screenTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 72;
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 72);
  sky.addColorStop(0, '#3f6fb6');
  sky.addColorStop(0.55, '#f2a65a');
  sky.addColorStop(1, '#f6d28b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 128, 72);
  ctx.fillStyle = '#2f5d3a';
  ctx.beginPath();
  ctx.moveTo(0, 72);
  ctx.bezierCurveTo(30, 40, 60, 62, 128, 44);
  ctx.lineTo(128, 72);
  ctx.fill();
  screenTex = new THREE.CanvasTexture(c);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  return screenTex;
}
// Beach-umbrella stripes, round the canopy.
let stripeTex = null;
function stripeTexture() {
  if (stripeTex) return stripeTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 8;
  const ctx = c.getContext('2d');
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = k % 2 ? '#f4f1ea' : '#2f8fa6';
    ctx.fillRect(k * 16, 0, 16, 8);
  }
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  return stripeTex;
}

function insidePoly([x, z], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Carbon as cars: a typical gasoline passenger car puts out about 4.6
// metric tons of CO2 a year (EPA, "Greenhouse Gas Emissions from a Typical
// Passenger Vehicle"), so the CO2 a garden draws down undoes that many years
// of a car's driving.
export const CAR_LB_CO2_YEAR = 4.6 * 2204.62; // about 10,140 lb
const CARS_MAX_FIGURES = 12; // past this, each car stands for 2, 5, 10, 20, 50… cars

/** How many cars' driving for a year the CO2 (lb) undoes, and how many each drawn car stands for. */
export function carsFor(co2Lb) {
  const cars = Math.max(0, co2Lb || 0) / CAR_LB_CO2_YEAR;
  // Steps of 1, 2 and 5 keep a big property at 5 to 12 cars, never one.
  let unit = 1;
  for (let i = 1; Math.round(cars / unit) > CARS_MAX_FIGURES; i++) unit = [1, 2, 5][i % 3] * 10 ** Math.floor(i / 3);
  return { cars, unit, figures: cars > 0 ? Math.max(1, Math.round(cars / unit)) : 0 };
}

/** What the CO2 (lb) undoes: "1.2 cars driven a year", "7 months of one car’s driving", or ''. */
export function carsText(co2Lb) {
  const { cars } = carsFor(co2Lb);
  if (cars <= 0) return '';
  if (cars < 0.95) {
    const months = Math.max(1, Math.round(cars * 12));
    return `${months} month${months === 1 ? '' : 's'} of one car’s driving`;
  }
  const n = cars < 9.95 ? Math.round(cars * 10) / 10 : Math.round(cars);
  return `${n.toLocaleString('en-US')} car${n === 1 ? '' : 's'} driven a year`;
}

// A sedan in pale glass, its outline drawn in: the car the garden undoes,
// there and not there. Length along local x with the nose at +x, standing on
// y = 0. Feet; about a midsize sedan (16 ft by 6, 4 ft 9 in tall).
const CAR = { len: 15.8, wid: 6.1, tall: 4.75 };
const ghostParts = (() => {
  const wheelR = 1.05;
  const box = (w, h, d, x, y) => new THREE.BoxGeometry(w, h, d).translate(x, y, 0);
  const cabin = new THREE.BoxGeometry(7, 1.75, CAR.wid - 0.7);
  // Slope the windscreen and rear window: pull the cabin's top corners in.
  const p = cabin.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * 0.72 + (p.getX(i) > 0 ? -0.15 : 0.1));
  cabin.computeVertexNormals();
  cabin.translate(-0.5, 2.95 + 0.875, 0);
  // The body's top edge rounds down a little at the nose and the tail.
  const body = new THREE.BoxGeometry(CAR.len, 1.55, CAR.wid);
  const b = body.attributes.position;
  for (let i = 0; i < b.count; i++) if (b.getY(i) > 0) b.setX(i, b.getX(i) * 0.93);
  body.computeVertexNormals();
  body.translate(0, 0.75 + 0.775 + 0.6, 0);
  return {
    wheelR,
    body,
    skirt: box(8, 0.6, CAR.wid - 0.3, 0, 1.05),
    cabin,
    tyre: new THREE.CylinderGeometry(wheelR, wheelR, 0.7, 24).rotateX(Math.PI / 2),
  };
})();
function ghostCar() {
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xc6dacb, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.72, clearcoat: 1, depthWrite: false });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x6f8b7c, roughness: 0.1, transparent: true, opacity: 0.58, clearcoat: 1, depthWrite: false });
  const line = new THREE.LineBasicMaterial({ color: 0x2c4536, transparent: true, opacity: 0.9 });
  for (const [geo, m] of [[ghostParts.body, shell], [ghostParts.skirt, shell], [ghostParts.cabin, glass]]) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = 3;
    mesh.castShadow = geo === ghostParts.body; // a soft footing, so it stands on the ground
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), line));
    g.add(mesh);
  }
  for (const x of [-5.1, 5.1]) for (const z of [-(CAR.wid / 2 - 0.25), CAR.wid / 2 - 0.25]) {
    const tyre = new THREE.Mesh(ghostParts.tyre, glass);
    tyre.position.set(x, ghostParts.wheelR, z);
    tyre.renderOrder = 3;
    tyre.add(new THREE.LineSegments(new THREE.EdgesGeometry(ghostParts.tyre, 30), line));
    g.add(tyre);
  }
  return g;
}

const SIZE = { // footprint [long, deep]
  pizza: [1.6, 1.6], dinner: [6, 3], tv: [5.4, 1.6], phone: [1.6, 1.6], vacation: [8, 6], hottub: [7.5, 8.8],
  car: [14.6, 7.4], carNew: [14.6, 7.4], suv: [16.4, 8], sailboat: [30, 10], plane: [28, 36], yacht: [96, 20], jet: [60, 52],
};
// How tall each stands, for its label.
const TALL = { pizza: 1.4, dinner: 3.7, tv: 4.7, phone: 3.9, vacation: 6.9, hottub: 3.4, car: 5.4, carNew: 5.4, suv: 6.5, sailboat: 44, plane: 10, yacht: 30, jet: 22 };

/**
 * dollars, gallons: saved over `years`; co2: lb of CO2 drawn down then. lotPts: the lot in scene feet [[x, z]];
 * house: the main building's outline there, if known; avoid: other buildings'
 * outlines (neighbours', a garage), kept clear of the cars. front: { dx, dz }, the
 * unit direction from the property toward its street. at(x, z): ground height.
 * The cash, what it could buy, the water and the people it serves stand in
 * one row on one side of the house, outward from it in that order, their
 * fronts in line with the house front; the cars whose driving the CO2
 * undoes stand on the house's other side. Without a house they stand at the front
 * corners of the lot. Returns { group, items, zones, bounds }: items are the bundles
 * and water layers in the order they appear ({ obj, at: 0..1 }); zones are
 * their footprints with room around them ([[x, z] x 4] each); bounds
 * frames the house and everything beside it for the camera.
 */
export function createPayoffStacks({ dollars, gallons, co2 = 0, years, lotPts, house, avoid = [], front, at }) {
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

  // Each piece takes the next place out from the house on the same side, so
  // none of them runs into the house or another: `nextAt` is where the next starts.
  let nextAt = minS - GAP_FT;

  // Money: a tower of bundles beside the house, filled column by column.
  const { denom, count } = cashPlan(dollars);
  if (count > 0) {
    const cols = Math.ceil(count / PER_COLUMN);
    const across = Math.max(1, Math.ceil(Math.sqrt(cols)));
    const deep = Math.ceil(cols / across);
    const w = across * (BUNDLE.w + 0.25) + 1.2;
    const d = deep * (BUNDLE.d + 0.25) + 1.2;
    const sideAt = nextAt - w / 2;
    nextAt = sideAt - w / 2 - GAP_FT;
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
    // toward the street, turned a touch to show its side: as many as the
    // savings pay for, parked in rows of up to three.
    const buy = purchaseFor(dollars);
    const [len, dep] = SIZE[buy.model];
    const pieces = buy.stack ? 1 : buy.count; // a stack is one pile of them all
    const perRow = Math.min(pieces, 3);
    const rows = Math.ceil(pieces / perRow);
    const first = sideAt - w / 2 - 3 - len / 2;
    let top = 0;
    let labelAt = null;
    for (let k = 0; k < pieces; k++) {
      const objSide = first - (k % perRow) * (len + 1.2);
      const [ox, oz] = place(objSide, frontLine + dep / 2 + 1 - Math.floor(k / perRow) * (dep + 1.5));
      const [olo, ohi] = lowHigh(ox, oz, len / 2, dep / 2);
      const obj = purchaseModel(buy.model, buy.stack ? buy.count : 1);
      obj.position.set(ox, ohi > olo + 1.5 ? olo : (olo + ohi) / 2, oz);
      obj.rotation.y = facing + 0.35; // side on to the street, turned a little
      obj.visible = false;
      group.add(obj);
      items.push({ obj, at: 1 });
      top = Math.max(top, obj.position.y);
      if (k === Math.floor((perRow - 1) / 2)) labelAt = [ox, oz];
    }
    const objLabel = tagSprite([`That buys ${buy.name}`, `about $${fmt(buy.price)}${buy.count > 1 ? ' each' : ''}, drawn to scale`], 13);
    objLabel.position.set(labelAt[0], 0, labelAt[1]);
    group.add(objLabel);
    labels.push({ sprite: objLabel, top: top + (TALL[buy.model] || 3.6), world: true });
    const last = first - (perRow - 1) * (len + 1.2);
    const back = frontLine + 1 - (rows - 1) * (dep + 1.5);
    framed.push(place(last - len / 2, frontLine + dep + 1), place(first + len / 2, back));
    zone(last - len / 2 - 3, first + len / 2 + 3, back - 2, frontLine + VIEW_FT);
    nextAt = Math.min(nextAt, last - len / 2 - GAP_FT); // the water comes after what the cash buys
  }

  // Water: the true volume past the cash and what it buys, a clear blue block
  // of layers, one per year (or per month for a single year).
  const ft3 = Math.max(0, gallons) / GAL_PER_FT3;
  if (ft3 > 1) {
    const side = Math.cbrt(ft3);
    const layers = years <= 1 ? 12 : Math.min(30, Math.round(years));
    const layerH = side / layers;
    const sideAt = nextAt - side / 2 - 0.6;
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
    framed.push(place(sideAt - side / 2 - 0.6, frontLine), place(sideAt + side / 2, frontLine - side - 1.2));
    zone(sideAt - side / 2 - 3.6, sideAt + side / 2 + 3.6, frontLine - side - 4.2, frontLine + VIEW_FT);
    nextAt = sideAt - side / 2 - 0.6;
  }

  // Who that water would serve: a figure per person's indoor water for a
  // year (per 10, 100 or 1,000 people for big savings), in rows past the
  // water, filling outward and back from the house's front.
  const { people, unit, figures } = peopleFor(gallons);
  if (figures > 0) {
    const perRow = Math.min(figures, 8);
    const rows = Math.ceil(figures / perRow);
    const step = 2.6;
    const first = nextAt - 4 - 0.8;
    const width = (perRow - 1) * step + 1.6;
    let top = 0;
    for (let k = 0; k < figures; k++) {
      const [px, pz] = place(first - (k % perRow) * step, frontLine - 1 - Math.floor(k / perRow) * step);
      const fig = person(k);
      fig.position.set(px, at(px, pz), pz);
      fig.rotation.y = facing + (Math.sin(k * 7.1) * 0.25);
      fig.visible = false;
      group.add(fig);
      items.push({ obj: fig, at: 0.4 + (0.6 * (k + 1)) / figures });
      top = Math.max(top, fig.position.y + 5.6);
    }
    const whole = Math.round(people);
    const headline = people < 1
      ? `${Math.max(1, Math.round(people * 12))} months of one person’s water`
      : `Water for ${fmt(whole)} ${whole === 1 ? 'person' : 'people'} for a year`;
    const label = tagSprite([headline, `${GAL_PER_PERSON_DAY} gal a day each, indoors${unit > 1 ? ` · each figure ${fmt(unit)} people` : ''}`], 14);
    const [lx, lz] = place(first - width / 2 + 0.8, frontLine - 1 - ((rows - 1) * step) / 2);
    label.position.set(lx, 0, lz);
    group.add(label);
    labels.push({ sprite: label, top, world: true });
    framed.push(place(first + 1, frontLine), place(first - width, frontLine - 1 - rows * step));
    zone(first - width - 3, first + 3, frontLine - rows * step - 4, frontLine + VIEW_FT);
    nextAt = first - width - GAP_FT;
  }

  // The carbon it draws down, as the cars whose driving that undoes: pale
  // glass sedans at true size, a typical car's year of driving each (or 10,
  // 100… for big properties), angle-parked in rows on the house's other
  // side, noses toward the street, so the house stands between what the
  // garden saves and what it undoes.
  const carbon = carsFor(co2);
  if (carbon.figures > 0) {
    const tilt = 0.9; // the cars' angle to the street, radians
    const [cos, sin] = [Math.cos(tilt), Math.sin(tilt)];
    const acrossOne = CAR.len * cos + CAR.wid * sin; // one car's reach along the street
    const deepOne = CAR.len * sin + CAR.wid * cos; // and toward it
    const pitch = CAR.wid / sin + 1.4; // stall to stall along the street
    const perRow = Math.min(carbon.figures, 4);
    const rows = Math.ceil(carbon.figures / perRow);
    const rowStep = deepOne + 2.5;
    const span = acrossOne + (perRow - 1) * pitch;
    const depth = deepOne + (rows - 1) * rowStep;
    // Where they park: the house's other side if that's open, else at the
    // end of the savings row; never in a neighbour's house or a garage
    // (Real 3D keeps those whole). dir: which way the row runs from `from`.
    const maxS = Math.max(...anchor.map((p) => along(p, s)));
    const hits = (from, dir) => {
      let n = 0;
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) {
        const pt = place(from + dir * (-2 + ((span + 4) * i) / 8), frontLine + 2 - ((depth + 4) * j) / 4);
        if (avoid.some((q) => insidePoly(pt, q))) n++;
      }
      return n;
    };
    const spots = [{ from: maxS + GAP_FT, dir: 1 }, { from: nextAt, dir: -1 }].map((o) => ({ ...o, hits: hits(o.from, o.dir) }));
    const { from, dir } = spots.find((o) => o.hits === 0) || spots.reduce((a, b) => (b.hits < a.hits ? b : a));
    const first = from + dir * (acrossOne / 2);
    let top = 0;
    for (let k = 0; k < carbon.figures; k++) {
      const [cxk, czk] = place(first + dir * (k % perRow) * pitch, frontLine - deepOne / 2 - Math.floor(k / perRow) * rowStep);
      const [lo, hi] = lowHigh(cxk, czk, acrossOne / 2, deepOne / 2);
      const car = ghostCar();
      car.position.set(cxk, hi > lo + 1.5 ? lo : (lo + hi) / 2, czk);
      // Nose toward the street, angled away from the house.
      car.rotation.y = dir > 0 ? facing - Math.PI + tilt : facing - tilt;
      car.visible = false;
      group.add(car);
      items.push({ obj: car, at: 0.45 + (0.55 * (k + 1)) / carbon.figures });
      top = Math.max(top, car.position.y + CAR.tall);
    }
    const last = first + dir * (perRow - 1) * pitch;
    const headline = `Undoes ${carsText(co2)}`;
    const sub = carbon.unit > 1 ? `each glass car stands for ${fmt(carbon.unit)} cars’ yearly CO₂` : 'each glass car: a typical car’s CO₂ for a year (EPA)';
    const label = tagSprite([headline, `${fmt(co2)} lb of CO₂ drawn down over ${years} year${years === 1 ? '' : 's'}`, sub], 15);
    const [lx, lz] = place((first + last) / 2, frontLine - deepOne / 2 - ((rows - 1) * rowStep) / 2);
    label.position.set(lx, 0, lz);
    group.add(label);
    labels.push({ sprite: label, top, world: true });
    const [a, b] = [Math.min(first, last) - acrossOne / 2, Math.max(first, last) + acrossOne / 2];
    framed.push(place(a, frontLine), place(b, frontLine - depth));
    zone(a - 3, b + 3, frontLine - depth - 3, frontLine + VIEW_FT);
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
