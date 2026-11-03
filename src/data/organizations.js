// Each organization lists exactly where it runs planting projects (cities,
// counties, region, state). `organizationsFor(project, tier)` returns matches
// for a geographic range, where tier widens the net:
//   0 = city/zip, 1 = + county, 2 = + region, 3 = + statewide
// A Palo Alto property starts with the mid-Peninsula groups that plant
// right there, then "See more" widens to county, region, and finally statewide
// programs — never empty, always locally ordered.

const STATE_ALIASES = {
  california: 'CA', ca: 'CA',
  oregon: 'OR', or: 'OR',
  washington: 'WA', wa: 'WA',
  nevada: 'NV', nv: 'NV',
  arizona: 'AZ', az: 'AZ',
};

// Bay Area city -> county, so a project's city is enough to match county-scoped
// orgs without storing county on the project.
const CITY_COUNTY = {
  'Palo Alto': 'Santa Clara',
  'East Palo Alto': 'San Mateo',
  'Mountain View': 'Santa Clara',
  'Menlo Park': 'San Mateo',
  'Sunnyvale': 'Santa Clara',
  'Cupertino': 'Santa Clara',
  'Santa Clara': 'Santa Clara',
  'San Jose': 'Santa Clara',
  'Los Altos': 'Santa Clara',
  'Los Altos Hills': 'Santa Clara',
  'Redwood City': 'San Mateo',
  'San Mateo': 'San Mateo',
  'Burlingame': 'San Mateo',
  'Foster City': 'San Mateo',
  'Belmont': 'San Mateo',
  'San Carlos': 'San Mateo',
  'Half Moon Bay': 'San Mateo',
  'Oakland': 'Alameda',
  'Berkeley': 'Alameda',
  'Fremont': 'Alameda',
  'Hayward': 'Alameda',
  'Pleasanton': 'Alameda',
  'Livermore': 'Alameda',
  'San Francisco': 'San Francisco',
  'Daly City': 'San Mateo',
  'South San Francisco': 'San Mateo',
  'Pacifica': 'San Mateo',
  'San Rafael': 'Marin',
  'Mill Valley': 'Marin',
  'Novato': 'Marin',
  'Santa Rosa': 'Sonoma',
  'Petaluma': 'Sonoma',
  'Napa': 'Napa',
  'Vallejo': 'Solano',
  'Fairfield': 'Solano',
  'Concord': 'Contra Costa',
  'Walnut Creek': 'Contra Costa',
  'Richmond': 'Contra Costa',
  'Los Gatos': 'Santa Clara',
  'Saratoga': 'Santa Clara',
  'Campbell': 'Santa Clara',
  'Milpitas': 'Santa Clara',
  'Newark': 'Alameda',
  'Union City': 'Alameda',
  'Los Angeles': 'Los Angeles',
  'Long Beach': 'Los Angeles',
  'Pasadena': 'Los Angeles',
  'San Diego': 'San Diego',
  'Santa Barbara': 'Santa Barbara',
  'Ventura': 'Ventura',
  'San Luis Obispo': 'San Luis Obispo',
  'Sacramento': 'Sacramento',
  'Fresno': 'Fresno',
  'Stockton': 'San Joaquin',
  'Modesto': 'Stanislaus',
};

// County -> broader region of California, used for the region tier.
const COUNTY_REGION = {
  'Santa Clara': 'Bay Area', 'San Mateo': 'Bay Area', 'Alameda': 'Bay Area',
  'Contra Costa': 'Bay Area', 'San Francisco': 'Bay Area', 'Marin': 'Bay Area',
  'Solano': 'Bay Area', 'Napa': 'North Coast', 'Sonoma': 'North Coast',
  'Los Angeles': 'Southern California', 'Orange': 'Southern California',
  'San Diego': 'Southern California', 'Riverside': 'Southern California',
  'San Bernardino': 'Southern California',
  'Ventura': 'Central Coast', 'Santa Barbara': 'Central Coast',
  'San Luis Obispo': 'Central Coast', 'Monterey': 'Central Coast',
  'Santa Cruz': 'Central Coast',
  'San Joaquin': 'Central Valley', 'Stanislaus': 'Central Valley',
  'Fresno': 'Central Valley', 'Sacramento': 'Central Valley',
  'Kern': 'Central Valley', 'Merced': 'Central Valley', 'Yolo': 'Central Valley',
  'El Dorado': 'Sierra', 'Placer': 'Sierra', 'Nevada': 'Sierra',
};

