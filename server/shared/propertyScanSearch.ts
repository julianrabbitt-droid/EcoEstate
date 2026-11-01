import { framePoint, latLngToFrame, normalizeRing } from './propertyGeometry.ts';
import { clipToFrame, ringWithinLot } from './propertyScanBounds.ts';
import { buildEstimate } from './propertyEstimate.ts';
import { fetchSatelliteFrame, traceLawnsInOutline } from './propertyScanVision.ts';

const reproject = (ring, from, to) => (Array.isArray(ring) ? ring : []).map(point => latLngToFrame(to, framePoint(from, point)));

function asTrace(result, lot, context = {}) {
  return {
    lotPolygon: lot, clipped: !!context.clipped,
    features: (Array.isArray(result?.lawns) ? result.lawns : []).map(lawn => ({ type: 'lawn', polygon: lawn.polygon, holes: lawn.holes || [] })),
    buildings: Array.isArray(result?.buildings) && result.buildings.length ? result.buildings : (context.housePolygon?.length ? [{ polygon: context.housePolygon }] : []),
    trees: Array.isArray(result?.trees) ? result.trees.map(t => ({ point: t?.point, r: Number(t?.r) || 0 })) : [],
    paths: Array.isArray(result?.paths) ? result.paths.map(p => ({ polygon: p?.polygon })) : [],
    confidence: Math.min(Number(result?.confidence) || 0, Number.isFinite(context.confidence) ? context.confidence : 1),
    notes: [context.notes, result?.notes].filter(Boolean).join(' '),
    turfSpecies: '',
  };
}

export async function scanPropertyLawns(base44, image, frame, lot, address, record, context = {}, full = false) {
  const result = await traceLawnsInOutline(base44, image, frame, address, lot, record?.lotSizeSqft || 0);
  const trace = asTrace(result, lot, context);
  let estimate = buildEstimate(trace, frame, record);
  if (!estimate || estimate.lawnAreaSqft > 0 || estimate.boundaryClipped) return { estimate, searchedAround: false };

  // The simplified scan checks two diagonally-opposite ground locations; the
  // full scan checks all four sides of the property. Unlike roof-centered zoom
  // retries, these views inspect side/back/front land without changing the lot.
  const centers = full
    ? [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]
    : [[0.25, 0.25], [0.75, 0.75]];
  const searches = centers.map(([x, y]) => {
    const [lat, lng] = framePoint(frame, { x, y });
    const detail = frame.zoom >= 20 ? frame : { ...frame, lat, lng, zoom: frame.zoom + 1 };
    const mask = detail === frame
      ? clipToFrame(lot, [x - 0.25, y - 0.25, x + 0.25, y + 0.25])
      : clipToFrame(lot.map(point => latLngToFrame(detail, framePoint(frame, point))));
    return { detail, mask };
  }).filter(search => search.mask.length >= 3);
  const recovered = [];
  for (let i = 0; i < searches.length; i += 2) {
    const batch = await Promise.all(searches.slice(i, i + 2).map(async ({ detail, mask }) => {
      try {
        const detailImage = detail === frame ? image : await fetchSatelliteFrame(base44, detail);
        const scanned = await traceLawnsInOutline(base44, detailImage, detail, address, mask, 0, true);
        return (Array.isArray(scanned?.lawns) ? scanned.lawns : [])
          .map(lawn => ({ ...lawn, polygon: normalizeRing(lawn.polygon) }))
          .filter(lawn => ringWithinLot(lawn.polygon, mask))
          .map(lawn => ({
            type: 'lawn', polygon: normalizeRing(reproject(lawn.polygon, detail, frame)),
            holes: (Array.isArray(lawn.holes) ? lawn.holes : []).map(hole => normalizeRing(reproject(hole, detail, frame))).filter(hole => hole.length >= 3),
          }));
      } catch (error) {
        console.warn('Property detail search unavailable:', error?.message);
        return [];
      }
    }));
    recovered.push(...batch.flat());
  }
  estimate = buildEstimate({
    ...trace, features: recovered,
    notes: recovered.length ? 'Checked the property in separate detail views. ' + trace.notes : trace.notes,
  }, frame, record);
  console.info('Property lawn search:', { detailViews: searches.length, lawnAreaSqft: estimate?.lawnAreaSqft || 0 });
  return { estimate, searchedAround: searches.length > 0 };
}