import { createClientFromRequest } from '../../sdk.js';
import { fetchStreetView } from '../../shared/streetView.ts';
import { fetchZillowProperty } from '../../shared/zillow.ts';
import { fitFrame, frameForOutline, framePoint, latLngToFrame, normalizeRing, overviewFrame, touchesEdge } from '../../shared/propertyGeometry.ts';
import { boundaryIsRoof } from '../../shared/propertyScanBounds.ts';
import { fetchSatelliteFrame, privateStreetView, tracePropertyFrame } from '../../shared/propertyScanVision.ts';
import { describeBuildingFromFootprint } from '../../shared/propertyEstimate.ts';
import { scanPropertyLawns } from '../../shared/propertyScanSearch.ts';
import { fetchPublicParcel } from '../../shared/publicParcels.ts';

const COORD_PRECISION = 1e5;
function cacheKeyFor(lat, lng) { return `${Math.round(lat * COORD_PRECISION)},${Math.round(lng * COORD_PRECISION)}`; }

async function reSignFile(base44, fileUri) {
  if (!fileUri) return null;
  try {
    const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 3600 });
    return signed_url;
  } catch { return null; }
}

function validOutline(value) {
  if (!Array.isArray(value) || value.length < 3 || value.length > 120) return null;
  return value.every(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(p[0]) <= 85 && Math.abs(p[1]) <= 180) ? value : null;
}

function scanResponse(image, frame, streetViewImage, estimate, searchedAround = false, reason = '') {
  const manualDrawingRequired = !estimate || estimate.lawnAreaSqft < 1 || estimate.boundaryClipped;
  return Response.json({
    satelliteImage: image.url, satelliteFileUri: image.fileUri, streetViewImage,
    frame: { center: [frame.lat, frame.lng], zoom: frame.zoom, logicalWidth: 640, imageScale: 2 },
    estimate, manualDrawingRequired, searchedAround,
    message: manualDrawingRequired ? reason || (searchedAround
      ? 'No lawn could be detected reliably after checking the other parts of the property. Click around your lawn below to draw it yourself.'
      : 'No lawn could be detected reliably within the property boundary. Click around your lawn below to draw it yourself.') : null,
  });
}

