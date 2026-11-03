// Deterministic landscape math + design, server-side.
//
// Owns the financial, environmental, plant-count, mulch and default-design
// calculations that previously ran in the browser (src/lib/landscapeMath.js).
// The frontend sends the resolved plant traits (it already holds the catalog)
// so this function stays pure and needs no LLM and no plant database of its own.

import { rebatesFor } from '../../shared/rebates.ts';

const ASSUMPTIONS = {
  installPerSqFt: 2.4,
  irrigationPerSqFt: 0.9,
  mulchPerSqFt: 0.35,
  waterRatePerGallon: 0.0065,
  turfGallonsPerSqFt: 46,
  nativeGallonsPerSqFt: 13.5,
  maintenancePerSqFt: 0.12,
  inputsPerSqFt: 0.042,
};

const MULCH_DEPTH_FT = 0.25;
const MULCH_BAG_CUFT = 2;
const PLANT_DENSITY = 0.4;

// Rebates come from the programs that actually serve the property (see
// shared/rebates.ts); without a location there are none to count.
const NO_INCENTIVES = { rows: [], best: null, extras: [], total: 0, place: null };

async function incentivesFor(location, turfSqft) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return NO_INCENTIVES;
  try {
    return await rebatesFor(lat, lon, turfSqft);
  } catch (e) {
    console.warn('computeLandscape: rebate lookup failed', e?.message);
    return NO_INCENTIVES;
  }
}

function clearanceOf(plant) {
  if (!plant) return 1;
  return Math.max(plant.spacing || 1, plant.w || 1);
}

function quantityForShare(share, plant, sqft) {
  if (!plant) return 1;
  const c = clearanceOf(plant);
  return Math.max(1, Math.round((share * PLANT_DENSITY * sqft) / (c * c)));
}

function byId(catalog, id) {
  return Array.isArray(catalog) ? catalog.find((p) => p.id === id) : null;
}

export default async function (req) {
  try {
    const body = await req.json().catch(() => ({}));
    const turfSqft = Math.max(0, Math.round(Number(body?.turfSqft) || 0));
    // Caps well above any real design keep oversized requests cheap.
    const entries = Array.isArray(body?.entries) ? body.entries.slice(0, 500) : [];
    const catalog = Array.isArray(body?.catalog) ? body.catalog.slice(0, 3000).filter((p) => p && typeof p === 'object') : [];

    // Totals
    let count = 0;
    let cost = 0;
    const ids = new Set();
    entries.forEach((e) => {
      const qty = Math.max(0, Math.round(Number(e?.quantity) || 0));
      const unitCost = Number(e?.cost) || 0;
      count += qty;
      cost += qty * unitCost;
      if (e?.speciesId) ids.add(e.speciesId);
    });
    const totals = { count, cost, speciesCount: ids.size };

    // Mulch
    let cuft = 0;
    entries.forEach((e) => {
      const qty = Math.max(0, Math.round(Number(e?.quantity) || 0));
      const w = Number(e?.w) || 0;
      if (w > 0) cuft += Math.PI * Math.pow(w / 2, 2) * MULCH_DEPTH_FT * qty;
    });
    const mulch = { cuft: Math.round(cuft), bags: Math.ceil(cuft / MULCH_BAG_CUFT) };

    // Financials
    const install = Math.round(turfSqft * ASSUMPTIONS.installPerSqFt);
    const irrigation = Math.round(turfSqft * ASSUMPTIONS.irrigationPerSqFt);
    const mulchCost = Math.round(turfSqft * ASSUMPTIONS.mulchPerSqFt);
    const totalCost = cost + install + irrigation + mulchCost;
    const incentives = await incentivesFor(body?.location, turfSqft);
    const rebate = incentives.total;
    const outOfPocket = Math.max(0, totalCost - rebate);
    const gallonsBefore = Math.round(turfSqft * ASSUMPTIONS.turfGallonsPerSqFt);
    const gallonsAfter = Math.round(turfSqft * ASSUMPTIONS.nativeGallonsPerSqFt);
    const gallonsSaved = Math.max(0, gallonsBefore - gallonsAfter);
    const waterSavings = Math.round(gallonsSaved * ASSUMPTIONS.waterRatePerGallon);
    const maintenanceSavings = Math.round(turfSqft * ASSUMPTIONS.maintenancePerSqFt);
    const inputSavings = Math.round(turfSqft * ASSUMPTIONS.inputsPerSqFt);
    const annualSavings = waterSavings + maintenanceSavings + inputSavings;
    const payback = annualSavings > 0 ? outOfPocket / annualSavings : 0;
    const series = Array.from({ length: 11 }, (_, year) => ({ year, net: Math.round(-outOfPocket + annualSavings * year) }));
    const financials = {
      turfSqft,
      plantCount: count,
      plantCost: cost,
      install,
      irrigation,
      mulch: mulchCost,
      totalCost,
      rebate,
      outOfPocket,
      gallonsBefore,
      gallonsAfter,
      gallonsSaved,
      reductionPct: gallonsBefore ? Math.round((gallonsSaved / gallonsBefore) * 100) : 0,
      waterSavings,
      maintenanceSavings,
      inputSavings,
      annualSavings,
      payback,
      series,
      incentives,
      tenYearNet: Math.round(-outOfPocket + annualSavings * 10),
    };

    // Environmental
    const plants = entries
      .map((e) => ({ ...e, wildlife: Array.isArray(e?.wildlife) ? e.wildlife : [] }))
      .filter((e) => e && e.speciesId);
    const birds = plants.filter((p) => p.wildlife.includes('Birds') || p.wildlife.includes('Hummingbirds')).length;
    const pollinators = plants.filter(
      (p) => p.wildlife.includes('Native bees') || p.wildlife.includes('Butterflies') || p.wildlife.includes('Hummingbirds')
    ).length;
    const habitatPoints = plants.reduce((sum, p) => sum + p.wildlife.length, 0);
    const before = 23;
    const after = Math.min(98, Math.round(30 + plants.length * 5 + habitatPoints * 1.5));
    const environmental = {
      speciesAdded: plants.length,
      birds,
      pollinators,
      before,
      after,
      convertedSqft: turfSqft,
      canopySqft: Math.round(plants.reduce((sum, p) => sum + (Number(p.w) || 0) * (Number(p.w) || 0) / 2, 0)),
    };

    // Use only the location-resolved catalog. Never inject California defaults.
    const supplied = Array.isArray(body.defaultPalette) ? body.defaultPalette.slice(0, 20) : [];
    const valid = supplied.filter((entry) => byId(catalog, entry?.speciesId) && Number(entry.share) > 0);
    const palette = valid.length ? valid : catalog.slice(0, 8).map((plant) => ({ speciesId: plant.id, share: 1 }));
    const sum = palette.reduce((total, entry) => total + Number(entry.share), 0) || 1;
    const autoDesign = palette.map(({ speciesId, share }) => ({
      speciesId, quantity: quantityForShare(Number(share) / sum, byId(catalog, speciesId), turfSqft || 1200),
    }));

    return Response.json({ totals, mulch, financials, environmental, autoDesign });
  } catch (error) {
    console.error('computeLandscape failed:', error?.message);
    return Response.json({ error: error?.message || 'Could not compute landscape.' }, { status: 500 });
  }
}