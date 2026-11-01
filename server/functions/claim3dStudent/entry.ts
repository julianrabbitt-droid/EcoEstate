import { createClientFromRequest } from '../../sdk.js';
import { emailDomain, isSchoolDomain } from '../../student.js';

// Free 3D-view unlock for students and educators. The caller must be a signed-in
// app user. We verify the platform-authenticated user's email domain against the
// community-maintained JetBrains/swot school-domain directory (which includes
// legitimate non-.edu school domains), with a small blocklist of public email
// providers. We never trust a client-supplied email or domain, and we never
// grant if the directory can't be reached. The grant is a paid Base44Purchase
// record (the entitlement the frontend already reads) with studentUnlock = true
// and amount "0" — no payment, no webhook. Idempotent.

// A verified school email unlocks the 3D Garden View AND the Full Auto Scan at
// no cost — the same entitlements as EcoEstate Pro, granted via the
// '3d_view' purchase record the entitlement checks read. The same check also
// runs automatically on sign-in (server/student.js); this is the manual path.
const UNLOCK_PRODUCTS = {
  '3d_view': '3D Garden View — Student / Educator Unlock',
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth
      .me()
      .catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Sign in to unlock' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const productId = UNLOCK_PRODUCTS[body.productId] ? body.productId : '3d_view';
    const productName = UNLOCK_PRODUCTS[productId];

    const domain = emailDomain(user.email);
    if (!domain) {
      return Response.json(
        { error: 'Add a school email to your account, then try again.' },
        { status: 400 },
      );
    }

    let school;
    try {
      school = await isSchoolDomain(domain);
    } catch (_) {
      return Response.json(
        { error: "Couldn't reach the school directory. Please try again in a moment." },
        { status: 503 },
      );
    }
    if (!school) {
      return Response.json(
        {
          error:
            "That email domain isn't recognized as a school. Unlock this feature, or sign in with a school email address.",
        },
        { status: 403 },
      );
    }

    // Idempotent: if a paid grant already exists for this user, they're unlocked.
    const { items } = await base44.asServiceRole.entities.Base44Purchase.filter(
      { productId, appUserId: user.id, status: 'paid' },
      { limit: 1 },
    );
    if (items && items.length > 0) {
      return Response.json({ unlocked: true, student: true });
    }

    await base44.asServiceRole.entities.Base44Purchase.create({
      checkoutSessionId: `student_${user.id}_${productId}_${Date.now()}`,
      status: 'paid',
      appUserId: user.id,
      buyerEmail: user.email,
      productId,
      productName,
      quantity: 1,
      amount: '0',
      currency: 'USD',
      studentUnlock: true,
      paidAt: new Date().toISOString(),
    });

    return Response.json({ unlocked: true, student: true });
  } catch (error) {
    console.error('claim3dStudent: error', error);
    return Response.json({ error: 'Could not unlock right now. Please try again.' }, { status: 500 });
  }
}