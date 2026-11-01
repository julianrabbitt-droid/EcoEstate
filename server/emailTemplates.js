// Branded transactional emails. Each template returns { subject, text, html }.
// HTML uses tables and inline styles so it renders the same in Gmail, Outlook
// and Apple Mail; colours match the site's theme in src/index.css.

const BRAND = {
  page: '#f9f6f1', // --background
  card: '#ffffff',
  ink: '#13251e', // --foreground
  green: '#193329', // --primary
  accent: '#c36641', // --accent
  muted: '#5d6b65',
  line: '#e7e2d8',
  tint: '#f1ede4',
};
const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
const SANS = "'Inter Tight', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const SITE = 'ecoestate.org';

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Shared frame: hidden preview text, wordmark, white card, footer.
function layout({ preview, heading, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escape(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding:0 4px 20px;font-family:${SERIF};font-size:22px;color:${BRAND.green};letter-spacing:-0.2px;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:10px;background:${BRAND.accent};margin-right:8px;vertical-align:middle;"></span><span style="vertical-align:middle;">EcoEstate</span>
      </td></tr>
      <tr><td style="background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:18px;padding:36px 32px;">
        <h1 style="margin:0 0 14px;font-family:${SERIF};font-weight:400;font-size:26px;line-height:1.2;color:${BRAND.ink};">${escape(heading)}</h1>
        ${body}
      </td></tr>
      <tr><td style="padding:22px 4px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${BRAND.muted};">
        EcoEstate helps you replace your lawn with native plants.<br>
        <a href="https://${SITE}" style="color:${BRAND.muted};text-decoration:underline;">${SITE}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const paragraph = (html) => `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${BRAND.ink};">${html}</p>`;
const note = (html) => `<p style="margin:20px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${BRAND.muted};">${html}</p>`;

export function verificationEmail({ code, minutes = 10 }) {
  const digits = escape(code);
  const html = layout({
    preview: `Your code is ${code}. It expires in ${minutes} minutes.`,
    heading: 'Confirm your email',
    body: [
      paragraph('Enter this code in EcoEstate to finish creating your account.'),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;"><tr>
        <td align="center" style="background:${BRAND.tint};border-radius:14px;padding:22px 12px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:34px;font-weight:600;letter-spacing:10px;color:${BRAND.green};">${digits}</td>
      </tr></table>`,
      paragraph(`The code expires in ${minutes} minutes.`),
      note('If you didn’t try to sign up for EcoEstate, you can ignore this email. No account will be created.'),
    ].join('\n'),
  });
  const text = [
    'Confirm your email',
    '',
    'Enter this code in EcoEstate to finish creating your account:',
    '',
    `    ${code}`,
    '',
    `The code expires in ${minutes} minutes.`,
    '',
    'If you didn’t try to sign up for EcoEstate, you can ignore this email. No account will be created.',
    '',
    `EcoEstate · https://${SITE}`,
  ].join('\n');
  return { subject: `Your EcoEstate code is ${code}`, text, html };
}

export function resetPasswordEmail({ url, minutes = 60 }) {
  const link = escape(url);
  const html = layout({
    preview: 'Use this link to choose a new password.',
    heading: 'Reset your password',
    body: [
      paragraph('We got a request to reset the password for your EcoEstate account. Choose a new one here:'),
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr>
        <td style="border-radius:999px;background:${BRAND.green};">
          <a href="${link}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:600;color:#f9f6f1;text-decoration:none;border-radius:999px;">Choose a new password</a>
        </td>
      </tr></table>`,
      paragraph(`This link works once and expires in ${minutes === 60 ? 'an hour' : `${minutes} minutes`}.`),
      note(`If the button doesn’t work, paste this link into your browser:<br><a href="${link}" style="color:${BRAND.accent};word-break:break-all;">${link}</a>`),
      note('If you didn’t ask to reset your password, you can ignore this email. Your password won’t change.'),
    ].join('\n'),
  });
  const text = [
    'Reset your password',
    '',
    'We got a request to reset the password for your EcoEstate account. Choose a new one here:',
    '',
    url,
    '',
    `This link works once and expires in ${minutes === 60 ? 'an hour' : `${minutes} minutes`}.`,
    '',
    'If you didn’t ask to reset your password, you can ignore this email. Your password won’t change.',
    '',
    `EcoEstate · https://${SITE}`,
  ].join('\n');
  return { subject: 'Reset your EcoEstate password', text, html };
}

// EcoEstate Pro subscription notices required by California's Automatic
// Renewal Law: the acknowledgment sent when someone subscribes, and the
// reminder sent at least once a year. Both restate the renewal terms and how
// to cancel. `firstMonthUsd` is what the first month cost (after any referral
// or promo discount); `termsVersion` is the Terms version they accepted.
export function proSubscriptionEmail({ kind = 'welcome', firstMonthUsd = null, termsVersion = '', operator = '', address = '' }) {
  const welcome = kind === 'welcome';
  const subject = welcome ? 'Your EcoEstate Pro subscription is active' : 'Reminder: your EcoEstate Pro subscription renews monthly';
  const discounted = welcome && firstMonthUsd != null && Number(firstMonthUsd) < 10;
  const lines = [
    welcome ? 'Thanks for subscribing to EcoEstate Pro.' : 'This is your yearly reminder about your EcoEstate Pro subscription.',
    'What you get: saved properties, project tracking, project exports and the community.',
    `Price: $10.00 per month plus any tax.${discounted ? ` Your first month was $${Number(firstMonthUsd).toFixed(2)} with your discount.` : ''}`,
    'Renewal: it renews automatically every month on the same date and charges the card you used, until you cancel. There is no minimum term.',
    `How to cancel: sign in at ${SITE}, open your account menu and choose “Manage subscription”, then “Cancel subscription”. Or reply to this email and we will cancel for you. Pro stays on until the end of the month you've paid for. No refunds for partial months.`,
    `Terms: https://${SITE}/terms${termsVersion ? ` (version ${termsVersion})` : ''}`,
  ];
  const footer = [operator, address, 'support@ecoestate.org'].filter(Boolean).join(' · ');
  const text = `${lines.join('\n\n')}\n\n${footer}\n`;
  const html = layout({
    preview: welcome ? 'Your subscription details and how to cancel.' : 'Your subscription details and how to cancel.',
    heading: welcome ? 'Your Pro subscription is active' : 'Your Pro subscription renews monthly',
    body: lines.map((l) => paragraph(escape(l))).join('') + note(escape(footer)),
  });
  return { subject, text, html };
}
