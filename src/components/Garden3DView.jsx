import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Leaf, Loader2, Move, ScanEye, Sun, Wand2 } from 'lucide-react';
import WalkThroughHandle from '@/components/WalkThroughHandle';
import WalkSpeedControl from '@/components/WalkSpeedControl';
import WalkMiniMap from '@/components/WalkMiniMap';
import { Button } from '@/components/ui/button';
import { plantById } from '@/data/nativePlants';
import { plantsForProject } from '@/data/regions';
import { base44 } from '@/api/base44Client';
import { ARRANGEMENTS } from '@/data/arrangements';
import { disposeObject } from '@/lib/disposeThree';
import { arrangePlants, prepareBuildings, prepareLot, preparePolys, prepareTrees, preparePaths, projectOrigin } from '@/lib/gardenLayout';

// Module-level geometries, materials and textures are reused across scene
// rebuilds and remounts; they're tracked here so disposal skips them.
const SHARED = new WeakSet();
const shared = (r) => { SHARED.add(r); return r; };
const isShared = (r) => SHARED.has(r);

const GEO = {
  ico1: shared(new THREE.IcosahedronGeometry(1, 1)),
  cyl: shared(new THREE.CylinderGeometry(1, 1, 1, 8)),
  cone: shared(new THREE.ConeGeometry(1, 1, 6)),
  ring: shared(new THREE.RingGeometry(0.85, 1, 28)),
  sphere: shared(new THREE.SphereGeometry(1, 10, 8)),
};

// Raised mulch slab geometry: a 0.35 ft mound with a soft rounded top edge.
const MULCH_Y = 0.03; // mulch sits a hair above the ground so it reads as a flat 2D layer
const EYE_HEIGHT = 5.5; // walkthrough camera height (ft) above the ground

function canvasTexture(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const tex = shared(new THREE.CanvasTexture(c)); // only used for the cached textures below
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

let _mulch;
function mulchTexture() {
  if (_mulch) return _mulch;
  _mulch = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#7c5a38';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 3200; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 1 + Math.random() * 2.4;
      const shade = Math.random();
      ctx.fillStyle = shade > 0.6 ? '#9a724a' : shade < 0.3 ? '#5e3f25' : '#7c5a38';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return _mulch;
}
// Roads and paths: speckled asphalt and light pavers, laid in world feet so
// the texture scale matches however big the slab is.
const ROAD_KINDS = new Set(['service', 'living_street', 'residential', 'unclassified', 'tertiary', 'secondary', 'primary']);
let _asphalt;
function asphaltTexture() {
  if (_asphalt) return _asphalt;
  _asphalt = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#45464a';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5000; i++) {
      const v = 55 + Math.floor(Math.random() * 45);
      ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.6, 1.6);
    }
  });
  _asphalt.repeat.set(1 / 12, 1 / 12); // one tile per 12 ft
  return _asphalt;
}
let _pavers;
function paverTexture() {
  if (_pavers) return _pavers;
  _pavers = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#d8cfbd';
    ctx.fillRect(0, 0, s, s);
    const n = 4;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const shade = 200 + Math.floor(Math.random() * 30);
        ctx.fillStyle = `rgb(${shade},${shade - 8},${shade - 24})`;
        ctx.fillRect((col * s) / n + 3, (row * s) / n + 3, s / n - 6, s / n - 6);
      }
    }
  });
  _pavers.repeat.set(1 / 4, 1 / 4); // pavers about 1 ft square
  return _pavers;
}

// Centre, direction and size of a road/path outline (principal axis of its points).
function slabAxis(poly) {
  const n = poly.length;
  const mx = poly.reduce((s, p) => s + p[0], 0) / n;
  const my = poly.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of poly) {
    sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my);
  }
  let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI; // keep text reading left to right
  const ux = Math.cos(angle), uy = Math.sin(angle);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [x, y] of poly) {
    const u = (x - mx) * ux + (y - my) * uy;
    const v = -(x - mx) * uy + (y - my) * ux;
    minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  return { mx, my, angle, length: maxU - minU, width: maxV - minV };
}

// Street name painted flat along a road.
function roadLabel(name, axis) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '600 72px "Inter Tight", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(20,20,20,0.85)';
  ctx.strokeText(name, 512, 64);
  ctx.fillStyle = '#f5f2ea';
  ctx.fillText(name, 512, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const h = Math.max(2, Math.min(axis.width * 0.55, 10));
  const w = Math.min(axis.length * 0.85, h * (1024 / 128));
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = axis.angle; // after laying flat, z turns it within the ground plane
  return mesh;
}

// Sky: a soft, hazy blue overhead, fading to near-white at the horizon.
let _sky;
function skyTexture() {
  if (_sky) return _sky;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#9dbbd8');
  g.addColorStop(0.55, '#c3d6e7');
  g.addColorStop(1, '#eef2f4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 512);
  _sky = shared(new THREE.CanvasTexture(c));
  _sky.colorSpace = THREE.SRGBColorSpace;
  return _sky;
}

// Satellite imagery of the surroundings, stitched from map tiles and toned
// down (less colour, lighter) so the modelled property stays the focus.
// Resolves to { canvas, west, south, east, north } (the mosaic's exact extent).
const SAT_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
const _satCache = new Map();
function loadSurroundings({ west, south, east, north }) {
  const key = [west, south, east, north].map((v) => v.toFixed(5)).join(',');
  if (_satCache.has(key)) return _satCache.get(key);
  const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
  const lat2y = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
  const x2lon = (x, z) => (x / 2 ** z) * 360 - 180;
  const y2lat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
  // Most detail that stays within 8×8 tiles.
  let z = 19;
  while (z > 12 && (Math.floor(lon2x(east, z)) - Math.floor(lon2x(west, z)) + 1) * (Math.floor(lat2y(south, z)) - Math.floor(lat2y(north, z)) + 1) > 64) z--;
  const [x0, x1] = [Math.floor(lon2x(west, z)), Math.floor(lon2x(east, z))];
  const [y0, y1] = [Math.floor(lat2y(north, z)), Math.floor(lat2y(south, z))];
  const canvas = document.createElement('canvas');
  canvas.width = (x1 - x0 + 1) * 256;
  canvas.height = (y1 - y0 + 1) * 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d9d6cc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const loads = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      loads.push(new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.filter = 'saturate(55%) brightness(1.06) contrast(0.85)';
          ctx.drawImage(img, (x - x0) * 256, (y - y0) * 256);
          ctx.filter = 'none';
          resolve();
        };
        img.onerror = resolve; // a missing tile leaves a neutral patch
        img.src = `${SAT_TILES}/${z}/${y}/${x}`;
      }));
    }
  }
  const promise = Promise.all(loads).then(() => {
    // Wash with the page's cream so the imagery recedes behind the model.
    ctx.fillStyle = 'rgba(242, 239, 231, 0.38)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return { canvas, west: x2lon(x0, z), east: x2lon(x1 + 1, z), north: y2lat(y0, z), south: y2lat(y1 + 1, z) };
  });
  promise.catch(() => _satCache.delete(key));
  _satCache.set(key, promise);
  return promise;
}

