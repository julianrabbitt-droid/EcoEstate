import { createClientFromRequest } from '../../sdk.js';
import { hasPremiumFeatures } from '../../shared/entitlements.ts';

// Deterministic garden designer. Part of the paid plans (Pro, the
// student/educator unlock, city partners): checked here, not just in the page.
//
// Replaces the previous LLM call. Scores every plant in the supplied catalog
// against the user's free-text description and the site's sun exposure, picks
// the 3–5 best matches, and returns a normalized species mix plus a planting
// pattern and short note. Same input/output shape as before, so the 3D view and
// the "Design from text" button work unchanged — with no model invocation.

const WILDLIFE_KEYS = {
  hummingbird: ['Hummingbirds'],
  hummingbirds: ['Hummingbirds'],
  bee: ['Native bees'],
  bees: ['Native bees'],
  pollinator: ['Native bees', 'Butterflies', 'Hummingbirds'],
  pollinators: ['Native bees', 'Butterflies', 'Hummingbirds'],
  butterfly: ['Butterflies'],
  butterflies: ['Butterflies'],
  bird: ['Birds'],
  birds: ['Birds'],
  berry: ['Birds'],
  berries: ['Birds'],
};

const TRAIT_KEYS = {
  drought: { water: ['Very low', 'Low'], score: 2 },
  'low water': { water: ['Very low', 'Low'], score: 2 },
  'very low water': { water: ['Very low'], score: 3 },
  'dry': { water: ['Very low', 'Low'], score: 1 },
  shade: { sun: ['Part shade'], score: 2, pattern: 'clusters' },
  shady: { sun: ['Part shade'], score: 2, pattern: 'clusters' },
  sun: { sun: ['Full sun'], score: 1 },
  sunny: { sun: ['Full sun'], score: 1 },
  hedge: { forms: ['shrub'], score: 2, pattern: 'rows' },
  screen: { forms: ['shrub', 'tree'], score: 2, pattern: 'rows' },
  tree: { forms: ['tree'], score: 3 },
  shrub: { forms: ['shrub'], score: 2 },
  flower: { forms: ['flower'], score: 1 },
  wildflower: { forms: ['flower'], score: 2 },
  grass: { forms: ['grass'], score: 2 },
  meadow: { forms: ['grass', 'flower'], score: 2, pattern: 'scatter' },
  groundcover: { forms: ['flower', 'grass'], score: 2 },
  cover: { score: 1 },
  color: { forms: ['flower'], score: 1 },
  colourful: { forms: ['flower'], score: 1 },
  evergreen: { score: 1 },
  fragrant: { score: 1 },
  scent: { score: 1 },
};

function scorePlant(plant, promptLower, tokens, siteSun) {
  let score = 1;
  let patternHint = null;

  for (const [key, wildlife] of Object.entries(WILDLIFE_KEYS)) {
    if (promptLower.includes(key) && (plant.wildlife || []).some((w) => wildlife.includes(w))) score += 2;
  }

  for (const [key, rule] of Object.entries(TRAIT_KEYS)) {
    if (!promptLower.includes(key)) continue;
    if (rule.water && rule.water.includes(plant.water)) score += rule.score;
    if (rule.sun && rule.sun.includes(plant.sun)) score += rule.score;
    if (rule.forms && rule.forms.includes(plant.form)) score += rule.score;
    if (rule.pattern) patternHint = rule.pattern;
  }

  const name = `${plant.common || ''} ${plant.scientific || ''}`.toLowerCase();
  for (const t of tokens) {
    if (t.length > 3 && name.includes(t)) score += 3;
  }

  if (siteSun === 'Full sun' && plant.sun === 'Part shade') score -= 2;
  if (siteSun === 'Part shade' && plant.sun === 'Full sun') score -= 1;

  return { score: Math.max(0.1, score), patternHint };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || !(await hasPremiumFeatures(base44, user.id))) {
      return Response.json({ error: 'Designing from a sentence is part of EcoEstate Pro and the free student unlock. See Plans.' }, { status: 402 });
    }
    const { prompt, catalog, sun } = await req.json().catch(() => ({}));
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3)
      return Response.json({ error: 'Describe the garden you want.' }, { status: 400 });
    if (!Array.isArray(catalog) || !catalog.length)
      return Response.json({ error: 'Plant catalog is required.' }, { status: 400 });

    const promptLower = prompt.toLowerCase();
    const tokens = promptLower.split(/[^a-z]+/).filter(Boolean);
    const siteSun = typeof sun === 'string' ? sun : '';

    const scored = catalog
      .slice(0, 3000)
      .filter((p) => p && typeof p === 'object')
      .map((plant) => {
        const { score, patternHint } = scorePlant(plant, promptLower, tokens, siteSun);
        return { plant, score, patternHint };
      })
      .sort((a, b) => b.score - a.score);

    const top = scored.slice(0, 5).filter((s) => s.score >= 2);
    const picks = top.length >= 3 ? top : scored.slice(0, 3);

    const totalScore = picks.reduce((sum, p) => sum + p.score, 0) || 1;
    let species = picks.map((p) => ({
      speciesId: p.plant.id,
      share: Math.max(0.02, Math.round((p.score / totalScore) * 1000) / 1000),
    }));
    const shareSum = species.reduce((s, x) => s + x.share, 0) || 1;
    species = species.map((x) => ({ ...x, share: Math.round((x.share / shareSum) * 1000) / 1000 }));

    const patternHints = picks.map((p) => p.patternHint).filter(Boolean);
    const pattern = patternHints[0] || 'drifts';

    const names = picks.map((p) => p.plant.common).filter(Boolean);
    const note = names.length
      ? `A ${pattern === 'scatter' ? 'naturalistic' : pattern === 'rows' ? 'structured' : 'layered'} native mix of ${names.join(', ')} matched to your description.`
      : 'A custom native mix built from your description.';

    return Response.json({ species, pattern, note });
  } catch (error) {
    console.error('designFromPrompt: error', error);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}