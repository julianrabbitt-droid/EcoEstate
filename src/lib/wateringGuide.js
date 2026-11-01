// Free, rule-based watering guidance for native plantings. No network calls.

const CA_COUNTY_RE = /\b(alameda|contra costa|marin|napa|san francisco|san mateo|santa clara|solano|sonoma|los angeles|orange|riverside|san bernardino|san diego|ventura|santa barbara|san luis obispo|monterey|santa cruz|sacramento|fresno|kern|placer|el dorado|yolo|san joaquin|stanislaus|merced|tulare|humboldt|mendocino|shasta|butte|imperial)\s+county\b/i;

export function isCaliforniaAddress(address = '') {
  const a = String(address || '');
  return /,\s*California\b/i.test(a) || /\bCA\b/.test(a) || /,\s*CA\s*(,|\d|$)/.test(a) || CA_COUNTY_RE.test(a);
}

// Returns e.g. "Santa Clara County" if the address names one.
export function countyFromAddress(address = '') {
  const m = String(address || '').match(/([A-Z][A-Za-z.' ]+?)\s+County\b/);
  return m ? `${m[1].trim()} County` : '';
}

const monthIndex = (d) => (d instanceof Date ? d.getMonth() : new Date(d).getMonth());

export function wateringAdvice({ plant, startDate, today = new Date(), isCalifornia = false }) {
  const now = today instanceof Date ? today : new Date(today);
  const month = monthIndex(now);
  const dry = month >= 3 && month <= 9; // Apr–Oct
  const water = plant?.water || 'Low';
  const start = startDate ? new Date(`${startDate}T00:00`) : null;
  const ageDays = start && !Number.isNaN(start.getTime()) ? (now - start) / 86400000 : null;
  const establishing = ageDays == null ? false : ageDays < 730;
  const name = plant?.common || 'your plants';

  const wetLabel = isCalifornia ? 'the rainy season (about Nov to Mar)' : 'the rainy or cool months';
  const dryLabel = isCalifornia ? 'the dry season (about Apr to Oct)' : 'the hot, dry months';

  let headline;
  const detail = [];

  if (!dry) {
    headline = `Rainy season: skip the hose unless it has not rained for about 2 weeks.`;
    detail.push(`It is ${wetLabel}. Water ${name} only if there has been no rain for about 2 weeks and the soil 2 to 3 inches down is dry.`);
    if (establishing) detail.push('Young plants are still building roots, so check them a little more often in dry spells.');
    else detail.push('Established natives usually need no extra water now.');
  } else if (establishing) {
    const interval = water === 'Moderate' ? 'about once a week' : 'every 1 to 2 weeks';
    headline = `Establishing: deep-water ${interval} through ${dryLabel}.`;
    detail.push(`${name} is in its first 1 to 2 years, so roots are still growing. Water deeply ${interval} during ${dryLabel}, then let the soil dry between waterings.`);
    detail.push('Each year of age, stretch the gap between waterings a little. Aim to wean it off over 2 years.');
  } else {
    const interval =
      water === 'Very low' ? 'none to about once a month' : water === 'Moderate' ? 'about every 1 to 2 weeks' : 'about every 2 to 4 weeks';
    headline = `Established: ${interval} in ${dryLabel}.`;
    detail.push(`${name} has a ${water.toLowerCase()} water need. Once established, ${interval} is usually plenty during ${dryLabel}.`);
    if (water === 'Very low') detail.push('Summer water can harm dry-adapted natives; when in doubt, wait.');
    if (isCalifornia) detail.push('Many California natives rest in summer; leaf drop or a dull look is often normal.');
  }

  detail.push('Check first: push a finger 2 to 3 inches into the soil. Water only if it is dry.');
  detail.push('Water deeply and infrequently at the root zone, early in the morning.');
  detail.push('Keep mulch 2 to 3 inches away from stems. No fertilizer is needed for natives.');

  return { headline, detail };
}
