import { createClientFromRequest } from '../../sdk.js';
import { APP_URL } from '../../config.js';
import { billingAccount, stripeClient } from '../../shared/billing.ts';

// Opens Stripe's customer portal, where subscribers cancel or update payment details.
export default async function (req) {
  try {
    const s = stripeClient();
    if (!s) return Response.json({ error: 'Payments aren’t available right now.' }, { status: 503 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Sign in first.' }, { status: 401 });
    const account = await billingAccount(base44, user, s);
    const portal = await s.billingPortal.sessions.create({ customer: account.stripeCustomerId, return_url: `${APP_URL}/my-projects` });
    return Response.json({ redirectUrl: portal.url });
  } catch (error) {
    console.error('billing-portal: error', error?.message);
    return Response.json({ error: 'Could not open subscription settings.' }, { status: 502 });
  }
}