let _ground;
function groundTexture() {
  if (_ground) return _ground;
  _ground = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#b8b3a3';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2400; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 1 + Math.random() * 2;
      const shade = Math.random();
      ctx.fillStyle = shade > 0.6 ? '#c7c2b3' : shade < 0.3 ? '#a39e8f' : '#b8b3a3';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return _ground;
}

// 3D building: extrudes a roofed structure from its footprint. Wall color and
// roof type come from a project's saved `building` attributes, which only older
// scans have; otherwise the walls are gray with a neutral roof. Height is passed
// in (measured per footprint, or estimated from its size — see the caller).
const WALL_COLORS = {
  white: 0xf2efe9, beige: 0xe8dcc6, tan: 0xcfa978, cream: 0xefe6d4,
  gray: 0x9a9a96, brown: 0x6e5642, brick: 0x9a5a45, red: 0x9c4b3a,
  blue: 0x6b7d8f, green: 0x6f8175, yellow: 0xd8c47a,
};
const ROOF_COLORS = {
  flat: 0x333333, gable: 0x4a3528, hip: 0x4a3528, shed: 0x4a3528, mansard: 0x2e2e2e, unknown: 0x3c3c3c,
};
function buildBuilding(points, heightFt, wallColor, roofType) {
  const g = new THREE.Group();
  // Build around the footprint's own centre so the roof's eave overhang (a 4%
  // scale-up) grows evenly on all sides instead of sliding off the walls.
  const mx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const my = points.reduce((s, p) => s + p[1], 0) / points.length;
  g.position.set(mx, 0, -my);
  const shape = new THREE.Shape();
  points.forEach((p, i) => { if (i === 0) shape.moveTo(p[0] - mx, p[1] - my); else shape.lineTo(p[0] - mx, p[1] - my); });
  const wallHex = WALL_COLORS[wallColor] ?? WALL_COLORS.gray;
  const wallMat = new THREE.MeshStandardMaterial({ color: wallHex, roughness: 0.92, flatShading: true });
  const walls = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: heightFt, bevelEnabled: false }), wallMat);
  walls.rotation.x = -Math.PI / 2;
  walls.castShadow = true; walls.receiveShadow = true;
  g.add(walls);
  // Roof: a thin slab slightly oversized vs the footprint to read as eaves.
  const roofMat = new THREE.MeshStandardMaterial({ color: ROOF_COLORS[roofType] ?? ROOF_COLORS.unknown, roughness: 0.85 });
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }), roofMat);
  roof.rotation.x = -Math.PI / 2;
  roof.position.y = heightFt;
  roof.scale.set(1.04, 1.04, 1);
  roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);
  return g;
}

// Existing mature trees kept from the scan: rendered as a trunk + broad ico
// canopy sized to the scanned radius and, when known, the measured canopy
// height; in a distinct deep green so they read as kept trees rather than
// newly designed plants.
const EXISTING_TREE = { id: '__existing_tree__', form: 'tree', color: '#38522e', accent: '#5a7344' };
function buildExistingTree(radiusFt, heightFt) {
  const r = Math.max(2, radiusFt);
  const plant = { ...EXISTING_TREE, w: r * 2, h: heightFt > 0 ? Math.max(heightFt, r) : r * 2.3 };
  return buildPlant(plant, true);
}

// Per-plant materials are built fresh in buildPlant with a small random color
// variation so a bed of the same species doesn't read as identical clones.

// One shared material set per species + maturity. A bed of the same species used
// to build a fresh MeshStandardMaterial per plant (hundreds of GPU programs); now
// they all share three, which is the single biggest 3D perf win here.
const _matCache = new Map();
function plantMaterials(plant, mature) {
  const key = plant.id + ':' + (mature ? 'm' : 'y');
  if (_matCache.has(key)) return _matCache.get(key);
  const mats = {
    leaf: shared(new THREE.MeshStandardMaterial({ color: new THREE.Color(plant.color), roughness: 0.85, flatShading: true })),
    accent: shared(new THREE.MeshStandardMaterial({ color: new THREE.Color(plant.accent || plant.color), roughness: 0.7, flatShading: true })),
    trunk: shared(new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.95 })),
  };
  _matCache.set(key, mats);
  return mats;
}

