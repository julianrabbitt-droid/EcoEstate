// What went wrong across a city-test run (scripts/city-test.mjs): issue rates
// per city and per house type, the numbers behind them, and the worst homes
// for each issue, to look at side by side (compare.html). With a second run,
// the rates before and after on the homes both scanned (matched by address).
//
//   node scripts/analyze-runs.mjs <runDir> [--vs <earlierRunDir>]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const runDir = args[0];
const vsDir = args.includes('--vs') ? args[args.indexOf('--vs') + 1] : null;

function load(dir) {
  const rows = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl') && !x.includes('.assessor'))) {
    const city = f.replace(/\.jsonl$/, '');
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).forEach((l, i) => rows.push({ ...JSON.parse(l), city, n: i + 1 }));
  }
  return rows;
}
const houses = (d) => d.diag?.houses?.houses || [];
const openSqft = (d) => Math.max(1, d.diag.lot - d.diag.roof - d.diag.tree);
const ISSUES = {
  'missed green (>300 sq ft)': (d) => d.diag.missedGreen > 300,
  'missed smooth flat green (>300)': (d) => d.diag.missedGreen - (d.diag.missedRough || 0) - (d.diag.missedLumpy || 0) > 300,
  'non-green lawn (>30% of lawn)': (d) => d.lawnSqft > 100 && d.diag.lawnBrown > 0.3 * d.lawnSqft,
  'paving over plants (>100)': (d) => d.diag.pavedGreen > 100,
  'ragged paving shapes': (d) => d.diag.pavedRagged > 0,
  'bare ground unassigned (>25% open)': (d) => d.diag.bareUnclaimed > 0.25 * openSqft(d),
  'pool water missed (>100)': (d) => d.diag.blueMissed > 100,
  'footprint over open ground (<85%)': (d) => houses(d).some((h) => h.coverage !== null && h.coverage < 0.85),
  'building beside outline (>200)': (d) => (d.diag.houses?.spillSqft || 0) > 200,
  'height off >5 ft': (d) => houses(d).some((h) => h.heightErrFt !== null && Math.abs(h.heightErrFt) > 5),
  'no lidar height': (d) => !houses(d).some((h) => h.heightSource === 'lidar'),
};
const pct = (xs, f) => (xs.length ? `${Math.round((100 * xs.filter(f).length) / xs.length)}%` : '-');
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

const rows = load(runDir);
const ok = rows.filter((d) => d.ok && d.diag);
console.log(`${rows.length} scans, ${ok.length} with checks, ${rows.length - ok.length} failed`);
rows.filter((d) => !d.ok).slice(0, 8).forEach((d) => console.log(`  FAILED ${d.city} ${d.address}: ${String(d.error).slice(0, 90)}`));

const cities = [...new Set(ok.map((d) => d.city))].sort();
console.log(`\nISSUE RATES BY CITY\n${pad('issue', 38)}${cities.map((c) => lpad(c.slice(0, 10), 11)).join('')}${lpad('all', 7)}`);
for (const [name, f] of Object.entries(ISSUES)) console.log(`${pad(name, 38)}${cities.map((c) => lpad(pct(ok.filter((d) => d.city === c), f), 11)).join('')}${lpad(pct(ok, f), 7)}`);

const types = (d) => {
  const h = houses(d).slice().sort((a, b) => b.sqft - a.sqft)[0] || {};
  const g = d.diag;
  return [
    (h.flatShare || 0) > 0.6 ? 'flat roof' : 'pitched roof',
    (g.houses?.lotReliefFt || 0) > 20 ? 'hillside lot (>20 ft)' : 'flat lot',
    (h.sqft || 0) < 1500 ? 'small house <1500' : (h.sqft || 0) > 3000 ? 'large house >3000' : 'mid house',
    d.pools ? 'has pool' : 'no pool',
    g.tree > 0.3 * g.lot ? 'tree-heavy lot' : 'open lot',
    d.lawnSqft ? 'lawn found' : 'no lawn found',
  ];
};
const groups = new Map();
ok.forEach((d) => types(d).forEach((t) => groups.set(t, [...(groups.get(t) || []), d])));
const short = Object.keys(ISSUES).map((k) => k.split(' ').slice(0, 2).join(' ').slice(0, 11));
console.log(`\nISSUE RATES BY HOUSE TYPE\n${pad('type', 24)}${lpad('n', 5)}${short.map((s) => lpad(s, 12)).join('')}`);
for (const [t, xs] of [...groups.entries()].sort()) console.log(`${pad(t, 24)}${lpad(xs.length, 5)}${Object.values(ISSUES).map((f) => lpad(pct(xs, f), 12)).join('')}`);

const hs = ok.flatMap(houses);
const errs = hs.map((h) => h.heightErrFt).filter((e) => e !== null && e !== undefined);
console.log('\nNUMBERS');
if (errs.length) console.log(`height error: median ${median(errs)} ft, |err| > 5 ft ${errs.filter((e) => Math.abs(e) > 5).length}/${errs.length}`);
const cov = hs.map((h) => h.coverage).filter((c) => c !== null && c !== undefined);
if (cov.length) console.log(`footprint coverage: median ${median(cov)}, under 0.85 ${cov.filter((c) => c < 0.85).length}/${cov.length}`);
console.log(`pools: ${ok.reduce((a, d) => a + (d.pools || 0), 0)} in ${ok.filter((d) => d.pools).length} homes`);
console.log(`lawn share of lot (median): ${cities.map((c) => `${c} ${median(ok.filter((d) => d.city === c).map((d) => d.lawnShare || 0))}`).join(', ')}`);
console.log(`terrain with the scan: ${ok.filter((d) => d.terrain).length}/${ok.length}; seconds per scan (median): ${median(ok.map((d) => d.seconds))}`);

console.log('\nWORST HOMES (city n address: value)');
const worst = {
  missedGreen: (d) => d.diag.missedGreen,
  bareUnclaimed: (d) => d.diag.bareUnclaimed,
  blueMissed: (d) => d.diag.blueMissed,
  spill: (d) => d.diag.houses?.spillSqft || 0,
  heightErr: (d) => Math.max(0, ...houses(d).map((h) => Math.abs(h.heightErrFt ?? 0))),
};
for (const [k, f] of Object.entries(worst)) console.log(`  ${k}: ${ok.slice().sort((a, b) => f(b) - f(a)).slice(0, 6).map((d) => `${d.city.slice(0, 4)} ${d.n} ${d.address}: ${f(d)}`).join(' | ')}`);

if (vsDir) {
  const key = (d) => `${d.city}|${d.address}`;
  const before = new Map(load(vsDir).filter((d) => d.ok && d.diag).map((d) => [key(d), d]));
  const both = ok.filter((d) => before.has(key(d)));
  const B = both.map((d) => before.get(key(d)));
  console.log(`\nBEFORE → AFTER on ${both.length} homes both runs scanned`);
  for (const [name, f] of Object.entries(ISSUES)) console.log(`${pad(name, 38)}${lpad(pct(B, f), 6)} → ${pct(both, f)}`);
  const sum = (xs) => xs.reduce((a, d) => a + (d.lawnSqft || 0), 0);
  console.log(`lawn total ${sum(B)} → ${sum(both)} sq ft; homes with no lawn ${B.filter((d) => !d.lawnSqft).length} → ${both.filter((d) => !d.lawnSqft).length}; pools ${B.reduce((a, d) => a + (d.pools || 0), 0)} → ${both.reduce((a, d) => a + (d.pools || 0), 0)}`);
}
