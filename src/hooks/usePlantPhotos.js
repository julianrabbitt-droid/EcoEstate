import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Module-level cache so photos fetched once for a species are reused across
// pages and re-renders. Wikipedia thumbnails are stable URLs, so caching is safe.
const cache = new Map(); // id -> url | null

export function usePlantPhotos(plants = []) {
  const [photos, setPhotos] = useState(() => {
    const m = {};
    plants.forEach((p) => { const u = cache.get(p.id); if (u) m[p.id] = u; });
    return m;
  });

  const ids = plants.map((p) => p.id).sort().join(',');
  useEffect(() => {
    let cancelled = false;
    const needed = plants.filter((p) => !cache.has(p.id));
    if (!needed.length) {
      const m = {};
      plants.forEach((p) => { const u = cache.get(p.id); if (u) m[p.id] = u; });
      setPhotos(m);
      return;
    }
    base44.functions
      .invoke('getPlantPhotos', { plants: needed.map((p) => ({ id: p.id, scientific: p.scientific })) })
      .then((res) => {
        const got = (res.data && res.data.photos) || {};
        needed.forEach((p) => { cache.set(p.id, got[p.id] || null); });
        if (cancelled) return;
        const m = {};
        plants.forEach((p) => { const u = cache.get(p.id); if (u) m[p.id] = u; });
        setPhotos(m);
      })
      .catch(() => { needed.forEach((p) => cache.set(p.id, null)); });
    return () => { cancelled = true; };
  }, [ids]);

  return photos;
}