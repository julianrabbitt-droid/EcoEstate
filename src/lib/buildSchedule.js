// Scales a build + establishment timeline to the size of the converted area.
// A small yard (~1,200 sq ft) reads as a week or two of work; a park-scale site
// (an acre or more) stretches into months or years. All durations derive from
// the convertible turf square footage so the timeline tracks the project.

function fmtDay(d, unit) {
  if (unit === 'week') {
    const w = Math.max(1, Math.ceil(d / 7));
    return `Week ${w}`;
  }
  // months
  return `Month ${Math.max(1, Math.floor(d / 30) + 1)}`;
}

function fmtRange(start, end, unit) {
  const a = fmtDay(start, unit);
  const b = fmtDay(end, unit);
  return a === b ? a : `${a}–${b}`;
}

// Build phases share the total build window in fixed proportions: prep and
// irrigation are quick, planting dominates. Order is preserved top to bottom.
const PHASE_FRACTIONS = [
  { f: 0.15, key: 'prep' },
  { f: 0.2, key: 'soil' },
  { f: 0.15, key: 'drip' },
  { f: 0.5, key: 'plant' },
];

export function buildSchedule(sqft = 0) {
  const area = Math.max(1, Number(sqft) || 0);
  // ~150 sq ft of installed bed per working day for a small crew, with a floor
  // of 3 days so even a tiny yard isn't instantaneous.
  const totalDays = Math.max(3, Math.round(area / 150));
  const unit = totalDays < 60 ? 'week' : 'month';

  let cursor = 0;
  const phases = PHASE_FRACTIONS.map((p) => {
    const start = cursor;
    const end = cursor + totalDays * p.f;
    cursor = end;
    return { key: p.key, start, end, when: fmtRange(start, end, unit) };
  });

  // Establishment takes longer on bigger sites — more plants to nurse through
  // their first dry seasons.
  const establishYears = Math.min(5, Math.max(1, Math.round(totalDays / 120)));
  const establishLabel = `Year 1${establishYears > 1 ? `–${establishYears}` : ''}`;

  let buildLabel;
  if (totalDays <= 14) buildLabel = `${Math.ceil(totalDays / 7)}-week build`;
  else if (totalDays < 120) buildLabel = `${Math.ceil(totalDays / 30)}-month build`;
  else buildLabel = `${(totalDays / 365).toFixed(1)}-year build`;

  return {
    totalDays,
    unit,
    phases,
    establishYears,
    establishLabel,
    buildLabel,
    title: `From lawn to garden in ${buildLabel}`,
  };
}