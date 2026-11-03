// Real 3D test: saved scans opened in the app's Real 3D (the development
// review page, /dev/render?real=1, on the local dev server) in headless Chrome,
// looked at from above, from the street side, the back, both sides and at eye
// height in the street. A hole is a pixel whose view ray points below the
// horizon yet meets nothing: the background shows through the ground. Holes
// are tallied by what Real 3D's cut masks say is there (lot, tree, the strip
// to the street, none), and Google's ground is compared with the model's over
// the cut areas.
//
//   node scripts/real3d-holes.mjs <outDir> <scanFolderUrl>|<n>[|label] ...
//
// A scan folder holds n.json and n.png as lawn-api/scripts/city-test.mjs
// writes them, served over http (lawn-api/scripts/serve-run.mjs). Writes
// outDir/<label>-<view>.png, -holes.png (holes in magenta) and -plan.png (the
// cut masks with the holes' ground points), and outDir/results.jsonl.
// MODEL=1: the plain 3D model instead; QA=1: Google's own mesh, uncut (its
// holes are the baseline); SETTLE_MS: how long each view waits for its tiles;
// VIEWS=front,street,near: only those views (near: closer, for reviewing).
import fs from 'node:fs';
import path from 'node:path';
import { openPage } from './lib/headless.mjs';

const [outDir, ...specs] = process.argv.slice(2);
if (!outDir || !specs.length) {
  console.error('usage: node scripts/real3d-holes.mjs <outDir> <scanFolderUrl>|<n>[|label] ...');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const BASE = process.env.APP_URL || 'http://localhost:5173';
const MODEL = Boolean(process.env.MODEL);
const settleMs = Number(process.env.SETTLE_MS || 10000);
const page = await openPage({ width: 1280, height: 800 });

// In the page: one view, rendered as shown and again on magenta to find holes.
function inPage(spec) {
  return (async () => {
    const t = window.__ecoThree.current;
    const tiles = window.__ecoTiles;
    const clip = window.__ecoClip;
    const { camera, controls, scene, renderer } = t;
    const V = camera.position.constructor;
    const gAt = window.__ecoGround?.groundAt?.current || (() => 0);
    const pos = [...spec.pos];
    const tgt = [...spec.tgt];
    // The street view: out from the house toward the street until off the lot,
    // then across the sidewalk to the far side of the road, looking back at the house.
    if (spec.street && clip?.uEcoMask.value.image?.getContext) {
      const lotC = clip.uEcoMask.value.image;
      const lb = clip.uEcoBox.value;
      const lctx = lotC.getContext('2d');
      const onLot = (x, z) => {
        const u = (x - lb.x) / lb.z;
        const v = (z - lb.y) / lb.w;
        if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return false;
        return lctx.getImageData(Math.floor(u * lotC.width), Math.floor((1 - v) * lotC.height), 1, 1).data[0] > 127;
      };
      let r = 0;
      while (r < 400 && onLot(spec.street[0] * r, spec.street[1] * r)) r += 2;
      pos[0] = spec.street[0] * (r + 30);
      pos[2] = spec.street[1] * (r + 30);
    }
    // Heights given above the ground there (the street view stands on it).
    if (spec.eye) {
      pos[1] = gAt(pos[0], pos[2]) + spec.eye;
      tgt[1] = gAt(tgt[0], tgt[2]) + spec.eye;
    }
    camera.position.set(...pos);
    controls.target.set(...tgt);
    controls.update();
    camera.lookAt(controls.target);
    camera.updateMatrixWorld(true);
    t.markDirty();
    // Let the tiles for this view load.
    const t0 = performance.now();
    let quiet = 0;
    let settled = false;
    while (performance.now() - t0 < spec.settleMs) {
      await new Promise((r) => setTimeout(r, 250));
      t.markDirty();
      const st = (tiles?.active && tiles.tiles.stats) || {};
      if (!st.downloading && !st.parsing && !st.queued) {
        if (++quiet >= 8) { settled = true; break; }
      } else quiet = 0;
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const read = () => { const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    const toUrl = (px) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      ctx.putImageData(img, 0, 0);
      return c.toDataURL('image/png');
    };
    renderer.render(scene, camera);
    const shown = read();
    const bg = scene.background;
    const fog = scene.fog;
    let ColorC = bg?.isColor ? bg.constructor : null;
    if (!ColorC) scene.traverse((o) => { if (!ColorC && o.material?.color?.isColor) ColorC = o.material.color.constructor; });
    scene.background = new ColorC(1, 0, 1);
    scene.fog = null;
    renderer.render(scene, camera);
    const px = read();
    scene.background = bg;
    scene.fog = fog;
    t.markDirty();
    const sample = (tex, box, x, z) => {
      const c = tex?.image;
      if (!c?.getContext) return null;
      const u = (x - box.x) / box.z;
      const v = (z - box.y) / box.w;
      if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return null;
      return c.getContext('2d').getImageData(Math.floor(u * c.width), Math.floor((1 - v) * c.height), 1, 1).data;
    };
    const tally = { lot: 0, tree: 0, strip: 0, none: 0 };
    const where = [];
    let below = 0;
    let holes = 0;
    const dir = new V();
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const k = (y * w + x) * 4;
        dir.set(((x + 0.5) / w) * 2 - 1, ((y + 0.5) / h) * 2 - 1, 0.5).unproject(camera).sub(camera.position).normalize();
        if (dir.y > -0.12) continue;
        below++;
        if (!(px[k] > 235 && px[k + 1] < 25 && px[k + 2] > 235)) continue;
        holes++;
        if (where.length >= 1500) { tally.none++; continue; } // counted, not traced
        // Where the ray meets the model's ground.
        let s = 0;
        let gx = camera.position.x;
        let gz = camera.position.z;
        for (let step = 0; step < 1500; step++) {
          s += 2;
          gx = camera.position.x + dir.x * s;
          gz = camera.position.z + dir.z * s;
          if (camera.position.y + dir.y * s <= gAt(gx, gz)) break;
        }
        const lot = clip && sample(clip.uEcoMask.value, clip.uEcoBox.value, gx, gz);
        const near = clip && sample(clip.uEcoNear.value, clip.uEcoNearBox.value, gx, gz);
        let cls = 'none';
        if (lot && lot[0] > 127) cls = 'lot';
        else if (near && near[1] > 127) cls = 'tree';
        else if (near && near[2] > 127) cls = 'strip';
        tally[cls]++;
        where.push([Math.round(gx), Math.round(gz), cls]);
      }
    }
    // The cuts (lot red, trees green, strip blue) with the holes' ground points.
    let plan = null;
    if (holes && clip) {
      const nb = clip.uEcoNearBox.value;
      const lb = clip.uEcoBox.value;
      const P = 600;
      const pc = document.createElement('canvas');
      pc.width = P;
      pc.height = P;
      const pctx = pc.getContext('2d');
      pctx.fillStyle = '#222';
      pctx.fillRect(0, 0, P, P);
      pctx.globalAlpha = 0.7;
      if (clip.uEcoNear.value.image?.getContext) pctx.drawImage(clip.uEcoNear.value.image, 0, 0, P, P);
      if (clip.uEcoMask.value.image?.getContext) pctx.drawImage(clip.uEcoMask.value.image, ((lb.x - nb.x) / nb.z) * P, (1 - (lb.y + lb.w - nb.y) / nb.w) * P, (lb.z / nb.z) * P, (lb.w / nb.w) * P);
      pctx.globalAlpha = 1;
      pctx.fillStyle = '#ff00ff';
      for (const [x, z] of where) pctx.fillRect(((x - nb.x) / nb.z) * P - 1, (1 - (z - nb.y) / nb.w) * P - 1, 3, 3);
      plan = pc.toDataURL('image/png');
    }
    return { view: spec.name, settled, below, holes, tally, shown: toUrl(shown), holesImg: holes ? toUrl(px) : null, plan };
  })();
}

