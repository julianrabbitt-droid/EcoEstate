import { createClientFromRequest } from '../../sdk.js';
import { hasPremiumFeatures } from '../../shared/entitlements.ts';

// Starts tracking a scanned property's conversion (My projects, a paid
// feature: EcoEstate Pro or the free student/educator unlock). Tracked
// projects are created here with the service role, after checking the
// entitlement server-side; the entity itself only allows admins to create.
// Body: { projectId }. Idempotent per property.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Sign in to track a project.' }, { status: 401 });
    if (!(await hasPremiumFeatures(base44, user.id))) {
      return Response.json({ error: 'Project tracking is part of EcoEstate Pro, or free with a school email.' }, { status: 402 });
    }
    const { projectId } = await req.json().catch(() => ({}));
    if (typeof projectId !== 'string' || !projectId) return Response.json({ error: 'Choose a property to track.' }, { status: 400 });

    // Read the scan as the user, so only their own properties can be tracked.
    const project = await base44.entities.Project.get(projectId).catch(() => null);
    if (!project) return Response.json({ error: 'That property wasn’t found.' }, { status: 404 });

    const { items } = await base44.asServiceRole.entities.TrackedProject.filter({ projectId, created_by_id: user.id }, { limit: 1 });
    if (items?.length) return Response.json(items[0]);

    const data = JSON.parse(project.data || '{}');
    const center = Array.isArray(data.center) && data.center.length === 2 ? data.center.map(Number) : null;
    // The place name or street address, before the city ("920, Moreno Avenue" -> "920 Moreno Avenue").
    const parts = String(data.address || '').split(',').map((p) => p.trim()).filter(Boolean);
    const numbered = /^\d+[a-z]?$/i.test(parts[0] || '') && parts[1];
    const name = (numbered ? `${parts[0]} ${parts[1]}` : parts[0]) || 'My property';
    // What other members see: the city or neighborhood after the street, never the street itself.
    const place = parts.slice(numbered ? 2 : 1).find((p) => !/county$/i.test(p) && !/^\d/.test(p));
    const mapLabel = place || 'Member project';
    const tracked = await base44.asServiceRole.entities.TrackedProject.create({
      projectId,
      name,
      mapLabel,
      address: data.address || '',
      center,
      mapPoint: center ? center.map((v) => Math.round(v * 100) / 100) : null, // ~1 km, for the community map
      ownerName: String(user.full_name || '').split(' ')[0] || 'A neighbor',
      lawnSqft: Number(data.breakdown?.turf || data.totalSqft || 0),
      startDate: new Date().toISOString().slice(0, 10),
      waterPricePer1000Gal: Number(data.lawnImpact?.assumptions?.waterPricePer1000Gal || 0),
      shareOnMap: false,
      convertedSqft: 0,
    });
    return Response.json(tracked);
  } catch (error) {
    console.error('startTracking: error', error);
    return Response.json({ error: 'Could not start tracking this project.' }, { status: 500 });
  }
}
