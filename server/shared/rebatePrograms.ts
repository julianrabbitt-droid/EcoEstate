// Lawn-replacement and native-planting incentives, each checked against the
// program's own official page on the date in `verified`. A program applies
// when the property is in one of its water utilities (EPA public water system
// ids, from EPA's service-area boundaries), counties (FIPS) or states.
//
// Amount fields:
//   perSqft + capSqft/capAmount/minSqft  paid per square foot of lawn replaced
//   tiers [{ sqft, rate }]                rate for each band, e.g. $5 first 10,000 then $2.50
//   coupons { sqftEach, amount, max }     a fixed amount per block of lawn removed
//   upTo                                  published maximum only; shown, not counted in totals
// kind: 'turf' programs don't combine with each other (the best one counts);
// 'addon' programs stack on top. `replaces` drops a broader program the local
// one already includes. Re-check the pages when updating rates.

export type Program = {
  id: string;
  name: string;
  provider: string;
  url: string;
  verified: string;
  kind: 'turf' | 'addon';
  where: { pwsids?: string[]; counties?: string[]; states?: string[] };
  perSqft?: number;
  capSqft?: number;
  capAmount?: number;
  minSqft?: number;
  tiers?: { sqft: number; rate: number }[];
  coupons?: { sqftEach: number; amount: number; max: number };
  upTo?: number;
  replaces?: string[];
  note: string;
};

const VERIFIED = '2026-11-01';