// In the page: Google's ground (after Real 3D's offset) minus the model's,
// over the street strip and the tree cuts.
function groundProbe() {
  const clip = window.__ecoClip;
  const g = window.__ecoGround;
  const tiles = window.__ecoTiles;
  const t = window.__ecoThree.current;
  const V = t.camera.position.constructor;
  const c = clip.uEcoNear.value.image;
  const box = clip.uEcoNearBox.value;
  if (!c?.getContext || !g) return { error: 'no masks' };
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const ray = new t.raycaster.constructor();
  const out = { strip: [], tree: [] };
  tiles.tiles.group.updateMatrixWorld(true);
  for (let j = 4; j < c.height; j += 24) {
    for (let i = 4; i < c.width; i += 24) {
      const k = (j * c.width + i) * 4;
      const cls = data[k + 2] > 127 ? 'strip' : data[k + 1] > 127 ? 'tree' : null;
      if (!cls) continue;
      const x = box.x + ((i + 0.5) / c.width) * box.z;
      const z = box.y + (1 - (j + 0.5) / c.height) * box.w;
      ray.set(new V(x, 1e5, z), new V(0, -1, 0));
      const ours = g.groundAt.current(x, z);
      // The lowest surface within 40 ft of the model's ground (the ground under any car or canopy).
      const near = ray.intersectObject(tiles.tiles.group, true).map((hh) => hh.point.y - (g.fix ? g.fix(x, z) : 0) - ours).filter((d) => Math.abs(d) < 40);
      out[cls].push(near.length ? Math.round(Math.min(...near) * 10) / 10 : null);
    }
  }
  const sum = (a) => {
    const v = a.filter((x) => x !== null).sort((p, q) => p - q);
    return { n: a.length, noHit: a.length - v.length, p10: v[Math.floor(v.length * 0.1)], p50: v[Math.floor(v.length * 0.5)], p90: v[Math.floor(v.length * 0.9)], over1_2ft: v.filter((x) => x > 1.2).length };
  };
  return { terrain: g.terrainSource, fixed: Boolean(g.fix), strip: sum(out.strip), tree: sum(out.tree) };
}