function buildPlant(plant, mature) {
  const g = new THREE.Group();
  const s = mature ? 1 : 0.35;
  const w = Math.max(0.8, plant.w) * s;
  const h = Math.max(0.8, plant.h) * s;
  const { leaf: leafMat, accent: accentMat, trunk: trunkMat } = plantMaterials(plant, mature);
  const hasAccent = plant.accent && plant.accent !== plant.color;

  const blob = (geo, mat, x, y, z, sx, sy, sz, rot) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.rotation.y = rot || 0;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  };

  if (plant.form === 'tree') {
    const trunk = new THREE.Mesh(GEO.cyl, trunkMat);
    trunk.scale.set(0.13, h * 0.5, 0.13);
    trunk.position.y = h * 0.25;
    trunk.castShadow = true; trunk.receiveShadow = true;
    g.add(trunk);
    const cw = w * 0.55;
    blob(GEO.ico1, leafMat, 0, h * 0.5 + h * 0.22, 0, cw, cw * 0.85, cw, 0.4);
    blob(GEO.ico1, leafMat, cw * 0.4, h * 0.5 + h * 0.32, cw * 0.3, cw * 0.7, cw * 0.6, cw * 0.7, 1.1);
    blob(GEO.ico1, leafMat, -cw * 0.35, h * 0.5 + h * 0.3, -cw * 0.25, cw * 0.65, cw * 0.55, cw * 0.65, 2.0);
    if (hasAccent) {
      for (let i = 0; i < 8; i++) {
        const b = new THREE.Mesh(GEO.sphere, accentMat);
        const a = Math.random() * Math.PI * 2, r = Math.random() * cw * 0.5;
        b.scale.setScalar(0.06);
        b.position.set(Math.cos(a) * r, h * 0.5 + h * 0.35 + Math.random() * 0.3, Math.sin(a) * r);
        b.castShadow = true; g.add(b);
      }
    }
  } else if (plant.form === 'shrub') {
    const r = w * 0.34;
    const lobes = 6;
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const rad = r * (0.7 + Math.random() * 0.5);
      blob(GEO.ico1, leafMat, Math.cos(a) * r * 0.5, r * 0.8 + (Math.random() - 0.3) * r * 0.3, Math.sin(a) * r * 0.5, rad, rad * 0.8, rad, a);
    }
    if (hasAccent) {
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(GEO.sphere, accentMat);
        b.scale.setScalar(0.08);
        b.position.set((Math.random() - 0.5) * r, r * 0.7 + Math.random() * r * 0.5, (Math.random() - 0.5) * r);
        b.castShadow = true; g.add(b);
      }
    }
  } else if (plant.form === 'flower') {
    const stem = new THREE.Mesh(GEO.cyl, trunkMat);
    stem.scale.set(0.045, h, 0.045); stem.position.y = h * 0.5; stem.castShadow = true; g.add(stem);
    for (let i = 0; i < 2; i++) {
      const lf = new THREE.Mesh(GEO.cone, leafMat);
      lf.scale.set(0.12, 0.2, 0.04);
      lf.position.set(i ? 0.12 : -0.12, h * 0.4, 0);
      lf.rotation.z = i ? -0.8 : 0.8; lf.castShadow = true; g.add(lf);
    }
    const bloom = new THREE.Mesh(GEO.ico1, accentMat);
    bloom.scale.setScalar(w * 0.32); bloom.position.y = h + w * 0.12; bloom.castShadow = true; g.add(bloom);
    for (let i = 0; i < 6; i++) {
      const petal = new THREE.Mesh(GEO.cone, accentMat);
      const a = (i / 6) * Math.PI * 2;
      petal.scale.set(w * 0.1, w * 0.2, w * 0.1);
      petal.position.set(Math.cos(a) * w * 0.2, h + w * 0.05, Math.sin(a) * w * 0.2);
      petal.rotation.z = Math.PI / 2.3; petal.rotation.y = -a; petal.castShadow = true; g.add(petal);
    }
  } else if (plant.form === 'groundcover') {
    const mounds = 9;
    for (let i = 0; i < mounds; i++) {
      const a = (i / mounds) * Math.PI * 2 + Math.random();
      const r = Math.random() * w * 0.45;
      const rad = w * 0.22 * (0.7 + Math.random() * 0.5);
      blob(GEO.ico1, leafMat, Math.cos(a) * r, rad * 0.5, Math.sin(a) * r, rad, rad * 0.4, rad, a);
    }
    if (hasAccent) {
      for (let i = 0; i < 5; i++) {
        const b = new THREE.Mesh(GEO.sphere, accentMat);
        b.scale.setScalar(0.05);
        b.position.set((Math.random() - 0.5) * w, 0.15 + Math.random() * 0.15, (Math.random() - 0.5) * w);
        g.add(b);
      }
    }
  } else { // grass
    const blades = 12;
    for (let i = 0; i < blades; i++) {
      const blade = new THREE.Mesh(GEO.cone, leafMat);
      const a = (i / blades) * Math.PI * 2 + Math.random() * 0.3;
      const r = Math.random() * w * 0.3;
      blade.scale.set(w * 0.05, h * (0.7 + Math.random() * 0.5), w * 0.05);
      blade.position.set(Math.cos(a) * r, h * 0.4, Math.sin(a) * r);
      blade.rotation.z = (Math.random() - 0.5) * 0.3;
      blade.castShadow = true; g.add(blade);
    }
    if (hasAccent) {
      const plume = new THREE.Mesh(GEO.cone, accentMat);
      plume.scale.set(w * 0.06, h * 0.4, w * 0.06); plume.position.y = h * 0.9; plume.castShadow = true; g.add(plume);
    }
  }
  return g;
}

