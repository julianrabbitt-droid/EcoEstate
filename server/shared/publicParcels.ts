// Public assessor-map geometry, not building footprints or a legal survey.
// Providers are explicitly allowlisted; locations outside coverage use visual bounds.
const providers = [{
  label: 'San Luis Obispo County Assessor parcel map',
  url: 'https://gis.slocounty.ca.gov/arcgis/rest/services/Public/SLO_CO_PARCELS/MapServer/0',
  extent: [-121.35, 34.86, -119.46, 35.84],
}];

export async function fetchPublicParcel(lat, lng) {
  const provider = providers.find(({ extent: [west, south, east, north] }) => lng >= west && lng <= east && lat >= south && lat <= north);
  if (!provider) return null;
  const params = new URLSearchParams({
    f: 'json', geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'apn', returnGeometry: 'true', resultRecordCount: '2',
  });
  const response = await fetch(`${provider.url}/query?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const data = await response.json();
  // Ambiguous matches and multipart parcels need manual review, not a guessed union.
  if (data.error || data.exceededTransferLimit || data.features?.length !== 1) return null;
  const rings = data.features[0].geometry?.rings;
  if (rings?.length !== 1 || rings[0].length < 4 || rings[0].length > 121) return null;
  const outline = rings[0].slice(0, -1).map(([x, y]) => [y, x]);
  if (!outline.every(point => point.every(Number.isFinite) && Math.abs(point[0]) <= 85 && Math.abs(point[1]) <= 180)) return null;
  return { outline, source: provider.label, sourceUrl: provider.url };
}