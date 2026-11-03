// One colour per species in a planting, for the Build step's plan (discs under
// the plants in 3D, dots in the planting list). Checked with the dataviz
// validator on the bone cards: fixed order, never cycled. The last pair is
// close for deuteranopia, so every species also carries its number.
export const SPECIES_COLORS = ['#4c8a2b', '#2f78b7', '#c4651d', '#7a63c4', '#c2456a', '#9a7d12', '#0f9a8c', '#a8509c'];
// A ninth species and beyond: a neutral grey, still numbered.
export const OTHER_COLOR = '#8f9a90';

// speciesId -> { color, n } in the order the species appear in the design.
export function speciesKey(entries = []) {
  const out = new Map();
  entries.forEach((e) => {
    if (!e || out.has(e.speciesId)) return;
    const i = out.size;
    out.set(e.speciesId, { color: SPECIES_COLORS[i] || OTHER_COLOR, n: i + 1 });
  });
  return out;
}
