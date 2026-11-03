// Every page at desktop and phone widths in headless Chrome: exceptions,
// console errors, failed requests, the page scrolling sideways, elements past
// the screen's edge (outside sideways-scrolling strips), and a screenshot.
//
//   node scripts/page-sweep.mjs <outDir> [baseUrl] [scan.json]
//
// baseUrl defaults to the local dev server. With a saved scan (city-test
// output), a guest project is made from it in local storage so the project's
// own pages are covered too. ROUTES=/a,/b and SIZE=desktop|phone narrow it.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, sleep } from './lib/headless.mjs';

const [outDir, base = 'http://localhost:5173', scanJson] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node scripts/page-sweep.mjs <outDir> [baseUrl] [scan.json]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const SIZES = [
  { name: 'desktop', width: 1280, height: 800, mobile: false },
  { name: 'phone', width: 390, height: 844, mobile: true },
].filter((z) => !process.env.SIZE || z.name === process.env.SIZE);
const PROJECT_ID = 'page-sweep-project';
const routes = process.env.ROUTES
  ? process.env.ROUTES.split(',')
  : ['/', '/why-native', '/examples', '/installs', '/community', '/cities', '/plans', '/beta', '/privacy', '/terms', '/cookies', '/refunds', '/my-projects', '/login', '/register', '/no-such-page'];
if (scanJson && !process.env.ROUTES) routes.push(`/project/${PROJECT_ID}`, ...['design', 'impact', 'plan'].map((s) => `/project/${PROJECT_ID}/${s}`));

// A guest project from a saved scan, as the scan page would keep it.
function seedProject(d, id) {
  const rings = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : []);
  const ll = (ring) => ring.map(([lon, lat]) => [lat, lon]);
  const project = {
    id, address: d.address, center: [d.location.lat, d.location.lon], boundary: (d.lawn?.features || []).flatMap((f) => rings(f.geometry)).map(ll),
    totalSqft: d.lawnSqft, breakdown: { turf: d.lawnSqft, beds: 0, bare: 0 }, lotOutline: ll(rings(d.parcel.geometry)[0]), lotSizeSqft: d.parcel.areaSqft,
    buildings: (d.buildings?.features || []).map((f) => ll(rings(f.geometry)[0])), buildingHeightsFt: (d.buildings?.features || []).map((f) => f.properties.heightFt),
    trees: (d.trees || []).map((t) => ({ latLng: [t.lat, t.lon], radiusFt: t.radiusFt, heightFt: t.heightFt })), terrain: d.terrain || null,
    scanSource: 'satellite', design: [], createdAt: new Date().toISOString(), city: 'Test', state: 'CA', zip: '90000', countryCode: 'US',
  };
  return `localStorage.setItem('understory.projects.v1', ${JSON.stringify(JSON.stringify([project]))}); true`;
}

const out = fs.createWriteStream(path.join(outDir, 'pages.jsonl'));
let problems = 0;
for (const size of SIZES) {
  const page = await openPage(size);
  if (scanJson) {
    await page.send('Page.navigate', { url: base });
    await sleep(2500);
    await page.evaluate(seedProject(JSON.parse(fs.readFileSync(scanJson, 'utf8')), PROJECT_ID));
  }
  for (const route of routes) {
    page.events.length = 0;
    const t0 = Date.now();
    await page.send('Page.navigate', { url: base + route });
    await sleep(route.startsWith('/project') ? 9000 : 4500);
    let layout;
    try {
      layout = await page.evaluate(`(() => {
        const W = document.documentElement.clientWidth;
        const scrolls = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
        const past = [];
        for (const el of document.querySelectorAll('body *')) {
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || st.position === 'fixed' || el.closest('canvas, .leaflet-container')) continue;
          const r = el.getBoundingClientRect();
          if (r.width && r.height && (r.right > W + 2 || r.left < -2) && !scrolls(el)) past.push((el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ').slice(0, 3).join('.')).slice(0, 80) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
        }
        return { sideways: document.documentElement.scrollWidth > W + 1, past: past.slice(0, 8), pastCount: past.length, title: document.title };
      })()`);
    } catch (err) {
      layout = { error: err.message.slice(0, 200) };
    }
    const name = `${size.name}${route.replace(/[/:]+/g, '_')}`;
    await page.screenshot(path.join(outDir, `${name}.png`));
    const errors = page.events.filter((e) => e.kind !== 'warning');
    if (errors.length || layout.sideways || layout.pastCount) problems++;
    out.write(`${JSON.stringify({ size: size.name, route, ms: Date.now() - t0, errors, ...layout })}\n`);
    console.log(size.name.padEnd(8), route.padEnd(36), errors.length ? `errors ${errors.length}: ${errors.slice(0, 2).map((e) => `[${e.kind}] ${e.text.slice(0, 90)}`).join(' | ')}` : 'ok', layout.sideways ? 'SCROLLS SIDEWAYS' : '', layout.pastCount ? `past the edge: ${layout.past.slice(0, 2).join(', ')}` : '');
  }
  page.close();
}
out.end();
console.log(problems ? `${problems} page(s) with problems` : 'no problems');
process.exit(0);
