// How evenly each arrangement covers real lawns: for every scan file given
// (GET /v1/lawn responses) and every arrangement, lays the plants out as the
// 3D view does and measures, over a 1 ft grid inside the lawns:
//   gap  the largest distance from any point to its nearest plant, in plant
//        spacings (1 is perfectly even; over ~1.6 reads as a bare patch);
//   bare the share of lawn further than one spacing from every plant;
//   close the closest two plants, in spacings (under ~0.5 reads as crowded);
//   count plants drawn vs listed.
//   node scripts/layout-check.mjs scan1.json scan2.json …
import fs from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { arrangePlants, preparePolys } = await server.ssrLoadModule('/src/lib/gardenLayout.js');
const { ARRANGEMENTS } = await server.ssrLoadModule('/src/data/arrangements.js');
const { quantityForShare } = await server.ssrLoadModule('/src/lib/landscapeMath.js');
const { geoJsonOuterRings } = await server.ssrLoadModule('/src/lib/geo.js');

const inPoly = (x, y, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) c = !c;
  }
  return c;
};

const rows = [];
for (const file of process.argv.slice(2)) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!(d.lawnSqft > 0)) continue;
  const project = { boundary: geoJsonOuterRings(d.lawn), breakdown: { turf: d.lawnSqft } };
  const polys = preparePolys(project);
  for (const arr of ARRANGEMENTS) {
    const entries = arr.species.map((s) => ({ speciesId: s.speciesId, quantity: quantityForShare(s.share, s.speciesId, d.lawnSqft) }));
    const listed = entries.reduce((a, e) => a + e.quantity, 0);
    const placed = arrangePlants(polys, entries, arr.pattern);
    if (!placed.length) {
      rows.push([d.address.slice(0, 32), arr.id, arr.pattern, 0, listed, '-', '-', '-']);
      continue;
    }
    const spacing = Math.sqrt(polys.reduce((a, p) => a + Math.abs(p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0)) / 2, 0) / placed.length);
    let worst = 0;
    let bare = 0;
    let total = 0;
    for (const poly of polys) {
      const xs = poly.map((p) => p[0]);
      const ys = poly.map((p) => p[1]);
      for (let x = Math.min(...xs); x < Math.max(...xs); x += 1) {
        for (let y = Math.min(...ys); y < Math.max(...ys); y += 1) {
          if (!inPoly(x, y, poly)) continue;
          let m = Infinity;
          for (const p of placed) m = Math.min(m, Math.hypot(p.x - x, p.y - y));
          worst = Math.max(worst, m);
          total++;
          if (m > spacing) bare++;
        }
      }
    }
    let close = Infinity;
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) close = Math.min(close, Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y));
    rows.push([d.address.slice(0, 32), arr.id, arr.pattern, placed.length, listed, (worst / spacing).toFixed(2), `${Math.round((bare / Math.max(1, total)) * 100)}%`, (close / spacing).toFixed(2)]);
  }
}
console.log(['property', 'arrangement', 'pattern', 'drawn', 'listed', 'gap', 'bare', 'close'].join('\t'));
for (const r of rows) console.log(r.join('\t'));
await server.close();