export default function Garden3DView({ entries = [], project, activeArrangement, onApplyArrangement }) {
  const mountRef = useRef(null);
  const threeRef = useRef(null);
  const plantMeshesRef = useRef([]);
  const bedMeshesRef = useRef([]);
  const bedsRef = useRef([]);
  const draggingRef = useRef(null);
  const tweenRef = useRef(null);
  const focusOnRef = useRef(null);
  const [mature, setMature] = useState(true);
  const [moveMode, setMoveMode] = useState(false);
  const moveModeRef = useRef(false);
  const [walkMode, setWalkMode] = useState(false);
  // The orbit camera and first-person walk-through are free for everyone.
  const interactive = true;
  const interactiveRef = useRef(true);
  const [walkSpeed, setWalkSpeed] = useState(4.5);
  const walkSpeedRef = useRef(4.5);
  useEffect(() => { walkSpeedRef.current = walkSpeed; }, [walkSpeed]);
  const walkRef = useRef({ keys: new Set(), yaw: 0, pitch: 0, active: false, last: 0 });
  const personPosRef = useRef(null);
  // Plants moved by hand, keyed `${speciesId}:${nth of that species}` → lot
  // feet {x, y}, so a rebuild (e.g. maturity toggle) keeps them. Component
  // state only; it isn't saved with the project.
  const movedRef = useRef({ polys: null, pattern: null, map: new Map() });
  const surroundingsRef = useRef(null); // the latest satellite-surroundings request; older ones are dropped
  const [custom, setCustom] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [designing, setDesigning] = useState(false);
  const [designError, setDesignError] = useState('');

  const arrangement = useMemo(() => ARRANGEMENTS.find((a) => a.id === activeArrangement) || null, [activeArrangement]);

  const regionPlantIds = useMemo(() => new Set(plantsForProject(project).map((p) => p.id)), [project]);
  const regionArrangements = useMemo(
    () => ARRANGEMENTS.filter((a) => a.species.every((s) => regionPlantIds.has(s.speciesId))),
    [regionPlantIds],
  );
  const activeArr = activeArrangement === 'type-design' ? custom : arrangement;
  const pattern = activeArr?.pattern || 'rows';
  const turfSqft = project?.breakdown?.turf || 0;

  const polys = useMemo(() => preparePolys(project), [project]);
  const lot = useMemo(() => prepareLot(project), [project]);
  const buildings = useMemo(() => prepareBuildings(project), [project]);
  const trees = useMemo(() => prepareTrees(project), [project]);
  const paths = useMemo(() => preparePaths(project), [project]);
  const layout = useMemo(() => arrangePlants(polys, entries, pattern), [polys, entries, pattern]);
  const boundsAll = useMemo(() => {
    const model = (lot && lot.length >= 3) ? [lot] : polys;
    const all = model.flat();
    if (!all.length) return { minX: 0, maxX: 30, minY: 0, maxY: 30 };
    return {
      minX: Math.min(...all.map((p) => p[0])),
      maxX: Math.max(...all.map((p) => p[0])),
      minY: Math.min(...all.map((p) => p[1])),
      maxY: Math.max(...all.map((p) => p[1])),
    };
  }, [lot, polys]);
  const cx = (boundsAll.minX + boundsAll.maxX) / 2;
  const cy = (boundsAll.minY + boundsAll.maxY) / 2;
  const maxDim = Math.max(boundsAll.maxX - boundsAll.minX, boundsAll.maxY - boundsAll.minY, 30);

  // Real-world origin (lat/lng) of the scene's local feet space, used to map the
  // first-person camera back onto the satellite mini-map during walk-through.
  const origin = useMemo(() => projectOrigin(project), [project]);
  const getPersonGeo = useCallback(() => {
    const three = threeRef.current;
    if (!three || !origin) return null;
    const { camera } = three;
    const { minLat, minLng, cosLat } = origin;
    const localX = camera.position.x + cx;
    const localY = -camera.position.z + cy;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    // scene +X is east, +Z is south, so heading (clockwise from north) = atan2(east, north).
    const headingDeg = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
    return {
      lat: localY / 364000 + minLat,
      lng: localX / (364000 * cosLat) + minLng,
      headingDeg,
    };
  }, [origin, cx, cy]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const scene = new THREE.Scene();
    scene.background = skyTexture();

    const maxDpr = Math.min(window.devicePixelRatio, 2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(maxDpr);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cursor = 'grab';
    let lastRatio = maxDpr;

    // Bird's-eye overview: an oblique aerial angle (~50° off vertical) so the mulch
    // beds and plant models read as a real 3D landscape, not a flat plan looking down.
    const viewDir = new THREE.Vector3(0, 1, 1.25).normalize();
    const camFor = (tx, ty, tz, radius, factor = 3.4) => {
      const dist = Math.max(radius * factor, maxDim * 0.18);
      return new THREE.Vector3(tx, ty, tz).addScaledVector(viewDir, dist);
    };
    const overview = () => ({ pos: camFor(0, 0, 0, maxDim / 2, 3.8), tgt: new THREE.Vector3(0, 0, 0) });
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 1e7);
    const ov = overview();
    camera.position.copy(ov.pos);
    camera.lookAt(ov.tgt);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enableRotate = true; // drag to orbit; a click (no drag) still focuses a lawn
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = maxDim * 0.12;
    controls.maxDistance = Infinity;
    // Keep the camera above the ground so you can never orbit under the garden
    // and see the underside of the mulch beds.
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.target.copy(ov.tgt);

    // Lighting only — no sky or grass background. The canvas is transparent, so the
    // property outline (built in the layout effect) is the whole model.
    const sunPos = new THREE.Vector3(maxDim * 0.6, maxDim * 0.9, maxDim * 0.35);
    scene.add(new THREE.HemisphereLight(0xcfe2ee, 0x5a6b3a, 0.7));
    scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    const dir = new THREE.DirectionalLight(0xfff2d6, 1.15);
    dir.position.copy(sunPos);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = maxDim * 4;
    const sd = maxDim * 1.2;
    dir.shadow.camera.left = -sd;
    dir.shadow.camera.right = sd;
    dir.shadow.camera.top = sd;
    dir.shadow.camera.bottom = -sd;
    dir.shadow.bias = -0.0006;
    scene.add(dir);

    const plantGroup = new THREE.Group();
    scene.add(plantGroup);

    const ring = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: 0xc4673b, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    scene.add(ring);

    // Default walkthrough start: outside the model, in front of the property, so
    // you walk into the garden. The person is the draggable Walk through button
    // in the toolbar — drop it on the canvas to choose where to enter.
    if (!personPosRef.current) personPosRef.current = { x: 0, z: -(maxDim * 0.62) - 4 };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    // On-demand rendering: a frame only calls renderer.render when something
    // actually changed (orbit/zoom, a focus tween, walk movement, a rebuild, a
    // resize). At rest the loop parks at idle and the GPU stays cold.
    let dirty = true;
    const markDirty = () => { dirty = true; };

    threeRef.current = { scene, camera, renderer, controls, plantGroup, ring, raycaster, pointer, groundPlane, cx, cy, maxDim, overview, camFor, markDirty };

    let frame;
    const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const animate = () => {
      const w = walkRef.current;
      if (w && w.active) {
        const now = performance.now();
        const dt = Math.min(0.05, (now - (w.last || now)) / 1000);
        w.last = now;
        let f = 0; let r = 0;
        if (w.keys.has('w') || w.keys.has('arrowup')) f += 1;
        if (w.keys.has('s') || w.keys.has('arrowdown')) f -= 1;
        if (w.keys.has('d') || w.keys.has('arrowright')) r += 1;
        if (w.keys.has('a') || w.keys.has('arrowleft')) r -= 1;
        const moving = !!(f || r);
        if (moving) {
          camera.updateMatrixWorld();
          const dist = (walkSpeedRef.current || 4.5) * dt;
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          dir.y = 0; dir.normalize();
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
          right.y = 0; right.normalize();
          camera.position.addScaledVector(dir, f * dist).addScaledVector(right, r * dist);
          // Head bob mimics footsteps: phase advances with distance traveled, so
          // stride frequency is the same on any property, and the camera settles
          // back to eye height the moment you stop.
          w.bobPhase = (w.bobPhase || 0) + dist * 1.1;
          camera.position.y = EYE_HEIGHT + Math.sin(w.bobPhase) * 0.22;
          markDirty();
        } else {
          w.bobPhase = 0;
          if (Math.abs(camera.position.y - EYE_HEIGHT) > 0.001) {
            camera.position.y += (EYE_HEIGHT - camera.position.y) * Math.min(1, dt * 10);
            markDirty();
          }
        }
      } else {
        const tw = tweenRef.current;
        if (tw) {
          const t = Math.min(1, (performance.now() - tw.start) / tw.dur);
          const e = ease(t);
          camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
          controls.target.lerpVectors(tw.fromTgt, tw.toTgt, e);
          camera.lookAt(controls.target);
          markDirty();
          if (t >= 1) tweenRef.current = null;
        }
        controls.update();
      }
      if (dirty) {
        // Scale render resolution with camera distance: full quality up close, coarser when zoomed far out.
        const dist = camera.position.distanceTo(controls.target);
        const near = maxDim * 0.12;
        const far = maxDim * 4;
        const t = Math.min(1, Math.max(0, (dist - near) / (far - near)));
        const targetRatio = Math.max(0.5, maxDpr * (1 - t * 0.7));
        const stepped = Math.round(targetRatio * 4) / 4;
        if (stepped !== lastRatio) { renderer.setPixelRatio(stepped); lastRatio = stepped; }
        renderer.render(scene, camera);
        dirty = false;
      }
      frame = requestAnimationFrame(animate);
    };
    animate();
    controls.addEventListener('change', markDirty);

    const ro = new ResizeObserver(() => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      markDirty();
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.removeEventListener('change', markDirty);
      controls.dispose();
      surroundingsRef.current = null; // drop a satellite load still in flight
      disposeObject(scene, isShared); // the sky background is cached (shared), so it stays
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [maxDim]);

  // Build mulch beds (one per lawn outline), edging and plants.
  useEffect(() => {
    const three = threeRef.current;
    if (!three) return;
    const { scene, plantGroup, ring } = three;

    scene.children.filter((c) => c.userData && (c.userData.bed || c.userData.ground || c.userData.building || c.userData.path || c.userData.existingTree)).forEach((c) => {
      scene.remove(c);
      disposeObject(c, isShared);
    });
    disposeObject(plantGroup, isShared); // plants use shared geometry/materials; this is a no-op unless that changes
    plantGroup.clear();
    plantMeshesRef.current = [];
    bedMeshesRef.current = [];
    bedsRef.current = [];
    ring.visible = false;

    // Ground = a flat surface covering the whole property, with the lawns cut
    // out as holes so the mulch beds are the converted areas, not a slab under
    // them. The outer boundary is the lot when available, else a padded
    // bounding box around the lawns.
    const outerPoly = (lot && lot.length >= 3)
      ? lot
      : (() => {
          const all = polys.flat();
          if (!all.length) return null;
          const minX = Math.min(...all.map((p) => p[0])) - 4;
          const maxX = Math.max(...all.map((p) => p[0])) + 4;
          const minY = Math.min(...all.map((p) => p[1])) - 4;
          const maxY = Math.max(...all.map((p) => p[1])) + 4;
          return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
        })();
    if (outerPoly && outerPoly.length >= 3) {
      const shape = new THREE.Shape();
      outerPoly.forEach((p, i) => {
        const x = p[0] - cx;
        const y = p[1] - cy;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      // Cut a hole wherever a lawn (mulch bed) is, so the ground is everywhere
      // except where the lawns were.
      polys.forEach((poly) => {
        if (!poly || poly.length < 3) return;
        const hole = new THREE.Path();
        poly.forEach((p, i) => {
          const x = p[0] - cx;
          const y = p[1] - cy;
          if (i === 0) hole.moveTo(x, y);
          else hole.lineTo(x, y);
        });
        shape.holes.push(hole);
      });
      const oxs = outerPoly.map((p) => p[0] - cx);
      const oys = outerPoly.map((p) => p[1] - cy);
      const span = Math.max(Math.max(...oxs) - Math.min(...oxs), Math.max(...oys) - Math.min(...oys), 10);
      const gt = groundTexture();
      gt.repeat.set(span / 6, span / 6);
      const ground = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshStandardMaterial({ map: gt, color: 0xd8d4cc, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
      );
      ground.userData.ground = true;
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0;
      ground.receiveShadow = true;
      scene.add(ground);
      const gpts = outerPoly.map((p) => new THREE.Vector3(p[0] - cx, 0.012, -(p[1] - cy)));
      gpts.push(gpts[0].clone());
      const gline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(gpts), new THREE.LineBasicMaterial({ color: 0x6b6755 }));
      gline.userData.ground = true;
      scene.add(gline);

    }

    // Satellite imagery of the close surroundings, toned down so the model
    // stays the focus (see loadSurroundings). It never shows under the
    // property (a hole is cut there), fades out at its edges, and sits well
    // below every modelled item and is drawn first, so nothing collides with it.
    if (origin) {
      const local = [...(outerPoly || []), ...polys.flat(), ...paths.flat()];
      if (local.length) {
        const xs = local.map((p) => p[0]);
        const ys = local.map((p) => p[1]);
        const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const pad = Math.max(60, 0.25 * Math.max(maxX - minX, maxY - minY));
        const [ex0, ex1, ey0, ey1] = [minX - pad, maxX + pad, minY - pad, maxY + pad];
        const toLon = (x) => origin.minLng + x / (364000 * origin.cosLat);
        const toLat = (y) => origin.minLat + y / 364000;
        const toX = (lon) => (lon - origin.minLng) * 364000 * origin.cosLat;
        const toY = (lat) => (lat - origin.minLat) * 364000;
        const hole = outerPoly && outerPoly.length >= 3 ? outerPoly : null;
        const request = {};
        surroundingsRef.current = request;
        loadSurroundings({ west: toLon(ex0), east: toLon(ex1), south: toLat(ey0), north: toLat(ey1) }).then((sat) => {
          if (surroundingsRef.current !== request) return; // the scene was rebuilt meanwhile
          // Crop the tile mosaic to exactly the requested area (local feet ↔ canvas pixels).
          const [sx0, sx1, sy0, sy1] = [toX(sat.west), toX(sat.east), toY(sat.south), toY(sat.north)];
          const pxPerFtX = sat.canvas.width / (sx1 - sx0);
          const pxPerFtY = sat.canvas.height / (sy1 - sy0);
          const W = Math.round((ex1 - ex0) * pxPerFtX);
          const H = Math.round((ey1 - ey0) * pxPerFtY);
          const c = document.createElement('canvas');
          c.width = W;
          c.height = H;
          const ctx = c.getContext('2d');
          ctx.drawImage(sat.canvas, (ex0 - sx0) * pxPerFtX, (sy1 - ey1) * pxPerFtY, W, H, 0, 0, W, H);
          ctx.globalCompositeOperation = 'destination-out';
          // Hole where the property is modelled.
          if (hole) {
            ctx.beginPath();
            hole.forEach(([x, y], i) => {
              const px = (x - ex0) * pxPerFtX;
              const py = (ey1 - y) * pxPerFtY;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.closePath();
            ctx.fill();
          }
          // Soft edges fading into the sky.
          const fade = Math.min(W, H) * 0.18;
          for (const [gx0, gy0, gx1, gy1, rx, ry, rw, rh] of [
            [0, 0, fade, 0, 0, 0, fade, H],
            [W, 0, W - fade, 0, W - fade, 0, fade, H],
            [0, 0, 0, fade, 0, 0, W, fade],
            [0, H, 0, H - fade, 0, H - fade, W, fade],
          ]) {
            const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
            g.addColorStop(0, 'rgba(0,0,0,1)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(rx, ry, rw, rh);
          }
          const tex = new THREE.CanvasTexture(c);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(ex1 - ex0, ey1 - ey0),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
          );
          mesh.userData.ground = true;
          mesh.renderOrder = -1; // drawn before everything else, so modelled items always cover it
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set((ex0 + ex1) / 2 - cx, -1.5, -((ey0 + ey1) / 2 - cy));
          scene.add(mesh);
          three.markDirty?.();
        }, () => {});
      }
    }

    polys.forEach((poly, bi) => {
      if (!poly || poly.length < 3) return;
      const shape = new THREE.Shape();
      poly.forEach((p, i) => {
        const x = p[0] - cx;
        // Build the shape in the same handedness as the outline/plants (world Z = -(p[1]-cy)).
        const y = p[1] - cy;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      const span = Math.max(boundsAll.maxX - boundsAll.minX, boundsAll.maxY - boundsAll.minY, 10);
      const mulch = mulchTexture();
      mulch.repeat.set(span / 4, span / 4);
      // Mulch is a flat 2D area lifted just above the ground (MULCH_Y) so it reads as
      // a layer on top of the property base, not a raised mound.
      const bed = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshStandardMaterial({ map: mulch, color: 0xffffff, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
      );
      bed.userData.bed = true;
      bed.userData.bedIndex = bi;
      bed.rotation.x = -Math.PI / 2;
      bed.position.y = MULCH_Y;
      bed.receiveShadow = true;
      scene.add(bed);
      bedMeshesRef.current.push(bed);

      // Focus target: centroid + bounding radius of this lawn (in scene-local coords).
      const lxs = poly.map((p) => p[0] - cx);
      const lzs = poly.map((p) => -(p[1] - cy));
      const bx = lxs.reduce((s, v) => s + v, 0) / lxs.length;
      const bz = lzs.reduce((s, v) => s + v, 0) / lzs.length;
      const radius = Math.max(...lxs.map((x, i) => Math.hypot(x - bx, lzs[i] - bz)), 3);
      bedsRef.current.push({ x: bx, z: bz, radius });

      const outlinePts = poly.map((p) => new THREE.Vector3(p[0] - cx, MULCH_Y + 0.02, -(p[1] - cy)));
      outlinePts.push(outlinePts[0].clone());
      const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outlinePts), new THREE.LineBasicMaterial({ color: 0x4a3322 }));
      outline.userData.bed = true;
      scene.add(outline);
    });

    // Extrude the scanned building footprints into 3D. Height is the measured
    // one from the lawn scan when available (Overture height or floors, or the
    // canopy height model); otherwise estimated from footprint size.
    const bAttr = project?.building || {};
    buildings.forEach((poly) => {
      if (!poly || poly.length < 3) return;
      const pts = poly.map((p) => [p[0] - cx, p[1] - cy]);
      const area = Math.abs(pts.reduce((s, p, i) => s + pts[i][0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0)) / 2;
      // Height scales with footprint size so large buildings read as tall, not flat.
      // An older project's saved building height is honored when it is the taller estimate.
      const stories = Math.max(1, Math.min(4, Math.round(area / 1200)));
      const heightFt = poly.heightFt > 0 ? poly.heightFt : Math.max(Number(bAttr.heightFt) || 0, stories * 10.5);
      const mesh = buildBuilding(pts, heightFt, bAttr.wallColor, bAttr.roofType);
      mesh.userData.building = true;
      scene.add(mesh);
    });

    // Roads and paths as raised, textured slabs with an edge line so they stand
    // out from mulch and ground: asphalt roads with a pale curb, paver paths
    // with darker edging. Named roads get their street name painted on.
    const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95, metalness: 0 });
    const paverMat = new THREE.MeshStandardMaterial({ map: paverTexture(), roughness: 0.9, metalness: 0 });
    const curbMat = new THREE.LineBasicMaterial({ color: 0xe8e4da });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x8a7f6b });
    const labelled = new Set();
    paths.forEach((poly) => {
      if (!poly || poly.length < 3) return;
      const road = ROAD_KINDS.has(poly.kind);
      const depth = road ? 0.9 : 0.5; // roads stand well clear of the faded satellite ground
      const shape = new THREE.Shape();
      poly.forEach((p, i) => { const x = p[0] - cx; const y = p[1] - cy; if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y); });
      const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), road ? roadMat : paverMat);
      slab.userData.path = true;
      slab.rotation.x = -Math.PI / 2;
      slab.position.y = MULCH_Y; // sits on the mulch, so a path crossing a converted lawn stays visible
      slab.receiveShadow = true;
      scene.add(slab);
      const edge = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(poly.map((p) => new THREE.Vector3(p[0] - cx, MULCH_Y + depth + 0.02, -(p[1] - cy)))),
        road ? curbMat : edgeMat,
      );
      edge.userData.path = true;
      scene.add(edge);

      // One label per road piece long enough to read; skip repeats close by.
      if (road && poly.name) {
        const axis = slabAxis(poly);
        const key = `${poly.name}:${Math.round(axis.mx / 150)}:${Math.round(axis.my / 150)}`;
        if (axis.length >= 40 && !labelled.has(key)) {
          labelled.add(key);
          const label = roadLabel(poly.name, axis);
          label.position.set(axis.mx - cx, MULCH_Y + depth + 0.05, -(axis.my - cy));
          label.userData.path = true;
          scene.add(label);
        }
      }
    });

    // Existing mature trees kept from the scan, sized to their scanned canopy.
    trees.forEach((t) => {
      const mesh = buildExistingTree(t.radiusFt, t.heightFt);
      mesh.position.set(t.x - cx, MULCH_Y, -(t.y - cy));
      mesh.userData.existingTree = true;
      scene.add(mesh);
    });

    // A different lawn outline or arrangement pattern starts plants fresh.
    if (movedRef.current.polys !== polys || movedRef.current.pattern !== pattern) {
      movedRef.current = { polys, pattern, map: new Map() };
    }
    const moved = movedRef.current.map;
    const nth = new Map();
    layout.forEach((p, i) => {
      const mesh = buildPlant(p.plant, mature);
      const k = nth.get(p.speciesId) || 0;
      nth.set(p.speciesId, k + 1);
      const moveKey = `${p.speciesId}:${k}`;
      const at = moved.get(moveKey) || p;
      mesh.position.set(at.x - cx, MULCH_Y, -(at.y - cy));
      mesh.userData = { index: i, speciesId: p.speciesId, plantId: p.plant.id, moveKey, cx, cy };
      plantGroup.add(mesh);
      mesh.traverse((o) => {
        if (o.isMesh) {
          o.userData.plant = mesh;
          plantMeshesRef.current.push(o);
        }
      });
    });

    three.markDirty?.();
  }, [layout, polys, pattern, lot, buildings, trees, paths, cx, cy, mature, boundsAll, origin]);

  useEffect(() => {
    moveModeRef.current = moveMode;
    if (threeRef.current) {
      threeRef.current.renderer.domElement.style.cursor = moveMode ? 'pointer' : 'pointer';
      if (!moveMode) {
        threeRef.current.ring.visible = false;
        draggingRef.current = null;
      }
    }
  }, [moveMode]);

  // The orbit camera is free for everyone. Walk mode
  // and move mode both override this to false regardless of tier.
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;
    t.controls.enabled = interactive && !walkMode && !moveMode;
  }, [interactive, walkMode, moveMode]);

  useEffect(() => {
    const three = threeRef.current;
    if (!three) return undefined;
    const { renderer, camera, controls, raycaster, pointer, groundPlane, ring } = three;
    const el = renderer.domElement;

    const setPointer = (e) => {
      const r = el.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    };
    const focusOn = (bedIndex) => {
      const t = threeRef.current;
      if (!t) return;
      const b = bedsRef.current[bedIndex];
      const ov = t.overview();
      const toPos = b ? t.camFor(b.x, 0, b.z, b.radius, 2.8) : ov.pos.clone();
      const toTgt = b ? new THREE.Vector3(b.x, 0, b.z) : ov.tgt.clone();
      tweenRef.current = {
        fromPos: camera.position.clone(),
        toPos,
        fromTgt: controls.target.clone(),
        toTgt,
        start: performance.now(),
        dur: 600,
      };
    };
    focusOnRef.current = focusOn;
    let downPos = null;
    const onDown = (e) => {
      if (walkRef.current?.active) return;
      setPointer(e);
      raycaster.setFromCamera(pointer, camera);
      downPos = { x: e.clientX, y: e.clientY };
      if (moveModeRef.current) {
        const hits = raycaster.intersectObjects(plantMeshesRef.current, false);
        if (hits.length) {
          const plant = hits[0].object.userData.plant;
          draggingRef.current = plant;
          ring.visible = true;
          ring.position.set(plant.position.x, MULCH_Y + 0.02, plant.position.z);
          const radius = Math.max(1.2, (plantById(plant.userData.plantId)?.w || 3) * 0.35);
          ring.scale.set(radius, radius, radius);
          el.style.cursor = 'grabbing';
        }
        return;
      }
      // Don't focus yet — wait for pointerup so an orbit drag doesn't also jump focus.
    };
    const onMove = (e) => {
      if (!moveModeRef.current || !draggingRef.current) return;
      setPointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hit)) {
        draggingRef.current.position.x = hit.x;
        draggingRef.current.position.z = hit.z;
        ring.position.x = hit.x;
        ring.position.z = hit.z;
      }
    };
    const onUp = (e) => {
      if (draggingRef.current) {
        const plant = draggingRef.current;
        const { moveKey, cx: pcx, cy: pcy } = plant.userData;
        if (moveKey) movedRef.current.map.set(moveKey, { x: plant.position.x + pcx, y: -plant.position.z + pcy });
        draggingRef.current = null;
        el.style.cursor = moveModeRef.current ? 'pointer' : 'grab';
        return;
      }
      // A click (pointer down+up with barely any movement) focuses a lawn or resets.
      if (!downPos || moveModeRef.current || walkRef.current?.active) { downPos = null; return; }
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (moved > 5) return; // it was an orbit drag, not a click
      if (!interactiveRef.current) return;
      setPointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(bedMeshesRef.current, false);
      focusOn(hits.length ? hits[0].object.userData.bedIndex : -1);
    };
    el.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  // First-person walkthrough: WASD to move, drag to look, Exit walk to return.
  useEffect(() => {
    const three = threeRef.current;
    if (!three) return;
    const { renderer, camera, controls, scene } = three;
    const el = renderer.domElement;
    const w = walkRef.current;
    if (!walkMode) {
      if (!w.active) return;
      w.active = false;
      w.keys.clear();
      personPosRef.current = { x: camera.position.x, z: camera.position.z }; // tap-to-walk resumes here
      el.style.cursor = 'pointer';
      focusOnRef.current?.(-1);
      return;
    }
    tweenRef.current = null;
    w.active = true;
    w.keys.clear();
    const pp = personPosRef.current || { x: 0, z: -(three.maxDim * 0.62) - 4 };
    camera.position.set(pp.x, EYE_HEIGHT, pp.z);
    // Look straight ahead (horizontal) toward the garden center, not down at the ground.
    camera.lookAt(0, EYE_HEIGHT, 0);
    camera.rotation.order = 'YXZ';
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    w.yaw = e.y;
    w.pitch = e.x;
    el.style.cursor = 'grab';
    // Render the first-person frame immediately on entering walk mode, so the
    // view switches to the person's perspective the instant they're dropped —
    // not only after the first WASD keypress marks the frame dirty.
    threeRef.current.markDirty();
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const onDown = (ev) => { dragging = true; lx = ev.clientX; ly = ev.clientY; el.style.cursor = 'grabbing'; };
    const onMove = (ev) => {
      if (!dragging) return;
      w.yaw -= (ev.clientX - lx) * 0.0026;
      w.pitch -= (ev.clientY - ly) * 0.0026;
      w.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, w.pitch));
      camera.rotation.set(w.pitch, w.yaw, 0, 'YXZ');
      lx = ev.clientX; ly = ev.clientY;
      threeRef.current.markDirty();
    };
    const onUp = () => { dragging = false; el.style.cursor = 'grab'; };
    const moveKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
    const onKeyDown = (ev) => { const k = ev.key.toLowerCase(); if (moveKeys.has(k)) ev.preventDefault(); w.keys.add(k); };
    const onKeyUp = (ev) => { w.keys.delete(ev.key.toLowerCase()); };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [walkMode]);

  // Dropping the dragged Walk through button onto the canvas places the
  // person there and enters first-person at that spot.
  const handleDrop = (e) => {
    e.preventDefault();
    const three = threeRef.current;
    if (!three) return;
    const { renderer, camera, raycaster, pointer, groundPlane } = three;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit)) {
      personPosRef.current = { x: hit.x, z: hit.z };
      setWalkMode(true);
    }
  };

  // On-screen arrows (touch has no keyboard) drive the same keys as WASD.
  const pressKey = (k, down) => {
    const w = walkRef.current;
    if (down) w.keys.add(k);
    else w.keys.delete(k);
  };
  const padButton = (k, Icon, label, cls) => (
    <button
      key={k}
      type="button"
      aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); pressKey(k, true); }}
      onPointerUp={() => pressKey(k, false)}
      onPointerCancel={() => pressKey(k, false)}
      onLostPointerCapture={() => pressKey(k, false)}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex h-10 w-10 touch-none select-none items-center justify-center rounded-full bg-background/75 text-foreground shadow backdrop-blur active:bg-primary active:text-primary-foreground ${cls}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );

  const legend = Object.values(
    entries.reduce((acc, e) => {
      const p = plantById(e.speciesId);
      if (!p) return acc;
      if (!acc[p.id]) acc[p.id] = { plant: p, qty: 0 };
      acc[p.id].qty += e.quantity;
      return acc;
    }, {}),
  );

  const runTypeDesign = async () => {
    const p = prompt.trim();
    if (p.length < 3 || designing) return;
    setDesigning(true);
    setDesignError('');
    try {
      const catalog = plantsForProject(project).map((pl) => ({
        id: pl.id,
        common: pl.common,
        form: pl.form,
        sun: pl.sun,
        water: pl.water,
        wildlife: pl.wildlife,
      }));
      const res = await base44.functions.invoke('designFromPrompt', {
        prompt: p,
        catalog,
        turfSqft,
        city: project?.city,
        state: project?.state,
        zip: project?.zip,
        sun: project?.sun,
        soil: project?.soil,
      });
      const data = res?.data;
      if (!data?.species?.length) {
        setDesignError(data?.error || 'Could not build a design from that.');
        return;
      }
      const arr = {
        id: 'type-design',
        name: 'Custom design',
        region: 'Custom design',
        pattern: data.pattern,
        note: data.note,
        species: data.species,
      };
      setCustom(arr);
      onApplyArrangement?.(arr);
    } catch (e) {
      setDesignError(e?.message || 'Design failed. Try again.');
    } finally {
      setDesigning(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-border p-0.5">
          {[{ v: true, l: 'At maturity' }, { v: false, l: 'Newly planted' }].map((o) => (
            <button
              key={o.l}
              type="button"
              onClick={() => setMature(o.v)}
              className={`rounded-full px-3 py-1.5 text-[11.5px] transition ${mature === o.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {interactive && (
            <Button variant="outline" onClick={() => { if (walkMode) setWalkMode(false); else focusOnRef.current?.(-1); }} className="rounded-full" size="sm">
              <ScanEye className="mr-1.5 h-4 w-4" />
              Reset view
            </Button>
          )}
          <Button variant={moveMode ? 'default' : 'outline'} onClick={() => setMoveMode((m) => !m)} className="rounded-full" size="sm">
            <Move className="mr-1.5 h-4 w-4" />
            {moveMode ? 'Done moving' : 'Move plants'}
          </Button>
          {walkMode ? (
            <Button variant="default" onClick={() => setWalkMode(false)} className="rounded-full" size="sm">
              Exit walk
            </Button>
          ) : (
            <WalkThroughHandle onActivate={() => setWalkMode(true)} />
          )}
        </div>
      </div>

      <div className="relative mt-3">
        <div
          ref={mountRef}
          onDragOver={(e) => { if (!walkMode) e.preventDefault(); }}
          onDrop={handleDrop}
          className="h-[360px] w-full overflow-hidden rounded-2xl border border-border sm:h-[460px]"
        />
        {walkMode && (
          <>
            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/60 px-3 py-1 text-[10px] leading-tight shadow backdrop-blur">
              <span className="text-foreground/90">Walk mode</span>
              <span className="text-muted-foreground"> · WASD or arrows to move · drag to look · Exit walk to return</span>
            </div>
            <div className="absolute bottom-3 left-3 grid grid-cols-3 gap-1">
              {padButton('arrowup', ArrowUp, 'Walk forward', 'col-start-2')}
              {padButton('arrowleft', ArrowLeft, 'Step left', 'col-start-1 row-start-2')}
              {padButton('arrowdown', ArrowDown, 'Walk back', 'col-start-2 row-start-2')}
              {padButton('arrowright', ArrowRight, 'Step right', 'col-start-3 row-start-2')}
            </div>
            <WalkSpeedControl value={walkSpeed} onChange={setWalkSpeed} />
            {origin && <WalkMiniMap project={project} getPersonGeo={getPersonGeo} />}
          </>
        )}
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <Sun className="h-3.5 w-3.5 text-accent" />
        {walkMode
          ? 'You are standing in the garden. WASD or the on-screen arrows to move, drag to look around, Exit walk to return to the plan.'
          : moveMode
            ? 'Click a plant and drag it to a new spot on the mulch. Hit Done moving to focus again.'
            : 'Drag to rotate · click a lawn to focus · scroll to zoom · tap the person, or drag it onto the property, to walk it.'}
      </p>

      <div className="mt-4 border-t border-border/70 pt-3">
        <div className="flex items-center gap-2">
        <Leaf className="h-3.5 w-3.5 text-accent" />
        <p className="label-xs">Agronomist arrangements</p>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        Some arrangements may not suit every lawn size or location.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {regionArrangements.filter((a) => !a.minArea || turfSqft >= a.minArea).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onApplyArrangement?.(a)}
              className={`rounded-full border px-3 py-1.5 text-[11.5px] transition ${a.id === activeArrangement ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground'}`}
            >
              {a.name}
            </button>
          ))}
        </div>
        {activeArr ? (
          <p className="mt-2 max-w-2xl text-[11.5px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">{activeArr.region}.</span> {activeArr.note}
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Plants default to an orderly grid on the mulch. Pick a pre-made mix to restyle them, or add species below.
          </p>
        )}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your ideal garden — e.g. drought-tolerant pollinator hedge with winter berries"
            className="field h-9 flex-1 text-[12.5px]"
            onKeyDown={(e) => { if (e.key === 'Enter' && !designing) runTypeDesign(); }}
          />
          <Button type="button" onClick={runTypeDesign} disabled={designing || !regionPlantIds.size || prompt.trim().length < 3} className="rounded-full" size="sm">
            {designing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
            {designing ? 'Designing…' : 'Design from text'}
          </Button>
        </div>
        {designError && <p className="mt-1.5 text-[11px] leading-relaxed text-destructive">{designError}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {legend.map(({ plant: p, qty }) => (
          <span key={p.id} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="text-foreground">{p.common}</span>
            <span className="text-muted-foreground/80">×{qty} · {p.form}</span>
          </span>
        ))}
      </div>
    </div>
  );
}