import { plantById } from '@/data/nativePlants';
import { defaultMixForProject, plantsForProject } from '@/data/regions';

export const ASSUMPTIONS = {
  installPerSqFt: 2.4,
  irrigationPerSqFt: 0.9,
  mulchPerSqFt: 0.35,
  waterRatePerGallon: 0.0065,
  turfGallonsPerSqFt: 46,
  nativeGallonsPerSqFt: 13.5,
  maintenancePerSqFt: 0.12,
  inputsPerSqFt: 0.042,
};

export const money = (n = 0) =>
  Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const num = (n = 0) => Math.round(Number(n) || 0).toLocaleString('en-US');

export function plantTotals(entries = []) {
  let count = 0;
  let cost = 0;
  const ids = new Set();
  entries.forEach((entry) => {
    const plant = plantById(entry.speciesId);
    if (!plant) return;
    count += entry.quantity || 0;
    cost += (entry.quantity || 0) * plant.cost;
    ids.add(plant.id);
  });
  return { count, cost, speciesCount: ids.size };
}

// Mulch: a 3" layer spread under each plant's mature canopy.
export const MULCH_DEPTH_FT = 0.25;
export const MULCH_BAG_CUFT = 2;

export function mulchPerPlant(plant) {
  if (!plant) return 0;
  const canopySqft = Math.PI * Math.pow(plant.w / 2, 2);
  return canopySqft * MULCH_DEPTH_FT;
}

export function mulchTotals(entries = []) {
  let cuft = 0;
  entries.forEach((entry) => {
    const plant = plantById(entry.speciesId);
    if (!plant) return;
    cuft += mulchPerPlant(plant) * (entry.quantity || 0);
  });
  return { cuft: Math.round(cuft), bags: Math.ceil(cuft / MULCH_BAG_CUFT) };
}

