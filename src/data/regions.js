// Resolve native plants from administrative geography, never climate alone.
import { PLANTS } from '@/data/nativePlants';
import { countryCodeFor, usRegionForState, usRegionForZip } from '@/data/locationRegions';

export const REGIONS = {
  // ── United States ────────────────────────────────────────────────────────
  pacific: {
    id: 'pacific',
    name: 'California',
    ecoregion: 'California chaparral, oak woodland & coastal scrub',
    states: 'CA',
    source: { label: 'Calscape — California Native Plant Society', url: 'https://calscape.org/' },
    defaultDesign: [
      { speciesId: 'purple-needlegrass', share: 0.18 },
      { speciesId: 'deer-grass', share: 0.12 },
      { speciesId: 'yarrow', share: 0.15 },
      { speciesId: 'california-poppy', share: 0.15 },
      { speciesId: 'california-fuchsia', share: 0.12 },
      { speciesId: 'hummingbird-sage', share: 0.1 },
      { speciesId: 'silver-lupine', share: 0.1 },
      { speciesId: 'california-sagebrush', share: 0.08 },
    ],
  },
  mountain: {
    id: 'mountain',
    name: 'Intermountain West',
    ecoregion: 'Sagebrush steppe, pinyon-juniper & montane foothills',
    states: 'AZ, CO, ID, NM, NV, UT, WY',
    source: { label: 'Plant Select — Colorado State University & Denver Botanic Gardens', url: 'https://plantselect.org/' },
    defaultDesign: [
      { speciesId: 'blue-grama', share: 0.2 },
      { speciesId: 'indian-ricegrass', share: 0.15 },
      { speciesId: 'firecracker-penstemon', share: 0.15 },
      { speciesId: 'four-o-clock-mountain', share: 0.15 },
      { speciesId: 'apache-plume', share: 0.12 },
      { speciesId: 'rubber-rabbitbrush', share: 0.12 },
      { speciesId: 'cliff-rose', share: 0.11 },
    ],
  },
  southcentral: {
    id: 'southcentral',
    name: 'South-Central Plains',
    ecoregion: 'Texas hill country, gulf prairie & cross timbers',
    states: 'TX, OK, AR, LA',
    source: { label: 'Lady Bird Johnson Wildflower Center — Texas natives', url: 'https://www.wildflower.org/collections/' },
    defaultDesign: [
      { speciesId: 'gulf-muhly', share: 0.18 },
      { speciesId: 'little-bluestem', share: 0.16 },
      { speciesId: 'prairie-verbena', share: 0.14 },
      { speciesId: 'rock-rose', share: 0.14 },
      { speciesId: 'blackfoot-daisy', share: 0.13 },
      { speciesId: 'blanket-flower', share: 0.13 },
      { speciesId: 'turks-cap', share: 0.12 },
    ],
  },
  prairie: {
    id: 'prairie',
    name: 'Central Prairies',
    ecoregion: 'Tallgrass prairie & oak savanna',
    states: 'IL, IN, OH, MI, WI, MN, IA, MO, KS, NE, ND, SD, MT',
    source: { label: 'Prairie Moon Nursery — native prairie plants', url: 'https://www.prairiemoon.com/' },
    defaultDesign: [
      { speciesId: 'little-bluestem', share: 0.18 },
      { speciesId: 'prairie-dropseed', share: 0.13 },
      { speciesId: 'butterfly-milkweed', share: 0.15 },
      { speciesId: 'black-eyed-susan', share: 0.14 },
      { speciesId: 'new-england-aster', share: 0.12 },
      { speciesId: 'wild-bergamot', share: 0.1 },
      { speciesId: 'golden-alexander', share: 0.1 },
      { speciesId: 'leadplant', share: 0.08 },
    ],
  },
  southeast: {
    id: 'southeast',
    name: 'Southeastern US',
    ecoregion: 'Longleaf pine, coastal plain & Piedmont',
    states: 'AL, FL, GA, MS, TN, KY, NC, SC, VA, WV',
    source: { label: 'Florida Wildflower Foundation — southeastern natives', url: 'https://flawildflowers.org/' },
    defaultDesign: [
      { speciesId: 'blanket-flower', share: 0.16 },
      { speciesId: 'stokes-aster', share: 0.14 },
      { speciesId: 'prairie-verbena', share: 0.14 },
      { speciesId: 'swamp-milkweed', share: 0.12 },
      { speciesId: 'cardinal-flower', share: 0.1 },
      { speciesId: 'inkberry', share: 0.12 },
      { speciesId: 'gulf-muhly', share: 0.12 },
      { speciesId: 'turks-cap', share: 0.1 },
    ],
  },
  midatlantic: {
    id: 'midatlantic',
    name: 'Mid-Atlantic',
    ecoregion: 'Eastern deciduous forest & meadow',
    states: 'NY, PA, NJ, DE, MD, DC',
    source: { label: 'Mt. Cuba Center — native plants of the eastern US', url: 'https://mtcubacenter.org/' },
    defaultDesign: [
      { speciesId: 'little-bluestem', share: 0.16 },
      { speciesId: 'northern-sea-oats', share: 0.1 },
      { speciesId: 'butterfly-milkweed', share: 0.15 },
      { speciesId: 'black-eyed-susan', share: 0.14 },
      { speciesId: 'new-england-aster', share: 0.12 },
      { speciesId: 'wild-bergamot', share: 0.1 },
      { speciesId: 'golden-alexander', share: 0.1 },
      { speciesId: 'joe-pye-weed', share: 0.13 },
    ],
  },
  northeast: {
    id: 'northeast',
    name: 'Northeast',
    ecoregion: 'Northern hardwood & coastal forest',
    states: 'CT, MA, ME, NH, RI, VT',
    source: { label: 'Native Plant Trust — northeastern natives', url: 'https://www.nativeplanttrust.org/' },
    defaultDesign: [
      { speciesId: 'little-bluestem', share: 0.16 },
      { speciesId: 'switchgrass', share: 0.1 },
      { speciesId: 'butterfly-milkweed', share: 0.15 },
      { speciesId: 'black-eyed-susan', share: 0.14 },
      { speciesId: 'new-england-aster', share: 0.12 },
      { speciesId: 'wild-bergamot', share: 0.1 },
      { speciesId: 'golden-alexander', share: 0.1 },
      { speciesId: 'cardinal-flower', share: 0.13 },
    ],
  },

  pacnw: {
    id: 'pacnw',
    name: 'Pacific Northwest',
    ecoregion: 'Cascadia lowland forest, oak savanna & subalpine meadow',
    states: 'WA, OR, BC',
    source: { label: 'Washington Native Plant Society — PNW natives', url: 'https://www.wnps.org/' },
    defaultDesign: [
      { speciesId: 'sword-fern', share: 0.16 },
      { speciesId: 'salal', share: 0.14 },
      { speciesId: 'oregon-grape', share: 0.13 },
      { speciesId: 'red-flowering-currant', share: 0.12 },
      { speciesId: 'common-camas', share: 0.12 },
      { speciesId: 'broadleaf-lupine', share: 0.11 },
      { speciesId: 'kinnikinnick', share: 0.1 },
      { speciesId: 'pacific-coast-iris', share: 0.12 },
    ],
  },

  // ── World regions ────────────────────────────────────────────────────────
  canada: {
    id: 'canada',
    name: 'Canada',
    ecoregion: 'Boreal forest, aspen parkland & northern prairie',
    states: 'AB, BC, MB, NB, NS, ON, QC, SK',
    source: { label: 'Canadian Wildlife Federation — native plants of Canada', url: 'https://cwf-fcf.org/en/resources/gardens-for-wildlife/' },
    defaultDesign: [
      { speciesId: 'canada-anemone', share: 0.16 },
      { speciesId: 'black-eyed-susan', share: 0.14 },
      { speciesId: 'new-england-aster', share: 0.13 },
      { speciesId: 'wild-bergamot', share: 0.12 },
      { speciesId: 'showy-milkweed', share: 0.12 },
      { speciesId: 'common-milkweed', share: 0.11 },
      { speciesId: 'red-osier-dogwood', share: 0.12 },
      { speciesId: 'serviceberry-canada', share: 0.1 },
    ],
  },
  mexico: {
    id: 'mexico',
    name: 'Mexico',
    ecoregion: 'Mexican oak-pine forest, desert scrub & tropical dry forest',
    states: 'MX',
    source: { label: 'CONABIO — Biodiversidad Mexicana', url: 'https://www.biodiversidad.gob.mx/' },
    defaultDesign: [
      { speciesId: 'mexican-agave', share: 0.18 },
      { speciesId: 'red-yucca', share: 0.16 },
      { speciesId: 'mexican-bush-sage', share: 0.15 },
      { speciesId: 'damianita', share: 0.14 },
      { speciesId: 'texas-sage', share: 0.13 },
      { speciesId: 'firecracker-penstemon', share: 0.12 },
      { speciesId: 'cliff-rose', share: 0.12 },
    ],
  },
  'british-isles': {
    id: 'british-isles',
    name: 'British Isles',
    ecoregion: 'British & Irish lowland meadow, hedgerow & woodland edge',
    states: 'England, Scotland, Wales, Northern Ireland, Ireland',
    source: { label: 'Plantlife — native plants of the UK & Ireland', url: 'https://www.plantlife.org.uk/' },
    defaultDesign: [
      { speciesId: 'common-knapweed', share: 0.16 },
      { speciesId: 'foxglove', share: 0.13 },
      { speciesId: 'red-campion', share: 0.13 },
      { speciesId: 'oxeye-daisy', share: 0.14 },
      { speciesId: 'field-scabious', share: 0.12 },
      { speciesId: 'greater-stitchwort', share: 0.1 },
      { speciesId: 'dog-rose', share: 0.12 },
      { speciesId: 'hawthorn-uk', share: 0.1 },
    ],
  },
  'western-europe': {
    id: 'western-europe',
    name: 'Western & Central Europe',
    ecoregion: 'Temperate deciduous forest, hay meadow & calcareous grassland',
    states: 'France, Germany, Belgium, Netherlands, Luxembourg, Austria, Switzerland, Poland',
    source: { label: 'Flora Europaea — European plant distributions', url: 'https://rbg-web2.rbge.org.uk/FE/fe.html' },
    defaultDesign: [
      { speciesId: 'common-knapweed', share: 0.16 },
      { speciesId: 'oxeye-daisy', share: 0.15 },
      { speciesId: 'field-scabious', share: 0.13 },
      { speciesId: 'salad-burnet', share: 0.12 },
      { speciesId: 'wild-mignonette', share: 0.12 },
      { speciesId: 'greater-knapweed', share: 0.12 },
      { speciesId: 'small-scabious', share: 0.1 },
      { speciesId: 'dog-rose', share: 0.1 },
    ],
  },
  mediterranean: {
    id: 'mediterranean',
    name: 'Mediterranean Europe',
    ecoregion: 'Mediterranean maquis, garrigue & drought-adapted scrub',
    states: 'Spain, Portugal, Italy, Greece, Malta, Cyprus, Croatia',
    source: { label: 'IUCN Mediterranean Plant Specialist Group', url: 'https://www.iucn.org/our-union/commissions/commission-ecosystem-management/our-work/specialist-groups/plant' },
    defaultDesign: [
      { speciesId: 'rock-rose-mediterranean', share: 0.16 },
      { speciesId: 'lavender-mediterranean', share: 0.15 },
      { speciesId: 'rosemary-mediterranean', share: 0.13 },
      { speciesId: 'thyme-mediterranean', share: 0.13 },
      { speciesId: 'cistus-mediterranean', share: 0.12 },
      { speciesId: 'phlomis-mediterranean', share: 0.12 },
      { speciesId: 'santolina-mediterranean', share: 0.1 },
      { speciesId: 'myrtle-mediterranean', share: 0.09 },
    ],
  },
  'northern-europe': {
    id: 'northern-europe',
    name: 'Northern Europe & Scandinavia',
    ecoregion: 'Boreal forest, subarctic meadow & coastal heath',
    states: 'Norway, Sweden, Denmark, Finland, Iceland, Estonia, Latvia, Lithuania',
    source: { label: 'Nordic native flora — Natural History Museum', url: 'https://www.nhm.uio.no/english/' },
    defaultDesign: [
      { speciesId: 'ling-heather', share: 0.18 },
      { speciesId: 'bilberry', share: 0.15 },
      { speciesId: 'cowberry', share: 0.14 },
      { speciesId: 'meadow-sweet-northern', share: 0.13 },
      { speciesId: 'wild-angelica', share: 0.12 },
      { speciesId: 'common-yarrow-northern', share: 0.13 },
      { speciesId: 'silver-birch', share: 0.15 },
    ],
  },
  australia: {
    id: 'australia',
    name: 'Australia',
    ecoregion: 'Australian sclerophyll forest, grassland & coastal heath',
    states: 'Australia',
    source: { label: 'Australian Native Plants Society — ANPSA', url: 'https://anpsa.org.au/' },
    defaultDesign: [
      { speciesId: 'kangaroo-paw', share: 0.16 },
      { speciesId: 'grevillea-coastal', share: 0.15 },
      { speciesId: 'bottlebrush-australia', share: 0.14 },
      { speciesId: 'westringia', share: 0.13 },
      { speciesId: 'lomandra-australia', share: 0.14 },
      { speciesId: 'callistemon-dwarf', share: 0.12 },
      { speciesId: 'correa-australia', share: 0.1 },
      { speciesId: 'banksia-dwarf', share: 0.06 },
    ],
  },
  'new-zealand': {
    id: 'new-zealand',
    name: 'New Zealand',
    ecoregion: 'New Zealand forest, shrubland & tussock grassland',
    states: 'New Zealand',
    source: { label: 'New Zealand Plant Conservation Network', url: 'https://www.nzpcn.org.nz/' },
    defaultDesign: [
      { speciesId: 'pohutukawa-nz', share: 0.14 },
      { speciesId: 'kowhai-nz', share: 0.15 },
      { speciesId: 'hebe-nz', share: 0.15 },
      { speciesId: 'leptinella-nz', share: 0.14 },
      { speciesId: 'carex-nz', share: 0.14 },
      { speciesId: 'flax-nz', share: 0.13 },
      { speciesId: 'coprosma-nz', share: 0.15 },
    ],
  },
  'southern-africa': {
    id: 'southern-africa',
    name: 'Southern Africa',
    ecoregion: 'Fynbos, grassland & savanna',
    states: 'South Africa, Botswana, Namibia, Zimbabwe',
    source: { label: 'SANBI — PlantZAfrica', url: 'https://www.plantzafrica.com/' },
    defaultDesign: [
      { speciesId: 'protea-dwarf', share: 0.14 },
      { speciesId: 'ericoid-fynbos', share: 0.15 },
      { speciesId: 'leonotis-africa', share: 0.14 },
      { speciesId: 'agapanthus-africa', share: 0.14 },
      { speciesId: 'dietes-africa', share: 0.14 },
      { speciesId: 'plumbago-africa', share: 0.13 },
      { speciesId: 'restio-fynbos', share: 0.16 },
    ],
  },
  'east-asia': {
    id: 'east-asia',
    name: 'East Asia',
    ecoregion: 'Temperate East Asian forest, meadow & woodland edge',
    states: 'Japan, Korea, China, Taiwan',
    source: { label: 'Kew Plants of the World Online — East Asian native ranges', url: 'https://powo.science.kew.org/' },
    defaultDesign: [
      { speciesId: 'japanese-silver-grass', share: 0.17 },
      { speciesId: 'ajuga-japan', share: 0.14 },
      { speciesId: 'aster-japan', share: 0.14 },
      { speciesId: 'miscanthus-japan', share: 0.13 },
      { speciesId: 'rhododendron-japan', share: 0.13 },
      { speciesId: 'hosta-japan', share: 0.12 },
      { speciesId: 'nandina-japan', share: 0.1 },
      { speciesId: 'sasa-bamboo', share: 0.07 },
    ],
  },
  'tropical-asia': {
    id: 'tropical-asia',
    name: 'Tropical & South Asia',
    ecoregion: 'Tropical monsoon forest, grassland & wetland edge',
    states: 'India, Sri Lanka, Thailand, Vietnam, Malaysia, Indonesia, Philippines',
    source: { label: 'Kew Plants of the World Online — tropical Asian native ranges', url: 'https://powo.science.kew.org/' },
    defaultDesign: [
      { speciesId: 'vetiver-asia', share: 0.17 },
      { speciesId: 'lemongrass-asia', share: 0.15 },
      { speciesId: 'curcuma-asia', share: 0.14 },
      { speciesId: 'hibiscus-asia', share: 0.14 },
      { speciesId: 'ixora-asia', share: 0.13 },
      { speciesId: 'cordyline-asia', share: 0.13 },
      { speciesId: 'pandanus-asia', share: 0.14 },
    ],
  },
  'south-america': {
    id: 'south-america',
    name: 'South America',
    ecoregion: 'Pampas, cerrado & Atlantic forest',
    states: 'Brazil, Argentina, Uruguay, Paraguay, Bolivia, Chile, Peru, Colombia',
    source: { label: 'Kew Plants of the World Online — South American native ranges', url: 'https://powo.science.kew.org/' },
    defaultDesign: [
      { speciesId: 'pampas-grass-sa', share: 0.16 },
      { speciesId: 'salvia-sa', share: 0.15 },
      { speciesId: 'verbena-sa', share: 0.14 },
      { speciesId: 'lantana-sa', share: 0.13 },
      { speciesId: 'stevia-sa', share: 0.13 },
      { speciesId: 'ruellia-sa', share: 0.13 },
      { speciesId: 'cedron-sa', share: 0.16 },
    ],
  },
};

