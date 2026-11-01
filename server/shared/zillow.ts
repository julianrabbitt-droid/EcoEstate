import { secrets } from '../sdk.js';
import { recordUsage } from '../usage.js';

function toSqft(value, unit) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return null;
  const u = String(unit || '').toLowerCase();
  if (u.includes('acre')) return Math.round(v * 43560);
  return Math.round(v); // assume square feet
}

function parseProp(p) {
  if (!p || typeof p !== 'object') return null;
  const lotValue = p.lotAreaValue ?? p.lotArea ?? p.lotSize ?? p.lot_area;
  const lotUnit = p.lotAreaUnit ?? p.lotAreaUnitShort ?? p.lot_unit;
  const living = p.livingArea ?? p.livingAreaValue ?? p.living_area ?? p.builtArea;
  const lotSqft = toSqft(lotValue, lotUnit);
  const livingSqft = Number(living) > 0 ? Math.round(Number(living)) : null;
  if (!lotSqft && !livingSqft) return null;
  const a = p.address && typeof p.address === 'object' ? p.address : p;
  const addressText = typeof p.address === 'string' ? p.address :
    (a.streetAddress ? `${a.streetAddress}${a.city ? `, ${a.city}` : ''}${a.state ? ` ${a.state}` : ''}${a.zipcode ? ` ${a.zipcode}` : ''}`.trim() : null);
  return {
    lotSizeSqft: lotSqft || null,
    livingAreaSqft: livingSqft || null,
    zpid: p.zpid ?? null,
    address: addressText,
    bedrooms: p.bedrooms ?? null,
    bathrooms: p.bathrooms ?? null,
    yearBuilt: p.yearBuilt ?? null,
  };
}

function firstProp(json, requestedAddress) {
  const abbreviations = { street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', boulevard: 'blvd', lane: 'ln', court: 'ct', north: 'n', south: 's', east: 'e', west: 'w' };
  const tokens = value => String(value || '').toLowerCase().replace(/[^a-z0-9 -]/g, ' ').split(/\s+/).filter(Boolean).map(t => abbreviations[t] || t);
  const requested = tokens(requestedAddress);
  if (!/^\d/.test(requested[0] || '') || requested.length < 3) return null;
  const candidates = Array.isArray(json) ? json : [...(json?.props || []), ...(Array.isArray(json?.data) ? json.data : []), json?.property, !Array.isArray(json?.data) ? json?.data : null, json];
  for (const candidate of candidates) {
    const prop = parseProp(candidate);
    if (!prop?.address) continue;
    const actual = tokens(prop.address);
    const zip = String(requestedAddress).match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5);
    const actualZip = String(prop.address).match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5);
    if (requested.slice(0, 3).every((t, i) => actual[i] === t) && (!zip || !actualZip || zip === actualZip)) return prop;
  }
  return null; // A nearby for-sale listing is not the requested property's record.
}

/** Pull lot size + living area from Zillow via RapidAPI. Returns null without a key or on any miss. */
export async function fetchZillowProperty(address) {
  const key = secrets.get('RAPIDAPI_KEY');
  if (!key || !address) return null;
  const host = secrets.get('RAPIDAPI_ZILLOW_HOST') || 'zillow-com1.p.rapidapi.com';
  const headers = { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host };
  const loc = encodeURIComponent(address.slice(0, 200));

  // Try the two most common search endpoint shapes across Zillow RapidAPI providers.
  const attempts = [
    `https://${host}/propertyExtendedSearch?location=${loc}&status_type=ForSale&home_type=Houses&page=1`,
    `https://${host}/search?location=${loc}&page=1`,
    `https://${host}/propertyExtendedSearch?location=${loc}&page=1`,
  ];

  for (const url of attempts) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      recordUsage('rapidapi_zillow', 1, 'zillow');
      if (!res.ok) continue;
      const json = await res.json();
      const prop = firstProp(json, address);
      if (prop) return prop;
    } catch {
      /* try next endpoint */
    }
  }
  return null;
}