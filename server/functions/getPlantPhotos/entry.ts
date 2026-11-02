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

// Who took each Wikimedia Commons photo and under which license, so the app
// can credit it as the license requires: { fileName: { artist, license, url } }.
async function photoCredits(files) {
  if (!files.length) return {};
  const titles = files.map((f) => encodeURIComponent(`File:${f}`)).join('|');
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url&iiextmetadatafilter=Artist|LicenseShortName&titles=${titles}&origin=*`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'EcoEstate/1.0 (native-plant-photo-lookup)' } });
    const pages = (await res.json())?.query?.pages || {};
    const out = {};
    for (const pg of Object.values(pages)) {
      const info = pg?.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata || {};
      const artist = String(meta.Artist?.value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
      out[String(pg.title).replace(/^File:/, '').replace(/ /g, '_')] = out[String(pg.title).replace(/^File:/, '')] = {
        artist: artist || 'Unknown author',
        license: String(meta.LicenseShortName?.value || '').trim() || 'see source',
        url: info.descriptionurl || null,
      };
    }
    return out;
  } catch {
    return {};
  }
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
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&titles=${titles}&piprop=thumbnail|name&pithumbsize=500&pilimit=50&redirects=1&origin=*`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'EcoEstate/1.0 (native-plant-photo-lookup)' },
    });
    const data = await res.json().catch(() => ({}));
    const query = (data && data.query) || {};
    const pages = query.pages || {};

    const byTitle = {};
    const fileByTitle = {};
    Object.values(pages).forEach((pg) => {
      if (pg && pg.thumbnail && pg.thumbnail.source) byTitle[pg.title] = pg.thumbnail.source;
      if (pg && pg.pageimage) fileByTitle[pg.title] = pg.pageimage;
    });
    const credits = await photoCredits(Object.values(fileByTitle));

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
    const credit = {};
    list.forEach((p) => {
      const t = resolve(p.title);
      if (byTitle[t]) photos[p.id] = byTitle[t];
      if (credits[fileByTitle[t]]) credit[p.id] = credits[fileByTitle[t]];
    });
    return Response.json({ photos, credits: credit });
  } catch (error) {
    console.error('getPlantPhotos: error', error);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}