function stateCode(s) {
  if (!s) return '';
  const v = String(s).trim().toLowerCase();
  return STATE_ALIASES[v] || (v.length === 2 ? v.toUpperCase() : v);
}

function normalizeCity(c) {
  if (!c) return '';
  return String(c).trim();
}

export const ORGANIZATIONS = [
  // --- Mid-Peninsula / Santa Clara & San Mateo (city tier) ---
  {
    id: 'canopy',
    name: 'Canopy',
    kind: 'Community installation',
    area: 'Palo Alto, East Palo Alto, Mountain View, Menlo Park',
    desc: 'Mid-Peninsula urban forestry nonprofit: volunteer tree planting and care days, and free trees for eligible East Palo Alto and Belle Haven homes.',
    url: 'https://www.canopy.org',
    contact: 'Volunteer and free-tree programs',
    serves: { cities: ['Palo Alto', 'East Palo Alto', 'Mountain View', 'Menlo Park', 'Belle Haven'], region: 'Bay Area', state: 'CA' },
    highlight: true,
  },
  {
    id: 'grassroots-ecology',
    name: 'Grassroots Ecology',
    kind: 'Community installation',
    area: 'Santa Clara & San Mateo Counties',
    desc: 'Volunteer habitat restoration in parks, open spaces and along creeks across the Peninsula and South Bay, with a native plant nursery.',
    url: 'https://www.grassrootsecology.org',
    contact: 'Volunteer restoration days',
    serves: { cities: ['Palo Alto', 'East Palo Alto', 'Mountain View', 'Los Altos', 'Los Altos Hills', 'Sunnyvale', 'Cupertino', 'Menlo Park', 'Redwood City', 'San Carlos'], counties: ['Santa Clara', 'San Mateo'], region: 'Bay Area', state: 'CA' },
  },
  {
    id: 'acterra',
    name: 'Acterra',
    kind: 'Stewardship & planting',
    area: 'Palo Alto & Peninsula',
    desc: 'Mid-Peninsula environmental nonprofit with volunteer habitat restoration days and resources for climate-friendly homes.',
    url: 'https://acterra.org',
    contact: 'Habitat volunteer programs',
    serves: { cities: ['Palo Alto', 'East Palo Alto', 'Mountain View', 'Menlo Park', 'Los Altos'], region: 'Bay Area', state: 'CA' },
  },
  {
    id: 'cnps-scv',
    name: 'CNPS Santa Clara Valley Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'Santa Clara County',
    desc: 'Native plant sales in spring and fall, garden tours and talks. Good for local-origin plants and expert advice.',
    url: 'https://www.cnps.org/chapter/santa-clara-valley/',
    contact: 'Chapter plant sales',
    serves: { cities: ['Palo Alto', 'Mountain View', 'Sunnyvale', 'Cupertino', 'Santa Clara', 'San Jose', 'Los Altos', 'Saratoga', 'Los Gatos', 'Campbell', 'Milpitas'], counties: ['Santa Clara'], region: 'Bay Area', state: 'CA' },
  },
  // --- Bay Area county tier ---
  {
    id: 'rescape',
    name: 'ReScape California',
    kind: 'Qualified landscapers',
    area: 'Bay Area & Central Valley',
    desc: 'ReScape California (formerly Bay-Friendly Landscaping): a directory of landscape professionals trained in watershed-friendly, native-first landscaping, for when you want a paid crew.',
    url: 'https://rescapeca.org',
    contact: 'Professional directory',
    serves: { counties: ['Santa Clara', 'San Mateo', 'Alameda', 'Contra Costa', 'San Francisco', 'Marin', 'Sonoma', 'Solano', 'Napa'], region: 'Bay Area', state: 'CA' },
  },
  {
    id: 'our-city-forest',
    name: 'Our City Forest',
    kind: 'Community installation',
    area: 'San Jose & Santa Clara County',
    desc: 'San Jose urban forestry nonprofit: free trees through grant programs, volunteer planting days, and Lawn Busters lawn-to-garden conversions.',
    url: 'https://www.ourcityforest.org',
    contact: 'Free trees and Lawn Busters',
    serves: { cities: ['San Jose', 'Santa Clara', 'Sunnyvale', 'Campbell', 'Milpitas'], counties: ['Santa Clara'], region: 'Bay Area', state: 'CA' },
  },
  {
    id: 'friends-urban-forest',
    name: 'Friends of the Urban Forest',
    kind: 'Community installation',
    area: 'San Francisco',
    desc: 'San Francisco nonprofit planting street trees and sidewalk gardens with neighbors and volunteers across the city.',
    url: 'https://www.fuf.net',
    contact: 'Volunteer planting programs',
    serves: { cities: ['San Francisco'], counties: ['San Francisco'], region: 'Bay Area', state: 'CA' },
  },
  {
    id: 'cnps-santa-clara',
    name: 'CNPS East Bay Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'Alameda & Contra Costa Counties',
    desc: 'East Bay chapter that runs Native Here Nursery in Berkeley, with plant lists, talks and garden advice for Alameda and Contra Costa.',
    url: 'https://www.ebcnps.org',
    contact: 'Native Here Nursery',
    serves: { cities: ['Oakland', 'Berkeley', 'Fremont', 'Hayward', 'Pleasanton', 'Livermore', 'Concord', 'Walnut Creek', 'Richmond'], counties: ['Alameda', 'Contra Costa'], region: 'Bay Area', state: 'CA' },
  },
  // --- Bay Area region tier (peninsula/wider) ---
  {
    id: 'cnps-santa-cruz',
    name: 'CNPS Santa Cruz County Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'Santa Cruz & San Mateo coast',
    desc: 'Santa Cruz County chapter with native plant sales, talks and local plant lists for coastal yards.',
    url: 'https://www.cruzcnps.org',
    contact: 'Chapter plant sales',
    serves: { cities: ['Half Moon Bay', 'Pacifica'], counties: ['San Mateo', 'Santa Cruz'], region: 'Central Coast', state: 'CA' },
  },
  {
    id: 'audubon-golden-gate',
    name: 'Golden Gate Audubon',
    kind: 'Habitat volunteers',
    area: 'Bay Area',
    desc: 'Bird-habitat restoration volunteer days in Bay Area parks and shorelines, and advice on bird-friendly native gardens.',
    url: 'https://goldengateaudubon.org',
    contact: 'Habitat volunteer programs',
    serves: { region: 'Bay Area', state: 'CA' },
  },
  // --- North Coast region ---
  {
    id: 'cnps-milo-baker',
    name: 'CNPS Milo Baker Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'Sonoma County',
    desc: 'Sonoma County chapter with spring and fall native plant sales, talks and field trips.',
    url: 'https://www.milobaker.cnps.org',
    contact: 'Chapter plant sales',
    serves: { cities: ['Santa Rosa', 'Petaluma', 'San Rafael', 'Novato', 'Mill Valley'], counties: ['Sonoma', 'Marin'], region: 'North Coast', state: 'CA' },
  },
  // --- Central Coast region ---
  {
    id: 'santa-barbara-botanic-garden',
    name: 'Santa Barbara Botanic Garden',
    kind: 'Nursery & advice',
    area: 'Santa Barbara & Ventura Counties',
    desc: 'California native botanic garden with a native plant nursery and classes on gardening with natives.',
    url: 'https://www.sbbg.org',
    contact: 'Native plant nursery',
    serves: { counties: ['Santa Barbara', 'Ventura', 'San Luis Obispo'], region: 'Central Coast', state: 'CA' },
  },
  {
    id: 'channel-islands-restoration',
    name: 'Channel Islands Restoration',
    kind: 'Stewardship & planting',
    area: 'Ventura & Santa Barbara Counties',
    desc: 'Volunteer habitat restoration in Ventura and Santa Barbara counties and on the Channel Islands, with a native plant nursery.',
    url: 'https://www.cirweb.org',
    contact: 'Volunteer restoration days',
    serves: { counties: ['Ventura', 'Santa Barbara'], region: 'Central Coast', state: 'CA' },
  },
  // --- Central Valley / Sierra ---
  {
    id: 'river-partners',
    name: 'River Partners',
    kind: 'Stewardship & planting',
    area: 'Central Valley',
    desc: 'Large-scale river habitat restoration across the Central Valley, with volunteer planting days.',
    url: 'https://www.riverpartners.org',
    contact: 'Volunteer planting days',
    serves: { counties: ['San Joaquin', 'Stanislaus', 'Fresno', 'Sacramento'], region: 'Central Valley', state: 'CA' },
  },
  {
    id: 'cnps-north-san-joaquin',
    name: 'CNPS North San Joaquin Valley Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'San Joaquin, Stanislaus & Merced',
    desc: 'Valley chapter with native plant sales, talks and plant lists for hot, dry valley gardens.',
    url: 'https://chapters.cnps.org/nsj/',
    contact: 'Chapter plant sales',
    serves: { counties: ['San Joaquin', 'Stanislaus', 'Merced'], region: 'Central Valley', state: 'CA' },
  },
  {
    id: 'cnps-sacramento-valley',
    name: 'CNPS Sacramento Valley Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'Sacramento region',
    desc: 'Online native plant sales every spring and fall, with garden design help and plant lists for the Sacramento Valley.',
    url: 'https://www.sacvalleycnps.org',
    contact: 'Chapter plant sales',
    serves: { counties: ['Sacramento', 'Yolo', 'Placer'], region: 'Central Valley', state: 'CA' },
  },
  {
    id: 'tuolumne-river-trust',
    name: 'Tuolumne River Trust',
    kind: 'Stewardship & planting',
    area: 'Stanislaus & San Joaquin Counties',
    desc: 'River conservation group with volunteer cleanups and restoration days along the Tuolumne around Modesto.',
    url: 'https://www.tuolumne.org',
    contact: 'Volunteer river days',
    serves: { counties: ['Stanislaus', 'San Joaquin'], region: 'Central Valley', state: 'CA' },
  },
  {
    id: 'cnps-redbud',
    name: 'CNPS Redbud Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'Nevada & Placer counties',
    desc: 'Spring and fall native plant sales, gardening-with-natives guides and local plant lists for the Sierra foothills.',
    url: 'https://chapters.cnps.org/redbud/',
    contact: 'Chapter plant sales',
    serves: { counties: ['Nevada', 'Placer'], region: 'Sierra', state: 'CA' },
  },
  {
    id: 'cnps-el-dorado',
    name: 'CNPS El Dorado Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'El Dorado County',
    desc: 'Native plant sales, gardening resources and a Homegrown Habitat group for foothill gardens.',
    url: 'https://www.eldoradocnps.org',
    contact: 'Chapter plant sales',
    serves: { counties: ['El Dorado'], region: 'Sierra', state: 'CA' },
  },
  // --- Southern California ---
  {
    id: 'theodore-payne',
    name: 'Theodore Payne Foundation',
    kind: 'Nursery & advice',
    area: 'Los Angeles & Southern California',
    desc: 'Sun Valley native plant nursery and education center selling California natives and seed, with classes on native gardening.',
    url: 'https://theodorepayne.org',
    contact: 'Native plant nursery',
    serves: { cities: ['Los Angeles', 'Pasadena', 'Long Beach'], counties: ['Los Angeles'], region: 'Southern California', state: 'CA' },
  },
  {
    id: 'treepeople',
    name: 'TreePeople',
    kind: 'Community installation',
    area: 'Los Angeles region',
    desc: 'Los Angeles nonprofit with volunteer tree planting and care events and classes on water-wise gardening.',
    url: 'https://www.treepeople.org',
    contact: 'Volunteer planting programs',
    serves: { cities: ['Los Angeles', 'Long Beach', 'Pasadena'], counties: ['Los Angeles'], region: 'Southern California', state: 'CA' },
  },
  {
    id: 'california-botanic-garden',
    name: 'California Botanic Garden',
    kind: 'Nursery & advice',
    area: 'Claremont & Inland Empire',
    desc: 'Claremont botanic garden devoted to California natives, with a native plant nursery and gardening classes.',
    url: 'https://www.calbg.org',
    contact: 'Native plant nursery',
    serves: { counties: ['Los Angeles', 'San Bernardino', 'Riverside'], region: 'Southern California', state: 'CA' },
  },
  {
    id: 'mountains-restoration-trust',
    name: 'Mountains Restoration Trust',
    kind: 'Stewardship & planting',
    area: 'Santa Monica Mountains',
    desc: 'Volunteer habitat restoration in the Santa Monica Mountains.',
    url: 'https://www.mountainstrust.org',
    contact: 'Volunteer restoration days',
    serves: { counties: ['Los Angeles', 'Ventura'], region: 'Southern California', state: 'CA' },
  },
  {
    id: 'cnps-san-diego',
    name: 'CNPS San Diego Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'San Diego County',
    desc: 'San Diego chapter with native plant sales, garden tours and native gardening help.',
    url: 'https://www.cnpssd.org',
    contact: 'Chapter plant sales',
    serves: { cities: ['San Diego'], counties: ['San Diego'], region: 'Southern California', state: 'CA' },
  },
  {
    id: 'cnps-orange-county',
    name: 'CNPS Orange County Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'Orange County',
    desc: 'Native garden tour, gardening-with-natives classes, a list of public native gardens and a directory of native landscapers in Orange County.',
    url: 'https://chapters.cnps.org/oc/',
    contact: 'Garden tour and classes',
    serves: { counties: ['Orange'], region: 'Southern California', state: 'CA' },
  },
  {
    id: 'laguna-canyon-foundation',
    name: 'Laguna Canyon Foundation',
    kind: 'Stewardship & planting',
    area: 'South Orange County',
    desc: 'Volunteer trail and habitat restoration days in the South Coast Wilderness around Laguna Beach, October through June.',
    url: 'https://lagunacanyon.org',
    contact: 'Volunteer days',
    serves: { cities: ['Laguna Beach', 'Laguna Niguel', 'Laguna Hills', 'Laguna Woods', 'Aliso Viejo', 'Irvine', 'Newport Beach'], counties: ['Orange'], region: 'Southern California', state: 'CA' },
  },
  // --- Statewide (tier 3) ---
  {
    id: 'cnps',
    name: 'California Native Plant Society',
    kind: 'Statewide chapters',
    area: 'California',
    desc: 'Your nearest CNPS chapter runs native plant sales, garden tours and talks. Start here for local experts anywhere in California.',
    url: 'https://www.cnps.org',
    contact: 'Find your chapter',
    serves: { states: ['CA'], region: 'California' },
  },
  {
    id: 'xerces-society',
    name: 'Xerces Society',
    kind: 'Pollinator habitat',
    area: 'California',
    desc: 'Pollinator-conservation nonprofit with regional lists of native plants for bees and butterflies.',
    url: 'https://xerces.org/pollinator-conservation/pollinator-friendly-plant-lists',
    contact: 'Pollinator plant lists',
    serves: { states: ['CA'], region: 'California' },
  },
  {
    id: 'audubon-ca',
    name: 'Audubon California',
    kind: 'Bird-friendly yards',
    area: 'California',
    desc: 'Plants for Birds: guidance on native plants that feed birds, from Audubon California and its local chapters.',
    url: 'https://ca.audubon.org',
    contact: 'Plants for Birds',
    serves: { states: ['CA'], region: 'California' },
  },
  {
    id: 'cal-pollinator',
    name: 'Pollinator Partnership',
    kind: 'Pollinator habitat',
    area: 'California',
    desc: 'Free ecoregional planting guides listing the native plants that support pollinators where you live.',
    url: 'https://www.pollinator.org',
    contact: 'Planting guides',
    serves: { states: ['CA'], region: 'California' },
  },
];