// `incentives` are the rebates that serve the property (useRebates / the
// findRebates function); without them no rebate is counted.
export function financials(project, entries = [], incentives = null) {
  const turfSqft = project?.breakdown?.turf || 0;
  const totals = plantTotals(entries);
  const install = Math.round(turfSqft * ASSUMPTIONS.installPerSqFt);
  const irrigation = Math.round(turfSqft * ASSUMPTIONS.irrigationPerSqFt);
  const mulch = Math.round(turfSqft * ASSUMPTIONS.mulchPerSqFt);
  const totalCost = totals.cost + install + irrigation + mulch;

  incentives ??= { rows: [], best: null, extras: [], total: 0, place: null };
  const rebate = incentives.total || 0;
  const outOfPocket = Math.max(0, totalCost - rebate);

  const gallonsBefore = Math.round(turfSqft * ASSUMPTIONS.turfGallonsPerSqFt);
  const gallonsAfter = Math.round(turfSqft * ASSUMPTIONS.nativeGallonsPerSqFt);
  const gallonsSaved = Math.max(0, gallonsBefore - gallonsAfter);

  const waterSavings = Math.round(gallonsSaved * ASSUMPTIONS.waterRatePerGallon);
  const maintenanceSavings = Math.round(turfSqft * ASSUMPTIONS.maintenancePerSqFt);
  const inputSavings = Math.round(turfSqft * ASSUMPTIONS.inputsPerSqFt);
  const annualSavings = waterSavings + maintenanceSavings + inputSavings;

  const payback = annualSavings > 0 ? outOfPocket / annualSavings : 0;

  const series = Array.from({ length: 11 }, (_, year) => ({
    year,
    net: Math.round(-outOfPocket + annualSavings * year),
  }));

  return {
    turfSqft,
    plantCount: totals.count,
    plantCost: totals.cost,
    install,
    irrigation,
    mulch,
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
}

export function environmental(project, entries = []) {
  const turfSqft = project?.breakdown?.turf || 0;
  const plants = entries.map((e) => plantById(e.speciesId)).filter(Boolean);
  const birds = plants.filter((p) => p.wildlife.includes('Birds')).length;
  const pollinators = plants.filter(
    (p) => p.wildlife.includes('Native bees') || p.wildlife.includes('Butterflies') || p.wildlife.includes('Hummingbirds')
  ).length;
  const habitatPoints = plants.reduce((sum, p) => sum + p.wildlife.length, 0);
  const before = 23;
  const after = Math.min(98, Math.round(30 + plants.length * 5 + habitatPoints * 1.5));
  return {
    speciesAdded: plants.length,
    birds,
    pollinators,
    before,
    after,
    convertedSqft: turfSqft,
    canopySqft: Math.round(plants.reduce((sum, p) => sum + (p.w * p.w) / 2, 0)),
  };
}

// Mature canopy clearance: the center-to-center distance so two plants of this
// species just touch at maturity (no overlap). Botanical planting distances
// (plant.spacing) are sometimes a touch tighter than the full mature width for
// massing — use the larger of the two so the grown-in model never overlaps.
export function clearanceOf(plant) {
  if (!plant) return 1;
  return Math.max(plant.spacing || 1, plant.w || 1);
}

// Front-yard arrays are sparse: cover roughly this fraction of the bed with
// mature canopies and cap any single species, so the yard reads as a curated
// mix rather than a nursery overflow.
const PLANT_DENSITY = 0.4;

export function quantityForShare(share, speciesId, sqft) {
  const plant = plantById(speciesId);
  if (!plant) return 1;
  const c = clearanceOf(plant);
  return Math.max(1, Math.round((share * PLANT_DENSITY * sqft) / (c * c)));
}

// Default palette: a layered mix of small plants only — grasses and a groundcover
// for texture and cover, flowers for season-long colour, and a couple of small
// shrubs for low structure. Large shrubs and trees are deliberately left out so a
// small yard fills with a rich, fine-textured planting; the user can add larger
// plants and trees from the species list when the site has room for them.
export function autoDesign(project) {
  const sqft = project?.breakdown?.turf || 1200;
  const picks = defaultMixForProject(project);
  return picks.map(({ speciesId, share }) => ({ speciesId, quantity: quantityForShare(share, speciesId, sqft) }));
}

// The design the later steps (Payoff, Build, Legacy) show: the saved one, or —
// before the user has saved any — the same auto-generated design the Design
// step starts from. Computed, not saved, so merely viewing a step never writes.
export function designOrDefault(project) {
  if (project?.design?.length) return project.design;
  if (!project) return [];
  return fitDesignToArea(autoDesign(project), project.breakdown?.turf || 0);
}

// Keep compatible saved choices; replace a legacy wrong-region default once.
export function designForProject(project) {
  if (!project?.design?.length) return project?.design || [];
  const allowed = new Set(plantsForProject(project).map((plant) => plant.id));
  const entries = project.design.filter((entry) => allowed.has(entry.speciesId));
  return entries.length ? entries : autoDesign(project);
}

export function suggestedQuantity(speciesId, turfSqft, speciesCount = 1) {
  const plant = plantById(speciesId);
  if (!plant) return 1;
  const c = clearanceOf(plant);
  const n = Math.max(1, speciesCount);
  // Each species gets an equal slice of the area's capacity at mature spacing,
  // so the total scales with the lawn area and the number of types in the mix.
  return Math.max(1, Math.round((PLANT_DENSITY * turfSqft) / (n * c * c)));
}

// Rescale a saved design's quantities to fit the current lawn area when the
// stored counts are clearly too low for it (e.g. designs created under the old
// per-species cap of 8). Keeps the user's species selection; recomputes each
// count from the area so the total scales with the lawn instead of staying
// stuck at the old cap.
export function fitDesignToArea(entries, turfSqft) {
  if (!entries?.length || !turfSqft) return entries;
  const floor = Math.max(1, Math.round(turfSqft / 100));
  const total = entries.reduce((s, e) => s + (e.quantity || 0), 0);
  if (total >= floor) return entries;
  const n = entries.length;
  return entries.map((e) => ({ ...e, quantity: suggestedQuantity(e.speciesId, turfSqft, n) }));
}