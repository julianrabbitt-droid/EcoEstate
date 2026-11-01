import { createClientFromRequest } from '../../sdk.js';

// Cultivars (e.g. "Ceanothus 'Concha'") have no Wikipedia article — fall back to
// the genus. Clean binomials are queried as-is; the PageImages API follows
// redirects (e.g. Stipa pulchra -> Nassella pulchra) automatically.
function wikiTitle(scientific) {
  if (!scientific) return '';
  const s = String(scientific).trim();
  if (s.includes("'")) return s.split(' ')[0];
  return s;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const plants = Array.isArray(body.plants) ? body.plants : [];
    if (!plants.length) return Response.json({ error: 'plants is required' }, { status: 400 });

    const list = plants
      .slice(0, 50)
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({ id: String(p.id), title: wikiTitle(p.scientific) }))
      .filter((p) => p.id && p.title);
    if (!list.length) return Response.json({ photos: {} });

    const titles = list.map((p) => encodeURIComponent(p.title)).join('|');
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&titles=${titles}&piprop=thumbnail&pithumbsize=500&pilimit=50&redirects=1&origin=*`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'EcoEstate/1.0 (native-plant-photo-lookup)' },
    });
    const data = await res.json().catch(() => ({}));
    const query = (data && data.query) || {};
    const pages = query.pages || {};

    const byTitle = {};
    Object.values(pages).forEach((pg) => {
      if (pg && pg.thumbnail && pg.thumbnail.source) byTitle[pg.title] = pg.thumbnail.source;
    });

    // Resolve each input title through normalization + redirect chains to the
    // final page title (e.g. "Stipa pulchra" -> "Nassella pulchra").
    const resolve = (t) => {
      for (const n of query.normalized || []) if (n.from === t) t = n.to;
      for (let i = 0; i < 2; i++) {
        const r = (query.redirects || []).find((x) => x.from === t);
        if (!r) break;
        t = r.to;
      }
      return t;
    };

    const photos = {};
    list.forEach((p) => {
      const u = byTitle[resolve(p.title)];
      if (u) photos[p.id] = u;
    });
    return Response.json({ photos });
  } catch (error) {
    console.error('getPlantPhotos: error', error);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}