// California ZIP prefixes that lie in one county (mixed ones are left out),
// for cities not listed above.
const ZIP3_COUNTY = {
  900: 'Los Angeles', 901: 'Los Angeles', 902: 'Los Angeles', 903: 'Los Angeles', 904: 'Los Angeles', 905: 'Los Angeles',
  906: 'Los Angeles', 907: 'Los Angeles', 908: 'Los Angeles', 910: 'Los Angeles', 911: 'Los Angeles', 912: 'Los Angeles',
  913: 'Los Angeles', 914: 'Los Angeles', 915: 'Los Angeles', 916: 'Los Angeles', 917: 'Los Angeles', 918: 'Los Angeles',
  919: 'San Diego', 920: 'San Diego', 921: 'San Diego', 923: 'San Bernardino', 924: 'San Bernardino', 925: 'Riverside',
  926: 'Orange', 927: 'Orange', 928: 'Orange', 931: 'Santa Barbara', 932: 'Kern', 933: 'Kern', 936: 'Fresno', 937: 'Fresno',
  938: 'Fresno', 939: 'Monterey', 941: 'San Francisco', 943: 'Santa Clara', 944: 'San Mateo', 946: 'Alameda', 947: 'Alameda',
  948: 'Contra Costa', 951: 'Santa Clara', 952: 'San Joaquin', 954: 'Sonoma', 957: 'Sacramento', 958: 'Sacramento',
};

