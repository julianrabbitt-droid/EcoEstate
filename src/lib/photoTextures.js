import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Photographed surface textures and scanned plant models from Poly Haven
// (CC0, public/assets/polyhaven). Each texture is a photo of a known patch of
// real surface (sizeFt across), so it is tiled at true scale on geometry whose
// UVs are in feet. Loading is async: things built before a photo arrives show
// their plain colour and pick the photo up when it lands (onPhotoLoaded).

const BASE = '/assets/polyhaven';
// Real-world width of each photographed patch, in feet.
const SIZE_FT = {
  aerial_wood_snips: 6.5,
  beige_wall_002: 6.5,
  brown_planks_05: 6.5,
  brick_wall_001: 6.5,
  clay_roof_tiles_02: 6.5,
  bark_brown_02: 3.3,
  concrete_pavement: 6.5,
};

const listeners = new Set();
/** Called with 'texture' or 'model' whenever one finishes loading, so the scene can redraw (or rebuild, for models). */
export function onPhotoLoaded(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const loaded = (kind = 'texture') => listeners.forEach((fn) => fn(kind));

const loader = new THREE.ImageLoader();
const cache = new Map();
let markShared = (x) => x;
export function setPhotoSharedMarker(fn) {
  markShared = fn;
}

/**
 * A photo texture tiled for geometry whose UVs are in feet divided by uvFt
 * (uvFt = 1 when UVs are plain feet). kind: 'diffuse' | 'nor_gl'.
 */
export function photo(name, kind, uvFt = 1) {
  const key = `${name}:${kind}:${uvFt}`;
  if (cache.has(key)) return cache.get(key);
  // Until the photo arrives, a one-pixel stand-in (white under the material's
  // colour, or a flat normal), never the black of an empty texture.
  const stand = document.createElement('canvas');
  stand.width = stand.height = 1;
  const ctx = stand.getContext('2d');
  ctx.fillStyle = kind === 'nor_gl' ? 'rgb(128, 128, 255)' : '#ffffff';
  ctx.fillRect(0, 0, 1, 1);
  const t = new THREE.Texture(stand);
  t.needsUpdate = true;
  loader.load(`${BASE}/${name}_${kind}_1k.jpg`, (img) => {
    t.source = new THREE.Source(img); // a new source, so the GPU copy is sized for the photo
    t.needsUpdate = true;
    loaded('texture');
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (kind === 'diffuse') t.colorSpace = THREE.SRGBColorSpace;
  const r = uvFt / (SIZE_FT[name] || 6.5);
  t.repeat.set(r, r);
  markShared(t);
  cache.set(key, t);
  return t;
}

// ---- Scanned shrub models ----
// shrub_03 (17k triangles) and shrub_02 (52k) at 1k textures. Normalised to a
// 1 ft footprint and 1 ft height, standing on the origin, so they scale like
// the procedural plants. Loaded on first use.
const SHRUBS = ['shrub_03', 'shrub_02'];
const shrubModels = new Map(); // id -> THREE.Object3D (template) | 'loading'
const gltf = new GLTFLoader();

function normalise(scene) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const holder = new THREE.Group();
  scene.position.set(-(box.min.x + size.x / 2), -box.min.y, -(box.min.z + size.z / 2));
  holder.add(scene);
  holder.scale.set(1 / Math.max(size.x, size.z, 1e-3), 1 / Math.max(size.y, 1e-3), 1 / Math.max(size.x, size.z, 1e-3));
  const outer = new THREE.Group();
  outer.add(holder);
  outer.traverse((o) => {
    if (o.isMesh) {
      markShared(o.geometry);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        markShared(m);
        Object.values(m).forEach((v) => v?.isTexture && markShared(v));
        m.side = THREE.DoubleSide;
        m.alphaTest = Math.max(m.alphaTest || 0, 0.4);
      });
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return outer;
}

/** Start loading the shrub models (idempotent). */
export function preloadShrubs() {
  for (const id of SHRUBS) {
    if (shrubModels.has(id)) continue;
    shrubModels.set(id, 'loading');
    gltf.load(
      `${BASE}/${id}/${id}.gltf`,
      (g) => {
        shrubModels.set(id, normalise(g.scene));
        loaded('model');
      },
      undefined,
      () => shrubModels.delete(id), // stays procedural
    );
  }
}

/** A unit-sized scanned shrub (variant picks which), or null until loaded. */
export function scannedShrub(variant = 0) {
  const ready = SHRUBS.map((id) => shrubModels.get(id)).filter((m) => m && m !== 'loading');
  if (!ready.length) return null;
  return ready[variant % ready.length].clone(true);
}
