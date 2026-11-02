// Curated native planting arrangements recommended by regional agriculturalists
// and restoration ecologists for California-compatible properties.
export const ARRANGEMENTS = [
  {
    id: 'pollinator-drifts',
    name: 'Pollinator drifts',
    region: 'Sun-loving · inland valleys',
    pattern: 'drifts',
    note: 'A year-round nectar flow recommended by regional pollinator-habitat specialists: fuchsia and sage carry the dry season, lilac opens early.',
    species: [
      { speciesId: 'california-fuchsia', share: 0.28 },
      { speciesId: 'hummingbird-sage', share: 0.24 },
      { speciesId: 'yarrow', share: 0.2 },
      { speciesId: 'california-lilac', share: 0.28 },
    ],
  },
  {
    id: 'chaparral-hedge',
    name: 'Chaparral hedge',
    region: 'Dry slopes · full sun',
    pattern: 'clusters',
    note: 'The drought-proof backbone California chaparral restoration crews favor: manzanita and lilac anchor, toyon and coffeeberry fill out.',
    species: [
      { speciesId: 'manzanita', share: 0.26 },
      { speciesId: 'california-lilac', share: 0.26 },
      { speciesId: 'toyon', share: 0.24 },
      { speciesId: 'coffeeberry', share: 0.24 },
    ],
  },
  {
    id: 'coastal-meadow',
    name: 'Coastal meadow',
    region: 'Low-water slopes · coastal',
    pattern: 'rows',
    note: 'A flowing native meadow land trusts advise for low-water slopes: needlegrass and deer grass banded with poppy and yarrow for color.',
    species: [
      { speciesId: 'purple-needlegrass', share: 0.34 },
      { speciesId: 'deer-grass', share: 0.24 },
      { speciesId: 'california-poppy', share: 0.22 },
      { speciesId: 'yarrow', share: 0.2 },
    ],
  },
  {
    id: 'oak-understory',
    name: 'Oak understory',
    region: 'Part shade · under canopy',
    pattern: 'scatter',
    note: 'Shade-tolerant layering beneath existing oaks, per arborist guidance: toyon and coffeeberry for structure, iris and sage for the floor.',
    species: [
      { speciesId: 'toyon', share: 0.24 },
      { speciesId: 'coffeeberry', share: 0.24 },
      { speciesId: 'douglas-iris', share: 0.28 },
      { speciesId: 'hummingbird-sage', share: 0.24 },
    ],
  },
  {
    id: 'wild-meadow',
    name: 'Wild meadow',
    region: 'Naturalized · intentionally wild',
    pattern: 'scatter',
    note: 'A deliberately informal, self-seeded look restoration ecologists use for naturalized meadows: species scatter freely rather than planting in rows or drifts.',
    species: [
      { speciesId: 'purple-needlegrass', share: 0.3 },
      { speciesId: 'california-poppy', share: 0.26 },
      { speciesId: 'yarrow', share: 0.22 },
      { speciesId: 'hummingbird-sage', share: 0.22 },
    ],
  },
  {
    id: 'dry-border',
    name: 'Dry sun border',
    region: 'Hot strip · parkway / curb',
    pattern: 'rows',
    note: 'A sun-baked curb strip agronomists suggest for fast coverage and pollinators: sages and lupine for structure, fuchsia for late color.',
    species: [
      { speciesId: 'cleveland-sage', share: 0.28 },
      { speciesId: 'white-sage', share: 0.22 },
      { speciesId: 'silver-lupine', share: 0.24 },
      { speciesId: 'california-fuchsia', share: 0.26 },
    ],
  },
  {
    id: 'cherry-hedgerow',
    name: 'Cherry hedgerow',
    region: 'Large sites · evergreen screen',
    pattern: 'rows',
    minArea: 3000,
    note: 'For wider sites that can hold an evergreen screen: Catalina cherry lifted above a lilac and fuchsia border.',
    species: [
      { speciesId: 'catalina-cherry', share: 0.22 },
      { speciesId: 'california-lilac', share: 0.28 },
      { speciesId: 'california-fuchsia', share: 0.24 },
      { speciesId: 'yarrow', share: 0.26 },
    ],
  },
  {
    id: 'oak-canopy-grove',
    name: 'Oak canopy grove',
    region: 'Large sites · canopy + understory',
    pattern: 'clusters',
    minArea: 4000,
    note: 'For big sites where a real canopy makes sense: a grove of coast live oaks lifted over a toyon, coffeeberry and iris understory.',
    species: [
      { speciesId: 'coast-live-oak', share: 0.18 },
      { speciesId: 'toyon', share: 0.26 },
      { speciesId: 'coffeeberry', share: 0.26 },
      { speciesId: 'douglas-iris', share: 0.3 },
    ],
  },
];
// Starter arrangements built from a region's own native plants, for places the
// curated California mixes above don't fit (anywhere their species aren't
// native). Each picks plants by form and the wildlife they feed; a mix needs
// at least three species to be offered.
const POLLINATOR = /bee|butterfl|hummingbird|pollinat|moth/i;
const BIRDS = /bird/i;
const feeds = (p, re) => (p.wildlife || []).some((w) => re.test(w));
const pick = (plants, test, n) => plants.filter(test).slice(0, n);
const even = (plants) => plants.map((p) => ({ speciesId: p.id, share: 1 / plants.length }));

