// The payoff's inputs: our estimates for the property (from computeLandscape),
// any of which the owner can replace with their own numbers (the rate on
// their water bill, their gardener's bill, a contractor's quote, the rebate
// they were approved for), with the money math redone from them.

export const PAYOFF_FIELDS = [
  { key: 'waterRate', group: 'water', label: 'Water rate', unit: '$ per 1,000 gal', step: 0.1, hint: 'From your water bill. Billed per unit (748 gal)? Divide that price by 0.748.' },
  { key: 'lawnGallons', group: 'water', label: 'Lawn watering now', unit: 'gal per sq ft a year', step: 1 },
  { key: 'gardenGallons', group: 'water', label: 'Native garden watering', unit: 'gal per sq ft a year', step: 0.5 },
  { key: 'increase', group: 'water', label: 'Water rates rise', unit: '% a year', step: 0.5 },
  { key: 'upkeep', group: 'yearly', label: 'Mowing and lawn care', unit: '$ a year', step: 10 },
  { key: 'inputs', group: 'yearly', label: 'Fertilizer and weed killer', unit: '$ a year', step: 5 },
  { key: 'plants', group: 'cost', label: 'Native plants', unit: '$', step: 10 },
  { key: 'install', group: 'cost', label: 'Installation labor', unit: '$ (0 if you do it yourself)', step: 50 },
  { key: 'irrigation', group: 'cost', label: 'Drip irrigation', unit: '$', step: 25 },
  { key: 'mulch', group: 'cost', label: 'Mulch and soil prep', unit: '$', step: 10 },
  { key: 'rebate', group: 'cost', label: 'Rebates you’ll get', unit: '$', step: 25 },
];

const DEFAULT_INCREASE_PCT = 3; // US water rates have risen faster than inflation for decades
const round = (v, places) => Math.round(v * 10 ** places) / 10 ** places;

/** Our estimate for every field, from the computed financials. */
export function payoffEstimates(fin) {
  const turf = fin?.turfSqft || 0;
  return {
    waterRate: fin?.gallonsSaved > 0 ? round((fin.waterSavings / fin.gallonsSaved) * 1000, 2) : 6.5,
    lawnGallons: turf ? round(fin.gallonsBefore / turf, 1) : 46,
    gardenGallons: turf ? round(fin.gallonsAfter / turf, 1) : 13.5,
    increase: DEFAULT_INCREASE_PCT,
    upkeep: fin?.maintenanceSavings || 0,
    inputs: fin?.inputSavings || 0,
    plants: fin?.plantCost || 0,
    install: fin?.install || 0,
    irrigation: fin?.irrigation || 0,
    mulch: fin?.mulch || 0,
    rebate: fin?.rebate || 0,
  };
}

/** Only the fields the person set, as finite, non-negative numbers. */
export function cleanPayoffInputs(mine) {
  const out = {};
  for (const { key } of PAYOFF_FIELDS) {
    const v = Number(mine?.[key]);
    if (mine?.[key] !== '' && mine?.[key] != null && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}

/**
 * The financials redone with the person's numbers in place of ours. Adds
 * `increase` (a fraction a year) and `edited` (whether any number is theirs).
 */
export function applyPayoffInputs(fin, mine) {
  if (!fin) return fin;
  const own = cleanPayoffInputs(mine);
  const v = { ...payoffEstimates(fin), ...own };
  const turf = fin.turfSqft || 0;
  const gallonsBefore = Math.round(turf * v.lawnGallons);
  const gallonsAfter = Math.round(turf * Math.min(v.gardenGallons, v.lawnGallons));
  const gallonsSaved = Math.max(0, gallonsBefore - gallonsAfter);
  const waterSavings = Math.round((gallonsSaved * v.waterRate) / 1000);
  const maintenanceSavings = Math.round(v.upkeep);
  const inputSavings = Math.round(v.inputs);
  const totalCost = Math.round(v.plants + v.install + v.irrigation + v.mulch);
  const rebate = Math.round(Math.min(v.rebate, totalCost));
  const outOfPocket = Math.max(0, totalCost - rebate);
  const annualSavings = waterSavings + maintenanceSavings + inputSavings;
  return {
    ...fin,
    gallonsBefore,
    gallonsAfter,
    gallonsSaved,
    reductionPct: gallonsBefore ? Math.round((gallonsSaved / gallonsBefore) * 100) : 0,
    waterSavings,
    maintenanceSavings,
    inputSavings,
    annualSavings,
    plantCost: Math.round(v.plants),
    install: Math.round(v.install),
    irrigation: Math.round(v.irrigation),
    mulch: Math.round(v.mulch),
    totalCost,
    rebate,
    outOfPocket,
    payback: annualSavings > 0 ? outOfPocket / annualSavings : 0,
    increase: v.increase / 100,
    edited: Object.keys(own).length > 0,
  };
}

/**
 * Money saved by the end of year `y`: the first year's savings, growing by
 * `increase` a year as water and lawn-care prices rise.
 */
export function savedBy(annual, increase, y) {
  if (annual <= 0 || y <= 0) return 0;
  return increase > 0 ? (annual * (Math.pow(1 + increase, y) - 1)) / increase : annual * y;
}

/**
 * When the running total crosses zero: fractional years from now, between
 * the yearly points (the chart joins them with straight lines), or null if
 * it never does within the series.
 */
export function breakEvenYears(series) {
  if (!series?.length) return null;
  if (series[0].net >= 0) return 0;
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1];
    const b = series[i];
    if (b.net >= 0) return a.year + ((0 - a.net) / (b.net - a.net)) * (b.year - a.year);
  }
  return null;
}

const storeKey = (projectId) => `ecoestate.payoffInputs.${projectId}`;
/** The person's numbers for a property, kept in this browser. */
export function readPayoffInputs(projectId) {
  try {
    return JSON.parse(localStorage.getItem(storeKey(projectId)) || '{}') || {};
  } catch {
    return {};
  }
}
export function savePayoffInputs(projectId, mine) {
  try {
    const own = cleanPayoffInputs(mine);
    if (Object.keys(own).length) localStorage.setItem(storeKey(projectId), JSON.stringify(own));
    else localStorage.removeItem(storeKey(projectId));
  } catch {
    /* private browsing: kept for this visit only */
  }
}
