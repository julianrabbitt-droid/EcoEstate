import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin, GoogleCloudAuthPlugin, ReorientationPlugin, TileCompressionPlugin } from '3d-tiles-renderer/plugins';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, Leaf, Loader2, Lock, Move, ScanEye, Sun, Wand2 } from 'lucide-react';
import WalkThroughHandle from '@/components/WalkThroughHandle';
import WalkSpeedControl from '@/components/WalkSpeedControl';
import WalkMiniMap from '@/components/WalkMiniMap';
import { Button } from '@/components/ui/button';
import { plantById } from '@/data/nativePlants';
import { plantsForProject, regionForProject } from '@/data/regions';
import { base44 } from '@/api/base44Client';
import { arrangementsFor } from '@/data/arrangements';
import { buildHouse, HOUSE_SHARED } from '@/lib/houseModel';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { useNavigate } from 'react-router-dom';
import { plantModel, setSharedMarker } from '@/lib/plantModels';
import { onPhotoLoaded, photo, setPhotoSharedMarker } from '@/lib/photoTextures';
import { disposeObject } from '@/lib/disposeThree';
import { terrainElevations } from '@/lib/terrainTiles';
import { arrangePlants, prepareBuildings, prepareLot, preparePolys, prepareTrees, preparePaths, projectOrigin } from '@/lib/gardenLayout';

// Module-level geometries, materials and textures are reused across scene
// rebuilds and remounts; they're tracked here so disposal skips them.
const SHARED = new WeakSet();
const shared = (r) => { SHARED.add(r); return r; };
const isShared = (r) => SHARED.has(r);
HOUSE_SHARED.forEach(shared);
setSharedMarker(shared);
setPhotoSharedMarker(shared);

const GEO = {
  ico0: shared(new THREE.IcosahedronGeometry(1, 0)),
  ico1: shared(new THREE.IcosahedronGeometry(1, 1)),
  ico2: shared(new THREE.IcosahedronGeometry(1, 2)),
  leafBlade: shared(new THREE.ConeGeometry(1, 1, 4)),
  cyl: shared(new THREE.CylinderGeometry(1, 1, 1, 8)),
  cone: shared(new THREE.ConeGeometry(1, 1, 6)),
  ring: shared(new THREE.RingGeometry(0.85, 1, 28)),
  sphere: shared(new THREE.SphereGeometry(1, 10, 8)),
};

// Raised mulch slab geometry: a 0.35 ft mound with a soft rounded top edge.
const MULCH_Y = 0.03; // mulch sits a hair above the ground so it reads as a flat 2D layer
const EYE_HEIGHT = 5.5; // walkthrough camera height (ft) above the ground

// Google Photorealistic 3D Tiles: the real house, trees and street around the
// planned garden. The browser key only works from ecoestate.org and localhost.
// Each time it's turned on is one paid session, so it's opt-in and remembered.
const GOOGLE_TILES_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || '';
const PHOTO_PREF = 'ecoestate.photoReal';
const M_TO_FT = 3.28084;
const PHOTO_SINK_FT = 0.2; // Google's ground just outside the lot sits this far below the model's
const SURROUND_FT = 110; // how far past the property Google's mesh is shown
const HOUSE_CUT_MARGIN_FT = 4; // Google's house is cut this far past the footprint (eaves, scan offsets)

// Google's mesh is cut away over the property (everything on and above its
// ground, so our model stands there instead) and faded out past the immediate
// surroundings. Done in the tiles' shaders: a top-down mask of the lot outline,
// plus a clean distance cut, discard fragments. Shared by every tile material.
const clipUniforms = {
  uEcoMask: { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) },
  uEcoBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  uEcoCenter: { value: new THREE.Vector2() },
  uEcoRadius: { value: 1e9 },
  // Around each scanned tree near the property, Google's tree is cut away
  // above the ground (kept below, so sidewalks and grass stay) and ours stands
  // there instead. Ground height comes from the USGS terrain.
  uEcoTrees: { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) },
  uEcoGround: { value: new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType) },
  uEcoNearBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  // 1 when the mask's green channel holds the lot: Google's mesh outside it is
  // muted a little, so the property stands out in its real colours.
  uEcoSpot: { value: 0 },
};
clipUniforms.uEcoMask.value.needsUpdate = true;
clipUniforms.uEcoTrees.value.needsUpdate = true;
clipUniforms.uEcoGround.value.needsUpdate = true;
// Google's mesh around a modelled tree is cut above the ground (our ground fills
// below): from 2.5 ft inside the scanned crown and from 4 ft in the margin
// around it, so pools, decks, fences and low walls nearby stay whole.
const TREE_CUT_CORE_FT = 2.5; // Google's ground can sit a foot or two off the USGS terrain; pools and decks must survive
const TREE_CUT_ABOVE_FT = 4;
const TREE_CUT_PAD_FT = 2; // and this far past its scanned crown
// Real 3D keeps the property in Google's own colours and mutes what's around it
// (this much of its colour, this bright) so the property is always easy to find.
const SURROUND_SATURATION = 0.6;
const LAWN_OUTLINE = 0x9fe870;
const SURROUND_BRIGHTNESS = 0.84;

// Outlines that must always read (the property line, each lawn): screen-space
// lines a few pixels wide, drawn over everything, with a dark halo so they show
// on bright roofs and dark trees alike. One shared resolution for all of them.
const LINE_RESOLUTION = new THREE.Vector2(1, 1);
function screenLine(points, { color, width, opacity = 1, dashed = false, order = 10 }) {
  const geometry = new LineGeometry();
  geometry.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
  const material = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthTest: false, depthWrite: false, dashed, dashSize: 3, gapSize: 2 });
  material.uniforms.resolution.value = LINE_RESOLUTION;
  const line = new Line2(geometry, material);
  if (dashed) line.computeLineDistances();
  line.renderOrder = order;
  line.raycast = () => {}; // never picked or clicked
  return line;
}
/** A closed outline with its halo, as one group. */
function haloOutline(points, color, width, { dashed = false, order = 10 } = {}) {
  const ring = [...points, points[0]];
  const group = new THREE.Group();
  group.add(screenLine(ring, { color: 0x10231c, width: width + 3, opacity: 0.4, order }));
  group.add(screenLine(ring, { color, width, opacity: 0.95, dashed, order: order + 1 }));
  return group;
}
function clipTileMaterial(m) {
  if (!m || m.userData.ecoClip) return;
  m.userData.ecoClip = true;
  m.toneMapped = false; // Google's tiles are photos; keep their colours as captured
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, clipUniforms);
    sh.vertexShader = 'varying vec3 vEcoWorld;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  vEcoWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    sh.fragmentShader = [
      'varying vec3 vEcoWorld;',
      'uniform sampler2D uEcoMask;',
      'uniform vec4 uEcoBox;',
      'uniform vec2 uEcoCenter;',
      'uniform float uEcoRadius;',
      'uniform sampler2D uEcoTrees;',
      'uniform sampler2D uEcoGround;',
      'uniform vec4 uEcoNearBox;',
      'uniform float uEcoSpot;',
      sh.fragmentShader.replace('#include <dithering_fragment>', `{
    vec2 ecoLotUv = (vEcoWorld.xz - uEcoBox.xy) / uEcoBox.zw;
    float ecoInLot = ecoLotUv.x > 0.0 && ecoLotUv.x < 1.0 && ecoLotUv.y > 0.0 && ecoLotUv.y < 1.0 ? texture2D(uEcoMask, ecoLotUv).g : 0.0;
    float ecoGrey = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 ecoMuted = mix(vec3(ecoGrey), gl_FragColor.rgb, ${SURROUND_SATURATION.toFixed(2)}) * ${SURROUND_BRIGHTNESS.toFixed(2)};
    gl_FragColor.rgb = mix(gl_FragColor.rgb, ecoMuted, uEcoSpot * (1.0 - ecoInLot));
  }
  #include <dithering_fragment>`).replace('void main() {', `void main() {
  vec2 ecoUv = (vEcoWorld.xz - uEcoBox.xy) / uEcoBox.zw;
  if (ecoUv.x > 0.0 && ecoUv.x < 1.0 && ecoUv.y > 0.0 && ecoUv.y < 1.0 && texture2D(uEcoMask, ecoUv).r > 0.5) discard;
  if (length(vEcoWorld.xz - uEcoCenter) > uEcoRadius) discard;
  vec2 ecoNear = (vEcoWorld.xz - uEcoNearBox.xy) / uEcoNearBox.zw;
  if (ecoNear.x > 0.0 && ecoNear.x < 1.0 && ecoNear.y > 0.0 && ecoNear.y < 1.0) {
    vec4 ecoTree = texture2D(uEcoTrees, ecoNear); // green: crown plus margin; red: the crown itself
    float ecoAbove = ecoTree.r > 0.5 ? ${TREE_CUT_CORE_FT.toFixed(1)} : ${TREE_CUT_ABOVE_FT.toFixed(1)};
    if (ecoTree.g > 0.5 && vEcoWorld.y > texture2D(uEcoGround, ecoNear).r + ecoAbove) discard;
  }`),
    ].join('\n');
  };
  m.customProgramCacheKey = () => 'eco-clip';
  m.needsUpdate = true;
}
const readPhotoPref = () => {
  try {
    return localStorage.getItem(PHOTO_PREF) === '1';
  } catch {
    return false;
  }
};

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
const polyArea = (q) => Math.abs(q.reduce((a, p, i) => { const n = q[(i + 1) % q.length]; return a + p[0] * n[1] - n[0] * p[1]; }, 0)) / 2;
// A label card standing over a lawn (always facing the camera, drawn on top),
// sized to read at the property's overview distance.
function lawnTag(lines, maxDim) {
  const W = 640;
  const H = 72 + 52 * (lines.length - 1) + 28;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(20, 33, 26, 0.86)';
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 28);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillStyle = i ? '#cfe6bd' : '#ffffff';
    ctx.font = i ? '500 34px "Inter Tight", Helvetica, Arial, sans-serif' : '600 46px "Inter Tight", Helvetica, Arial, sans-serif';
    ctx.fillText(line, W / 2, 50 + i * 52);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false }));
  const w = Math.max(18, maxDim * 0.45);
  sprite.scale.set(w, (w * H) / W, 1);
  sprite.renderOrder = 20;
  sprite.userData.lift = (w * H) / W / 2;
  return sprite;
}

