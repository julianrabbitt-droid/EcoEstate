// Yearly reminder to every active EcoEstate Pro subscriber (California's
// Automatic Renewal Law): once a day, email subscribers whose subscription
// anniversary falls within the next week and who haven't had a reminder in
// the last 11 months. Each send is recorded on the purchase as proof.
import { entityService, purchaseCounts } from './entities.js';
import { emailConfigured, sendEmail } from './email.js';
import { proSubscriptionEmail } from './emailTemplates.js';
import { LEGAL_ADDRESS, LEGAL_OPERATOR } from './config.js';

const DAY = 24 * 3600 * 1000;

export async function sendDueRenewalReminders(now = new Date()) {
  const purchases = entityService('Base44Purchase', null, { service: true });
  const rows = await purchases.filter({ productId: 'premium', status: 'paid' });
  let sent = 0;
  for (const p of rows) {
    if (!purchaseCounts(p) || !p.buyerEmail || !p.paidAt) continue;
    const start = new Date(p.paidAt);
    if (now - start < 300 * DAY) continue; // the welcome email covers the first year
    if (p.reminderSentAt && now - new Date(p.reminderSentAt) < 330 * DAY) continue;
    const anniversary = new Date(start);
    anniversary.setFullYear(now.getFullYear());
    if (anniversary < now) anniversary.setFullYear(now.getFullYear() + 1);
    if (anniversary - now > 7 * DAY) continue;
    try {
      const mail = proSubscriptionEmail({ kind: 'reminder', termsVersion: p.termsVersion, operator: LEGAL_OPERATOR, address: LEGAL_ADDRESS });
      const result = await sendEmail({ to: p.buyerEmail, ...mail });
      await purchases.update(p.id, { reminderSentAt: now.toISOString(), reminderEmailId: result.id || null });
      sent++;
    } catch (e) {
      console.error('renewal reminder failed', p.id, e?.message);
    }
  }
  return sent;
}

export function startRenewalReminders() {
  if (!emailConfigured()) console.warn('  ! RESEND_API_KEY is not set — Pro confirmation and yearly reminder emails are printed, not sent.');
  const run = () => sendDueRenewalReminders().catch((e) => console.error('renewal reminders failed', e?.message));
  setTimeout(run, 60_000);
  setInterval(run, DAY).unref();
}
