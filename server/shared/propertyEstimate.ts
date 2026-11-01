import { areaInsideLot, framePoint, normalizeRing, ringArea, squareFeetPerFrame, touchesEdge } from './propertyGeometry.ts';
import { ringWithinLot } from './propertyScanBounds.ts';
import { featureTypes } from './propertyScanVision.ts';

// Deterministic building description: stories from footprint area, neutral
// defaults for roof and wall. Replaces the previous street-view LLM read — the
// 3D view already falls back to this same footprint heuristic, so the building
// still renders at a reasonable height with no AI call.
export function describeBuildingFromFootprint(houseFootprintSqft) {
  const footprint = Math.max(0, Math.round(Number(houseFootprintSqft) || 0));
  if (footprint < 1) return null;
  const stories = Math.max(1, Math.min(4, Math.round(footprint / 1200)));
  return { visible: true, stories, roofType: 'unknown', wallColor: 'gray', heightFt: Math.round(stories * 9.5) };
}

export function buildEstimate(trace, frame, record) {
  const lot = normalizeRing(trace?.lotPolygon);
  if (!lot.length) return null;
  const scale = squareFeetPerFrame(frame);
  const housePolygon = normalizeRing(trace.housePolygon);
  const buildingsSrc = Array.isArray(trace.buildings)
    ? trace.buildings.map(b => normalizeRing(b?.polygon || b)).filter(r => r.length >= 3)
    : (housePolygon.length ? [housePolygon] : []);
  const features = (Array.isArray(trace.features) ? trace.features : []).slice(0, 40).map(feature => ({
    type: featureTypes.includes(feature.type) ? feature.type : 'other',
    polygon: normalizeRing(feature.polygon),
    holes: (Array.isArray(feature.holes) ? feature.holes : []).slice(0, 12).map(normalizeRing).filter(r => r.length >= 3),
  })).filter(feature => feature.polygon.length >= 3 && (feature.type !== 'lawn' || ringWithinLot(feature.polygon, lot))).map(feature => ({
    ...feature,
    points: feature.polygon.map(point => framePoint(frame, point)),
    areaSqft: Math.round(areaInsideLot([feature], lot) * scale),
  })).filter(feature => feature.areaSqft > 0);
  const lawns = features.filter(feature => feature.type === 'lawn');
  const lotSizeSqft = Math.round(ringArea(lot) * scale);
  const recordLotSizeSqft = record?.lotSizeSqft || null;
  const recordMismatch = !!recordLotSizeSqft && Math.abs(recordLotSizeSqft - lotSizeSqft) / recordLotSizeSqft > 0.35;
  const boundaryClipped = !!trace.clipped || touchesEdge(lot);
  const imgWidthFt = Math.sqrt(scale);
  const trees = (Array.isArray(trace.trees) ? trace.trees : [])
    .map(t => {
      const pt = t?.point;
      if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number' || pt.x < 0 || pt.x > 1 || pt.y < 0 || pt.y > 1) return null;
      const r = Math.max(0.004, Math.min(0.25, Number(t.r) || 0.015));
      return { latLng: framePoint(frame, pt), radiusFt: Math.round(r * imgWidthFt) };
    })
    .filter(Boolean);
  const paths = (Array.isArray(trace.paths) ? trace.paths : [])
    .map(p => {
      const ring = normalizeRing(p?.polygon);
      if (ring.length < 3) return null;
      return { polygonLatLng: ring.map(point => framePoint(frame, point)) };
    })
    .filter(Boolean);
  return {
    lotSizeSqft, recordLotSizeSqft, recordMismatch, boundaryClipped,
    houseFootprintSqft: Math.round(areaInsideLot(buildingsSrc.map(polygon => ({ polygon, holes: [] })), lot) * scale),
    lawnAreaSqft: Math.round(areaInsideLot(lawns, lot) * scale),
    lotPolygon: lot, lotPolygonLatLng: lot.map(point => framePoint(frame, point)),
    features, lawns, lawnPolygon: lawns[0]?.polygon || [],
    buildings: buildingsSrc.map(polygon => ({ polygon, polygonLatLng: polygon.map(point => framePoint(frame, point)) })),
    trees, paths,
    confidence: Math.max(0, Math.min(boundaryClipped ? 0.35 : recordMismatch ? 0.5 : 1, Number(trace.confidence) || 0)),
    turfSpecies: String(trace.turfSpecies || '').slice(0, 80),
    notes: String(trace.notes || '').slice(0, 400),
    source: 'vision', recordSource: recordLotSizeSqft ? 'zillow' : null, usedFallback: false,
  };
}