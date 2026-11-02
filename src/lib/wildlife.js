import * as THREE from 'three';

// Native wildlife that comes to the planted garden in 3D: butterflies and
// native bees working the flowers, hummingbirds hovering at blooms, and
// songbirds hopping through the beds and perching on shrubs. Only animals the
// chosen plants feed (each plant's `wildlife` list) appear, and more of them as
// the biodiversity score rises. Low-poly and drawn a little larger than life so
// they read at garden scale (SIZE). Plan feet; the 3D view's frame (z = -north).

// How much larger than life each is drawn, so it can be spotted from the
// overview of a whole yard.
const SIZE = { butterfly: 2.6, bee: 3, hummingbird: 2.4, songbird: 1.8 };
const KINDS = {
  butterfly: { tag: 'Butterflies', max: 10 },
  bee: { tag: 'Native bees', max: 12 },
  hummingbird: { tag: 'Hummingbirds', max: 4 },
  songbird: { tag: 'Birds', max: 6 },
};
// California natives: monarch, western tiger swallowtail, California dogface,
// west coast lady. Hummingbird: Anna's. Songbirds: California towhee, California
// scrub-jay, lesser goldfinch.
const BUTTERFLY_COLORS = [0xe8892b, 0xf2d03b, 0xf0b43a, 0xd9773a];
const BIRDS = [
  { body: 0x8a6a4f, head: 0x7a5c44, belly: 0xc9a27a },
  { body: 0x3d6fb3, head: 0x3d6fb3, belly: 0xd8d2c4 },
  { body: 0x8f9b3a, head: 0x2b2b2b, belly: 0xe2d34a },
];

const shared = new Map();
const mat = (color, opts = {}) => {
  const key = `${color}:${JSON.stringify(opts)}`;
  if (!shared.has(key)) shared.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts }));
  return shared.get(key);
};

function wing(w, h, color, side) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(side * w * 0.6, h * 0.9, side * w * 1.1, h * 0.4, side * w, -h * 0.1);
  shape.bezierCurveTo(side * w * 0.8, -h * 0.7, side * w * 0.3, -h * 0.6, 0, 0);
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat(color, { side: THREE.DoubleSide, roughness: 0.5 }));
  m.rotation.x = -Math.PI / 2;
  const pivot = new THREE.Group();
  pivot.add(m);
  return pivot;
}

function butterfly(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.2, 3, 6), mat(0x2a2420));
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const left = wing(0.32, 0.28, color, -1);
  const right = wing(0.32, 0.28, color, 1);
  g.add(left, right);
  g.userData.flap = (t) => {
    const a = Math.sin(t * 18) * 0.9 + 0.2;
    left.rotation.z = -a;
    right.rotation.z = a;
  };
  return g;
}

function bee() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0xe2b33a));
  body.scale.set(0.8, 0.8, 1.4);
  const band = new THREE.Mesh(new THREE.SphereGeometry(0.092, 8, 6, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.16), mat(0x241c14));
  band.scale.set(0.8, 0.8, 1.4);
  band.rotation.x = Math.PI / 2;
  const left = wing(0.12, 0.08, 0xdfe8ee, -1);
  const right = wing(0.12, 0.08, 0xdfe8ee, 1);
  left.position.y = right.position.y = 0.06;
  g.add(body, band, left, right);
  g.userData.flap = (t) => {
    const a = Math.sin(t * 60) * 0.6;
    left.rotation.z = -a;
    right.rotation.z = a;
  };
  return g;
}

function hummingbird() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0x3f8a5a, { metalness: 0.3 }));
  body.scale.set(0.8, 0.8, 1.6);
  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0xc2306a));
  throat.position.set(0, -0.02, 0.12);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.18, 5), mat(0x1c1c1c));
  beak.rotation.x = Math.PI / 2;
  beak.position.z = 0.27;
  const left = wing(0.22, 0.1, 0xb8c9bf, -1);
  const right = wing(0.22, 0.1, 0xb8c9bf, 1);
  left.position.y = right.position.y = 0.04;
  g.add(body, throat, beak, left, right);
  g.userData.flap = (t) => {
    const a = Math.sin(t * 70) * 0.9;
    left.rotation.z = -a;
    right.rotation.z = a;
  };
  return g;
}

function songbird({ body: bodyColor, head: headColor, belly }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(bodyColor));
  body.scale.set(0.85, 0.8, 1.35);
  body.position.y = 0.16;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(belly));
  chest.position.set(0, 0.12, 0.08);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(headColor));
  head.position.set(0, 0.3, 0.17);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 5), mat(0x3a3328));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.29, 0.29);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.24), mat(bodyColor));
  tail.position.set(0, 0.2, -0.27);
  tail.rotation.x = -0.35;
  const left = wing(0.3, 0.16, bodyColor, -1);
  const right = wing(0.3, 0.16, bodyColor, 1);
  left.position.y = right.position.y = 0.22;
  left.visible = right.visible = false; // folded unless flying
  g.add(body, chest, head, beak, tail, left, right);
  g.userData.flap = (t, flying) => {
    left.visible = right.visible = flying;
    const a = Math.sin(t * 22) * 0.8;
    left.rotation.z = -a;
    right.rotation.z = a;
  };
  return g;
}

