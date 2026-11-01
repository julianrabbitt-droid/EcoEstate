// Each organization lists exactly where it runs planting projects (cities,
// counties, region, state). `organizationsFor(project, tier)` returns matches
// for a geographic range, where tier widens the net:
//   0 = city/zip, 1 = + county, 2 = + region, 3 = + statewide
// A Palo Alto property starts with the 5 mid-Peninsula groups that plant
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
    desc: 'Volunteer planting days for street and yard trees plus native understory plantings on the mid-Peninsula. Submit a yard and they match it to an upcoming planting day.',
    url: 'https://www.canopy.org',
    contact: 'Volunteer planting programs',
    serves: { cities: ['Palo Alto', 'East Palo Alto', 'Mountain View', 'Menlo Park', 'Belle Haven'], region: 'Bay Area', state: 'CA' },
    highlight: true,
  },
  {
    id: 'grassroots-ecology',
    name: 'Grassroots Ecology',
    kind: 'Community installation',
    area: 'Santa Clara & San Mateo Counties',
    desc: 'Palo Alto-based native habitat restoration. Volunteers plant and maintain native gardens and creek-side habitat across the Peninsula and South Bay.',
    url: 'https://www.grassrootsecology.org',
    contact: 'Native plant volunteer programs',
    serves: { cities: ['Palo Alto', 'East Palo Alto', 'Mountain View', 'Los Altos', 'Los Altos Hills', 'Sunnyvale', 'Cupertino', 'Menlo Park', 'Redwood City', 'San Carlos'], counties: ['Santa Clara', 'San Mateo'], region: 'Bay Area', state: 'CA' },
  },
  {
    id: 'acterra',
    name: 'Acterra',
    kind: 'Stewardship & planting',
    area: 'Palo Alto & Peninsula',
    desc: 'Native habitat stewardship and volunteer planting in Palo Alto and nearby Peninsula communities, focused on climate-resilient native ecosystems.',
    url: 'https://acterra.org',
    contact: 'Habitat volunteer programs',
    serves: { cities: ['Palo Alto', 'East Palo Alto', 'Mountain View', 'Menlo Park', 'Los Altos'], region: 'Bay Area', state: 'CA' },
  },
  {
    id: 'cnps-scv',
    name: 'CNPS Santa Clara Valley Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'Santa Clara County',
    desc: 'Chapter volunteers review native plant lists and run native plant sales twice a year. Good for sourcing local-origin native plants and expert review.',
    url: 'https://www.cnps.org/chapter/santa-clara-valley/',
    contact: 'Chapter plant sales',
    serves: { cities: ['Palo Alto', 'Mountain View', 'Sunnyvale', 'Cupertino', 'Santa Clara', 'San Jose', 'Los Altos', 'Saratoga', 'Los Gatos', 'Campbell', 'Milpitas'], counties: ['Santa Clara'], region: 'Bay Area', state: 'CA' },
  },
  {
    id: 'green-faith-mv',
    name: 'Green Faith Alliance MV',
    kind: 'Volunteer crews',
    area: 'Mountain View & Sunnyvale',
    desc: 'Faith-community volunteer crews that plant native gardens and organize yard conversion events in the Mountain View–Sunnyvale corridor.',
    url: 'https://www.greenfaith.org',
    contact: 'Volunteer crews',
    serves: { cities: ['Mountain View', 'Sunnyvale', 'Palo Alto'], counties: ['Santa Clara'], region: 'Bay Area', state: 'CA' },
  },
  // --- Bay Area county tier ---
  {
    id: 'rescape',
    name: 'ReScape California',
    kind: 'Qualified landscapers',
    area: 'Bay Area & Central Valley',
    desc: 'Directory of contractors trained in river-friendly, native-first landscape practice, for when you want a paid crew instead of a volunteer day.',
    url: 'https://rescapeca.org',
    contact: 'Contractor directory',
    serves: { counties: ['Santa Clara', 'San Mateo', 'Alameda', 'Contra Costa', 'San Francisco', 'Marin', 'Sonoma', 'Solano', 'Napa'], region: 'Bay Area', state: 'CA' },
  },
  {
    id: 'our-city-forest',
    name: 'Our City Forest',
    kind: 'Community installation',
    area: 'San Jose & Santa Clara County',
    desc: 'San Jose-based urban forestry nonprofit running volunteer yard and street tree plantings, native plant giveaways, and loaner-tool libraries.',
    url: 'https://www.ourcityforest.org',
    contact: 'Volunteer planting programs',
    serves: { cities: ['San Jose', 'Santa Clara', 'Sunnyvale', 'Campbell', 'Milpitas'], counties: ['Santa Clara'], region: 'Bay Area', state: 'CA' },
  },
  {
    id: 'friends-urban-forest',
    name: 'Friends of the Urban Forest',
    kind: 'Community installation',
    area: 'San Francisco',
    desc: 'San Francisco volunteer tree-planting with native understory options, including backyard and sidewalk strips across the city.',
    url: 'https://www.fuf.net',
    contact: 'Volunteer planting programs',
    serves: { cities: ['San Francisco'], counties: ['San Francisco'], region: 'Bay Area', state: 'CA' },
  },
  {
    id: 'cnps-santa-clara',
    name: 'CNPS East Bay Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'Alameda & Contra Costa Counties',
    desc: 'East Bay native plant chapter with plant sales, yard-visit advice, and a native garden demonstration program for Alameda and Contra Costa residents.',
    url: 'https://www.ebcnps.org',
    contact: 'Chapter plant sales',
    serves: { cities: ['Oakland', 'Berkeley', 'Fremont', 'Hayward', 'Pleasanton', 'Livermore', 'Concord', 'Walnut Creek', 'Richmond'], counties: ['Alameda', 'Contra Costa'], region: 'Bay Area', state: 'CA' },
  },
  // --- Bay Area region tier (peninsula/wider) ---
  {
    id: 'cnps-santa-cruz',
    name: 'CNPS Santa Cruz County Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'Santa Cruz & San Mateo coast',
    desc: 'Coastal native plant chapter advising on fog-belt natives and running sales of locally sourced seedlings for coastal yards.',
    url: 'https://www.cruzcnps.org',
    contact: 'Chapter plant sales',
    serves: { cities: ['Half Moon Bay', 'Pacifica'], counties: ['San Mateo', 'Santa Cruz'], region: 'Central Coast', state: 'CA' },
  },
  {
    id: 'audubon-golden-gate',
    name: 'Golden Gate Audubon',
    kind: 'Habitat volunteers',
    area: 'Bay Area',
    desc: 'Bird-habitat volunteer crews that plant native pollinator and berry-producing species in yards and parks across the Bay Area.',
    url: 'https://goldengateaudubon.org',
    contact: 'Habitat volunteer programs',
    serves: { region: 'Bay Area', state: 'CA' },
  },
  {
    id: 'bay-area-clean-water-agencies',
    name: 'Bay-Friendly Landscaping Coalition',
    kind: 'Qualified landscapers',
    area: 'Bay Area',
    desc: 'Regional roster of landscape professionals certified in watershed-friendly, native planting and rainwater capture for Bay Area yards.',
    url: 'https://www.stopwaste.org/bay-friendly',
    contact: 'Contractor directory',
    serves: { region: 'Bay Area', state: 'CA' },
  },
  // --- North Coast region ---
  {
    id: 'cnps-milo-baker',
    name: 'CNPS Milo Baker Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'Sonoma County',
    desc: 'Sonoma County chapter running native plant sales and yard-conversion advice for North Bay and coast residents.',
    url: 'https://www.milobaker.cnps.org',
    contact: 'Chapter plant sales',
    serves: { cities: ['Santa Rosa', 'Petaluma', 'San Rafael', 'Novato', 'Mill Valley'], counties: ['Sonoma', 'Marin'], region: 'North Coast', state: 'CA' },
  },
  {
    id: 'laguna-foundation',
    name: 'Laguna de Santa Rosa Foundation',
    kind: 'Stewardship & planting',
    area: 'Sonoma County',
    desc: 'Wetland and watershed native restoration with volunteer planting days and native plant nursery sales in the Laguna de Santa Rosa.',
    url: 'https://www.lagunafoundation.org',
    contact: 'Native plant volunteer programs',
    serves: { counties: ['Sonoma'], region: 'North Coast', state: 'CA' },
  },
  // --- Central Coast region ---
  {
    id: 'santa-barbara-botanic-garden',
    name: 'Santa Barbara Botanic Garden',
    kind: 'Nursery & advice',
    area: 'Santa Barbara & Ventura Counties',
    desc: 'California native plant nursery and garden, selling local-origin natives and offering residential native garden design consultations.',
    url: 'https://www.sbbg.org',
    contact: 'Native plant nursery',
    serves: { counties: ['Santa Barbara', 'Ventura', 'San Luis Obispo'], region: 'Central Coast', state: 'CA' },
  },
  {
    id: 'channel-islands-restoration',
    name: 'Channel Islands Restoration',
    kind: 'Stewardship & planting',
    area: 'Ventura & Santa Barbara Counties',
    desc: 'Volunteer-native-planting nonprofit running yard and creek restoration events, plus a native plant nursery for the central coast.',
    url: 'https://www.cirweb.org',
    contact: 'Volunteer planting programs',
    serves: { counties: ['Ventura', 'Santa Barbara'], region: 'Central Coast', state: 'CA' },
  },
  // --- Central Valley / Sierra ---
  {
    id: 'river-partners',
    name: 'River Partners',
    kind: 'Stewardship & planting',
    area: 'Central Valley',
    desc: 'Large-scale native riparian restoration with volunteer planting days and native plant supply for valley-floor properties.',
    url: 'https://www.riverpartners.org',
    contact: 'Native plant volunteer programs',
    serves: { counties: ['San Joaquin', 'Stanislaus', 'Fresno', 'Sacramento'], region: 'Central Valley', state: 'CA' },
  },
  {
    id: 'cnps-san-joaquin',
    name: 'CNPS San Joaquin Valley Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'San Joaquin Valley',
    desc: 'Valley chapter advising on heat-tolerant native plantings and running seasonal native plant sales for valley residents.',
    url: 'https://www.cnps.org',
    contact: 'Chapter plant sales',
    serves: { counties: ['Fresno', 'San Joaquin', 'Stanislaus', 'Sacramento'], region: 'Central Valley', state: 'CA' },
  },
  {
    id: 'tuolumne-river-trust',
    name: 'Tuolumne River Trust',
    kind: 'Stewardship & planting',
    area: 'Stanislaus & San Joaquin Counties',
    desc: 'River-corridor native planting and yard conversion events bringing pollinator habitat to valley neighborhoods.',
    url: 'https://www.tuolumne.org',
    contact: 'Volunteer planting programs',
    serves: { counties: ['Stanislaus', 'San Joaquin'], region: 'Central Valley', state: 'CA' },
  },
  {
    id: 'sierra-foothills-conservancy',
    name: 'Sierra Foothills Conservancy',
    kind: 'Stewardship & planting',
    area: 'Sierra foothills',
    desc: 'Foothill native habitat volunteer days and oak-woodland native planting guidance for Sierra-region properties.',
    url: 'https://www.sierrafoothills.org',
    contact: 'Volunteer planting programs',
    serves: { counties: ['El Dorado', 'Placer', 'Nevada'], region: 'Sierra', state: 'CA' },
  },
  // --- Southern California ---
  {
    id: 'theodore-payne',
    name: 'Theodore Payne Foundation',
    kind: 'Nursery & advice',
    area: 'Los Angeles & Southern California',
    desc: 'Sun Valley native plant nursery and education center selling California natives and offering residential native garden design help.',
    url: 'https://theodorepayne.org',
    contact: 'Native plant nursery',
    serves: { cities: ['Los Angeles', 'Pasadena', 'Long Beach'], counties: ['Los Angeles'], region: 'Southern California', state: 'CA' },
  },
  {
    id: 'treepeople',
    name: 'TreePeople',
    kind: 'Community installation',
    area: 'Los Angeles region',
    desc: 'LA-based volunteer tree and native understory plantings for yards, schools, and parkways across the Los Angeles basin.',
    url: 'https://www.treepeople.org',
    contact: 'Volunteer planting programs',
    serves: { cities: ['Los Angeles', 'Long Beach', 'Pasadena'], counties: ['Los Angeles'], region: 'Southern California', state: 'CA' },
  },
  {
    id: 'california-botanic-garden',
    name: 'California Botanic Garden',
    kind: 'Nursery & advice',
    area: 'Claremont & Inland Empire',
    desc: 'Largest California native botanical garden, with a native plant nursery and residential garden design courses for Southern California.',
    url: 'https://www.californiabotanicgarden.org',
    contact: 'Native plant nursery',
    serves: { counties: ['Los Angeles', 'San Bernardino', 'Riverside'], region: 'Southern California', state: 'CA' },
  },
  {
    id: 'mountains-restoration-trust',
    name: 'Mountains Restoration Trust',
    kind: 'Stewardship & planting',
    area: 'Santa Monica Mountains',
    desc: 'Volunteer native habitat restoration in the Santa Monica Mountains and adjacent foothill yards around Los Angeles and Ventura.',
    url: 'https://www.mountainstrust.org',
    contact: 'Volunteer planting programs',
    serves: { counties: ['Los Angeles', 'Ventura'], region: 'Southern California', state: 'CA' },
  },
  {
    id: 'cnps-san-diego',
    name: 'CNPS San Diego Chapter',
    kind: 'Chapter advice & plant sales',
    area: 'San Diego County',
    desc: 'San Diego native plant chapter with seasonal plant sales and yard-visit advice for drought-tolerant Southern California natives.',
    url: 'https://www.cnpssd.org',
    contact: 'Chapter plant sales',
    serves: { cities: ['San Diego'], counties: ['San Diego'], region: 'Southern California', state: 'CA' },
  },
  // --- Statewide (tier 3) ---
  {
    id: 'cnps',
    name: 'California Native Plant Society',
    kind: 'Statewide chapters',
    area: 'California',
    desc: 'Your nearest CNPS chapter reviews plant lists and runs native plant sales. Start here for local experts anywhere in California.',
    url: 'https://www.cnps.org',
    contact: 'Find your chapter',
    serves: { states: ['CA'], region: 'California' },
  },
  {
    id: 'xerces-society',
    name: 'Xerces Society',
    kind: 'Pollinator habitat',
    area: 'California',
    desc: 'Pollinator-conservation nonprofit with native planting guides and habitat-certification programs for residential yards statewide.',
    url: 'https://www.xerces.org',
    contact: 'Habitat certification',
    serves: { states: ['CA'], region: 'California' },
  },
  {
    id: 'audubon-ca',
    name: 'Audubon California',
    kind: 'Bird-friendly yards',
    area: 'California',
    desc: 'Statewide bird-friendly native yard program with planting guides and volunteer native-plant installation events by local chapters.',
    url: 'https://ca.audubon.org',
    contact: 'Bird-friendly yard program',
    serves: { states: ['CA'], region: 'California' },
  },
  {
    id: 'cal-pollinator',
    name: 'Pollinator Partnership California',
    kind: 'Pollinator habitat',
    area: 'California',
    desc: 'Statewide pollinator-planting guides and a free native-seed program for residential habitat corridors across California.',
    url: 'https://www.pollinator.org',
    contact: 'Free native seed program',
    serves: { states: ['CA'], region: 'California' },
  },
];

function countyFor(project) {
  const city = normalizeCity(project?.city);
  return CITY_COUNTY[city] || CITY_COUNTY[Object.keys(CITY_COUNTY).find((c) => c.toLowerCase() === city.toLowerCase())] || '';
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