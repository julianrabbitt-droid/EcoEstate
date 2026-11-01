// Impact math for tracked projects. Pure functions over a TrackedProject record
// and its ProgressEntry list. Anything that is modelled is returned as an
// "estimate"; anything derived from the user's own logged numbers is "measured".
// Missing inputs yield null (the UI shows "—") — nothing is ever invented.

// Same water model as the lawn API: a lawn needs ~45 in/yr of irrigation-equivalent
// water; native plantings cut that need by (0.8 - 0.3) = 50 percentage points;
// 1 inch over 1 sq ft = 0.623 gallons.
export const LAWN_INCHES_PER_YEAR = 45;
export const WATER_REDUCTION = 0.8 - 0.3;
export const GALLONS_PER_SQFT_INCH = 0.623;

const DAY_MS = 86_400_000;
const MEASURED_WINDOW = 3; // most recent metered entries averaged

const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Entries sorted oldest to newest. */
export function sortEntries(entries) {
  return [...(entries || [])].sort(byDate);
}

/** Latest cumulative converted sq ft: newest entry, else the project's stored value. */
export function convertedSqft(project, entries) {
  const sorted = sortEntries(entries).filter((e) => isNum(e.convertedSqft));
  if (sorted.length) return sorted[sorted.length - 1].convertedSqft;
  return isNum(project?.convertedSqft) ? project.convertedSqft : 0;
}

/** Share of the lawn converted, 0-100, or null when the lawn size is unknown. */
export function percentConverted(converted, lawnSqft) {
  if (!isNum(lawnSqft) || lawnSqft <= 0) return null;
  return Math.min(100, (converted / lawnSqft) * 100);
}

/** ESTIMATE: gallons of irrigation saved per year by `sqft` of converted lawn. */
export function estimatedWaterSavedPerYear(sqft) {
  return Math.round(sqft * LAWN_INCHES_PER_YEAR * WATER_REDUCTION * GALLONS_PER_SQFT_INCH);
}

/**
 * MEASURED: gallons saved per month = baseline monthly use minus the average
 * recent monthly use. Each metered entry is normalised to a 30-day month using
 * its billing period (waterDays). Null without a baseline or a metered entry.
 */
export function measuredWaterSavedPerMonth(project, entries) {
  const baseline = project?.baselineGallonsPerMonth;
  if (!isNum(baseline) || baseline <= 0) return null;
  const metered = sortEntries(entries).filter((e) => isNum(e.waterGallons) && isNum(e.waterDays) && e.waterDays > 0);
  if (!metered.length) return null;
  const recent = metered.slice(-MEASURED_WINDOW);
  const avg = recent.reduce((sum, e) => sum + (e.waterGallons / e.waterDays) * 30, 0) / recent.length;
  return baseline - avg;
}

/** Sum of a numeric entry field, ignoring blanks. */
export function total(entries, field) {
  return (entries || []).reduce((sum, e) => sum + (isNum(e[field]) ? e[field] : 0), 0);
}

/**
 * Full impact summary. `waterSource` says whether the yearly figure used for
 * money is 'measured' (from logged water bills) or 'estimate' (the model).
 */
export function summarize(project, entries) {
  const converted = convertedSqft(project, entries);
  const estYear = estimatedWaterSavedPerYear(converted);
  const measuredMonth = measuredWaterSavedPerMonth(project, entries);
  const measuredYear = measuredMonth == null ? null : measuredMonth * 12;

  const waterSource = measuredYear != null ? 'measured' : converted > 0 ? 'estimate' : null;
  const waterPerYear = measuredYear != null ? measuredYear : converted > 0 ? estYear : null;

  const price = project?.waterPricePer1000Gal;
  const hasPrice = isNum(price) && price > 0;
  const yearlySavings = waterPerYear != null && hasPrice ? (waterPerYear / 1000) * price : null;

  const spent = total(entries, 'spentUsd');
  const rebates = total(entries, 'rebateUsd');
  const netCost = spent - rebates;
  const loggedMoney = (entries || []).some((e) => isNum(e.spentUsd) || isNum(e.rebateUsd));
  const payback = yearlySavings != null && yearlySavings > 0 && loggedMoney && netCost > 0 ? netCost / yearlySavings : null;

  return {
    converted,
    percent: percentConverted(converted, project?.lawnSqft),
    plants: total(entries, 'plantsInstalled'),
    estWaterPerYear: converted > 0 ? estYear : null,
    measuredWaterPerYear: measuredYear,
    waterSource,
    waterPerYear,
    yearlySavings,
    spent: loggedMoney ? spent : null,
    rebates: loggedMoney ? rebates : null,
    netCost: loggedMoney ? netCost : null,
    // Net savings over a year, before payback: yearly savings minus net cost.
    netYearOne: yearlySavings != null && loggedMoney ? yearlySavings - netCost : null,
    payback,
  };
}

/** Chart series: cumulative converted sq ft per progress update. */
export function convertedSeries(entries) {
  return sortEntries(entries)
    .filter((e) => isNum(e.convertedSqft))
    .map((e) => ({ date: e.date, sqft: e.convertedSqft }));
}

/**
 * Chart series: cumulative spend (net of rebates) vs. cumulative water-bill
 * savings. Savings are an ESTIMATE accrued between updates from the modelled
 * water saved by the lawn converted so far; empty without a water price.
 */
export function moneySeries(project, entries) {
  const price = project?.waterPricePer1000Gal;
  const sorted = sortEntries(entries);
  let spend = 0;
  let savings = 0;
  let prevConverted = 0;
  let prevTime = null;
  return sorted.map((e) => {
    const time = new Date(e.date).getTime();
    if (prevTime != null && isNum(price) && price > 0 && Number.isFinite(time)) {
      const years = (time - prevTime) / DAY_MS / 365;
      savings += (estimatedWaterSavedPerYear(prevConverted) / 1000) * price * years;
    }
    spend += (isNum(e.spentUsd) ? e.spentUsd : 0) - (isNum(e.rebateUsd) ? e.rebateUsd : 0);
    if (isNum(e.convertedSqft)) prevConverted = e.convertedSqft;
    prevTime = Number.isFinite(time) ? time : prevTime;
    return { date: e.date, spend: Math.round(spend), savings: Math.round(savings) };
  });
}

/** Formatters that render missing values as an em dash. */
export const fmtNum = (v, digits = 0) =>
  v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits });
export const fmtUsd = (v) =>
  v == null ? '—' : `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString()}`;
