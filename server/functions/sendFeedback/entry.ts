import { createClientFromRequest } from '../../sdk.js';
import { sendEmail } from '../../email.js';

// The Feedback button: saves the note (owner dashboard) and emails it to
// support@ecoestate.org. Signed in or not; one short note at a time.
const MAX_CHARS = 4000;

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  const body = await req.json().catch(() => ({}));
  const message = String(body.message || '').trim().slice(0, MAX_CHARS);
  if (message.length < 2) return Response.json({ error: 'Write a few words first.' }, { status: 400 });
  const page = String(body.page || '').slice(0, 300);
  const email = String(user?.email || body.email || '').trim().slice(0, 200);

  let beta = false;
  if (user) {
    const { items } = await base44.asServiceRole.entities.Base44Purchase.filter({ appUserId: user.id, status: 'paid' }, { limit: 20 });
    beta = (items || []).some((p) => p.betaUnlock);
  }
  await base44.asServiceRole.entities.Feedback.create({ message, page, email, appUserId: user?.id || '', beta });

  await sendEmail({
    to: 'support@ecoestate.org',
    subject: `Feedback${beta ? ' (tester)' : ''}: ${message.slice(0, 60)}`,
    text: `${message}\n\nPage: ${page || 'unknown'}\nFrom: ${email || 'not given'}${user ? ` (user ${user.id})` : ''}`,
  }).catch((err) => console.warn('[feedback] email not sent:', err.message)); // it's saved either way

  return Response.json({ ok: true });
}
