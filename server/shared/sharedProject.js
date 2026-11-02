// What a member may attach to a community post about their project: a
// summary only. Whatever the browser sends, only these fields survive, so an
// address, coordinates, lot outline, satellite view or account details can
// never be published through a post. The city is free text but capped, and
// anything that looks like a street address is refused.

const STREET = /\d+\s+[a-z0-9.' -]*\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place|ter|terrace|cir|circle|hwy|pkwy)\b/i;

const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : null;
};

/** The safe summary of a shared project, or null when nothing usable is left. */
export function sanitizeSharedProject(p) {
  if (!p || typeof p !== 'object') return null;
  const city = text(p.city, 80);
  const out = {
    city: city && !STREET.test(city) ? city : '',
    lawnSqft: num(p.lawnSqft, 1_000_000),
    plantCount: num(p.plantCount, 1_000_000),
    plants: (Array.isArray(p.plants) ? p.plants : [])
      .slice(0, 20)
      .map((x) => ({ name: text(x?.name, 60), count: num(x?.count, 100_000) }))
      .filter((x) => x.name && !STREET.test(x.name)),
    arrangement: text(p.arrangement, 60),
    gallonsSaved: num(p.gallonsSaved, 1e9),
    annualSavings: num(p.annualSavings, 1e8),
    installCost: num(p.installCost, 1e8),
    rebate: num(p.rebate, 1e8),
    co2PerYear: num(p.co2PerYear, 1e8),
    paybackYears: Number.isFinite(Number(p.paybackYears)) && Number(p.paybackYears) > 0 ? Math.min(Math.round(Number(p.paybackYears) * 10) / 10, 200) : null,
  };
  if (STREET.test(out.arrangement)) out.arrangement = '';
  return out.lawnSqft || out.plants.length ? out : null;
}