// Lawn as it is today (the scan check shows it before anything is designed):
// mown turf, short blade strokes in a few greens.
let _turf;
function turfTexture() {
  if (_turf) return _turf;
  _turf = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#5f8f3e';
    ctx.fillRect(0, 0, s, s);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      const shade = Math.random();
      ctx.strokeStyle = shade > 0.66 ? '#79a852' : shade < 0.33 ? '#4b7731' : '#628f41';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 2, y - 2 - Math.random() * 3);
      ctx.stroke();
    }
  });
  return _turf;
}
// Roads and paths: speckled asphalt and light pavers, laid in world feet so
// the texture scale matches however big the slab is.
const insidePoly = ([x, y], pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
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

// Photogrammetry leaves small loose pieces hanging in the air (birds, wires,
// bits of foliage it couldn't attach). In each loaded tile, pieces of mesh that
// connect to nothing else are found; a piece is dropped when it is small, sits
// well above the lowest ground around it, and doesn't reach the tile's edge
// (where it might carry on into the next tile, like half a roof).
const FLOATER = { maxSizeFt: 25, minLiftFt: 5, maxTris: 3000, cellFt: 6, maxTileFt: 1500 };
function removeFloaters(model, toScene) {
  model.updateMatrixWorld(true);
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  model.traverse((o) => {
    const g = o.geometry;
    if (!o.isMesh || !g?.attributes?.position) return;
    m.multiplyMatrices(toScene, o.matrixWorld);
    const pos = g.attributes.position;
    const n = pos.count;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const zs = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(m);
      xs[k] = v.x; ys[k] = v.y; zs[k] = v.z;
    }
    // Weld vertices that share a position (tiles duplicate them at texture seams).
    const id = new Int32Array(n);
    const seen = new Map();
    for (let k = 0; k < n; k++) {
      const key = `${Math.round(xs[k] * 20)},${Math.round(ys[k] * 20)},${Math.round(zs[k] * 20)}`;
      const prev = seen.get(key);
      if (prev === undefined) { seen.set(key, k); id[k] = k; } else id[k] = prev;
    }
    const parent = Int32Array.from({ length: n }, (_, k) => k);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const join = (a, b) => { a = find(id[a]); b = find(id[b]); if (a !== b) parent[a] = b; };
    const index = g.index ? g.index.array : null;
    const triCount = index ? index.length / 3 : n / 3;
    const corner = (t, c) => (index ? index[t * 3 + c] : t * 3 + c);
    for (let t = 0; t < triCount; t++) { join(corner(t, 0), corner(t, 1)); join(corner(t, 1), corner(t, 2)); }

    // Tile extent, and the lowest point in each horizontal cell (local ground).
    let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let k = 0; k < n; k++) { x0 = Math.min(x0, xs[k]); x1 = Math.max(x1, xs[k]); z0 = Math.min(z0, zs[k]); z1 = Math.max(z1, zs[k]); }
    // Coarse tiles cover whole districts; floaters only matter in the detailed ones nearby.
    if (!(x1 - x0 < FLOATER.maxTileFt && z1 - z0 < FLOATER.maxTileFt)) return;
    const cw = Math.max(1, Math.ceil((x1 - x0) / FLOATER.cellFt));
    const ch = Math.max(1, Math.ceil((z1 - z0) / FLOATER.cellFt));
    const low = new Float32Array(cw * ch).fill(Infinity);
    const cellOf = (x, z) => Math.min(ch - 1, Math.floor((z - z0) / FLOATER.cellFt)) * cw + Math.min(cw - 1, Math.floor((x - x0) / FLOATER.cellFt));
    for (let k = 0; k < n; k++) { const c = cellOf(xs[k], zs[k]); if (ys[k] < low[c]) low[c] = ys[k]; }

    // Bounds per piece.
    const box = new Map(); // root -> [x0, x1, y0, y1, z0, z1, tris]
    for (let t = 0; t < triCount; t++) {
      const r = find(id[corner(t, 0)]);
      let b = box.get(r);
      if (!b) { b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity, 0]; box.set(r, b); }
      for (let c = 0; c < 3; c++) {
        const k = corner(t, c);
        b[0] = Math.min(b[0], xs[k]); b[1] = Math.max(b[1], xs[k]);
        b[2] = Math.min(b[2], ys[k]); b[3] = Math.max(b[3], ys[k]);
        b[4] = Math.min(b[4], zs[k]); b[5] = Math.max(b[5], zs[k]);
      }
      b[6]++;
    }
    if (box.size < 2) return;
    const edge = 0.5;
    const drop = new Set();
    for (const [r, b] of box) {
      if (b[6] > FLOATER.maxTris || Math.max(b[1] - b[0], b[3] - b[2], b[5] - b[4]) > FLOATER.maxSizeFt) continue;
      if (b[0] - x0 < edge || x1 - b[1] < edge || b[4] - z0 < edge || z1 - b[5] < edge) continue;
      // Lowest ground within a cell of the piece.
      let ground = Infinity;
      const ci0 = Math.max(0, Math.floor((b[0] - x0) / FLOATER.cellFt) - 1);
      const ci1 = Math.min(cw - 1, Math.floor((b[1] - x0) / FLOATER.cellFt) + 1);
      const cj0 = Math.max(0, Math.floor((b[4] - z0) / FLOATER.cellFt) - 1);
      const cj1 = Math.min(ch - 1, Math.floor((b[5] - z0) / FLOATER.cellFt) + 1);
      for (let j = cj0; j <= cj1; j++) for (let i = ci0; i <= ci1; i++) ground = Math.min(ground, low[j * cw + i]);
      if (b[2] - ground <= FLOATER.minLiftFt) continue;
      // Only when there is ground under the whole piece: a clump of canopy with
      // nothing modelled beneath it would leave a hole to the sky.
      let covered = true;
      for (let j = Math.floor((b[4] - z0) / FLOATER.cellFt); covered && j <= Math.min(ch - 1, Math.floor((b[5] - z0) / FLOATER.cellFt)); j++) {
        for (let i = Math.floor((b[0] - x0) / FLOATER.cellFt); i <= Math.min(cw - 1, Math.floor((b[1] - x0) / FLOATER.cellFt)); i++) {
          if (!(low[j * cw + i] < b[2] - 3)) { covered = false; break; }
        }
      }
      if (covered) drop.add(r);
    }
    if (!drop.size) return;
    const kept = [];
    for (let t = 0; t < triCount; t++) {
      if (drop.has(find(id[corner(t, 0)]))) continue;
      kept.push(corner(t, 0), corner(t, 1), corner(t, 2));
    }
    g.setIndex(kept);
  });
}

