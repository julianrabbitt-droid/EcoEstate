// Finds a public, working parcel layer for every California county and writes
// lib/counties.json, which lib/parcels.js loads.
//
//   node scripts/discover-counties.mjs            full search for all 58 counties
//   node scripts/discover-counties.mjs --recheck  re-verify lib/counties.json; search again only where it fails
//
// For each county (boundary from the Census Bureau's TIGERweb):
//  1. search ArcGIS Online for public parcel services mentioning the county;
//  2. keep services whose extent matches the county (not one city, not the state);
//  3. pick a polygon layer with an APN-like field and check that
//     - parcels sampled across the county really lie inside the county
//       (a mislabelled layer can advertise the right extent), and
//     - a point query at a parcel's centre returns that parcel;
//  4. prefer layers titled as parcel/assessor data, then the one with the most
//     parcels: subsets (county-owned land, one program's parcels) cover the
//     county too but hold far fewer. Titles that name a subset come last.
// Layers checked by hand (PINNED) skip the search but are still verified.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, '..', 'lib', 'counties.json');
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query';
const SEARCH = 'https://www.arcgis.com/sharing/rest/search';

const PINNED = {
  'San Luis Obispo': { url: 'https://gis.slocounty.ca.gov/arcgis/rest/services/Public/SLO_CO_PARCELS/MapServer/0' },
  'Santa Barbara': { url: 'https://services3.arcgis.com/hMpg7vsYb74pEKjX/ArcGIS/rest/services/ParcelBaseMap/FeatureServer/0' },
  Ventura: { url: 'https://maps.ventura.org/arcgis/rest/services/DataDownloads/CommonData/MapServer/2' },
  Monterey: { url: 'https://maps.co.monterey.ca.us/server/rest/services/Land_Records/Parcels/MapServer/0' },
  'Los Angeles': { url: 'https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0' },
  // Search ranked a mislabelled Yuba County layer first.
  Plumas: { url: 'https://services1.arcgis.com/SIYkiqjmENweC50g/arcgis/rest/services/Plumas_County_Parcels/FeatureServer/0', idField: 'Name' },
  // Search ranked a consultant's traffic-study layer (overlapping zones) first.
  Fresno: { url: 'https://services6.arcgis.com/Gs01XZPFhKUG8tKU/arcgis/rest/services/Fresno_County_Parcels/FeatureServer/0' },
  // Not in ArcGIS Online search results; county's own server.
  Mono: { url: 'https://gis.mono.ca.gov/webgis/rest/services/OpenData/Cadastral/MapServer/1', idField: 'AsmtNum' },
};
// Counties served by a Socrata open-data API instead of ArcGIS.
const SOCRATA = {
  'San Francisco': {
    url: 'https://data.sf.gov/resource/acdm-wktn.geojson',
    geometryField: 'shape',
    where: 'active=true',
    idField: 'blklot',
    source: 'DataSF Parcels (Active and Retired)',
  },
};
const SUBSET = /owned|nurser|park|eligib|exempt|unincorporated|housing|_he_|\bhe\b|vacant|surplus|zoning|discovery|viable|williamson|ag_?preserve|fire|hazard|opportunit|vmt/i;
const PARCEL_TITLE = /parcel|apn|assess|cadastr|tax/i;
const ID_FIELD = /^(apn|ain|apn_?\d*|apnnodash|apn_d|parcel_?(id|no|num|number)?|parcelid|pin|asmt|asmtnum|assessment|assessor_?parcel.*)$/i;

async function getJson(url, ms = 20000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'error');
  return d;
}

const area = ([w, s, e, n]) => Math.max(0, e - w) * Math.max(0, n - s);
const overlap = (a, b) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);

