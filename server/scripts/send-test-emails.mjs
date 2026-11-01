// Sends the verification and password-reset emails to an address so you can
// check they arrive, look right, and don't land in spam.
//
//   npm run email:test -- you@example.com
//   npm run email:test -- --preview <folder>   (write the HTML and text to files instead)
//
// The code is random and the reset link is a sample that won't reset anything.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { APP_URL } from '../config.js';
import { emailConfigured, sendEmail } from '../email.js';
import { resetPasswordEmail, verificationEmail } from '../emailTemplates.js';

const args = process.argv.slice(2);
const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
// Real emails link to APP_URL; a localhost link would look suspicious to spam
// filters, so the test uses the live site's address when developing locally.
const siteUrl = /localhost|127\.0\.0\.1/.test(APP_URL) ? 'https://ecoestate-homes.com' : APP_URL;
const emails = {
  verification: verificationEmail({ code, minutes: 10 }),
  'password-reset': resetPasswordEmail({ url: `${siteUrl}/reset-password?token=sample-${crypto.randomBytes(8).toString('hex')}`, minutes: 60 }),
};

if (args[0] === '--preview') {
  const dir = path.resolve(args[1] || 'email-previews');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, email] of Object.entries(emails)) {
    fs.writeFileSync(path.join(dir, `${name}.html`), email.html);
    fs.writeFileSync(path.join(dir, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}\n`);
  }
  console.log(`Wrote previews to ${dir}`);
  process.exit(0);
}

const to = args[0];
if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
  console.error('Usage: npm run email:test -- you@example.com');
  process.exit(1);
}
if (!emailConfigured()) {
  console.error('RESEND_API_KEY is not set in .env, so nothing will be sent (the emails are printed below).');
}
let failed = false;
for (const [name, email] of Object.entries(emails)) {
  try {
    const r = await sendEmail({ to, ...email });
    console.log(r.delivered ? `Sent ${name} email to ${to} (Resend id ${r.id})` : `Printed ${name} email (not sent)`);
  } catch (err) {
    failed = true;
    console.error(`Failed to send ${name} email: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