// Ground heights across the property from the USGS 3D Elevation Program (bare
// earth, 1 m lidar where available), so the model sits on the real slope
// instead of a flat slab. Public data, sampled once per project view.
const USGS_SAMPLES = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples';
const USGS_WAIT_MS = 2500;
async function loadTerrain(planBounds, origin, cx, cy) {
  const { minX, maxX, minY, maxY } = planBounds;
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const step = Math.max(3, span / 22);
  const nx = Math.min(30, Math.ceil((maxX - minX) / step) + 1);
  const ny = Math.min(30, Math.ceil((maxY - minY) / step) + 1);
  const sx = (maxX - minX) / Math.max(1, nx - 1);
  const sy = (maxY - minY) / Math.max(1, ny - 1);
  const pts = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = minX + i * sx;
      const y = minY + j * sy;
      pts.push([x / (364000 * origin.cosLat) + origin.minLng, y / 364000 + origin.minLat]);
    }
  }
  const body = new URLSearchParams({
    geometry: JSON.stringify({ points: pts, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryMultipoint',
    returnFirstValueOnly: 'true',
    interpolation: 'RSP_BilinearInterpolation',
    f: 'json',
  });
  const metres = new Float64Array(pts.length).fill(NaN);
  // The AWS tiles load alongside; USGS gets a short head start, since the
  // model waits on this before it is shown.
  const aws = terrainElevations(pts).catch(() => []);
  try {
    const res = await fetch(USGS_SAMPLES, { method: 'POST', body, signal: AbortSignal.timeout(USGS_WAIT_MS) });
    const data = await res.json();
    for (const smp of data?.samples || []) {
      const v = Number(smp.value);
      if (Number.isFinite(v) && v > -500 && smp.locationId >= 0 && smp.locationId < pts.length) metres[smp.locationId] = v;
    }
  } catch {
    // USGS didn't answer in time; the coarser AWS terrain tiles stand in.
  }
  if (metres.filter(Number.isFinite).length < pts.length * 0.6) {
    const fallback = await aws;
    fallback.forEach((v, k) => { if (Number.isFinite(v) && v > -500) metres[k] = v; });
  }
  const known = [...metres].filter(Number.isFinite);
  if (known.length < pts.length * 0.6) return null;
  const mean = known.reduce((a, b) => a + b, 0) / known.length;
  const h = Float32Array.from(metres, (v) => (Number.isFinite(v) ? v : mean) * 3.28084);
  // Bilinear lookup in plan feet relative to the scene centre (cx, cy).
  const atPlan = (x, y) => {
    const fx = Math.min(nx - 1, Math.max(0, (x + cx - minX) / (sx || 1)));
    const fy = Math.min(ny - 1, Math.max(0, (y + cy - minY) / (sy || 1)));
    const i0 = Math.min(nx - 2, Math.floor(fx));
    const j0 = Math.min(ny - 2, Math.floor(fy));
    if (nx < 2 || ny < 2) return h[0];
    const tx = fx - i0;
    const ty = fy - j0;
    const v = (i, j) => h[j * nx + i];
    return (v(i0, j0) * (1 - tx) + v(i0 + 1, j0) * tx) * (1 - ty) + (v(i0, j0 + 1) * (1 - tx) + v(i0 + 1, j0 + 1) * tx) * ty;
  };
  const base = atPlan(0, 0);
  // Heights in feet relative to the scene centre's ground, at scene (x, z).
  const at = (x, z) => atPlan(x, -z) - base;
  let min = Infinity;
  for (const v of h) min = Math.min(min, v - base);
  return { at, min };
}

// A ground surface over the lot that follows the terrain: a grid draped on the
// heights, trimmed to the lot with holes where the beds are, via an alpha mask.
// Google's mesh has no ground under tree canopies or houses, so cutting them out
// of it (or a gap in its mesh) can leave holes to the sky; a skirt runs SKIRT_FT
// past the lot line and under every cut-out tree circle ([[x, z, r]]). Under
// the cuts (the circles and the house and bed shapes in `fills`, [[points,
// marginFt]]) it sits just below the real ground so Google's ground wins
// wherever it exists; elsewhere it sits deep, only filling gaps.
const SKIRT_FT = 45; // reaches neighbours' yards, where Google often has canopy but no ground
const SKIRT_DROP_FT = 0.6; // just past the lot line…
const SKIRT_DROP_MAX_FT = 2.5; // …sinking to this much lower further out
const SKIRT_DEEP_FT = 8; // away from the cuts: below any pool or sunken patio Google draws
const distToOutline = ([x, z], pts) => {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
    d = Math.min(d, Math.hypot(x - ax - t * ex, z - az - t * ez));
  }
  return d;
};
function drapedGround(outline, holes, at, texture, circles = [], skirt = false, exclude = [], fills = []) {
  const xs = [...outline.map((p) => p[0]), ...circles.flatMap(([x, , r]) => [x - r, x + r])];
  const zs = [...outline.map((p) => p[1]), ...circles.flatMap(([, z, r]) => [z - r, z + r])];
  const pad = SKIRT_FT + 1;
  const [x0, x1, z0, z1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...zs) - pad, Math.max(...zs) + pad];
  const step = Math.max(1.5, Math.max(x1 - x0, z1 - z0) / 120);
  const nearCut = (x, z) =>
    circles.some(([cx0, cz0, r]) => Math.hypot(x - cx0, z - cz0) <= r + step) ||
    fills.some(([pts, padFt]) => insidePoly([x, z], pts) || distToOutline([x, z], pts) <= padFt + step);
  const nx = Math.ceil((x1 - x0) / step) + 1;
  const nz = Math.ceil((z1 - z0) / step) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const col = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = x0 + ((x1 - x0) * i) / (nx - 1);
      const z = z0 + ((z1 - z0) * j) / (nz - 1);
      const inside = insidePoly([x, z], outline);
      // Inside the lot the fill sits well under Google's real yard (it only shows where the house was cut away).
      let drop = inside ? (skirt ? 1 : 0) : Math.min(SKIRT_DROP_MAX_FT, SKIRT_DROP_FT + distToOutline([x, z], outline) * 0.3);
      // Away from every cut the skirt only has to cover gaps in Google's mesh,
      // so it sinks deep: a pool or sunken patio Google draws lower than the
      // terrain then shows as it is, never painted over.
      if (skirt && !nearCut(x, z)) drop = SKIRT_DEEP_FT;
      pos.set([x, at(x, z) - drop, z], k * 3);
      // Off the lot the skirt mostly shows under canopies: shaded, earthy green.
      // The fill mostly shows under cut-away canopies: shaded, earthy green (the lot slab itself stays plain).
      col.set(inside && !skirt ? [1, 1, 1] : [0.5, 0.58, 0.42], k * 3);
      uv.set([i / (nx - 1), j / (nz - 1)], k * 2); // v runs with z, matching the mask canvas rows (flipY off)
    }
  }
  const index = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      index.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const W = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = W;
  const ctx = c.getContext('2d');
  const toPx = ([x, z]) => [((x - x0) / (x1 - x0)) * W, ((z - z0) / (z1 - z0)) * W];
  const trace = (pts) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(...toPx(p)) : ctx.moveTo(...toPx(p))));
    ctx.closePath();
  };
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineJoin = 'round';
  if (skirt) {
    // The lot plus a ring around it and the tree circles. Just under Google's
    // ground where its mesh is cut (houses, beds, trees), deep below it
    // everywhere else (see nearCut above).
    ctx.lineWidth = (2 * SKIRT_FT * W) / Math.max(x1 - x0, z1 - z0);
    trace(outline);
    ctx.fill();
    ctx.stroke();
    circles.forEach(([x, z, r]) => {
      const [px, pz] = toPx([x, z]);
      ctx.beginPath();
      ctx.ellipse(px, pz, (r / (x1 - x0)) * W, (r / (z1 - z0)) * W, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    ctx.lineWidth = (2 * 1 * W) / Math.max(x1 - x0, z1 - z0); // 1 ft past the line, tucked under Google's ground
    trace(outline);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#000';
    holes.forEach((h) => { trace(h); ctx.fill(); });
  }
  // Public streets and sidewalks stay Google's (or the satellite's), never ours.
  ctx.fillStyle = '#000';
  exclude.forEach((h) => { trace(h); ctx.fill(); });
  const alpha = new THREE.CanvasTexture(c);
  alpha.flipY = false;
  texture.repeat.set((x1 - x0) / 6, (z1 - z0) / 6);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: texture, alphaMap: alpha, alphaTest: 0.5, color: 0xa39a8a, vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide,
  }));
  mesh.receiveShadow = true;
  return mesh;
}

// Lift every vertex of a mesh (already placed in the scene) onto the terrain.
function drape(mesh, at) {
  mesh.updateMatrix();
  const m = mesh.matrix;
  const inv = m.clone().invert();
  const p = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let k = 0; k < p.count; k++) {
    v.fromBufferAttribute(p, k).applyMatrix4(m);
    v.y += at(v.x, v.z);
    v.applyMatrix4(inv);
    p.setXYZ(k, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}

// The strip between the property and its street (front yard to curb: sidewalk,
// planting strip, street trees), in scene feet. In Real 3D Google's mesh there
// is replaced by the model, so its rough tree blobs never block the view of the
// property. It runs from the lot's street-facing corners out to the nearest
// road's edge (scans saved without roads have none).
const FRONT_MAX_FT = 90; // a road further than this from the lot isn't its street
function convexHull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const h = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...half(p), ...half([...p].reverse())];
}
function frontStrip(lotPts, roads) {
  if (!lotPts || lotPts.length < 3 || !roads.length) return null;
  const nearest = ([x, z]) => {
    let best = null;
    for (const road of roads) {
      for (let i = 0; i < road.length; i++) {
        const [ax, az] = road[i];
        const [bx, bz] = road[(i + 1) % road.length];
        const [ex, ez] = [bx - ax, bz - az];
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
        const q = [ax + t * ex, az + t * ez];
        const d = Math.hypot(x - q[0], z - q[1]);
        if (!best || d < best.d) best = { q, d };
      }
    }
    return best;
  };
  const hits = lotPts.map((v) => ({ v, hit: nearest(v) }));
  const min = Math.min(...hits.map((h) => h.hit.d));
  if (min > FRONT_MAX_FT) return null;
  const front = hits.filter((h) => h.hit.d <= Math.min(FRONT_MAX_FT, min + 25));
  return front.length >= 2 ? convexHull(front.flatMap((h) => [h.v, h.hit.q])) : null;
}

