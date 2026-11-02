import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Rebates for a scanned property, from the programs that serve its location
// (water utility, county, state). Results are kept for the session.
const cache = new Map();

export const NO_REBATES = { rows: [], best: null, extras: [], total: 0, place: null };

export function useRebates(project) {
  const [lat, lon] = Array.isArray(project?.center) ? project.center : [];
  const turfSqft = Math.round(project?.breakdown?.turf || 0);
  const key = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(5)},${lon.toFixed(5)}:${turfSqft}` : null;
  const [rebates, setRebates] = useState(() => (key && cache.get(key)) || null);

  useEffect(() => {
    if (!key) return undefined;
    if (cache.has(key)) {
      setRebates(cache.get(key));
      return undefined;
    }
    let cancelled = false;
    base44.functions
      .invoke('findRebates', { lat, lon, turfSqft })
      .then(({ data }) => {
        cache.set(key, data);
        if (!cancelled) setRebates(data);
      })
      .catch(() => !cancelled && setRebates(NO_REBATES));
    return () => {
      cancelled = true;
    };
  }, [key, lat, lon, turfSqft]);

  return key ? rebates : NO_REBATES;
}