// Cache a successful scan (lawnAreaSqft > 0, not clipped) then return the response.
async function finishScan(base44, cacheKey, lat, lng, image, frame, streetViewImage, streetViewFileUri, estimate, searchedAround, reason = '') {
  if (cacheKey && estimate && estimate.lawnAreaSqft > 0 && !estimate.boundaryClipped) {
    try {
      await base44.asServiceRole.entities.ScanCache.deleteMany({ cacheKey });
      await base44.asServiceRole.entities.ScanCache.create({
        cacheKey, lat, lng,
        estimateJson: JSON.stringify(estimate),
        frameJson: JSON.stringify({ center: [frame.lat, frame.lng], zoom: frame.zoom, logicalWidth: 640, imageScale: 2 }),
        satelliteFileUri: image?.fileUri || '',
        streetViewFileUri: streetViewFileUri || '',
        searchedAround: !!searchedAround,
      });
      console.info('Scan cached:', { cacheKey, lawnAreaSqft: estimate.lawnAreaSqft });
    } catch (e) { console.warn('Scan cache write failed:', e?.message); }
  }
  return scanResponse(image, frame, streetViewImage, estimate, searchedAround, reason);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { lat, lng } = body;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat + lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
      return Response.json({ error: 'A valid property location is required.' }, { status: 400 });
    }
    const address = typeof body.address === 'string' ? body.address.trim().slice(0, 200) : '';
    // Scan results are cached per rounded location so repeated scans of the same
    // property return identical geometry (the vision LLM is non-deterministic).
    const cacheKey = cacheKeyFor(lat, lng);
    const fresh = body.fresh === true;
    if (!fresh) {
      try {
        const { items } = await base44.asServiceRole.entities.ScanCache.filter({ cacheKey }, { limit: 1 });
        const cached = items?.[0];
        if (cached && cached.estimateJson) {
          const estimate = JSON.parse(cached.estimateJson);
          const frame = JSON.parse(cached.frameJson);
          const [satelliteImage, streetViewImage] = await Promise.all([
            reSignFile(base44, cached.satelliteFileUri),
            reSignFile(base44, cached.streetViewFileUri),
          ]);
          console.info('Scan cache hit:', { cacheKey, lawnAreaSqft: estimate.lawnAreaSqft });
          return Response.json({
            satelliteImage, satelliteFileUri: cached.satelliteFileUri, streetViewImage,
            frame, estimate,
            manualDrawingRequired: !estimate || estimate.lawnAreaSqft < 1 || estimate.boundaryClipped,
            searchedAround: !!cached.searchedAround, message: null, cached: true,
          });
        }
      } catch (e) { console.warn('Scan cache read failed:', e?.message); }
    }
    // The full 4-point search is free for any signed-in account.
    let full = false;
    if (body.full === true) {
      const caller = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
      if (!caller) {
        return Response.json({ error: 'Sign in to run the Full Auto Scan.' }, { status: 401 });
      }
      full = true;
    }
    const suppliedOutline = validOutline(body.outline);
    // Unknown/legacy geocoder polygons must never silently become property lines.
    const outline = ['site', 'parcel'].includes(body.outlineKind) ? suppliedOutline : null;
    const buildingOutline = validOutline(body.buildingOutline) || (body.outlineKind === 'building' ? suppliedOutline : null);
    console.info('Property boundary input:', { outlineKind: body.outlineKind || 'unknown', hasSiteBoundary: !!outline, hasBuildingFootprint: !!buildingOutline });
    const [record, streetViewResult, parcel] = await Promise.all([
      address && !outline ? fetchZillowProperty(address).catch(() => null) : Promise.resolve(null),
      fetchStreetView(base44, lat, lng, 0, '640x420').then(view => privateStreetView(base44, view)).catch(() => null),
      outline ? Promise.resolve(null) : fetchPublicParcel(lat, lng).catch(() => null),
    ]);
    const streetViewImage = streetViewResult?.url || null;
    const streetViewFileUri = streetViewResult?.fileUri || null;

    const attachBuilding = (estimate) => {
      if (!estimate) return estimate;
      const building = describeBuildingFromFootprint(estimate.houseFootprintSqft);
      if (building) estimate.building = building;
      return estimate;
    };

    const propertyOutline = parcel?.outline || outline;
    if (propertyOutline) {
      const frame = { ...frameForOutline(propertyOutline), targetLat: lat, targetLng: lng };
      const image = await fetchSatelliteFrame(base44, frame);
      const lot = normalizeRing(propertyOutline.map(point => latLngToFrame(frame, point)));
      const result = await scanPropertyLawns(base44, image, frame, lot, address, record, {}, full);
      if (result.estimate) {
        result.estimate.boundarySource = parcel ? 'public_parcel' : 'mapped_site';
        result.estimate.boundaryLabel = parcel?.source || 'Mapped site outline';
      }
      await attachBuilding(result.estimate);
      console.info('Mapped property scan:', { boundarySource: parcel?.source || 'mapped site', lotSizeSqft: result.estimate?.lotSizeSqft, lawnAreaSqft: result.estimate?.lawnAreaSqft, searchedAround: result.searchedAround });
      return await finishScan(base44, cacheKey, lat, lng, image, frame, streetViewImage, streetViewFileUri, result.estimate, result.searchedAround);
    }

    let contextFrame = { ...overviewFrame(lat, lng, record?.lotSizeSqft), targetLat: lat, targetLng: lng };
    let image = await fetchSatelliteFrame(base44, contextFrame);
    const locate = () => tracePropertyFrame(base44, image, contextFrame, address, record?.lotSizeSqft,
      buildingOutline ? buildingOutline.map(point => latLngToFrame(contextFrame, point)) : []);
    let context = await locate();
    let contextLot = normalizeRing(context?.lotPolygon);
    if (contextLot.length && (context.clipped || touchesEdge(contextLot)) && contextFrame.zoom > 12) {
      contextFrame = { ...contextFrame, zoom: contextFrame.zoom - 1 };
      image = await fetchSatelliteFrame(base44, contextFrame);
      context = await locate();
      contextLot = normalizeRing(context?.lotPolygon);
    }
    const roofs = [normalizeRing(context?.housePolygon), normalizeRing((buildingOutline || []).map(point => latLngToFrame(contextFrame, point)))];
    if (!contextLot.length || context.clipped || touchesEdge(contextLot) || Number(context.confidence) < 0.5 || roofs.some(roof => boundaryIsRoof(contextLot, roof))) {
      return await finishScan(base44, cacheKey, lat, lng, image, contextFrame, streetViewImage, streetViewFileUri, null, false,
        'The building was located, but the surrounding property lines could not be established reliably. Click around your lawn below to draw it yourself; no neighboring land has been included.');
    }

    const frame = { ...contextFrame, ...fitFrame(contextFrame, contextLot) };
    image = await fetchSatelliteFrame(base44, frame);
    // Keep the wide-view land boundary fixed: the lawn pass cannot shrink it to a roof.
    const lot = normalizeRing(contextLot.map(point => latLngToFrame(frame, framePoint(contextFrame, point))));
    const housePolygon = normalizeRing(normalizeRing(context.housePolygon).map(point => latLngToFrame(frame, framePoint(contextFrame, point))));
    const result = await scanPropertyLawns(base44, image, frame, lot, address, record, { ...context, housePolygon }, full);
    await attachBuilding(result.estimate);
    console.info('Property scan result:', { lotSizeSqft: result.estimate?.lotSizeSqft, lawnAreaSqft: result.estimate?.lawnAreaSqft, searchedAround: result.searchedAround });
    return await finishScan(base44, cacheKey, lat, lng, image, frame, streetViewImage, streetViewFileUri, result.estimate, result.searchedAround);
  } catch (error) {
    console.error('Property scan failed:', error?.message);
    return Response.json({ error: 'Auto-scan could not complete. Try measuring manually.' }, { status: 502 });
  }
}