// Where Google's real ground is, as an offset (ft) from the terrain heights, so
// in Real 3D the model's beds, plants, house and trees stand on it instead of
// floating above it or sinking into it. Cast down onto Google's mesh on a grid
// over the property and its surroundings (scene box [x0, x1, z0, z1]). The
// ground is the lowest surface that a good share of the points around agree on
// (canopy, roofs and cars stand above it; a pool is a small minority); a point
// standing well above the ground found further around it (all canopy or roof
// nearby) takes its neighbours' value instead. Used only to place the model in this view.
const GROUND_NEAR_FT = 14; // neighbourhood radius
const GROUND_WIDE_FT = 40; // the wider check against canopy and roofs
const GROUND_TALL_FT = 4; // this far above the ground around it is canopy, a roof or a car
const GROUND_SNAP_FT = 1.2; // a hit this close to the estimate is the ground itself
async function googleGround(group, rawAt, [x0, x1, z0, z1], alive) {
  const step = Math.max(4, Math.max(x1 - x0, z1 - z0) / 40);
  const nx = Math.ceil((x1 - x0) / step) + 1;
  const nz = Math.ceil((z1 - z0) / step) + 1;
  const raw = new Float32Array(nx * nz).fill(NaN);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const from = new THREE.Vector3();
  group.updateMatrixWorld(true);
  for (let k = 0; k < raw.length; k++) {
    if (k % 60 === 59) {
      await new Promise((r) => setTimeout(r)); // about a millisecond a ray: keep the page responsive
      if (!alive()) return null;
    }
    const x = x0 + (k % nx) * step;
    const z = z0 + Math.floor(k / nx) * step;
    ray.set(from.set(x, 1e5, z), down);
    const hit = ray.intersectObject(group, true)[0];
    if (hit) raw[k] = hit.point.y - rawAt(x, z);
  }
  if ([...raw].filter(Number.isFinite).length < 12) return null;
  const around = (grid, i, j, radius) => {
    const out = [];
    for (let dj = -radius; dj <= radius; dj++) {
      for (let di = -radius; di <= radius; di++) {
        const [ii, jj] = [i + di, j + dj];
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz || di * di + dj * dj > radius * radius) continue;
        const v = grid[jj * nx + ii];
        if (Number.isFinite(v)) out.push(v);
      }
    }
    return out.sort((a, b) => a - b);
  };
  const r = Math.max(1, Math.round(GROUND_NEAR_FT / step));
  const local = new Float32Array(raw.length).fill(NaN);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const near = around(raw, i, j, r);
      if (near.length < 3) continue;
      const base = near[Math.floor(near.length * 0.15)];
      const low = near.filter((v) => v <= base + 2.5);
      local[j * nx + i] = low[Math.floor(low.length / 2)];
    }
  }
  const wide = Math.max(r + 1, Math.round(GROUND_WIDE_FT / step));
  let fix = new Float32Array(raw.length).fill(NaN);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const v = local[j * nx + i];
      if (!Number.isFinite(v)) continue;
      const ring = around(local, i, j, wide);
      if (v <= ring[Math.floor(ring.length * 0.2)] + GROUND_TALL_FT) fix[j * nx + i] = v;
    }
  }
  // Fill the gaps from their neighbours, ring by ring, then smooth once.
  for (let pass = 0; pass < nx + nz; pass++) {
    const next = fix.slice();
    let missing = false;
    for (let k = 0; k < fix.length; k++) {
      if (Number.isFinite(fix[k])) continue;
      const [i, j] = [k % nx, Math.floor(k / nx)];
      const vals = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < nx && b < nz).map(([a, b]) => fix[b * nx + a]).filter(Number.isFinite);
      if (vals.length) next[k] = vals.reduce((s, v) => s + v, 0) / vals.length;
      else missing = true;
    }
    fix = next;
    if (!missing) break;
  }
  const smooth = new Float32Array(fix.length);
  for (let k = 0; k < fix.length; k++) {
    const [i, j] = [k % nx, Math.floor(k / nx)];
    let [sum, n] = [0, 0];
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const v = fix[(j + dj) * nx + i + di];
        if (i + di >= 0 && j + dj >= 0 && i + di < nx && j + dj < nz && Number.isFinite(v)) { sum += v; n++; }
      }
    }
    smooth[k] = Math.max(-15, Math.min(15, n ? sum / n : 0));
  }
  // Where Google's surface is open ground (close to the estimate), use exactly
  // its height, so the model and Google's ground meet without a step.
  for (let k = 0; k < smooth.length; k++) {
    if (Number.isFinite(raw[k]) && Math.abs(raw[k] - smooth[k]) < GROUND_SNAP_FT) smooth[k] = raw[k];
  }
  return (x, z) => {
    const fx = Math.min(nx - 1, Math.max(0, (x - x0) / step));
    const fz = Math.min(nz - 1, Math.max(0, (z - z0) / step));
    const [i0, j0] = [Math.min(nx - 2, Math.floor(fx)), Math.min(nz - 2, Math.floor(fz))];
    if (nx < 2 || nz < 2) return smooth[0];
    const [tx, tz] = [fx - i0, fz - j0];
    const v = (i, j) => smooth[j * nx + i];
    return (v(i0, j0) * (1 - tx) + v(i0 + 1, j0) * tx) * (1 - tz) + (v(i0, j0 + 1) * (1 - tx) + v(i0 + 1, j0 + 1) * tx) * tz;
  };
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
// Leaves are green, not the flower colour the catalog lists. Each species
// gets a slightly different natural green; grasses lean toward their own tint
// (needlegrass purple, deergrass silver) and trees keep their listed canopy.
const FOLIAGE = ['#4f6b3a', '#5b7442', '#466236', '#6b7f4c', '#587a52', '#7a8a5c'];
function foliageColor(plant) {
  if (plant.form === 'tree') return new THREE.Color(plant.color);
  let hash = 0;
  for (const ch of String(plant.id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const green = new THREE.Color(FOLIAGE[hash % FOLIAGE.length]);
  return plant.form === 'grass' ? green.lerp(new THREE.Color(plant.color), 0.35) : green;
}


// Plant detail scales with the scene: small yards get fuller, smoother
// plants; big properties get lighter ones (fewer pieces, no plant shadows)
// so thousands of plants stay smooth to orbit and walk through.
function plantDetailFor(count) {
  if (count <= 350) return 'high';
  if (count <= 1500) return 'normal';
  return 'low';
}

// Prepared plant models (see plantModels.js): one consistent template per
// form, textured leaf cards tinted per species, scaled to its size. A random
// turn per plant keeps a bed of one species from looking cloned.
// At maturity a plant spreads to meet its neighbours (`spacing`, from the
// layout), up to twice its listed width, so the bed reads as planted, not dotted.
// (Photo-scanned shrub models were tried here; at garden scale their sparse
// cut-out leaves read as bare sticks, so every shrub uses the full template.)
function buildPlant(plant, mature, detail = 'normal', { spacing = 0 } = {}) {
  const s = mature ? 1 : 0.35;
  const listed = Math.max(0.8, plant.w);
  const w = (mature ? Math.min(listed * 2, Math.max(listed, spacing * 0.95)) : listed) * s;
  const h = Math.max(0.8, plant.h) * s;
  const bloom = new THREE.Color(plant.form === 'tree' || plant.form === 'grass' ? plant.accent || plant.color : plant.color);
  const g = plantModel(plant.form, foliageColor(plant), bloom, detail, detail !== 'low');
  g.scale.set(w, h, w);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

// mode 'check': the scan as it is (lawn shown as lawn, no plants or design
// tools), for the person to confirm before designing; it always opens on the
// model, with Real 3D one click away. lawnLabel: lines of text shown over the
// largest lawn. onReady: called once the model stands on its terrain.
export default function Garden3DView({ entries = [], project, activeArrangement, onApplyArrangement, mode = 'design', lawnLabel = null, onReady }) {
  const checking = mode === 'check';
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [terrainDone, setTerrainDone] = useState(false);
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
  const tilesRef = useRef(null); // { tiles, wantUpdate } while the Google 3D view is on
  const [terrain, setTerrain] = useState(null); // { at(x, z), min } ground heights in feet, or null while flat
  useEffect(() => onPhotoLoaded(() => threeRef.current?.markDirty?.()), []); // a texture just appears on its material
  // The ground everything stands on, in scene feet: the terrain, plus in Real 3D
  // the offset to Google's real ground (googleGround). The raw terrain alone is
  // what Google's mesh is levelled against.
  const groundAtRef = useRef(() => 0);
  const terrainAtRef = useRef(() => 0);
  const terrainRef = useRef(null);
  const groundBoxRef = useRef([-60, 60, -60, 60]); // scene box [x0, x1, z0, z1] Google's ground is measured over
  const [realGround, setRealGround] = useState(null); // { terrain, fix(x, z) } measured on Google's mesh
  const [photoReal, setPhotoReal] = useState(() => !checking && Boolean(GOOGLE_TILES_KEY) && readPhotoPref());
  // Once Google 3D has loaded it stays loaded; the toggle only shows or hides
  // it (no reload, no new paid session). It loads hidden, behind the model, and
  // only shows once its tiles are in and the model stands on its ground.
  const [tilesWanted, setTilesWanted] = useState(photoReal);
  const photoRealRef = useRef(photoReal);
  const [photoStatus, setPhotoStatus] = useState('off'); // off | loading | ready | failed
  const showReal = photoReal && photoStatus === 'ready';
  useEffect(() => {
    photoRealRef.current = photoReal;
    if (photoReal) setTilesWanted(true);
    const t = tilesRef.current;
    if (t) {
      t.active = showReal;
      t.holder.visible = showReal;
      t.wantUpdate = true;
    }
    threeRef.current?.markDirty?.();
  }, [photoReal, showReal]);
  useEffect(() => {
    terrainRef.current = terrain;
    tilesRef.current?.refit?.();
  }, [terrain]);
  const groundFix = showReal && realGround && realGround.terrain === terrain ? realGround.fix : null;
  const groundAt = useMemo(() => {
    const base = terrain ? terrain.at : () => 0;
    return groundFix ? (x, z) => base(x, z) + groundFix(x, z) : base;
  }, [terrain, groundFix]);
  useEffect(() => { groundAtRef.current = groundAt; }, [groundAt]);
  const [photoCredit, setPhotoCredit] = useState('');
  const [custom, setCustom] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [designing, setDesigning] = useState(false);
  // Real 3D and design-from-a-sentence are in the paid plans (Pro, student
  // unlock, city partners); free accounts see them locked with a link to Plans.
  const { member, loading: accessLoading } = usePremiumAccess();
  const navigateTo = useNavigate();
  const locked = !accessLoading && !member;
  const [designError, setDesignError] = useState('');

  const regionPlants = useMemo(() => plantsForProject(project), [project]);
  const regionPlantIds = useMemo(() => new Set(regionPlants.map((p) => p.id)), [regionPlants]);
  // Curated mixes where their species are native; otherwise mixes built from the region's own natives.
  const regionArrangements = useMemo(() => arrangementsFor(regionPlants, regionForProject(project)?.name), [regionPlants, project]);
  const arrangement = useMemo(() => regionArrangements.find((a) => a.id === activeArrangement) || null, [regionArrangements, activeArrangement]);
  const fittingArrangements = regionArrangements.filter((a) => !a.minArea || (project?.breakdown?.turf || 0) >= a.minArea);
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
  const scenePoly = useCallback((poly) => poly.map(([x, y]) => [x - cx, -(y - cy)]), [cx, cy]);
  // In Real 3D only the trees on the lot or in the strip to the street are ours;
  // the neighbours' stay Google's.
  const ownTree = useCallback(
    (t) => (lot && lot.length >= 3 ? insidePoly([t.x, t.y], lot) : true) || (Boolean(frontRef.current) && insidePoly([t.x - cx, -(t.y - cy)], frontRef.current)),
    [lot, cx, cy],
  );
  const frontRef = useRef(null);
  const front = useMemo(
    () => frontStrip(lot && lot.length >= 3 ? scenePoly(lot) : null, paths.filter((q) => q && q.length >= 3 && ROAD_KINDS.has(q.kind) && q.kind !== 'service').map(scenePoly)),
    [lot, paths, scenePoly],
  );
  frontRef.current = front;
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
    LINE_RESOLUTION.set(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Film-style tone mapping, so bright sun and deep shade both read naturally.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cursor = 'grab';
    let lastRatio = maxDpr;

    // Bird's-eye overview: an oblique aerial angle (~50° off vertical) so the mulch
    // beds and plant models read as a real 3D landscape, not a flat plan looking down.
    // Looks from the south until the street is known, then from the street
    // (setFront): the open side, so neighbours' roofs and trees in Real 3D
    // don't stand between the camera and the property.
    const viewDir = new THREE.Vector3(0, 1, 1.25).normalize();
    let userMoved = false;
    const camFor = (tx, ty, tz, radius, factor = 3.4) => {
      const dist = Math.max(radius * factor, maxDim * 0.18);
      return new THREE.Vector3(tx, ty, tz).addScaledVector(viewDir, dist);
    };
    // Close enough that the property fills most of the view, with a little of the street around it.
    const overview = () => ({ pos: camFor(0, 0, 0, maxDim / 2, 3.2), tgt: new THREE.Vector3(0, 0, 0) });
    // A near plane of 0.5 ft (not 0.1) keeps depth precise enough that close surfaces don't shimmer.
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.5, 2e5);
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
    // Daylight from a physical sky model (same sun direction as the shadows)
    // lights every surface from all around, like a real afternoon.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const skyScene = new THREE.Scene();
    const sky = new Sky();
    sky.scale.setScalar(1000);
    Object.assign(sky.material.uniforms.turbidity, { value: 3.5 });
    Object.assign(sky.material.uniforms.rayleigh, { value: 1.4 });
    Object.assign(sky.material.uniforms.mieCoefficient, { value: 0.004 });
    sky.material.uniforms.sunPosition.value.copy(sunPos).normalize();
    skyScene.add(sky);
    const envTarget = pmrem.fromScene(skyScene, 0.02);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.45;
    sky.geometry.dispose();
    sky.material.dispose();
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xcfe2ee, 0x5a6b3a, 0.35));
    const dir = new THREE.DirectionalLight(0xfff2d6, 2.1);
    dir.position.copy(sunPos);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
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
    // Inspect the scene from the console while developing, or on the live site with ?debug3d.
    if (import.meta.env.DEV || /[?&]debug3d\b/.test(window.location.search)) window.__ecoThree = threeRef;

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
          camera.position.y = groundAtRef.current(camera.position.x, camera.position.z) + EYE_HEIGHT + Math.sin(w.bobPhase) * 0.22;
          markDirty();
        } else {
          w.bobPhase = 0;
          const eye = groundAtRef.current(camera.position.x, camera.position.z) + EYE_HEIGHT;
          if (Math.abs(camera.position.y - eye) > 0.001) {
            camera.position.y += (eye - camera.position.y) * Math.min(1, dt * 10);
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
      const t3 = tilesRef.current?.active ? tilesRef.current : null;
      // Tiles also load while hidden, behind the model, until Real 3D is ready.
      const tl = t3 || (tilesRef.current?.loading ? tilesRef.current : null);
      if (tl && (dirty || tl.wantUpdate)) {
        tl.wantUpdate = false;
        camera.updateMatrixWorld();
        tl.tiles.update();
      }
      if (dirty) {
        // In Real 3D, Google shows the surroundings (streets, neighbours, street
        // trees) and our model shows the property, which is cut out of Google's mesh.
        for (const c of scene.children) {
          const u = c.userData;
          if (u && (u.satellite || (u.offLot && !u.inFront))) c.visible = !t3;
          if (u && u.outline) c.visible = !t3;
          if (u && u.skirt) c.visible = !!t3;
          if (u && u.lotGround) c.visible = !t3;
        }
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
    controls.addEventListener('start', () => { userMoved = true; });
    // Turn the default view to face the property from (dx, dz) (scene feet,
    // horizontal); the camera moves there too unless the person has already moved it.
    threeRef.current.setFront = (dx, dz) => {
      const len = Math.hypot(dx, dz);
      if (!len) return;
      // Only follow when the camera still sits at the default view (not dragged, focused or walking).
      const atDefault = !tweenRef.current && camera.position.distanceTo(overview().pos) < 1;
      viewDir.set((dx / len) * 1.25, 1, (dz / len) * 1.25).normalize();
      if (userMoved || !atDefault || walkRef.current?.active) return;
      const next = overview();
      tweenRef.current = { fromPos: camera.position.clone(), toPos: next.pos, fromTgt: controls.target.clone(), toTgt: next.tgt, start: performance.now(), dur: 500 };
      markDirty();
    };

    const ro = new ResizeObserver(() => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      LINE_RESOLUTION.set(mount.clientWidth, mount.clientHeight);
      markDirty();
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.removeEventListener('change', markDirty);
      controls.dispose();
      surroundingsRef.current = null; // drop a satellite load still in flight
      tilesRef.current?.dispose();
      tilesRef.current = null;
      envTarget.dispose();
      disposeObject(scene, isShared); // the sky background is cached (shared), so it stays
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [maxDim]);

  // Ground points (scene feet) for lining the Google mesh up with the model:
  // lawn outline corners first (always open ground), then the property line.
  const groundSamplesRef = useRef([]);
  // Streets and sidewalks off the lot: open, bare ground, the best reference
  // for where Google's ground really is (yards are often under canopy or roofs).
  const roadSamplesRef = useRef([]);
  useEffect(() => {
    const pts = [...polys.flat(), ...(lot || [])].map(([x, y]) => [x - cx, -(y - cy)]);
    groundSamplesRef.current = pts.length > 40 ? pts.filter((_, i) => i % Math.ceil(pts.length / 40) === 0) : pts;
    // Google's ground is measured over the property and as far as the skirt reaches past it.
    const box = [...pts, ...buildings.flat().map(([x, y]) => [x - cx, -(y - cy)])];
    if (box.length) {
      const m = SKIRT_FT + 8;
      groundBoxRef.current = [Math.min(...box.map((p) => p[0])) - m, Math.max(...box.map((p) => p[0])) + m, Math.min(...box.map((p) => p[1])) - m, Math.max(...box.map((p) => p[1])) + m];
    }
    const road = [];
    for (const q of paths) {
      if (!q || q.length < 3) continue;
      const mx = q.reduce((a, p) => a + p[0], 0) / q.length;
      const my = q.reduce((a, p) => a + p[1], 0) / q.length;
      if (lot && lot.length >= 3 && insidePoly([mx, my], lot)) continue; // driveways and walks on the lot
      road.push([mx - cx, -(my - cy)], ...q.map(([x, y]) => [x - cx, -(y - cy)]));
    }
    roadSamplesRef.current = road.length > 60 ? road.filter((_, i) => i % Math.ceil(road.length / 60) === 0) : road;
  }, [polys, lot, paths, buildings, cx, cy]);

  // Real ground heights for the property and a margin around it (USGS 3DEP).
  useEffect(() => {
    setTerrain(null);
    setTerrainDone(false);
    terrainAtRef.current = () => 0;
    const all = lot && lot.length >= 3 ? lot : [...polys.flat(), ...buildings.flat()];
    if (!origin || !all.length) {
      setTerrainDone(true);
      return undefined;
    }
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const m = 75; // reaches street trees, which can stand ~20 m from the lot line
    let stale = false;
    loadTerrain({ minX: Math.min(...xs) - m, maxX: Math.max(...xs) + m, minY: Math.min(...ys) - m, maxY: Math.max(...ys) + m }, origin, cx, cy)
      .then((t) => {
        if (stale) return;
        if (t) {
          terrainAtRef.current = t.at;
          setTerrain(t);
        }
        setTerrainDone(true);
      })
      .catch(() => { if (!stale) setTerrainDone(true); }); // stays flat
    return () => { stale = true; };
  }, [origin, lot, polys, buildings, cx, cy]);

  // What is cut out of Google's mesh: only where our model replaces something:
  // the house (with a margin for eaves and scan offsets) and the planned beds.
  // Between the lot and its street (see frontStrip) only what stands above the
  // ground goes (trees, hedges, cars), so the real street, sidewalk and lawn
  // stay and nothing blocks the view of the property. The rest of the yard stays
  // Google's real one (lawn, patios, pools, sheds, fences), so nothing that
  // straddles the property line gets sliced and the property blends into its
  // surroundings; a soft dashed line marks it.
  useEffect(() => {
    const scene2 = (poly) => poly.map(([x, y]) => [x - cx, -(y - cy)]);
    const houses = buildings.filter((b) => b && b.length >= 3).map(scene2);
    const beds = polys.filter((q) => q && q.length >= 3).map(scene2);
    const lotPts = lot && lot.length >= 3 ? scene2(lot) : null;
    const all = [...houses.flat(), ...beds.flat(), ...(lotPts || []), ...(front || [])];
    if (!all.length) return undefined;
    const pad = HOUSE_CUT_MARGIN_FT + 2;
    const xs = all.map((p) => p[0]);
    const zs = all.map((p) => p[1]);
    const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...zs) - pad, Math.max(...zs) + pad];
    const W = 1024;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = W;
    const ctx = c.getContext('2d');
    const ftPx = W / Math.max(maxX - minX, maxZ - minZ, 1);
    const trace = (pts) => {
      ctx.beginPath();
      pts.forEach(([x, z], i) => {
        const px = ((x - minX) / (maxX - minX || 1)) * W;
        const py = (1 - (z - minZ) / (maxZ - minZ || 1)) * W; // canvas rows run top-down; the texture is flipped
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    };
    // Green: the lot (kept in full colour; the surroundings are muted). Red: cut away.
    if (lotPts) {
      ctx.fillStyle = '#00ff00';
      trace(lotPts);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2 * HOUSE_CUT_MARGIN_FT * ftPx;
    houses.forEach((h) => { trace(h); ctx.fill(); ctx.stroke(); });
    ctx.lineWidth = 2 * 1 * ftPx;
    beds.forEach((h) => { trace(h); ctx.fill(); ctx.stroke(); });
    const scenePts = lotPts || [[minX, minZ], [maxX, maxZ]];
    const tex = new THREE.CanvasTexture(c);
    const previous = clipUniforms.uEcoMask.value;
    clipUniforms.uEcoMask.value = tex;
    clipUniforms.uEcoBox.value.set(minX, minZ, maxX - minX || 1, maxZ - minZ || 1);
    clipUniforms.uEcoCenter.value.set(0, 0);
    clipUniforms.uEcoRadius.value = Math.max(...scenePts.map(([x, z]) => Math.hypot(x, z))) + SURROUND_FT;
    clipUniforms.uEcoSpot.value = lotPts ? 1 : 0;
    if (previous !== tex && previous.image?.width > 1) previous.dispose();

    // Tree cut-outs and the ground under them, over the lot plus a margin.
    const m = 75;
    const [nx0, nx1, nz0, nz1] = [minX - m, maxX + m, minZ - m, maxZ + m];
    const tc = document.createElement('canvas');
    tc.width = W;
    tc.height = W;
    const tctx = tc.getContext('2d');
    const circle = (x, z, r) => {
      tctx.beginPath();
      tctx.ellipse(((x - nx0) / (nx1 - nx0)) * W, (1 - (z - nz0) / (nz1 - nz0)) * W, (r / (nx1 - nx0)) * W, (r / (nz1 - nz0)) * W, 0, 0, Math.PI * 2);
      tctx.fill();
    };
    tctx.fillStyle = '#00ff00'; // crown plus margin
    const own = trees.filter(ownTree);
    own.forEach((t) => circle(t.x - cx, -(t.y - cy), (t.radiusFt || 6) + TREE_CUT_PAD_FT));
    tctx.fillStyle = '#ffff00'; // the crown itself
    own.forEach((t) => circle(t.x - cx, -(t.y - cy), t.radiusFt || 6));
    // With the house modelled, everything of Google's taller than a low wall
    // on the lot goes too (its trees are modelled from the scan), so nothing
    // rough stands over the yard; pools, patios and low walls stay.
    const fillTree = (pts) => {
      tctx.fillStyle = '#00ff00';
      tctx.beginPath();
      pts.forEach(([x, z], i) => {
        const px = ((x - nx0) / (nx1 - nx0)) * W;
        const py = (1 - (z - nz0) / (nz1 - nz0)) * W;
        if (i) tctx.lineTo(px, py);
        else tctx.moveTo(px, py);
      });
      tctx.closePath();
      tctx.fill();
    };
    if (houses.length && lotPts) fillTree(lotPts);
    if (front) fillTree(front);
    const treeTex = new THREE.CanvasTexture(tc);
    const G = 64;
    const heights = new Float32Array(G * G);
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) heights[j * G + i] = groundAt(nx0 + ((nx1 - nx0) * (i + 0.5)) / G, nz0 + ((nz1 - nz0) * (j + 0.5)) / G);
    }
    const groundTex = new THREE.DataTexture(heights, G, G, THREE.RedFormat, THREE.FloatType);
    groundTex.minFilter = THREE.NearestFilter; // float textures can't be filtered everywhere
    groundTex.magFilter = THREE.NearestFilter;
    groundTex.needsUpdate = true;
    const oldTrees = clipUniforms.uEcoTrees.value;
    const oldGround = clipUniforms.uEcoGround.value;
    clipUniforms.uEcoTrees.value = treeTex;
    clipUniforms.uEcoGround.value = groundTex;
    clipUniforms.uEcoNearBox.value.set(nx0, nz0, nx1 - nx0, nz1 - nz0);
    if (oldTrees.image?.width > 1) oldTrees.dispose();
    if (oldGround.image?.width > 1) oldGround.dispose();
    threeRef.current?.markDirty?.();
    return undefined;
  }, [lot, polys, buildings, trees, paths, groundAt, front, ownTree, cx, cy]);

  // Google Photorealistic 3D Tiles around the garden, while the toggle is on.
  // The tileset is placed so the scene origin is the property's centre, east
  // along +X and north along -Z like the model, in feet, with its ground just
  // below the beds (measured by casting down onto the mesh as tiles load).
  useEffect(() => {
    const three = threeRef.current;
    if (!tilesWanted || locked || !three || !origin || !GOOGLE_TILES_KEY) {
      setPhotoStatus('off');
      setPhotoCredit('');
      return undefined;
    }
    const { scene, camera, renderer, markDirty } = three;
    const lat0 = origin.minLat + cy / 364000;
    const lon0 = origin.minLng + cx / (364000 * origin.cosLat);
    const DEG = Math.PI / 180;
    let stopped = false;
    let state = null;

    // Placed at the ground's height above the ellipsoid, so the camera starts
    // above the real surface wherever the property is (Google only loads
    // detailed tiles near the camera). Fine-tuned against the mesh below.
    const start = (heightM, knownHeight) => {
      const tiles = new TilesRenderer();
      tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: GOOGLE_TILES_KEY, autoRefreshToken: true }));
      const draco = new DRACOLoader().setDecoderPath('/draco/');
      tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
      tiles.registerPlugin(new TileCompressionPlugin());
      tiles.registerPlugin(new ReorientationPlugin({ lat: lat0 * DEG, lon: lon0 * DEG, height: heightM }));
      tiles.setCamera(camera);
      tiles.setResolutionFromRenderer(camera, renderer);

      // The plugin puts north on +Z and west on +X, in metres; turn and scale to the model's frame.
      const holder = new THREE.Group();
      holder.rotation.y = Math.PI;
      holder.scale.setScalar(M_TO_FT);
      holder.add(tiles.group);
      scene.add(holder);

      // Hidden until ready: the tiles load (and the model is fitted to them)
      // behind the model, which stays on screen meanwhile.
      holder.visible = false;
      state = { tiles, holder, active: false, loading: true, leveledAt: null, wantUpdate: true, dispose: null };
      if (window.__ecoThree) window.__ecoTiles = state;
      const ray = new THREE.Raycaster();
      ray.firstHitOnly = true;
      const down = new THREE.Vector3(0, -1, 0);
      const levelGround = () => {
        holder.updateMatrixWorld(true);
        // Heights are relative to where the tiles were placed (the holder's zero):
        // within a few hundred feet when the elevation was known, otherwise the
        // ellipsoid, where US ground is roughly -500 to +15,000 ft. Cast from far above.
        const top = holder.position.y + 60000;
        // Google's ground minus ours at each point: one offset lines the two up everywhere.
        const offsets = (pts) => {
          const out = [];
          for (const [x, z] of pts) {
            ray.set(new THREE.Vector3(x, top, z), down);
            const hit = ray.intersectObject(tiles.group, true)[0];
            if (hit) out.push(hit.point.y - holder.position.y - terrainAtRef.current(x, z));
          }
          return out.sort((a, b) => a - b);
        };
        // Streets and sidewalks first; the yard (lawn and lot corners) when there are none.
        let heights = offsets(roadSamplesRef.current);
        if (heights.length < 4) heights = offsets(groundSamplesRef.current);
        if (heights.length < 3) return false;
        // The lower quartile: pavement and lawn, not street trees, roofs or cars.
        const ground = heights[Math.floor(heights.length / 4)];
        const median = heights[Math.floor(heights.length / 2)];
        // Coarse globe tiles load first and can be far off; wait for detailed ones that agree.
        const [lo, hi] = knownHeight ? [-400, 400] : [-1000, 15000];
        if (ground < lo || ground > hi || median - ground > 60) return false;
        holder.position.y = -ground - PHOTO_SINK_FT;
        holder.updateMatrixWorld(true);
        markDirty();
        return true;
      };
      // Then where Google's ground really is across the property (googleGround),
      // so the model stands on it. Measured once the tiles have settled, and
      // again only if the levelling moves; the first one reveals Real 3D.
      let measureTimer = null;
      let measureRun = 0;
      const reveal = () => {
        if (!state.loading || state.disposed) return;
        state.loading = false;
        clearTimeout(state.giveUp);
        setPhotoStatus('ready');
      };
      const measureGround = () => {
        clearTimeout(measureTimer);
        measureTimer = setTimeout(async () => {
          const run = ++measureRun;
          const terrainNow = terrainRef.current;
          const fix = await googleGround(tiles.group, terrainAtRef.current, groundBoxRef.current, () => !state.disposed && run === measureRun);
          if (state.disposed || run !== measureRun) return;
          if (fix) setRealGround({ terrain: terrainNow, fix });
          const st = tiles.stats;
          if (fix && !st.downloading && !st.parsing && !st.queued) reveal();
        }, 600);
      };
      const credit = () => {
        const text = tiles.getAttributions().filter((a) => a.type === 'string').map((a) => a.value).join(' ').trim();
        setPhotoCredit(text);
      };
      const onNeedsUpdate = () => { state.wantUpdate = true; markDirty(); };
      const onModel = ({ scene: model }) => {
        holder.updateMatrixWorld(true);
        try {
          removeFloaters(model, tiles.group.matrixWorld);
        } catch (err) {
          console.warn('3D tiles: floater cleanup skipped', err?.message); // never block a tile over it
        }
        model.traverse((o) => { if (o.material) clipTileMaterial(o.material); });
        onNeedsUpdate();
      };
      // When the terrain arrives (or changes) after the tiles, line up and measure again.
      state.refit = () => {
        if (levelGround()) {
          state.leveledAt = holder.position.y;
          measureGround();
        }
      };
      const onLoadEnd = () => {
        const before = holder.position.y;
        if (levelGround() && (state.loading || state.leveledAt === null || Math.abs(holder.position.y - before) > 0.3)) {
          state.leveledAt = holder.position.y;
          measureGround();
        }
        credit();
        markDirty();
      };
      // Never leave Real 3D spinning: after a while, show what has loaded if it
      // lined up with the model, otherwise say it isn't available.
      state.giveUp = setTimeout(() => {
        if (!state.loading || state.disposed) return;
        if (state.leveledAt !== null) {
          reveal();
          return;
        }
        state.loading = false;
        setPhotoStatus('failed');
        if (tilesRef.current === state) tilesRef.current = null;
        state.dispose();
        markDirty();
      }, 40000);
      const onRoot = () => {
        // One root tileset request is one billed session; count it on the owner dashboard.
        base44.functions.invoke('tilesSession', {}).catch(() => {});
      };
      const onError = (e) => {
        if (!tiles.root) {
          // Nothing loaded (bad key, quota, network): drop it so the modelled surroundings come back.
          state.loading = false;
          setPhotoStatus('failed');
          if (tilesRef.current === state) tilesRef.current = null;
          state.dispose();
          markDirty();
        }
        console.warn('3D tiles failed to load', e?.error?.message || e);
      };
      tiles.addEventListener('needs-update', onNeedsUpdate);
      tiles.addEventListener('load-model', onModel);
      tiles.addEventListener('tile-visibility-change', markDirty);
      tiles.addEventListener('tiles-load-end', onLoadEnd);
      tiles.addEventListener('load-root-tileset', onRoot);
      tiles.addEventListener('load-error', onError);

      state.dispose = () => {
        if (state.disposed) return; // the scene teardown may already have done it
        state.disposed = true;
        clearTimeout(state.giveUp);
        clearTimeout(measureTimer);
        scene.remove(holder);
        tiles.dispose();
        draco.dispose();
      };
      tilesRef.current = state;
      markDirty();
    };

    setPhotoStatus('loading');
    // USGS ground elevation (orthometric, metres) plus the geoid, which sits
    // about 30 m below it across the contiguous US.
    const GEOID_M = -30;
    // USGS or the AWS terrain tiles, whichever answers first (only a rough
    // start: the mesh is levelled against the model as it loads); without any
    // height the camera would start underground and Google would send nothing.
    const usable = (elev) => (Number.isFinite(elev) && elev > -500 ? [elev + GEOID_M, true] : Promise.reject());
    Promise.any([
      fetch(`https://epqs.nationalmap.gov/v1/json?x=${lon0}&y=${lat0}&units=Meters&wkid=4326`, { signal: AbortSignal.timeout(6000) })
        .then((r) => r.json())
        .then((d) => usable(Number(d?.value))),
      terrainElevations([[lon0, lat0]]).then(([elev]) => usable(elev)),
    ])
      .catch(() => [0, false])
      .then(([heightM, known]) => {
        if (!stopped) start(heightM, known);
      });
    return () => {
      stopped = true;
      if (state) {
        if (tilesRef.current === state) tilesRef.current = null;
        state.dispose();
      }
      markDirty();
    };
  }, [tilesWanted, locked, origin, cx, cy, maxDim]);

  const togglePhotoReal = () => {
    if (locked) {
      navigateTo('/plans');
      return;
    }
    setPhotoReal((on) => {
      try {
        localStorage.setItem(PHOTO_PREF, on ? '0' : '1');
      } catch {
        /* private browsing: the choice just isn't remembered */
      }
      return !on;
    });
  };

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
    const at = groundAt; // ground height (ft) at scene (x, z)
    const sloped = Boolean(terrain || groundFix);
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
    const onLot = (x, y) => !outerPoly || outerPoly.length < 3 || insidePoly([x, y], outerPoly);
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
      let ground;
      if (sloped) {
        const toScene = (poly) => poly.map((p) => [p[0] - cx, -(p[1] - cy)]);
        // Same circles as the tree cut-outs in Google's mesh (TREE_CUT_PAD_FT past each crown).
        const circles = trees.filter(ownTree).map((t) => [t.x - cx, -(t.y - cy), (t.radiusFt || 6) + TREE_CUT_PAD_FT]);
        const publicWays = paths.filter((q) => q && q.length >= 3 && !onLot(q.reduce((s2, p) => s2 + p[0], 0) / q.length, q.reduce((s2, p) => s2 + p[1], 0) / q.length)).map(toScene);
        ground = drapedGround(toScene(outerPoly), polys.filter((q) => q && q.length >= 3).map(toScene), at, gt, [], false, publicWays);
        const skirtTex = gt.clone();
        skirtTex.needsUpdate = true;
        // Under what's cut from Google's mesh: houses (footprint plus the cut margin) and beds.
        const cutFills = [
          ...buildings.filter((q) => q && q.length >= 3).map((q) => [toScene(q), HOUSE_CUT_MARGIN_FT + 1]),
          ...polys.filter((q) => q && q.length >= 3).map((q) => [toScene(q), 2]),
        ];
        const skirt = drapedGround(toScene(outerPoly), [], at, skirtTex, circles, true, publicWays, cutFills);
        skirt.userData.ground = true;
        skirt.userData.skirt = true; // Real 3D only
        skirt.visible = false;
        scene.add(skirt);
      } else {
        ground = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshStandardMaterial({ map: gt, color: 0xa39a8a, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
      }
      ground.userData.ground = true;
      ground.userData.lotGround = true; // Real 3D shows Google's real yard instead
      scene.add(ground);
      const gpts = outerPoly.map((p) => new THREE.Vector3(p[0] - cx, at(p[0] - cx, -(p[1] - cy)) + 0.65, -(p[1] - cy)));
      // The property line: white dashes over a dark halo, drawn over everything
      // (like a selection outline) so trees, fences and roofs never hide it.
      const gline = haloOutline(gpts, 0xffffff, 2.5, { dashed: true, order: 10 });
      gline.userData.ground = true;
      gline.userData.propertyLine = true;
      gline.userData.outline = true;
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
          mesh.userData.satellite = true;
          mesh.renderOrder = -1; // drawn before everything else, so modelled items always cover it
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set((ex0 + ex1) / 2 - cx, (terrain ? terrain.min : 0) - 1.5, -((ey0 + ey1) / 2 - cy));
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
      const mulch = checking ? turfTexture() : mulchTexture();
      if (checking) mulch.repeat.set(1 / 4, 1 / 4); // shape UVs are in feet: one patch per 4 ft
      else mulch.repeat.set(span / 4, span / 4);
      // Mulch is a flat 2D area lifted just above the ground (MULCH_Y) so it reads as
      // a layer on top of the property base, not a raised mound.
      const bed = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        // Photographed wood-chip mulch (CC0, Poly Haven); shape UVs are in feet.
        checking
          ? new THREE.MeshStandardMaterial({ map: mulch, roughness: 1, metalness: 0, side: THREE.DoubleSide })
          : new THREE.MeshStandardMaterial({ map: photo('aerial_wood_snips', 'diffuse'), normalMap: photo('aerial_wood_snips', 'nor_gl'), color: 0xc9b8a6, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
      );
      bed.userData.bed = true;
      bed.userData.bedIndex = bi;
      bed.rotation.x = -Math.PI / 2;
      bed.position.y = MULCH_Y;
      bed.receiveShadow = true;
      if (sloped) drape(bed, at);
      scene.add(bed);
      bedMeshesRef.current.push(bed);

      // Focus target: centroid + bounding radius of this lawn (in scene-local coords).
      const lxs = poly.map((p) => p[0] - cx);
      const lzs = poly.map((p) => -(p[1] - cy));
      const bx = lxs.reduce((s, v) => s + v, 0) / lxs.length;
      const bz = lzs.reduce((s, v) => s + v, 0) / lzs.length;
      const radius = Math.max(...lxs.map((x, i) => Math.hypot(x - bx, lzs[i] - bz)), 3);
      bedsRef.current.push({ x: bx, z: bz, radius });

      // The lawn being converted, outlined in green over everything, so it's
      // found at a glance even under trees or on a big property.
      const outlinePts = poly.map((p) => new THREE.Vector3(p[0] - cx, at(p[0] - cx, -(p[1] - cy)) + MULCH_Y + 0.1, -(p[1] - cy)));
      const outline = haloOutline(outlinePts, LAWN_OUTLINE, 2.5, { order: 12 });
      outline.userData.bed = true;
      outline.userData.outline = true; // the model view only; Real 3D shows the property as it looks
      scene.add(outline);
    });

    // Buildings from the scanned footprints, squared up into conventional
    // blocks with roofs, windows and a front door facing the nearest road
    // (see houseModel.js). Height is the measured one from the lawn scan when
    // available (Overture height or floors, or the canopy height model).
    const bAttr = project?.building || {};
    const roadPts = paths.filter((p) => ROAD_KINDS.has(p.kind)).flat().map((p) => [p[0] - cx, p[1] - cy]);
    // View the property from its street: the nearest point on any road line
    // (not just its vertices, which can be far down the block). Plan y is north, scene z south.
    let street = null;
    for (const road of paths.filter((p) => ROAD_KINDS.has(p.kind))) {
      for (let i = 1; i < road.length; i++) {
        const [ax, ay] = [road[i - 1][0] - cx, road[i - 1][1] - cy];
        const [bx, by] = [road[i][0] - cx, road[i][1] - cy];
        const ex = bx - ax;
        const ey = by - ay;
        const t = Math.max(0, Math.min(1, -(ax * ex + ay * ey) / (ex * ex + ey * ey || 1)));
        const p = [ax + t * ex, ay + t * ey];
        if (!street || Math.hypot(...p) < Math.hypot(...street)) street = p;
      }
    }
    if (street) three.setFront?.(street[0], -street[1]);
    buildings.forEach((poly) => {
      if (!poly || poly.length < 3) return;
      const pts = poly.map((p) => [p[0] - cx, p[1] - cy]);
      const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const front = roadPts.reduce((best, p) => (!best || Math.hypot(p[0] - mx, p[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? p : best), null);
      const heightFt = poly.heightFt > 0 ? poly.heightFt : Number(bAttr.heightFt) > 0 ? Number(bAttr.heightFt) : null;
      const mesh = buildHouse(pts, heightFt, { wallColor: bAttr.wallColor, roofType: bAttr.roofType, front });
      // Stand on the lowest ground under the footprint; uphill walls run into the slope like a foundation.
      mesh.position.y = Math.min(...pts.map(([x, y]) => at(x, -y)));
      mesh.userData.building = true;
      scene.add(mesh);
    });

    // Roads and paths as raised, textured slabs with an edge line so they stand
    // out from mulch and ground: asphalt roads with a pale curb, paver paths
    // with darker edging. Named roads get their street name painted on.
    const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95, metalness: 0 });
    // Photographed concrete pavers (CC0, Poly Haven) for walks and patios.
    const paverMat = new THREE.MeshStandardMaterial({ map: photo('concrete_pavement', 'diffuse'), normalMap: photo('concrete_pavement', 'nor_gl'), roughness: 0.9, metalness: 0 });
    const curbMat = new THREE.LineBasicMaterial({ color: 0xe8e4da });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x8a7f6b });
    const labelled = new Set();
    // Off the lot, Google's real streets and trees take over in Real 3D (onLot is defined above).
    paths.forEach((poly) => {
      if (!poly || poly.length < 3) return;
      const road = ROAD_KINDS.has(poly.kind);
      const offLot = !onLot(poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length);
      const depth = road ? 0.9 : 0.5; // roads stand well clear of the faded satellite ground
      const shape = new THREE.Shape();
      poly.forEach((p, i) => { const x = p[0] - cx; const y = p[1] - cy; if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y); });
      const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), road ? roadMat : paverMat);
      slab.userData.path = true;
      slab.userData.offLot = offLot;
      slab.rotation.x = -Math.PI / 2;
      slab.position.y = MULCH_Y; // sits on the mulch, so a path crossing a converted lawn stays visible
      slab.receiveShadow = true;
      if (sloped) drape(slab, at);
      scene.add(slab);
      const edge = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(poly.map((p) => new THREE.Vector3(p[0] - cx, at(p[0] - cx, -(p[1] - cy)) + MULCH_Y + depth + 0.02, -(p[1] - cy)))),
        road ? curbMat : edgeMat,
      );
      edge.userData.path = true;
      edge.userData.offLot = offLot;
      scene.add(edge);

      // One label per road piece long enough to read; skip repeats close by.
      if (road && poly.name) {
        const axis = slabAxis(poly);
        const key = `${poly.name}:${Math.round(axis.mx / 150)}:${Math.round(axis.my / 150)}`;
        if (axis.length >= 40 && !labelled.has(key)) {
          labelled.add(key);
          const label = roadLabel(poly.name, axis);
          label.position.set(axis.mx - cx, at(axis.mx - cx, -(axis.my - cy)) + MULCH_Y + depth + 0.05, -(axis.my - cy));
          label.userData.path = true;
          label.userData.offLot = offLot;
          scene.add(label);
        }
      }
    });

    // Existing mature trees kept from the scan, sized to their scanned canopy.
    // Each stands on the lowest ground under its crown (never on a roof, wall or
    // lump in Google's mesh) and keeps its scanned height above that ground.
    trees.forEach((t) => {
      const mesh = buildExistingTree(t.radiusFt, t.heightFt);
      const [tx, tz] = [t.x - cx, -(t.y - cy)];
      const reach = Math.max(2, (t.radiusFt || 6) * 0.5);
      const base = Math.min(at(tx, tz), ...Array.from({ length: 8 }, (_, k) => at(tx + reach * Math.cos((k * Math.PI) / 4), tz + reach * Math.sin((k * Math.PI) / 4))));
      mesh.position.set(tx, base + MULCH_Y, tz);
      mesh.userData.existingTree = true;
      mesh.userData.offLot = !onLot(t.x, t.y);
      mesh.userData.inFront = mesh.userData.offLot && ownTree(t);
      scene.add(mesh);
    });

    // A different lawn outline or arrangement pattern starts plants fresh.
    if (movedRef.current.polys !== polys || movedRef.current.pattern !== pattern) {
      movedRef.current = { polys, pattern, map: new Map() };
    }
    const moved = movedRef.current.map;
    const nth = new Map();
    const detail = plantDetailFor(layout.length);
    layout.forEach((p, i) => {
      const mesh = buildPlant(p.plant, mature, detail, { spacing: p.spacing });
      const k = nth.get(p.speciesId) || 0;
      nth.set(p.speciesId, k + 1);
      const moveKey = `${p.speciesId}:${k}`;
      const spot = moved.get(moveKey) || p;
      mesh.position.set(spot.x - cx, at(spot.x - cx, -(spot.y - cy)) + MULCH_Y, -(spot.y - cy));
      mesh.userData = { index: i, speciesId: p.speciesId, plantId: p.plant.id, moveKey, cx, cy };
      plantGroup.add(mesh);
      mesh.traverse((o) => {
        if (o.isMesh) {
          o.userData.plant = mesh;
          plantMeshesRef.current.push(o);
        }
      });
    });

    // The person's own numbers, floating over their largest lawn.
    if (lawnLabel?.length && polys.length) {
      const big = polys.filter((q) => q && q.length >= 3).reduce((a, q) => (!a || polyArea(q) > polyArea(a) ? q : a), null);
      if (big) {
        const lx = big.reduce((t, p) => t + p[0], 0) / big.length - cx;
        const lz = -(big.reduce((t, p) => t + p[1], 0) / big.length - cy);
        const tag = lawnTag(lawnLabel, maxDim);
        tag.position.set(lx, at(lx, lz) + 2 + tag.userData.lift, lz);
        tag.userData.bed = true;
        scene.add(tag);
      }
    }

    three.markDirty?.();
    // Ready once the model stands on its terrain and has been drawn.
    if (terrainDone && onReadyRef.current) {
      const done = onReadyRef.current;
      onReadyRef.current = null;
      requestAnimationFrame(() => requestAnimationFrame(() => done()));
    }
  }, [layout, polys, pattern, lot, buildings, trees, paths, cx, cy, mature, boundsAll, origin, terrain, groundAt, groundFix, checking, front, ownTree, lawnLabel, terrainDone, maxDim]);

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
    const { renderer, camera, controls, raycaster, pointer, ring } = three;
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
          ring.position.set(plant.position.x, plant.position.y + 0.02, plant.position.z);
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
      // Drag across a plane at the plant's own height, then settle it on the ground there.
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -draggingRef.current.position.y);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        const y = groundAtRef.current(hit.x, hit.z) + MULCH_Y;
        draggingRef.current.position.set(hit.x, y, hit.z);
        ring.position.set(hit.x, y + 0.02, hit.z);
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
    const eye = groundAtRef.current(pp.x, pp.z) + EYE_HEIGHT;
    camera.position.set(pp.x, eye, pp.z);
    // Look straight ahead (horizontal) toward the garden center, not down at the ground.
    camera.lookAt(0, eye, 0);
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
        <div className={`inline-flex rounded-full border border-border p-0.5 ${checking ? 'hidden' : ''}`}>
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
        <div className="flex flex-wrap gap-2">
          {GOOGLE_TILES_KEY && origin && (
            <Button
              variant={photoReal ? 'default' : 'outline'}
              onClick={togglePhotoReal}
              className="rounded-full"
              size="sm"
              aria-pressed={photoReal}
              title={locked ? 'Real 3D is part of Pro and the free student unlock' : 'Show the real house, trees and street in 3D from Google'}
            >
              {photoReal && photoStatus === 'loading' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : locked ? <Lock className="mr-1.5 h-4 w-4" /> : <Box className="mr-1.5 h-4 w-4" />}
              {photoReal && photoStatus === 'loading' ? 'Setting up Real 3D…' : checking && !photoReal ? 'Try Real 3D' : 'Real 3D'}
            </Button>
          )}
          {interactive && (
            <Button variant="outline" onClick={() => { if (walkMode) setWalkMode(false); else focusOnRef.current?.(-1); }} className="rounded-full" size="sm">
              <ScanEye className="mr-1.5 h-4 w-4" />
              Reset view
            </Button>
          )}
          {!checking && (
            <Button variant={moveMode ? 'default' : 'outline'} onClick={() => setMoveMode((m) => !m)} className="rounded-full" size="sm">
              <Move className="mr-1.5 h-4 w-4" />
              {moveMode ? 'Done moving' : 'Move plants'}
            </Button>
          )}
          {checking ? null : walkMode ? (
            <Button variant="default" onClick={() => setWalkMode(false)} className="rounded-full" size="sm">
              Exit walk
            </Button>
          ) : (
            <WalkThroughHandle onActivate={() => setWalkMode(true)} />
          )}
        </div>
      </div>

      <div className="relative mt-3">
        {showReal ? (
          <span className="pointer-events-none absolute bottom-1.5 right-2 z-10 flex max-w-[85%] items-center gap-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9.5px] text-white">
            <span className="text-[11px] font-medium tracking-tight">Google</span>
            <span className="truncate">{photoCredit || 'Map data ©Google'}</span>
          </span>
        ) : (
          <span className="pointer-events-none absolute bottom-1.5 right-2 z-10 rounded bg-black/50 px-1.5 py-0.5 text-[9.5px] text-white">
            Imagery © Esri, Maxar, Earthstar Geographics
          </span>
        )}
        {showReal && (
          <p className="pointer-events-none absolute left-3 top-3 z-10 max-w-[80%] rounded-lg bg-background/75 px-3 py-1.5 text-[11px] text-muted-foreground shadow backdrop-blur">
            Surroundings from Google 3D. Your property is our model of it, so the plan is never hidden.
          </p>
        )}
        {photoReal && photoStatus === 'loading' && (
          <p role="status" className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[85%] items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-[11px] text-muted-foreground shadow backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            Setting up Real 3D in the background. It appears here once it’s ready.
          </p>
        )}
        {photoReal && photoStatus === 'failed' && (
          <p role="status" className="absolute left-3 top-3 z-10 rounded-full bg-background/80 px-3 py-1 text-[11px] text-muted-foreground shadow backdrop-blur">
            Google 3D isn't available here right now. Showing the model.
          </p>
        )}
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
        {checking
          ? 'Drag to rotate · scroll to zoom. Green is the lawn we found; the dashed line is the property line.'
          : walkMode
          ? 'You are standing in the garden. WASD or the on-screen arrows to move, drag to look around, Exit walk to return to the plan.'
          : moveMode
            ? 'Click a plant and drag it to a new spot on the mulch. Hit Done moving to focus again.'
            : 'Drag to rotate · click a lawn to focus · scroll to zoom · tap the person, or drag it onto the property, to walk it.'}
      </p>

      {!checking && (
      <>
      <div className="mt-4 border-t border-border/70 pt-3">
        <div className="flex items-center gap-2">
        <Leaf className="h-3.5 w-3.5 text-accent" />
        <p className="label-xs">Agronomist arrangements</p>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        Some arrangements may not suit every lawn size or location.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {fittingArrangements.length === 0 && (
            <p className="text-[11.5px] text-muted-foreground">No ready-made mixes for this area yet. Describe the garden you want below, or pick plants from the list.</p>
          )}
          {fittingArrangements.map((a) => (
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
            placeholder="Describe your ideal garden, e.g. drought-tolerant pollinator hedge with winter berries"
            className="field h-9 flex-1 text-[12.5px]"
            onKeyDown={(e) => { if (e.key === 'Enter' && !designing) runTypeDesign(); }}
          />
          {locked ? (
            <Button type="button" variant="outline" onClick={() => navigateTo('/plans')} className="rounded-full" size="sm">
              <Lock className="mr-1.5 h-4 w-4" /> Design from text: Pro or student
            </Button>
          ) : (
            <Button type="button" onClick={runTypeDesign} disabled={designing || !regionPlantIds.size || prompt.trim().length < 3} className="rounded-full" size="sm">
              {designing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
              {designing ? 'Designing…' : 'Design from text'}
            </Button>
          )}
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
      </>
      )}
    </div>
  );
}