function inRings([x, y], rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

async function counties() {
  const d = await getJson(`${TIGER}?where=STATE%3D%2706%27&outFields=NAME&returnGeometry=true&outSR=4326&maxAllowableOffset=0.005&f=json`, 60000);
  return d.features
    .map((f) => {
      const pts = f.geometry.rings.flat();
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      return { name: f.attributes.NAME, rings: f.geometry.rings, extent: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function candidates(short, extent) {
  const found = new Map();
  for (const q of [`parcels "${short} County"`, `parcel "${short}" county`, `"${short}" parcels`]) {
    const params = new URLSearchParams({ q: `${q} type:("Feature Service" OR "Map Service")`, num: '100', f: 'json' });
    let d;
    try {
      d = await getJson(`${SEARCH}?${params}`);
    } catch {
      continue;
    }
    for (const it of d.results ?? []) {
      if (!it.url || !it.extent?.length) continue;
      const box = [it.extent[0][0], it.extent[0][1], it.extent[1][0], it.extent[1][1]];
      const cover = overlap(box, extent) / area(extent); // share of the county covered
      const spill = area(box) / area(extent); // how much bigger than the county
      if (cover < 0.6 || spill > 4) continue;
      const score = cover - Math.abs(Math.log(spill)) * 0.2 + (/county|assessor/i.test(`${it.title} ${it.owner}`) ? 0.3 : 0) + (/parcel/i.test(it.title) ? 0.3 : 0);
      if (!found.has(it.url) || found.get(it.url).score < score) found.set(it.url, { url: it.url.replace(/\/+$/, ''), title: it.title, score });
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 8);
}

async function polygonLayers(serviceUrl) {
  if (/\/\d+$/.test(serviceUrl)) return [serviceUrl];
  const d = await getJson(`${serviceUrl}?f=json`);
  const layers = (d.layers ?? []).filter((l) => !l.subLayerIds?.length && (l.geometryType ?? 'esriGeometryPolygon') === 'esriGeometryPolygon');
  layers.sort((a, b) => Number(/parcel/i.test(b.name)) - Number(/parcel/i.test(a.name)));
  return layers.slice(0, 3).map((l) => `${serviceUrl}/${l.id}`);
}

const centre = (ring) => [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];

async function verify(layerUrl, county, idHint) {
  const meta = await getJson(`${layerUrl}?f=json`);
  if (meta.geometryType !== 'esriGeometryPolygon') return null;
  const idField = idHint ?? (meta.fields ?? []).find((f) => ID_FIELD.test(f.name))?.name;
  if (!idField) return null;

  // Sample parcels in a 3x3 grid over the county; most must fall inside it.
  const [w, s, e, n] = county.extent;
  const samples = [];
  for (let gx = 0; gx < 3; gx++) {
    for (let gy = 0; gy < 3; gy++) {
      const env = JSON.stringify({ xmin: w + ((e - w) * gx) / 3, ymin: s + ((n - s) * gy) / 3, xmax: w + ((e - w) * (gx + 1)) / 3, ymax: s + ((n - s) * (gy + 1)) / 3, spatialReference: { wkid: 4326 } });
      const d = await getJson(
        `${layerUrl}/query?${new URLSearchParams({ f: 'json', where: '1=1', geometry: env, geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', returnGeometry: 'true', outFields: idField, resultRecordCount: '2' })}`
      ).catch(() => null);
      for (const f of d?.features ?? []) if (f.geometry?.rings?.[0]?.length >= 4) samples.push(centre(f.geometry.rings[0]));
    }
  }
  if (!samples.length) return null;
  const insideShare = samples.filter((p) => inRings(p, county.rings)).length / samples.length;
  if (insideShare < 0.7) return null;

  const [cx, cy] = samples.find((p) => inRings(p, county.rings));
  const hit = await getJson(
    `${layerUrl}/query?${new URLSearchParams({ f: 'json', geometry: JSON.stringify({ x: cx, y: cy, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: idField, returnGeometry: 'true', resultRecordCount: '2' })}`
  );
  if (!hit.features?.length || !hit.features[0].geometry?.rings) return null;
  const count = await getJson(`${layerUrl}/query?${new URLSearchParams({ f: 'json', where: '1=1', returnCountOnly: 'true' })}`, 60000)
    .then((d) => d.count ?? 0)
    .catch(() => 0);
  return { idField, name: meta.name, count };
}

async function discover(county) {
  const short = county.name.replace(/ County$/, '');
  const pinned = PINNED[short];
  const tried = pinned ? [{ url: pinned.url, title: 'verified by hand', idField: pinned.idField }] : await candidates(short, county.extent);
  const passed = [];
  for (const cand of tried) {
    let layers = [];
    try {
      layers = await polygonLayers(cand.url);
    } catch {
      continue;
    }
    for (const layer of layers) {
      try {
        const ok = await verify(layer, county, cand.idField);
        if (ok) {
          const label = `${cand.title} ${ok.name} ${layer}`;
          passed.push({ ...ok, url: layer, title: cand.title, subset: SUBSET.test(label), parcelTitle: PARCEL_TITLE.test(label) });
        }
      } catch {
        /* try the next layer */
      }
    }
  }
  passed.sort((a, b) => Number(a.subset) - Number(b.subset) || Number(b.parcelTitle) - Number(a.parcelTitle) || b.count - a.count);
  // Hand-checked layers stay even if the automatic check can't finish (very
  // large counties' sample queries can time out).
  if (!passed.length && pinned) {
    console.warn(`  ! ${county.name}: automatic check failed, keeping the hand-checked layer`);
    return { best: { url: pinned.url, title: 'verified by hand', idField: pinned.idField ?? 'apn', count: null, subset: false }, tried: 1 };
  }
  return { best: passed[0], tried: tried.length };
}

const entry = (county, best) => {
  const key = county.name.replace(/ County$/, '').toLowerCase().replace(/[^a-z]+/g, '-');
  const extent = county.extent.map((v) => Number(v.toFixed(3)));
  if (!best) return { key, county: county.name, url: null, extent };
  return { key, county: county.name, label: `${county.name} parcel map`, url: best.url, source: best.title, idField: best.idField, parcels: best.count, partial: best.subset, extent };
};

const recheck = process.argv.includes('--recheck');
const previous = recheck && fs.existsSync(OUT) ? Object.fromEntries(JSON.parse(fs.readFileSync(OUT, 'utf8')).map((c) => [c.county, c])) : {};
const results = [];
for (const county of await counties()) {
  const short = county.name.replace(/ County$/, '');
  let result;
  if (SOCRATA[short]) {
    const key = short.toLowerCase().replace(/[^a-z]+/g, '-');
    result = { key, county: county.name, label: `${county.name} parcel map`, type: 'socrata', ...SOCRATA[short], extent: county.extent.map((v) => Number(v.toFixed(3))) };
  } else {
    const prev = previous[county.name];
    let best = null;
    if (prev?.url && !PINNED[short]) {
      const ok = await verify(prev.url, county, prev.idField).catch(() => null);
      if (ok) best = { ...ok, url: prev.url, title: prev.source, subset: prev.partial };
    }
    if (!best) best = (await discover(county)).best;
    result = entry(county, best);
  }
  results.push(result);
  const status = !result.url ? 'NONE' : result.partial ? 'PART' : 'OK  ';
  console.log(`${status} ${county.name.padEnd(24)} ${result.url ? `${String(result.parcels ?? '').padStart(8)}  ${result.source}  ${result.url}` : ''}`);
}
fs.writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`);
console.log(`\n${results.filter((r) => r.url).length}/${results.length} counties with a working parcel layer -> ${path.relative(process.cwd(), OUT)}`);
