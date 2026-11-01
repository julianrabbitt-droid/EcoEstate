// Address -> lat/lon with Geocodio API v2 (GET /v2/geocode).
// The key is sent in the Authorization header, never in the URL, so it can't
// end up in logs or error messages.
import { ApiError, ConfigError, UpstreamError } from './errors.js';

const ENDPOINT = 'https://api.geocod.io/v2/geocode';

// Matches precise enough to find the property. Coarser ones (intersection,
// street centre, city, county, state) would land on the wrong parcel.
const PRECISE = new Set(['rooftop', 'point', 'range_interpolation', 'nearest_rooftop_match']);

export async function geocode(address) {
  const key = process.env.GEOCODIO_API_KEY;
  if (!key) throw new ConfigError('GEOCODIO_API_KEY', 'Address lookup needs a Geocodio API key.');

  const url = `${ENDPOINT}?${new URLSearchParams({ q: address, country: 'US', limit: '1' })}`;
  let r;
  try {
    r = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new UpstreamError('geocoder', 'network');
  }
  if (r.status === 422) return null; // Geocodio couldn't parse the address
  if (r.status === 401 || r.status === 403) throw new UpstreamError('geocoder', r.status, 'Geocodio rejected the API key or its permissions.');
  if (!r.ok) throw new UpstreamError('geocoder', r.status);

  const data = await r.json();
  const top = (data.results ?? []).find((res) => res.address_components?.country === 'US');
  if (!top) return null;
  if (!PRECISE.has(top.accuracy_type)) {
    throw new ApiError(404, 'address_not_precise', 'That address only matched a street or city, not a specific property. Include the house number.');
  }
  return {
    lat: Number(top.location.lat),
    lon: Number(top.location.lng),
    label: top.formatted_address,
    accuracy: top.accuracy_type,
  };
}