export function regionalArrangements(plants, regionName = 'your region') {
  const where = `Built from plants native to ${regionName}`;
  const low = (p) => ['groundcover', 'grass'].includes(p.form) || (p.h || 99) <= 1.5;
  const mixes = [
    {
      id: 'regional-pollinator',
      name: 'Pollinator drifts',
      pattern: 'drifts',
      region: where,
      note: 'Flowers and shrubs that feed bees, butterflies and hummingbirds, planted in sweeping drifts.',
      species: pick(plants, (p) => ['flower', 'shrub'].includes(p.form) && feeds(p, POLLINATOR), 4),
    },
    {
      id: 'regional-hedge',
      name: 'Native hedge',
      pattern: 'rows',
      region: where,
      note: 'Native shrubs in a row along the edge for screening, shelter and berries for birds.',
      species: [...pick(plants, (p) => p.form === 'shrub' && feeds(p, BIRDS), 2), ...pick(plants, (p) => p.form === 'shrub' && !feeds(p, BIRDS), 2)],
    },
    {
      id: 'regional-meadow',
      name: 'Wild meadow',
      pattern: 'scatter',
      region: where,
      note: 'Native grasses mixed with wildflowers, scattered loosely like a natural meadow.',
      species: [...pick(plants, (p) => p.form === 'grass', 2), ...pick(plants, (p) => p.form === 'flower', 3)],
    },
    {
      id: 'regional-woodland',
      name: 'Woodland edge',
      pattern: 'clusters',
      region: where,
      minArea: 1500,
      note: 'A native tree grouped with shrubs and shade-tolerant plants beneath it.',
      species: [...pick(plants, (p) => p.form === 'tree', 1), ...pick(plants, (p) => p.form === 'shrub', 2), ...pick(plants, (p) => /shade/i.test(p.sun || '') && p.form !== 'tree', 1)],
    },
    {
      id: 'regional-groundcover',
      name: 'Low groundcover',
      pattern: 'scatter',
      region: where,
      note: 'Low native groundcovers and grasses for a soft, walkable lawn replacement.',
      species: pick(plants, low, 4),
    },
  ];
  return mixes
    .map((m) => ({ ...m, species: even([...new Map(m.species.map((p) => [p.id, p])).values()]) }))
    .filter((m) => m.species.length >= 3);
}

/** Arrangements that suit a property's plants: the curated mixes whose species are all native there, else regional starter mixes. */
export function arrangementsFor(plants, regionName) {
  const ids = new Set(plants.map((p) => p.id));
  const curated = ARRANGEMENTS.filter((a) => a.species.every((s) => ids.has(s.speciesId)));
  return curated.length >= 3 ? curated : [...curated, ...regionalArrangements(plants, regionName)];
}