function countyFor(project) {
  const city = normalizeCity(project?.city);
  const listed = CITY_COUNTY[city] || CITY_COUNTY[Object.keys(CITY_COUNTY).find((c) => c.toLowerCase() === city.toLowerCase())];
  if (listed) return listed;
  const zip = String(project?.zip || '').trim();
  return /^9\d{4}/.test(zip) ? ZIP3_COUNTY[Number(zip.slice(0, 3))] || '' : '';
}

function regionFor(project) {
  const county = countyFor(project);
  return COUNTY_REGION[county] || '';
}

// Match level for an org against the project, where lower = more local:
//   0 = city/zip, 1 = county, 2 = region, 3 = state, -1 = no match.
function matchLevel(org, ctx) {
  const s = org.serves || {};
  if (Array.isArray(s.cities) && s.cities.length && s.cities.some((c) => c.toLowerCase() === ctx.city.toLowerCase())) return 0;
  if (Array.isArray(s.zips) && s.zips.length && s.zips.includes(ctx.zip)) return 0;
  if (Array.isArray(s.counties) && s.counties.length && ctx.county && s.counties.includes(ctx.county)) return 1;
  if (s.region && ctx.region && s.region === ctx.region) return 2;
  if (s.state && ctx.state && stateCode(s.state) === ctx.state) return 3;
  if (Array.isArray(s.states) && ctx.state && s.states.map(stateCode).includes(ctx.state)) return 3;
  return -1;
}

// Return organizations matching at or within `tier` (0–3), ordered most-local
// first so widening the range appends broader programs at the bottom.
export function organizationsFor(project, tier = 0) {
  const ctx = {
    city: normalizeCity(project?.city),
    zip: String(project?.zip || '').trim(),
    state: stateCode(project?.state),
    county: countyFor(project),
    region: regionFor(project),
  };

  const hits = ORGANIZATIONS
    .map((org) => ({ org, lvl: matchLevel(org, ctx) }))
    .filter((x) => x.lvl >= 0 && x.lvl <= tier)
    .sort((a, b) => a.lvl - b.lvl || (b.org.highlight ? 1 : 0) - (a.org.highlight ? 1 : 0));
  return hits.map((x) => x.org);
}

export const NURSERIES = [
  { name: 'Yerba Buena Nursery', area: 'Half Moon Bay', note: 'California natives only' },
  { name: 'Theodore Payne Foundation', area: 'Sun Valley', note: 'Native seed and plants' },
  { name: 'Native West Nursery', area: 'San Diego', note: 'Contract grows, delivery' },
  { name: 'Local hardware & soil yard', area: 'Your city', note: 'Mulch, compost, drip parts' },
];