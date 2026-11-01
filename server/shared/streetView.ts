/** Shared Street View fetcher used by streetViewImage and autoScanProperty. */
export async function fetchStreetView(base44, lat, lng, heading = 0, size = '640x420') {
  const location = `${lat},${lng}`;
  const meta = await base44.asServiceRole.connectors.callApi('google_maps', {
    method: 'GET',
    host: 'maps',
    path: '/maps/api/streetview/metadata',
    query: { location, radius: '50' },
  });
  const metaData = meta?.data || meta || {};
  if (metaData.status !== 'OK') {
    return { available: false, status: metaData.status || 'UNKNOWN' };
  }
  const img = await base44.asServiceRole.connectors.callApi('google_maps', {
    method: 'GET',
    host: 'maps',
    path: '/maps/api/streetview',
    query: { location, size, heading: String(heading), radius: '50', source: 'outdoor' },
  });
  if (!img?.dataBase64) {
    return { available: false, status: 'NO_IMAGE' };
  }
  const contentType = img.contentType || 'image/jpeg';
  return {
    available: true,
    image: `data:${contentType};base64,${img.dataBase64}`,
    panoId: metaData.pano_id || '',
    heading,
  };
}