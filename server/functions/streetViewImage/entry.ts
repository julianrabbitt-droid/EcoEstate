import { createClientFromRequest } from '../../sdk.js';
import { fetchStreetView } from '../../shared/streetView.ts';
import { has3dView } from '../../shared/entitlements.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // Street View imagery is a paid 3D-view resource; verify the caller's paid
    // (or student-unlocked) 3d_view entitlement before spending Maps quota.
    const caller = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!caller || !(await has3dView(base44, caller.id))) {
      return Response.json({ error: '3D Garden View is a paid feature.' }, { status: 402 });
    }
    const body = await req.json().catch(() => ({}));
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const heading = ((Number(body.heading || 0) % 360) + 360) % 360;
    const size = typeof body.size === 'string' && /^\d{2,4}x\d{2,4}$/.test(body.size) ? body.size : '640x420';
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: 'A property location is required.' }, { status: 400 });
    }
    const sv = await fetchStreetView(base44, lat, lng, heading, size);
    if (sv.available) return Response.json(sv);
    return Response.json({ available: false, status: sv.status });
  } catch (error) {
    return Response.json({ error: 'Street View is unavailable right now.' }, { status: 502 });
  }
}