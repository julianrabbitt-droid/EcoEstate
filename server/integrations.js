// Replacements for Base44's built-in integrations:
//   InvokeLLM            -> turned off (no paid AI calls); the scan's vision
//                           fallback reports "unavailable" instead
//   connectors.callApi   -> Google Maps Platform, called directly with your API key
import { HttpError } from './entities.js';
import { recordUsage } from './usage.js';

export async function invokeLLM() {
  throw new HttpError(503, 'AI image analysis is not enabled');
}

const CONNECTOR_HOSTS = { maps: 'https://maps.googleapis.com' };

export async function callConnectorApi(connector, { method = 'GET', host = 'maps', path = '/', query = {}, body } = {}) {
  if (connector !== 'google_maps') throw new HttpError(400, `Unknown connector ${connector}`);
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { success: false, error: 'GOOGLE_MAPS_API_KEY is not set on the server' };
  const base = CONNECTOR_HOSTS[host] || `https://${host}`;
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, String(v));
  url.searchParams.set('key', key);

  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    const data = await res.json();
    return { success: res.ok, status: res.status, data, ...data };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!res.ok) return { success: false, status: res.status, error: buffer.toString('utf8').slice(0, 300) };
  if (path.endsWith('/staticmap')) recordUsage('google_static_map', 1, path);
  else if (path.endsWith('/streetview')) recordUsage('google_street_view', 1, path); // metadata lookups are free
  return { success: true, status: res.status, contentType, dataBase64: buffer.toString('base64') };
}
