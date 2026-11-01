import { createClientFromRequest } from '../../sdk.js';
import { fulfillCheckout, stripeClient, syncSubscription } from '../../shared/billing.ts';

// Stripe webhook: point an endpoint at POST /api/functions/payments-webhook with
// the events checkout.session.completed, customer.subscription.updated and
// customer.subscription.deleted, and put its signing secret in
// STRIPE_WEBHOOK_SECRET. Every event's signature is verified before use.
export default async function (req) {
  const s = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return Response.json({ error: 'Payments not configured' }, { status: 503 });
  let event;
  try {
    event = await s.webhooks.constructEventAsync(await req.text(), req.headers.get('stripe-signature') || '', secret);
  } catch (error) {
    console.warn('payments-webhook: bad signature', error?.message);
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }
  try {
    const base44 = createClientFromRequest(req);
    if (event.type === 'checkout.session.completed') await fulfillCheckout(base44, s, event.data.object);
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      await syncSubscription(base44, event.data.object);
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error('payments-webhook: error', event.type, error?.message);
    return Response.json({ error: 'Webhook handling failed' }, { status: 500 }); // Stripe retries
  }
}
