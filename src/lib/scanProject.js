import { geoJsonOuterRings } from '@/lib/geo';

// Buildings and trees from the lawn API in the project's format: building
// outlines with their measured heights (same order), trees with height and crown.
export function scannedStructures(d) {
  const buildings = [];
  const buildingHeightsFt = [];
  const buildingRoofs = []; // { color, shape } from the aerial photo and canopy heights, same order
  for (const f of d?.buildings?.features || []) {
    const ring = geoJsonOuterRings(f.geometry)[0];
    if (!ring) continue;
    buildings.push(ring);
    buildingHeightsFt.push(f.properties?.heightFt ?? null);
    const p = f.properties || {};
    buildingRoofs.push({
      color: p.roofColor || null,
      shape: p.roofShape || null,
      // What mappers recorded (OpenStreetMap via Overture).
      mappedShape: p.mappedRoofShape || null,
      material: p.roofMaterial || null,
      facadeMaterial: p.facadeMaterial || null,
      facadeColor: p.facadeColor || null,
      // The roof as lidar surveyed it, when it did (see the lawn API's roofHeightMap).
      grid: p.roofGrid || null,
    });
  }
  const trees = (d?.trees || []).map((t) => ({ latLng: [t.lat, t.lon], radiusFt: t.radiusFt, heightFt: t.heightFt }));
  const paths = [...(d?.paths?.features || []), ...(d?.nearbyRoads?.features || []), ...(d?.paved?.features || [])]
    .map((f) => ({ polygonLatLng: geoJsonOuterRings(f.geometry)[0], kind: f.properties?.kind, name: f.properties?.name || null }))
    .filter((p) => p.polygonLatLng);
  // The yard from above (public-domain NAIP), for the model's ground.
  const groundImage = d?.groundImage ? { url: d.groundImage.url || `data:image/png;base64,${d.groundImage.png}`, west: d.groundImage.west, south: d.groundImage.south, east: d.groundImage.east, north: d.groundImage.north } : null;
  // Swimming pools, as [lat, lng] outlines (never lawn; water in the 3D model).
  const pools = (d?.pools?.features || []).map((f) => geoJsonOuterRings(f.geometry)[0]).filter((ring) => ring && ring.length >= 3);
  return { buildings, buildingHeightsFt, buildingRoofs, trees, paths, pools, groundImage };
}

// A scan (the lawn API's answer) as the project the 3D view draws, before it
// is saved: the check step's preview, and the scan review's renders.
export function projectFromScan(d, place = null) {
  const boundary = d?.lawnSqft > 0 ? geoJsonOuterRings(d.lawn) : [];
  if (!d?.location) return null;
  return {
    address: d.address,
    city: place?.city || '',
    state: place?.state || '',
    zip: place?.zip || '',
    countryCode: 'US',
    center: [d.location.lat, d.location.lon],
    boundary,
    totalSqft: d.lawnSqft,
    breakdown: { turf: d.lawnSqft, beds: 0, bare: 0 },
    lotOutline: geoJsonOuterRings(d.parcel?.geometry)[0] || null,
    lotSizeSqft: d.parcel?.areaSqft || 0,
    ...scannedStructures(d),
  };
}