// ISO-2 country code → region id.
const COUNTRY_MAP = {
  US: 'us-zip', // resolved by ZIP below
  CA: 'canada',
  MX: 'mexico',
  GB: 'british-isles',
  IE: 'british-isles',
  FR: 'western-europe',
  DE: 'western-europe',
  BE: 'western-europe',
  NL: 'western-europe',
  LU: 'western-europe',
  AT: 'western-europe',
  CH: 'western-europe',
  PL: 'western-europe',
  CZ: 'western-europe',
  SK: 'western-europe',
  HU: 'western-europe',
  ES: 'mediterranean',
  PT: 'mediterranean',
  IT: 'mediterranean',
  GR: 'mediterranean',
  MT: 'mediterranean',
  CY: 'mediterranean',
  HR: 'mediterranean',
  SI: 'mediterranean',
  RS: 'mediterranean',
  MK: 'mediterranean',
  AL: 'mediterranean',
  BA: 'mediterranean',
  ME: 'mediterranean',
  NO: 'northern-europe',
  SE: 'northern-europe',
  DK: 'northern-europe',
  FI: 'northern-europe',
  IS: 'northern-europe',
  EE: 'northern-europe',
  LV: 'northern-europe',
  LT: 'northern-europe',
  AU: 'australia',
  NZ: 'new-zealand',
  ZA: 'southern-africa',
  BW: 'southern-africa',
  NA: 'southern-africa',
  ZW: 'southern-africa',
  JP: 'east-asia',
  KR: 'east-asia',
  CN: 'east-asia',
  TW: 'east-asia',
  IN: 'tropical-asia',
  LK: 'tropical-asia',
  TH: 'tropical-asia',
  VN: 'tropical-asia',
  MY: 'tropical-asia',
  SG: 'tropical-asia',
  ID: 'tropical-asia',
  PH: 'tropical-asia',
  KH: 'tropical-asia',
  BR: 'south-america',
  AR: 'south-america',
  UY: 'south-america',
  PY: 'south-america',
  BO: 'south-america',
  CL: 'south-america',
  PE: 'south-america',
  EC: 'south-america',
  CO: 'south-america',
  VE: 'south-america',
};

