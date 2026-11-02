import { createClientFromRequest } from '../../sdk.js';

// Free tester access while EcoEstate is being built: anyone with the beta link
// (/beta?code=…) who signs in gets the member features (Real 3D, design from a
// sentence, the community and project tracking), recorded like the student
// unlock as a paid '3d_view' Base44Purchase with amount "0" and betaUnlock set.
// The code comes from BETA_CODE on the server (the default below until it's
// set). Idempotent.
const BETA_CODE = process.env.BETA_CODE || 'native-garden-preview';
const PRODUCT_ID = '3d_view';

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
  if (!user) return Response.json({ error: 'Sign in to use your tester access.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (String(body.code || '').trim().toLowerCase() !== BETA_CODE.toLowerCase()) {
    return Response.json({ error: 'That tester link is not valid. Ask for a new one.' }, { status: 403 });
  }

  const { items } = await base44.asServiceRole.entities.Base44Purchase.filter(
    { productId: PRODUCT_ID, appUserId: user.id, status: 'paid' },
    { limit: 1 },
  );
  if (items && items.length > 0) return Response.json({ unlocked: true });

  await base44.asServiceRole.entities.Base44Purchase.create({
    checkoutSessionId: `beta_${user.id}_${PRODUCT_ID}_${Date.now()}`,
    status: 'paid',
    appUserId: user.id,
    buyerEmail: user.email,
    productId: PRODUCT_ID,
    productName: 'EcoEstate beta tester access',
    quantity: 1,
    amount: '0',
    currency: 'USD',
    betaUnlock: true,
    paidAt: new Date().toISOString(),
  });
  return Response.json({ unlocked: true, new: true });
}
