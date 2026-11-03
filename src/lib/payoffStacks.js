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
// What the savings could buy: the dearest thing on a ladder from a birdhouse
// to a private jet that they cover (as many as they pay for, up to `most`),
// so a longer horizon or a bigger property reaches the next thing up.
export const PURCHASES = [
  { min: 5000000, one: 'a private jet', many: 'private jets', price: 5000000, model: 'jet', most: 3 },
  { min: 2000000, one: 'a motor yacht', many: 'motor yachts', price: 2000000, model: 'yacht', most: 1 },
  { min: 350000, one: 'a small plane', many: 'small planes', price: 350000, model: 'plane', most: 3 },
  { min: 180000, one: 'a sailboat', many: 'sailboats', price: 180000, model: 'sailboat', most: 1 },
  { min: 90000, one: 'a tiny house', many: 'tiny houses', price: 90000, model: 'tinyhouse', most: 1 },
  { min: 45000, one: 'a new electric car', many: 'new electric cars', price: 45000, model: 'carNew', most: 1 },
  { min: 15000, one: 'a used electric car', many: 'used electric cars', price: 15000, model: 'car', most: 2 },
  { min: 7000, one: 'a hot tub', many: 'hot tubs', price: 7000, model: 'hottub', most: 1 },
  { min: 3500, one: 'a backyard greenhouse', many: 'backyard greenhouses', price: 3500, model: 'greenhouse', most: 1 },
  { min: 1500, one: 'an e-bike', many: 'e-bikes', price: 1500, model: 'ebike', most: 1 },
  { min: 900, one: 'a kayak', many: 'kayaks', price: 900, model: 'kayak', most: 1 },
  { min: 450, one: 'a new bike', many: 'new bikes', price: 500, model: 'bike', most: 1 },
  { min: 200, one: 'a garden bench', many: 'garden benches', price: 300, model: 'bench', most: 1 },
  { min: 0, one: 'a cedar birdhouse', many: 'cedar birdhouses', price: 60, model: 'birdhouse', most: 3 },
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
  } else if (kind === 'kayak') {
    // A sit-on-top kayak on its rack, paddle across it.
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), mat(0xd9682b, 0.35, 0.1));
    hull.scale.set(6, 0.55, 1.1);
    hull.position.y = 1.6;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.9), mat(0x2b2d2a, 0.7));
    seat.position.set(-0.4, 2.05, 0);
    g.add(hull, seat);
    const rack = mat(0x6d5a48, 0.9);
    for (const x of [-3, 3]) {
      g.add(tube([x, 0, -0.8], [x, 1.1, -0.8], 0.08, rack));
      g.add(tube([x, 0, 0.8], [x, 1.1, 0.8], 0.08, rack));
      g.add(tube([x, 1.1, -0.9], [x, 1.1, 0.9], 0.09, rack));
    }
    g.add(tube([-1.5, 2.25, -1.6], [1.5, 2.25, 1.6], 0.05, mat(0x2b2d2a, 0.4)));
  } else if (kind === 'greenhouse') {
    // Aluminium frame and glass, a gable roof, staging inside.
    const metal = mat(0xd6d8d2, 0.35, 0.7);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xdff0ea, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.35, depthWrite: false });
    const [w, d, h, ridge] = [10, 8, 6.2, 8.4];
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glass);
    walls.position.y = h / 2;
    const roofShape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, ridge - h)]);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: w, bevelEnabled: false }), glass);
    roof.rotation.y = Math.PI / 2;
    roof.position.set(-w / 2, h, 0);
    g.add(walls, roof);
    for (const x of [-w / 2, -w / 6, w / 6, w / 2]) {
      for (const z of [-d / 2, d / 2]) g.add(tube([x, 0, z], [x, h, z], 0.06, metal));
      g.add(tube([x, h, -d / 2], [x, ridge, 0], 0.06, metal));
      g.add(tube([x, h, d / 2], [x, ridge, 0], 0.06, metal));
    }
    g.add(tube([-w / 2, ridge, 0], [w / 2, ridge, 0], 0.06, metal));
    for (const z of [-d / 2, d / 2]) g.add(tube([-w / 2, h, z], [w / 2, h, z], 0.06, metal));
    const bench = new THREE.Mesh(new THREE.BoxGeometry(w - 1.5, 0.2, 1.8), mat(0x9a6b45, 0.85));
    bench.position.set(0, 2.6, -d / 2 + 1.3);
    g.add(bench);
    for (let k = 0; k < 6; k++) {
      const pot = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), mat(0x4c8a2b, 0.8));
      pot.position.set(-3.5 + k * 1.4, 3.0, -d / 2 + 1.3);
      g.add(pot);
    }
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
  } else if (kind === 'tinyhouse') {
    // On its trailer: cedar siding, a metal gable roof, a window and a door.
    const trailer = new THREE.Mesh(new THREE.BoxGeometry(24, 0.5, 8.4), mat(0x2b2d2a, 0.6, 0.5));
    trailer.position.y = 2.2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(24, 8.5, 8.4), mat(0xb98a5e, 0.8));
    body.position.y = 6.7;
    const roofShape = new THREE.Shape([new THREE.Vector2(-4.7, 0), new THREE.Vector2(4.7, 0), new THREE.Vector2(0, 3.2)]);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 24.6, bevelEnabled: false }), mat(0x3d4a45, 0.45, 0.5));
    roof.rotation.y = Math.PI / 2;
    roof.position.set(-12.3, 10.95, 0);
    const win = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.2), mat(0x22302c, 0.1, 0.3));
    win.position.set(-4, 7.5, 4.25);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.6, 6.4, 0.2), mat(0x5a3f2c, 0.7));
    door.position.set(6, 5.7, 4.25);
    g.add(trailer, body, roof, win, door);
    const hub = mat(0xa7aaa4, 0.35, 0.7);
    for (const x of [-1.6, 1.6]) for (const z of [-4.3, 4.3]) g.add(wheel(1.2, 0.6, x, 1.2, z, rubber, hub));
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
  } else if (kind === 'car' || kind === 'carNew') {
    const paint = mat(kind === 'carNew' ? 0x8a2f2f : 0xe9e6dd, 0.3, 0.2);
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

const SIZE = { // footprint [long, deep]
  birdhouse: [1.2, 1.2], bench: [5.2, 2.2], bike: [6, 1.6], ebike: [6, 1.6], kayak: [12, 2.2], greenhouse: [10, 8], hottub: [7.5, 8.8],
  car: [14.6, 7.4], carNew: [14.6, 7.4], tinyhouse: [24, 9.4], sailboat: [30, 10], plane: [28, 36], yacht: [96, 20], jet: [60, 52],
};
// How tall each stands, for its label.
const TALL = { birdhouse: 7, bench: 3.6, bike: 3.6, ebike: 3.6, kayak: 2.6, greenhouse: 8.6, hottub: 3.4, car: 5.4, carNew: 5.4, tinyhouse: 14.2, sailboat: 44, plane: 10, yacht: 30, jet: 22 };

/**
 * dollars, gallons: saved over `years`. lotPts: the lot in scene feet [[x, z]];
 * house: the main building's outline there, if known. front: { dx, dz }, the
 * unit direction from the property toward its street. at(x, z): ground height.
 * The cash, what it could buy, the water and the people it serves stand in
 * one row on one side of the house, outward from it in that order, their
 * fronts in line with the house front. Without a house they stand at the front
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
    const perRow = Math.min(buy.count, 3);
    const rows = Math.ceil(buy.count / perRow);
    const first = sideAt - w / 2 - 3 - len / 2;
    let top = 0;
    let labelAt = null;
    for (let k = 0; k < buy.count; k++) {
      const objSide = first - (k % perRow) * (len + 1.2);
      const [ox, oz] = place(objSide, frontLine + dep / 2 + 1 - Math.floor(k / perRow) * (dep + 1.5));
      const [olo, ohi] = lowHigh(ox, oz, len / 2, dep / 2);
      const obj = purchaseModel(buy.model);
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
