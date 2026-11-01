import { createClientFromRequest } from '../../sdk.js';
import { fulfillCheckout, stripeClient } from '../../shared/billing.ts';

// Called when the buyer returns from Stripe Checkout, so Premium unlocks right
// away even before (or without) the webhook. Body: { sessionId }.
export default async function (req) {
  try {
    const s = stripeClient();
    if (!s) return Response.json({ error: 'Payments aren’t available right now.' }, { status: 503 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Sign in to finish your subscription.' }, { status: 401 });
    const { sessionId } = await req.json().catch(() => ({}));
    if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) return Response.json({ error: 'Missing checkout session.' }, { status: 400 });
    const session = await s.checkout.sessions.retrieve(sessionId);
    if (session.client_reference_id !== user.id) return Response.json({ error: 'That checkout belongs to another account.' }, { status: 403 });
    const purchase = await fulfillCheckout(base44, s, session);
    return Response.json({ premium: !!purchase });
  } catch (error) {
    console.error('confirm-checkout: error', error?.message);
    return Response.json({ error: 'Could not confirm your subscription yet. It will update shortly.' }, { status: 502 });
  }
}
