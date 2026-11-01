export const PROGRAMS = [
  {
    id: 'turf-rebate',
    name: 'Turf replacement rebate',
    provider: 'Metropolitan Water District / SoCal Water$mart',
    perSqft: 2,
    capSqft: 5000,
    category: 'Turf removal',
    stacks: false,
    region: 'Southern California',
    desc: 'Paid per square foot of living turf removed and replaced with water-wise planting.',
    url: 'https://socalwatersmart.com',
  },
  {
    id: 'district-turf',
    name: 'District grass conversion credit',
    provider: 'Cal Water and local water districts',
    perSqft: 1.5,
    capSqft: 3000,
    category: 'Turf removal',
    stacks: false,
    region: 'Statewide, district dependent',
    desc: 'Retail water districts fund their own conversion credits; most do not stack with the regional rebate.',
    url: 'https://www.calwater.com/conservation/rebates/',
  },
  {
    id: 'drip',
    name: 'Drip irrigation conversion',
    provider: 'Local water district',
    perSqft: 0.3,
    capAmount: 300,
    category: 'Irrigation',
    stacks: true,
    region: 'District dependent',
    desc: 'Rebate for replacing spray heads with pressure-regulated drip on the converted area.',
    url: 'https://www.calwater.com/conservation/rebates/',
  },
  {
    id: 'rain-barrel',
    name: 'Rain barrel rebate',
    provider: 'Municipal stormwater program',
    perUnit: 75,
    units: 2,
    category: 'Water capture',
    stacks: true,
    region: 'Municipal',
    desc: 'Two barrels typically covered per household; check your city stormwater program.',
    url: 'https://www.waterboards.ca.gov/',
  },
  {
    id: 'shade-tree',
    name: 'Free shade tree',
    provider: 'Our City Forest / local tree nonprofit',
    perUnit: 100,
    units: 1,
    category: 'Tree planting',
    stacks: true,
    region: 'Santa Clara County and partner cities',
    desc: 'A free 15-gallon native or shade tree, with planting help at a community event.',
    url: 'https://ourcityforest.org',
  },
];

export function programAmount(program, turfSqft) {
  if (program.perSqft) {
    const eligibleSqft = program.capSqft ? Math.min(turfSqft, program.capSqft) : turfSqft;
    const gross = eligibleSqft * program.perSqft;
    return Math.round(program.capAmount ? Math.min(gross, program.capAmount) : gross);
  }
  if (program.perUnit) return program.perUnit * (program.units || 1);
  return program.flat || 0;
}

export function incentiveEstimates(turfSqft) {
  const rows = PROGRAMS.map((p) => ({ ...p, amount: programAmount(p, turfSqft) }));
  const single = rows.filter((r) => !r.stacks).sort((a, b) => b.amount - a.amount);
  const best = single[0] || null;
  const extras = rows.filter((r) => r.stacks);
  const total = extras.reduce((sum, r) => sum + r.amount, 0) + (best ? best.amount : 0);
  return { rows, best, extras, total: Math.round(total) };
}