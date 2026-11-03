// One colour per species in a planting, for the Build step's plan (discs under
// the plants in 3D, dots in the planting list). Checked with the dataviz
// validator on the dark cards: fixed order, never cycled. The pair at slots 5
// and 6 is close for deuteranopia, so every species also carries its number.
export const SPECIES_COLORS = ['#58a636', '#4a96d0', '#d07c30', '#8a76d0', '#2ea39a', '#c8566e', '#a8901a', '#b85aa8'];
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
