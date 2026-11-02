// Rebates for a property: finds its water utility (EPA's community water
// system service areas) and its county, city, state and ZIP (US Census
// geocoder), then matches the programs in rebatePrograms.ts and estimates
// each one for the lawn area. Both lookups are free public services; results
// are cached by location.
import { PROGRAMS, type Program } from './rebatePrograms.ts';

const EPA_WATER_SYSTEMS =
  'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Water_System_Boundaries/FeatureServer/0/query';
const CENSUS_GEOGRAPHIES = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';

export type Place = {
  utilities: { pwsid: string; name: string; wholesale: boolean }[];
  zip: string | null;
  city: string | null;
  county: string | null;
  countyFips: string | null;
  state: string | null;
  stateFips: string | null;
};

const places = new Map<string, Promise<Place>>();

async function getJson(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`${new URL(url).host} returned ${r.status}`);
  return r.json();
}

async function waterUtilities(lat: number, lon: number) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'PWSID,PWS_Name,Service_Area_Type,Population_Served_Count',
    returnGeometry: 'false',
    f: 'json',
  });
  const data = await getJson(`${EPA_WATER_SYSTEMS}?${params}`);
  return (data.features ?? [])
    .map((f) => f.attributes)
    .map((a) => ({ pwsid: a.PWSID, name: titleCase(a.PWS_Name), wholesale: /wholesal/i.test(a.Service_Area_Type || ''), pop: a.Population_Served_Count || 0 }))
    .sort((a, b) => Number(a.wholesale) - Number(b.wholesale) || b.pop - a.pop)
    .map(({ pop: _pop, ...u }) => u);
}

async function censusPlace(lat: number, lon: number) {
  const params = new URLSearchParams({
    x: String(lon),
    y: String(lat),
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    layers: 'all',
    format: 'json',
  });
  const g = (await getJson(`${CENSUS_GEOGRAPHIES}?${params}`)).result?.geographies ?? {};
  const first = (name: string) => g[name]?.[0] ?? null;
  const zcta = Object.keys(g).find((k) => /ZIP Code Tabulation/i.test(k));
  const county = first('Counties');
  const state = first('States');
  const city = first('Incorporated Places') ?? first('Census Designated Places');
  return {
    zip: zcta ? g[zcta]?.[0]?.ZCTA5 ?? g[zcta]?.[0]?.BASENAME ?? null : null,
    city: city?.BASENAME ?? null,
    county: county?.NAME ?? null,
    countyFips: county?.GEOID ?? null,
    state: state?.NAME ?? null,
    stateFips: state?.GEOID ?? null,
  };
}

// EPA names are all caps ("PHOENIX CITY OF", "EAST BAY MUD"); make them readable.
const ACRONYMS = new Set(['MUD', 'PUD', 'MWD', 'CWD', 'WD', 'ID', 'CSD', 'PUC', 'USA', 'II', 'III', 'LLC']);
const titleCase = (s = '') =>
  s
    .split(/\s+/)
    .map((w) => (ACRONYMS.has(w.replace(/[^A-Z]/g, '')) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ')
    .replace(/\b(Of|And|The)\b/g, (m) => m.toLowerCase())
    .replace(/^(.+?),? (City|Town) of$/i, (_, name, kind) => `${kind} of ${name}`)
    .replace(/^./, (m) => m.toUpperCase());

/** The water utility, ZIP, city, county and state for a point, or null fields where a lookup failed. */
export function locate(lat: number, lon: number): Promise<Place> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (!places.has(key)) {
    const lookup = Promise.all([
      waterUtilities(lat, lon).catch((e) => (console.warn('rebates: EPA lookup failed', e.message), [])),
      censusPlace(lat, lon).catch((e) => (console.warn('rebates: Census lookup failed', e.message), {})),
    ]).then(([utilities, place]) => ({ utilities, zip: null, city: null, county: null, countyFips: null, state: null, stateFips: null, ...place }));
    places.set(key, lookup);
    // Don't keep a failed or partial lookup.
    lookup.then((p) => !p.utilities.length && !p.stateFips && places.delete(key));
    if (places.size > 2000) places.delete(places.keys().next().value);
  }
  return places.get(key);
}

function applies(program: Program, place: Place) {
  const { pwsids, counties, states } = program.where;
  if (pwsids?.some((id) => place.utilities.some((u) => u.pwsid === id))) return true;
  if (counties?.includes(place.countyFips ?? '')) return true;
  if (states?.includes(place.stateFips ?? '')) return true;
  return false;
}

/** Estimated dollars for this lawn area, or null when only a maximum is published. */
export function programAmount(p: Program, sqft: number): number | null {
  if (p.minSqft && sqft < p.minSqft) return 0;
  if (p.coupons) return Math.min(p.coupons.max, Math.floor(sqft / p.coupons.sqftEach)) * p.coupons.amount;
  if (p.tiers) {
    let left = sqft;
    let prev = 0;
    let total = 0;
    for (const t of p.tiers) {
      const band = Math.min(left, t.sqft - prev);
      total += band * t.rate;
      left -= band;
      prev = t.sqft;
      if (left <= 0) break;
    }
    return Math.round(p.capAmount ? Math.min(total, p.capAmount) : total);
  }
  if (p.perSqft) {
    const eligible = p.capSqft ? Math.min(sqft, p.capSqft) : sqft;
    const gross = eligible * p.perSqft;
    return Math.round(p.capAmount ? Math.min(gross, p.capAmount) : gross);
  }
  return null;
}

/**
 * Programs for a property and lawn size: { place, rows, best, extras, total }.
 * `total` counts the best lawn-replacement program plus add-ons that stack;
 * programs with only a published maximum are listed but not counted.
 */
export async function rebatesFor(lat: number, lon: number, turfSqft: number) {
  const place = await locate(lat, lon);
  let matched = PROGRAMS.filter((p) => applies(p, place));
  const replaced = new Set(matched.flatMap((p) => p.replaces ?? []));
  matched = matched.filter((p) => !replaced.has(p.id));
  const rows = matched.map((p) => {
    const amount = programAmount(p, turfSqft);
    return {
      id: p.id,
      name: p.name,
      provider: p.provider,
      url: p.url,
      verified: p.verified,
      kind: p.kind,
      desc: p.note,
      amount: amount ?? 0,
      upTo: amount == null ? p.upTo ?? null : null,
      stacks: p.kind === 'addon',
    };
  });
  const counted = rows.filter((r) => r.upTo == null);
  const best = counted.filter((r) => !r.stacks).sort((a, b) => b.amount - a.amount)[0] ?? null;
  const extras = counted.filter((r) => r.stacks);
  const total = (best?.amount ?? 0) + extras.reduce((s, r) => s + r.amount, 0);
  rows.sort((a, b) => (b === best ? 1 : 0) - (a === best ? 1 : 0) || b.amount - a.amount);
  return { place, rows, best, extras, total: Math.round(total) };
}