const results = fs.createWriteStream(path.join(outDir, 'results.jsonl'), { flags: 'a' });
for (const spec of specs) {
  const [src, n, label0] = spec.split('|');
  const label = label0 || `${path.basename(src)}-${n}`;
  page.events.length = 0;
  const url = `${BASE}/dev/render?src=${encodeURIComponent(src)}&n=${n}&view=design${MODEL ? '' : '&real=1'}${process.env.QA ? '&qa=1' : ''}`;
  const t0 = Date.now();
  await page.send('Page.navigate', { url });
  const ready = await page.waitFor(MODEL
    ? 'Boolean(window.__renderReady && window.__ecoThree?.current && window.__ecoGround)'
    : 'Boolean(window.__ecoTiles && !window.__ecoTiles.loading && window.__ecoTiles.holder.visible && window.__ecoThree?.current)', 150000, 1000);
  const row = { label, src, n, readySec: Math.round((Date.now() - t0) / 1000), ready: Boolean(ready), views: [] };
  if (ready) {
    if (!MODEL) {
      await page.waitFor('Boolean(window.__ecoGround?.fix)', 20000, 500);
      row.ground = await page.evaluate(`(${groundProbe.toString()})()`).catch((e) => ({ error: e.message }));
    }
    // Every texture in (the photographed ones load after the model shows, a
    // white stand-in until then).
    await page.waitFor(`(() => { let waiting = 0; window.__ecoThree.current.scene.traverse((o) => { const m = o.material; for (const k of ['map', 'normalMap']) { const img = m?.[k]?.image; if (img && (img.width || 0) <= 1) waiting++; } }); return waiting === 0; })()`, 20000, 500);
    const geo = await page.evaluate('(() => { const t = window.__ecoThree.current; return { maxDim: t.maxDim, front: t.front || null }; })()');
    const d = Math.max(60, geo.maxDim);
    const f = geo.front ? [geo.front.dx, geo.front.dz] : [0, 1];
    const all = [
      { name: 'top', pos: [0, d * 2.4, 0.01], tgt: [0, 0, 0] },
      ...[['front', f[0], f[1]], ['back', -f[0], -f[1]], ['left', -f[1], f[0]], ['right', f[1], -f[0]]].map(([name, dx, dz]) => ({ name, pos: [dx * d * 1.3, d * 0.95, dz * d * 1.3], tgt: [0, 0, 0] })),
      { name: 'street', pos: [f[0] * d * 1.1, 0, f[1] * d * 1.1], tgt: [0, 0, 0], eye: 5.5, street: f },
      // Closer, as the app opens on a property: for reviewing the model itself.
      { name: 'near', pos: [f[0] * d * 0.75, d * 0.55, f[1] * d * 0.75], tgt: [0, 0, 0] },
    ];
    const views = process.env.VIEWS ? all.filter((v) => process.env.VIEWS.split(',').includes(v.name)) : all.filter((v) => v.name !== 'near');
    for (const v of views) {
      try {
        const r = await page.evaluate(`(${inPage.toString()})(${JSON.stringify({ ...v, settleMs })})`);
        const save = (suffix, dataUrl) => dataUrl && fs.writeFileSync(path.join(outDir, `${label}-${v.name}${suffix}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
        save('', r.shown);
        save('-holes', r.holesImg);
        save('-plan', r.plan);
        delete r.shown;
        delete r.holesImg;
        delete r.plan;
        row.views.push(r);
      } catch (err) {
        row.views.push({ view: v.name, error: err.message.slice(0, 300) });
      }
    }
  }
  row.errors = page.events.filter((e) => e.kind !== 'warning').slice(0, 20);
  row.holes = row.views.reduce((a, v) => a + (v.holes || 0), 0);
  results.write(`${JSON.stringify(row)}\n`);
  console.log(label, row.ready ? `ready ${row.readySec}s` : 'NOT READY', `holes ${row.holes}`, row.views.map((v) => `${v.view}:${v.holes ?? 'err'}`).join(' '), row.ground ? `strip ground p50 ${row.ground.strip?.p50} ft, over 1.2 ft ${row.ground.strip?.over1_2ft}/${row.ground.strip?.n}` : '', row.errors.length ? `errors ${row.errors.length}` : '');
}
results.end();
page.close();
process.exit(0);