/** How many of each animal a planting draws: by the share of its plants that feed it, scaled by the score. */
export function wildlifeCounts(plants, score) {
  const strength = Math.max(0, Math.min(1, (score - 23) / 70));
  const out = {};
  for (const [kind, { tag, max }] of Object.entries(KINDS)) {
    const feeding = plants.filter((p) => p.wildlife?.includes(tag)).length;
    out[kind] = feeding ? Math.max(1, Math.round(max * strength * Math.min(1, 0.4 + feeding / Math.max(1, plants.length)))) : 0;
  }
  return out;
}

/**
 * Animals for a placed planting. spots: [{ x, z, top, wildlife }] in scene
 * feet (top = the plant's height there). Returns { group, counts, update(t) }.
 */
export function createWildlife(spots, score, groundAt) {
  const group = new THREE.Group();
  const plants = spots.map((s) => ({ wildlife: s.wildlife }));
  const counts = wildlifeCounts(plants, score);
  const random = (() => {
    let seed = 1234567;
    return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  })();
  const feedingOn = (tag) => spots.filter((s) => s.wildlife?.includes(tag));
  const animals = [];
  const add = (kind, model, targets, opts) => {
    if (!targets.length) return;
    model.scale.setScalar(SIZE[kind]);
    group.add(model);
    const start = targets[Math.floor(random() * targets.length)];
    const pos = new THREE.Vector3(start.x, groundAt(start.x, start.z) + start.top + (kind === 'songbird' ? 0 : 0.3), start.z);
    model.position.copy(pos);
    animals.push({ kind, model, targets, from: null, to: start, end: null, pos, wait: random() * 3, t: Math.random() * 10, ...opts });
  };
  for (let i = 0; i < counts.butterfly; i++) add('butterfly', butterfly(BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length]), feedingOn('Butterflies'), { speed: 2.2, hover: 0.35 });
  for (let i = 0; i < counts.bee; i++) add('bee', bee(), feedingOn('Native bees'), { speed: 3.5, hover: 0.15 });
  for (let i = 0; i < counts.hummingbird; i++) add('hummingbird', hummingbird(), feedingOn('Hummingbirds'), { speed: 9, hover: 0.4 });
  for (let i = 0; i < counts.songbird; i++) add('songbird', songbird(BIRDS[i % BIRDS.length]), feedingOn('Birds'), { speed: 7 });

  let last = null;
  const update = (time) => {
    const dt = last === null ? 0 : Math.min(0.1, time - last);
    last = time;
    for (const a of animals) {
      const { model } = a;
      if (a.wait > 0) {
        // Feeding or perched: a small hover over the plant (birds stand still and look about).
        a.wait -= dt;
        if (a.kind === 'songbird') {
          model.rotation.y += Math.sin(time * 3 + a.t) * 0.02;
          model.userData.flap(time, false);
        } else {
          model.position.set(a.pos.x + Math.sin(time * 2 + a.t) * a.hover, a.pos.y + Math.sin(time * 3.1 + a.t) * a.hover * 0.6, a.pos.z + Math.cos(time * 1.7 + a.t) * a.hover);
          model.userData.flap(time, true);
        }
        if (a.wait <= 0) {
          // Off to another plant: birds land on its top or the ground beside it.
          a.from = model.position.clone();
          a.to = a.targets[Math.floor(random() * a.targets.length)];
          const land = a.kind === 'songbird' ? (random() < 0.5 ? a.to.top : 0) : a.to.top + 0.3;
          const off = a.kind === 'songbird' && !land ? 1 : 0.3;
          a.end = new THREE.Vector3(a.to.x + (random() - 0.5) * off * 2, groundAt(a.to.x, a.to.z) + land, a.to.z + (random() - 0.5) * off * 2);
          a.t = 0;
        }
        continue;
      }
      // Travelling to the next plant: an arc, higher for birds.
      const dist = a.from.distanceTo(a.end) || 1;
      a.t = Math.min(1, a.t + (dt * a.speed) / dist);
      const p = a.from.clone().lerp(a.end, a.t);
      const lift = a.kind === 'songbird' ? 3 : a.kind === 'hummingbird' ? 1.2 : 1.5;
      p.y += Math.sin(a.t * Math.PI) * Math.min(lift, dist * 0.3);
      if (a.kind === 'butterfly') p.y += Math.sin(time * 9) * 0.15; // the fluttering bob
      const dir = p.clone().sub(model.position);
      if (dir.lengthSq() > 1e-6) model.rotation.y = Math.atan2(dir.x, dir.z);
      model.position.copy(p);
      model.userData.flap(time, true);
      if (a.t >= 1) {
        a.pos.copy(a.end);
        a.wait = a.kind === 'hummingbird' ? 1 + random() * 1.5 : a.kind === 'songbird' ? 2 + random() * 4 : 1.5 + random() * 3;
      }
    }
  };
  return { group, counts, update };
}
