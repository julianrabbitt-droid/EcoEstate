// Transactional email through Resend (https://resend.com/docs/api-reference/emails/send-email).
// Without RESEND_API_KEY, emails are printed to the server terminal instead so
// local development works with no mail provider, and a warning says so.

import { recordUsage } from './usage.js';

const RESEND_URL = 'https://api.resend.com/emails';
const FROM = process.env.EMAIL_FROM || 'EcoEstate <no-reply@ecoestate-homes.com>';

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);

export class EmailError extends Error {}

/**
 * Send { to, subject, text, html }. Throws EmailError when Resend rejects it.
 * The API key is only ever sent in the Authorization header, never logged.
 */
export async function sendEmail({ to, subject, text, html }) {
  if (!emailConfigured()) {
    console.warn('[email] RESEND_API_KEY is not set: printing this email instead of sending it.');
    console.log(`\n[email] To: ${to}\n[email] Subject: ${subject}\n${text}\n`);
    return { delivered: false };
  }

  let res;
  try {
    res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new EmailError('Could not reach Resend');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Resend's message explains the problem (e.g. an unverified sending domain) and never includes the key.
    throw new EmailError(`Resend rejected the email (${res.status}): ${data.message || res.statusText}`);
  }
  recordUsage('resend', 1, subject);
  return { delivered: true, id: data.id };
}
