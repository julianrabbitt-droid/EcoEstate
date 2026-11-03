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
    // The GPU copy made for the one-pixel stand-in is one pixel big, and the
    // photo can't be copied into it (it stayed white: tile roofs, brick and
    // siding showed plain for anyone whose photos came after the first
    // frame). Released, it's made again at the photo's size.
    t.dispose();
    t.source = new THREE.Source(img);
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

// ---- Scanned plant models (Real 3D) ----
// Photo-scans of real plants (CC0, Poly Haven). Each file holds a few
// variants of one plant laid out side by side; each becomes its own template,
// normalised to a 1 ft footprint and 1 ft height standing on the origin, so
// it scales like the drawn plants. Loaded only once Real 3D is turned on.
const SCANS = {
  grass: ['grass_medium_02'],
  shrub: ['shrub_04', 'shrub_03', 'shrub_02'],
  groundcover: ['periwinkle_plant'],
  flowerWarm: ['flower_gazania'], // orange and red blooms
  flowerYellow: ['flower_empodium'],
  flowerLight: ['flower_heliophila'], // white blooms, tinted to the species' colour
};
const SCAN_MAX_TRIS = 40000; // a garden has hundreds of plants: heavier variants are left out
const SCAN_MIN_SHARE = 0.3; // and so are seedlings (variants far lighter than the file's biggest)
const scanFiles = new Map(); // id -> templates[] | 'loading'
const gltf = new GLTFLoader();

const trisOf = (obj) => {
  let n = 0;
  obj.traverse((o) => {
    if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return n;
};

// Leaves cut out of photos thin away with distance (their edges blur into
// the background in the smaller copies of the texture); a little more
// opacity keeps the plant full from across the yard.
function foliage(m) {
  markShared(m);
  Object.values(m).forEach((v) => v?.isTexture && markShared(v));
  m.side = THREE.DoubleSide;
  m.alphaTest = 0.3;
  m.alphaToCoverage = true;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.a = min(1.0, diffuseColor.a * 1.5);');
  };
  m.customProgramCacheKey = () => 'scan-foliage';
  return m;
}

function template(node) {
  const copy = node.clone(true);
  copy.position.set(0, 0, 0); // each variant stands where its neighbour would in the file
  const outer = new THREE.Group();
  const holder = new THREE.Group();
  holder.add(copy);
  outer.add(holder);
  outer.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(copy);
  const size = box.getSize(new THREE.Vector3());
  copy.position.set(-(box.min.x + size.x / 2), -box.min.y, -(box.min.z + size.z / 2));
  holder.scale.set(1 / Math.max(size.x, size.z, 1e-3), 1 / Math.max(size.y, 1e-3), 1 / Math.max(size.x, size.z, 1e-3));
  outer.traverse((o) => {
    if (o.isMesh) {
      markShared(o.geometry);
      o.material = Array.isArray(o.material) ? o.material.map(foliage) : foliage(o.material);
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return outer;
}

/** Start loading every scanned plant (idempotent). */
export function preloadScans() {
  for (const id of Object.values(SCANS).flat()) {
    if (scanFiles.has(id)) continue;
    scanFiles.set(id, 'loading');
    gltf.load(
      `${BASE}/${id}/${id}.gltf`,
      (g) => {
        const variants = g.scene.children.filter((n) => trisOf(n) > 0);
        const most = Math.max(...variants.map(trisOf));
        const kept = variants.filter((n) => trisOf(n) <= SCAN_MAX_TRIS && trisOf(n) >= most * SCAN_MIN_SHARE);
        scanFiles.set(id, (kept.length ? kept : variants).map(template));
        loaded('model');
      },
      undefined,
      () => scanFiles.delete(id), // the drawn plant stays
    );
  }
}

const tinted = new Map(); // `${id}:${index}:${hex}` -> template with tinted petals
// Light petals (bright, nearly colourless in the photo) take the bloom colour;
// leaves and stems keep theirs.
function tintPetals(templ, bloom) {
  const copy = templ.clone(true);
  copy.traverse((o) => {
    if (!o.isMesh) return;
    const tint = (m) => {
      const c = markShared(m.clone());
      c.onBeforeCompile = (sh) => {
        sh.uniforms.uBloom = { value: bloom };
        sh.fragmentShader = `uniform vec3 uBloom;\n${sh.fragmentShader}`.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
  diffuseColor.a = min(1.0, diffuseColor.a * 1.5);
  {
    float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    float sat = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b) - min(min(diffuseColor.r, diffuseColor.g), diffuseColor.b);
    float petal = smoothstep(0.3, 0.55, lum) * (1.0 - smoothstep(0.12, 0.3, sat));
    diffuseColor.rgb = mix(diffuseColor.rgb, uBloom * (0.45 + 0.7 * lum), petal);
  }`,
        );
      };
      c.customProgramCacheKey = () => 'scan-petals';
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
  });
  return copy;
}

/**
 * A unit-sized scanned plant of a kind (grass, shrub, groundcover, flowerWarm,
 * flowerYellow, flowerLight), `variant` picking which, or null until loaded.
 * bloom (a THREE.Color) tints flowerLight's white petals.
 */
export function scannedPlant(kind, variant = 0, bloom = null) {
  const ready = (SCANS[kind] || []).flatMap((id) => {
    const v = scanFiles.get(id);
    return Array.isArray(v) ? v.map((t, i) => ({ id, i, t })) : [];
  });
  if (!ready.length) return null;
  const { id, i, t } = ready[Math.abs(variant) % ready.length];
  if (kind !== 'flowerLight' || !bloom || bloom.getHSL({}).l > 0.85) return t.clone(true);
  const key = `${id}:${i}:${bloom.getHexString()}`;
  if (!tinted.has(key)) tinted.set(key, tintPetals(t, bloom));
  return tinted.get(key).clone(true);
}
