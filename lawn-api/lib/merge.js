// Combines lawns that overlap or touch into single lawn groups, so each group
// can be converted as one shared mulch bed and no area is counted twice.
// Lawns closer than TOUCH_M count as touching: hand-drawn outlines meant to
// meet rarely line up exactly.
import turfArea from '@turf/area';
import buffer from '@turf/buffer';
import union from '@turf/union';

const SQM_TO_SQFT = 10.7639;
const TOUCH_M = 0.5;

function polygonFeatures(geo) {
  if (!geo) return [];
  if (geo.type === 'FeatureCollection') return geo.features.flatMap((f) => polygonFeatures(f));
  if (geo.type === 'Feature') return polygonFeatures(geo.geometry);
  if (geo.type === 'Polygon') return [{ type: 'Feature', properties: {}, geometry: geo }];
  if (geo.type === 'MultiPolygon') return geo.coordinates.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } }));
  return [];
}

const unionAll = (features) => (features.length > 1 ? union({ type: 'FeatureCollection', features }) : features[0] ?? null);

/**
 * Merge a GeoJSON Polygon, MultiPolygon, Feature or FeatureCollection of lawns
 * into a FeatureCollection with one Polygon per lawn group (largest first),
 * each with properties.areaSqft. Throws on invalid geometry.
 * `exact: true` merges only overlapping/edge-sharing lawns, keeping crisp corners.
 */
export function mergeLawns(geo, { exact = false } = {}) {
  const parts = polygonFeatures(geo).filter((f) => f.geometry.coordinates[0]?.length >= 4);
  if (!parts.length) return { type: 'FeatureCollection', features: [] };

  // Close gaps narrower than TOUCH_M: grow every lawn by half of it, union,
  // then shrink the result back by the same amount (this rounds corners).
  let result = null;
  if (!exact) {
    const grown = unionAll(parts.map((f) => buffer(f, TOUCH_M / 2, { units: 'meters' })).filter(Boolean));
    const merged = grown ? buffer(grown, -TOUCH_M / 2, { units: 'meters' }) : null;
    result = merged?.geometry ? merged : null;
  }
  // Exact union (also the fallback if shrinking erased slivers).
  result ??= unionAll(parts);

  const features = polygonFeatures(result)
    .map((f) => {
      const areaSqft = Math.round(turfArea(f) * SQM_TO_SQFT);
      return { type: 'Feature', geometry: f.geometry, properties: { areaSqft, confidence: null } };
    })
    .filter((f) => f.properties.areaSqft > 0)
    .sort((a, b) => b.properties.areaSqft - a.properties.areaSqft);
  return { type: 'FeatureCollection', features };
}