const UNKNOWN_REGION = {
  id: 'unknown', name: 'your location', ecoregion: 'Local native range not yet covered',
  states: '', defaultDesign: [],
  source: { label: 'Kew Plants of the World Online — check native ranges', url: 'https://powo.science.kew.org/' },
};
const EXTRA_REGIONS = {
  alaska: { id: 'alaska', name: 'Alaska', ecoregion: 'Alaskan boreal forest, tundra and coastal habitats', states: 'AK', defaultDesign: [], source: { label: 'Alaska Native Plant Society', url: 'https://aknps.org/' } },
  hawaii: { id: 'hawaii', name: 'Hawaiʻi', ecoregion: 'Hawaiian coastal and island habitats', states: 'HI', defaultDesign: [], source: { label: 'Native Plants Hawaiʻi', url: 'http://nativeplants.hawaii.edu/' } },
};
export function regionForLocation(location = {}) {
  const cc = countryCodeFor(location);
  if (cc === 'US') {
    // An entered ZIP can be corrected independently of the original scan.
    const zipRegion = usRegionForZip(location.zip);
    return zipRegion !== 'unknown' ? zipRegion : usRegionForState(location.state);
  }
  if (cc === 'CA' && /^(BC|British Columbia)$/i.test(String(location.state || '').trim())) return 'pacnw';
  if (cc) return COUNTRY_MAP[cc] || 'unknown';
  // Numeric postcodes outside the US must never be interpreted as US ZIPs.
  return 'unknown';
}
export function regionForZip(zip) { return usRegionForZip(zip); }
export function regionForProject(project) {
  const id = regionForLocation(project || {});
  return REGIONS[id] || EXTRA_REGIONS[id] || { ...UNKNOWN_REGION, name: project?.country || project?.state || 'your location' };
}
export function plantsForRegion(regionId) {
  if (!regionId || regionId === 'unknown' || regionId === 'worldwide-temperate') return [];
  return PLANTS.filter((plant) => (plant.regions || ['pacific']).includes(regionId));
}
export function plantsForZip(zip) { return plantsForRegion(regionForZip(zip)); }
export function plantsForProject(project) {
  const cc = countryCodeFor(project || {});
  const state = String(project?.state || '').trim().toLowerCase().replace(/^[A-Z]{2}-/i, '');
  return plantsForRegion(regionForProject(project).id).filter((plant) =>
    (!plant.nativeCountries || plant.nativeCountries.includes(cc)) &&
    (!plant.nativeStates || (state && plant.nativeStates.some((value) => value.toLowerCase() === state)))
  );
}
export function defaultMixForProject(project) {
  const catalog = plantsForProject(project);
  const allowed = new Set(catalog.map((plant) => plant.id));
  const curated = regionForProject(project).defaultDesign.filter((entry) => allowed.has(entry.speciesId));
  const picks = curated.length >= 3 ? curated : catalog.slice(0, 8).map((plant) => ({ speciesId: plant.id, share: 1 }));
  const total = picks.reduce((sum, entry) => sum + entry.share, 0) || 1;
  return picks.map((entry) => ({ ...entry, share: entry.share / total }));
}