export const PROGRAMS: Program[] = [
  // ---- California ----
  {
    id: 'mwd-socal',
    name: 'Turf Replacement Program',
    provider: 'Metropolitan Water District (SoCal Water$mart)',
    url: 'https://socalwatersmart.com/en/residential/rebates/available-rebates/turf-replacement-program/',
    verified: VERIFIED,
    kind: 'turf',
    // Metropolitan's member agencies serve most of these six counties; the
    // program's own lookup confirms an address.
    where: { counties: ['06037', '06059', '06073', '06111', '06065', '06071'] },
    perSqft: 2,
    capSqft: 5000,
    note: 'Regional base rate for Metropolitan member agencies, up to 5,000 sq ft a year, plus $100 per new tree (up to 5). Needs approval before you start, a stormwater feature and 3 plants per 100 sq ft. Your local water agency may add more.',
  },
  {
    id: 'ladwp',
    name: 'Turf Replacement Rebate',
    provider: 'Los Angeles Department of Water and Power',
    url: 'https://www.ladwp.com/who-we-are/water-system/water-conservation/turf-replacement-rebate',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['CA1910067'] },
    perSqft: 5,
    capSqft: 5000,
    minSqft: 250,
    replaces: ['mwd-socal'],
    note: '$5 per sq ft ($3 from LADWP plus Metropolitan’s $2), 250 to 5,000 sq ft. Pre-approval required.',
  },
  {
    id: 'valley-water',
    name: 'Landscape Conversion Rebate',
    provider: 'Valley Water (Santa Clara County)',
    url: 'https://www.valleywater.org/saving-water/rebates-surveys/landscape-rebates',
    verified: VERIFIED,
    kind: 'turf',
    where: { counties: ['06085'] },
    perSqft: 2,
    capAmount: 3000,
    note: '$2 per sq ft, up to $3,000 for single-family homes (higher in some cost-sharing cities). Pre-inspection and a Notice to Proceed before you remove any lawn.',
  },
  {
    id: 'ebmud',
    name: 'Lawn Conversion Rebate',
    provider: 'East Bay Municipal Utility District',
    url: 'https://www.ebmud.com/water/conservation-and-rebates/rebates/lawn-conversion-rebate',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['CA0110005'] },
    perSqft: 1,
    capAmount: 2000,
    note: '$1 per sq ft standard, or $2 per sq ft for the Super Rebate with extra requirements; up to $2,000 per home in 24 months. Lawn must have been watered for 3 years. Approval before you start.',
  },
  {
    id: 'ccwd',
    name: 'Lawn to Garden Rebate',
    provider: 'Contra Costa Water District',
    url: 'https://www.ccwater.com/160/Lawn-to-Garden-Rebate',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['CA0710003'] },
    perSqft: 1,
    capAmount: 2000,
    note: '$1 per sq ft, up to $2,000 for single-family homes. Wait for the Notice to Proceed before starting.',
  },

  // ---- Nevada ----
  {
    id: 'snwa',
    name: 'Water Smart Landscapes Rebate',
    provider: 'Southern Nevada Water Authority',
    url: 'https://www.snwa.com/rebates/wsl/index.html',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['NV0000090', 'NV0000076', 'NV0000175', 'NV0000011'] },
    tiers: [
      { sqft: 10000, rate: 5 },
      { sqft: Infinity, rate: 2.5 },
    ],
    note: '$5 per sq ft for the first 10,000 sq ft of grass converted to desert landscaping, then $2.50. Requires a pre-conversion inspection and a conservation easement.',
  },
  {
    id: 'lvvwd-bonus',
    name: 'Turf conversion bonus',
    provider: 'Las Vegas Valley Water District',
    url: 'https://www.snwa.com/rebates/wsl/index.html',
    verified: VERIFIED,
    kind: 'addon',
    where: { pwsids: ['NV0000090'] },
    perSqft: 2,
    note: 'An extra $2 per sq ft on top of the Water Smart Landscapes rebate for Las Vegas Valley Water District customers.',
  },

  // ---- Utah (Landscape Incentive Program, through Utah Water Savers) ----
  {
    id: 'utah-jvwcd',
    name: 'Landscape Incentive Program',
    provider: 'Jordan Valley Water Conservancy District (Utah Water Savers)',
    url: 'https://www.utahwatersavers.com/jvwcd-landscape-incentive-program-details',
    verified: VERIFIED,
    kind: 'turf',
    where: { counties: ['49035'] },
    perSqft: 3,
    minSqft: 200,
    note: '$3 per sq ft of lawn replaced in most of Salt Lake County. Apply and get a site visit before removing any grass. Select your water provider on Utah Water Savers to confirm.',
  },
  {
    id: 'utah-cuwcd',
    name: 'Landscape Incentive Program',
    provider: 'Central Utah Water Conservancy District (Utah Water Savers)',
    url: 'https://www.utahwatersavers.com/cuwcd-landscape-incentive-program-details',
    verified: VERIFIED,
    kind: 'turf',
    where: { counties: ['49049', '49051', '49023', '49013', '49047', '49015'] },
    perSqft: 3,
    capAmount: 50000,
    note: '$3 per sq ft of lawn replaced. Apply and get a site visit before removing any grass. Select your water provider on Utah Water Savers to confirm.',
  },
  {
    id: 'utah-statewide',
    name: 'Landscape Incentive Program',
    provider: 'Utah Division of Water Resources (Utah Water Savers)',
    url: 'https://www.utahwatersavers.com/division-of-water-resources-landscape-incentive-program-details',
    verified: VERIFIED,
    kind: 'turf',
    where: { states: ['49'] },
    perSqft: 2,
    capAmount: 50000,
    note: 'Statewide rate of $2 per sq ft where your provider participates; some districts pay more. Select your water provider on Utah Water Savers to confirm.',
  },

  // ---- Colorado ----
  {
    id: 'aurora-grip',
    name: 'Grass Replacement Incentive Program',
    provider: 'Aurora Water',
    url: 'https://www.auroragov.org/residents/water/rebates/water-wise_landscape_rebate',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['CO0103005'] },
    perSqft: 3,
    note: '$3 per sq ft for a traditional water-wise landscape ($0.50 for native grass). Applications open in spring and fall windows; approval before installation.',
  },

  // ---- New Mexico ----
  {
    id: 'abcwua',
    name: 'Xeriscape Rebate',
    provider: 'Albuquerque Bernalillo County Water Utility Authority',
    url: 'https://www.abcwua.org/conservation-rebates-xeriscape/',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['NM3510701'] },
    perSqft: 3,
    note: '$3 per sq ft of turf removed. A pre-approval inspection is required before any removal; half the area must be planted and spray irrigation converted to drip.',
  },

  // ---- Arizona ----
  {
    id: 'phoenix',
    name: 'Residential Grass Removal Program',
    provider: 'City of Phoenix Water Services',
    url: 'https://www.phoenix.gov/administration/departments/waterservices/supply-conservation/save-water/conservation-incentives/residential-grass-incentives.html',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['AZ0407025'] },
    perSqft: 2,
    minSqft: 250,
    capSqft: 5000,
    note: '$2 per sq ft of living grass removed, at least 250 sq ft (over 5,000 sq ft case by case). Apply through myPHX311.',
  },
  {
    id: 'chandler',
    name: 'Single Family Grass Removal Rebate',
    provider: 'City of Chandler',
    url: 'https://www.chandleraz.gov/residents/water/water-conservation/rebate-and-incentive-programs/residential/rebate-policy',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['AZ0407090'] },
    perSqft: 1.5,
    capAmount: 2000,
    minSqft: 500,
    note: '$1.50 per sq ft, up to $2,000, at least 500 sq ft. Get a Notice to Proceed before removing grass.',
  },
  {
    id: 'mesa',
    name: 'Residential Grass-to-Xeriscape Incentive',
    provider: 'City of Mesa',
    url: 'https://www.mesaaz.gov/Environment-Sustainability/Water-Conservation/Residential-Grass-to-Xeriscape-Program',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['AZ0407095'] },
    upTo: 2100,
    minSqft: 500,
    note: 'Flat amounts by area: $1,000 for 500–999 sq ft up to $2,000 for 1,500 sq ft or more, plus $50–100 per qualifying tree (up to $2,100). One incentive per home every 3 years.',
  },
  {
    id: 'gilbert',
    name: 'Residential Grass Removal Rebate',
    provider: 'Town of Gilbert',
    url: 'https://www.gilbertaz.gov/departments/public-works/water/water-conservation/rebates/residential-grass-removal-rebate',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['AZ0407092'] },
    upTo: 3000,
    minSqft: 200,
    note: 'Up to $2,000 for grass removal, plus up to $1,000 for planting low-water desert plants. At least 200 sq ft; verification before you start.',
  },
  {
    id: 'scottsdale',
    name: 'Residential Grass Removal Rebate',
    provider: 'City of Scottsdale',
    url: 'https://www.scottsdaleaz.gov/water/water-conservation/rebates/residential',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['AZ0407098'] },
    perSqft: 2,
    capAmount: 5000,
    minSqft: 500,
    note: '$2 per sq ft, up to $5,000, at least 500 sq ft, with a pre-inspection. Offered in seasonal application windows; check whether one is open.',
  },

  // ---- Texas ----
  {
    id: 'saws',
    name: 'WaterSaver Landscape Coupons',
    provider: 'San Antonio Water System',
    url: 'https://www.saws.org/watersaver-landscape-coupons-return-tailored-for-the-seasons/',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['TX0150018'] },
    coupons: { sqftEach: 200, amount: 125, max: 4 },
    note: 'Up to 4 coupons for plants at participating nurseries, one per 200 sq ft of grass removed: $125 in spring, $150 in fall. Paused in summer.',
  },
  {
    id: 'austin',
    name: 'WaterWise Landscape Rebate',
    provider: 'Austin Water',
    url: 'https://www.austintexas.gov/water/programs/rebates-tools-programs',
    verified: VERIFIED,
    kind: 'turf',
    where: { pwsids: ['TX2270001'] },
    upTo: 3000,
    note: 'Up to $3,000 for converting turf grass to a native plant bed.',
  },

  // ---- Mid-Atlantic and Midwest (native planting / stormwater) ----
  {
    id: 'montgomery-rainscapes',
    name: 'RainScapes Rewards: Conservation Landscaping',
    provider: 'Montgomery County Department of Environmental Protection',
    url: 'https://montgomerycountymd.gov/department-environmental-protection/property-care/rainscapes/rainscapes-stormwater-garden-conservation-landscapes/requirements-qualify-conservation-landscape-rebate',
    verified: VERIFIED,
    kind: 'turf',
    where: { counties: ['24031'] },
    perSqft: 5,
    capAmount: 7500,
    minSqft: 250,
    note: '$5 per sq ft of native conservation landscaping ($6 with 3 inches of temporary ponding), up to $7,500 per home, at least 250 sq ft. Planner site visit and plan approval before you install.',
  },
  {
    id: 'dc-riversmart',
    name: 'RiverSmart Homes',
    provider: 'DC Department of Energy and Environment',
    url: 'https://doee.dc.gov/service/riversmart-homes',
    verified: VERIFIED,
    kind: 'addon',
    where: { states: ['11'] },
    upTo: 6000,
    note: 'Native BayScaping gardens and rain gardens installed for a $200 copay each, free shade trees, and in some areas $8 per sq ft for converting pavement to plants (up to $6,000).',
  },
  {
    id: 'mn-lawns-to-legumes',
    name: 'Lawns to Legumes',
    provider: 'Minnesota Board of Water and Soil Resources',
    url: 'https://bwsr.state.mn.us/node/13561',
    verified: VERIFIED,
    kind: 'addon',
    where: { states: ['27'] },
    upTo: 400,
    note: 'Reimbursement of up to $400 for pollinator plantings (25% match). Offered in application rounds; check whether one is open.',
  },
];
