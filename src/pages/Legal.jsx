import { Link } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';

// Privacy Policy and Terms of Service. Plain-language, and kept in step with
// what the app actually does: if a feature starts collecting or sharing new
// data, update the matching section and EFFECTIVE_DATE (and TERMS_VERSION in
// server/auth.js, which records which version each person accepted). Operator
// details are repeated in server/config.js for subscription emails.
const EFFECTIVE_DATE = 'November 1, 2026';
const CONTACT = 'support@ecoestate.org';
const OPERATOR = 'Julian Rabbitt-Tomita';
const ADDRESS = '920 Moreno Avenue, Palo Alto, CA 94303';

const mail = <a href={`mailto:${CONTACT}`} className="underline underline-offset-2">{CONTACT}</a>;
const privacyLink = <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>;
const termsLink = <Link to="/terms" className="underline underline-offset-2">Terms of Service</Link>;

const PRIVACY = [
  {
    title: 'Who we are',
    body: [
      <>EcoEstate is run by {OPERATOR}, an individual doing business as “EcoEstate” in Palo Alto, California (“EcoEstate”, “we”, “us”). EcoEstate measures lawns and helps people replace them with native plants at ecoestate.org. {OPERATOR} is responsible for your information. Contact us at {mail}, or by mail at {ADDRESS}.</>,
      'This policy explains what we collect, why, who helps us run the service, and the choices you have.',
    ],
  },
  {
    title: 'What we collect',
    list: [
      <><b>Account details.</b> When you sign up: your email address and name, and your profile picture if you sign in with Google. Sign-in is handled by Clerk; if you set a password, Clerk stores it securely and we never see it. We also record when you agreed to these terms.</>,
      <><b>Properties you scan.</b> The address or place you search for, its location, the property and lawn outlines, and the designs, plant choices and settings you make. Guests can scan without an account; a guest’s unsaved scans stay in their own browser.</>,
      <><b>Things you post or upload.</b> Progress photos, project updates, community posts, comments and messages to other members. Before a photo is uploaded, the app removes its hidden metadata, such as the GPS location your camera may have saved.</>,
      <><b>Payments.</b> If you subscribe to EcoEstate Pro, Stripe processes your payment. We receive your subscription status, the email and name on the payment, the amount, and your agreement to the renewal terms, but never your full card number.</>,
      <><b>Referrals.</b> Your referral code, and the first names of friends who subscribed with it.</>,
      <><b>Technical data.</b> Your IP address and basic request logs, used to run the site, prevent abuse (for example, limiting how many scans run at once) and fix problems.</>,
    ],
    after: [
      'In the categories California law uses, that is: identifiers (name, email, IP address), commercial information (your subscription), location information you enter (the addresses you scan), photos and other content you add, and your activity on EcoEstate (request logs). We collect it from you, from your browser, and from Google if you sign in with Google.',
    ],
  },
  {
    title: 'How we use it',
    list: [
      'To provide the service: measure lawns, build designs and savings estimates, save your properties, and track your conversion.',
      'To run the community features you choose to use, and to deliver messages between members.',
      'To handle subscriptions, referral credits and the free student unlock (we check whether your email’s domain belongs to a school).',
      'To keep the service secure, prevent fraud and abuse, and fix bugs.',
      'To send you account and billing messages, such as sign-in codes, your subscription confirmation and the yearly subscription reminder. We don’t send marketing email.',
    ],
    after: [
      'We do not sell or share your personal information (as California law defines those terms), use it for targeted advertising, or use sensitive personal information to infer things about you.',
    ],
  },
  {
    title: 'What other people can see',
    list: [
      'Your scans, designs, photos and tracked projects are private to your account unless you choose to share them.',
      'Community posts and comments show your name and the photos you attach, to other members. If you add a city to a post, it also appears on the community map at the centre of that city, never at your address.',
      'If you turn on “Share on community map” for a tracked project, other members see your first name, the project’s progress, and an approximate location (rounded to about 1 km) with the city or neighborhood name, never your street address or exact location. You can turn sharing off at any time.',
      'Messages are visible only to you and the member you are messaging. If a member reports a conversation to us, we may review it to enforce the community rules.',
      'If you subscribe using a friend’s referral code, we show your first name to that friend so they know the referral worked.',
    ],
  },
  {
    title: 'Services that help us run EcoEstate',
    body: ['We share only what each service needs to do its job:'],
    list: [
      <><b>Clerk</b>: sign-in, account security and sign-in emails.</>,
      <><b>Supabase</b>: our database and private file storage, in the United States (Northern California).</>,
      <><b>Render</b>: hosting for the website and servers.</>,
      <><b>Stripe</b>: payments and subscriptions.</>,
      <><b>Resend</b>: delivers our subscription confirmation and reminder emails.</>,
      <><b>Google</b>: if you choose “Continue with Google”, Google shares your name, email and profile picture with us. (Our fonts are served from ecoestate.org, not Google.)</>,
      <><b>Google Street View</b>: when you open a design, we may send the location of the house (not your name or account) to Google to fetch one street photo, used only to match the 3D model’s wall colour. The photo isn’t stored, only the colour.</>,
      <><b>Rebate lookups</b>: to find the rebates that serve a property, we send its map location (not your name or account) to the US EPA’s water-system service-area map and the US Census Bureau’s geocoder, which return the water utility, ZIP code, city, county and state.</>,
      <><b>School-email check</b>: to see whether your email belongs to a school, we look up only the part after the “@” in a public list of school domains (JetBrains “swot”, served by jsDelivr).</>,
      <><b>Address and map data</b>: the addresses and areas you search are sent to geocoding and mapping services (Geocodio, OpenStreetMap/Nominatim, Esri and county parcel maps). Aerial imagery and tree and building data come from public sources (USDA NAIP via Microsoft Planetary Computer, Meta and WRI canopy data, Overture Maps). Your browser loads map tiles from Esri and plant photos from Wikimedia, which see your IP address.</>,
    ],
    after: ['We may also disclose information if the law requires it, to protect the safety or rights of people or the service, or as part of a sale or transfer of EcoEstate (in which case this policy still applies to your data).'],
  },
  {
    title: 'Do Not Track and cookies',
    body: [
      <>We don’t track you across other websites and we don’t use advertising or analytics cookies, so we don’t change what we do when your browser sends a Do Not Track or Global Privacy Control signal; there is no cross-site tracking to turn off. The only cookies and browser storage we use are what sign-in needs (set by Clerk) and what the app needs to work, such as saving guest scans and display settings on your device. Our <Link to="/cookies" className="underline underline-offset-2">Cookie Policy</Link> lists each one.</>,
      'We don’t allow other companies to collect information about your activity on EcoEstate over time and across other websites. The services listed above that your browser contacts directly receive your IP address and normal browser information when they deliver content.',
    ],
  },
  {
    title: 'How long we keep it',
    body: [
      <>We keep your account data while your account is open. If you cancel Pro without deleting your account, your data stays so you can come back.</>,
      <>To delete your account, choose “Delete account” in your account menu; it happens right away. You can also email {mail} from the address on your account, and within 30 days we delete your profile, saved properties, tracked projects, photos and other uploads, posts, comments and the messages you sent, and close your sign-in account. We keep records the law or fraud prevention requires, such as payment and tax records (kept by us and by Stripe for up to 7 years) and proof that you agreed to the subscription terms. Deleted data can remain in backups and server logs (which include IP addresses) for up to 30 days before it is overwritten.</>,
    ],
  },
  {
    title: 'Your choices and rights',
    list: [
      'In the app you can edit or delete your saved properties, tracked projects and community posts, and turn map sharing off at any time.',
      'You can delete your whole account yourself from “Delete account” in your account menu.',
      <>To delete a comment or message, or to get a copy of your data or correct it, email {mail}. We will confirm the request came from your account email and respond within 30 days. You may use an authorized agent.</>,
      'You can cancel EcoEstate Pro at any time from “Manage subscription” in your account menu.',
      'California residents, and people elsewhere with privacy laws, may have rights to know, access, correct and delete personal information, and not to be treated differently for using those rights. Whether or not those laws apply to us, we honor these requests from everyone.',
    ],
  },
  {
    title: 'People outside the United States',
    body: [
      'EcoEstate is built for properties in the United States and is run from the US, where our providers store your information. If you use EcoEstate from elsewhere, your information is processed in the US. If the EU or UK GDPR applies to you: we use your data to provide the service you asked for (contract), to keep it secure and prevent abuse (legitimate interests), and to meet legal duties (legal obligation). You can also object to processing, ask us to limit it, ask for a portable copy, and complain to your local data protection authority.',
    ],
  },
  {
    title: 'Security',
    body: ['We use encrypted connections (HTTPS), keep uploads in private storage behind expiring links, limit who and what can access the database, and rely on established providers for sign-in and payments. No service is perfectly secure, so please use a strong password or Google sign-in and tell us if you notice anything wrong. If a breach affects your personal information, we will tell you as the law requires.'],
  },
  {
    title: 'Children and teens',
    body: [
      'EcoEstate is not for children under 13, and we do not knowingly collect their information. If you believe a child under 13 has an account, contact us and we will delete it.',
      <>If you are under 18, you can delete posts and photos you have added, or ask us at {mail} to remove them or your comments. Removing them from EcoEstate doesn’t guarantee that copies made by others are gone.</>,
    ],
  },
  {
    title: 'Changes',
    body: ['If we make a material change to this policy, we will email account holders and show a notice in the app at least 14 days before the change takes effect, and update the date above. Smaller changes, such as clarifications, take effect when posted. We won’t use information we already have in a materially different way without your consent.'],
  },
];

const TERMS = [
  {
    title: 'Agreement',
    body: [
      <>These terms are an agreement between you and {OPERATOR}, who runs EcoEstate as an individual doing business as “EcoEstate” (“EcoEstate”, “we”, “us”), for your use of ecoestate.org. You accept them when you check the box agreeing to them while creating an account, or when you subscribe to EcoEstate Pro. If you use EcoEstate as a guest without an account, these terms still apply to that use. Please also read our {privacyLink}, which explains how we handle your information.</>,
    ],
  },
  {
    title: 'Who can use EcoEstate',
    body: [<>You must be at least 13 to use EcoEstate. If you are under 18, you may use EcoEstate only with permission from a parent or guardian, and you may not subscribe to EcoEstate Pro or make payments; a parent or guardian must do that. You are responsible for activity on your account and for keeping your sign-in secure; tell us right away at {mail} if you think someone else is using it.</>],
  },
  {
    title: 'Estimates, not professional advice',
    body: ['Lawn measurements, plant counts, costs, rebates, water and money savings and payback times are modeled estimates from aerial imagery and public data. They can be wrong. Property lines come from public parcel data and are not a survey. None of it is engineering, landscaping, financial or legal advice. Before you build: check the numbers on site, confirm rebate rules with the program, follow local rules and any HOA requirements, and call 811 to have utility lines marked before you dig. You are responsible for the work done on your property.'],
  },
  {
    title: 'Free features and EcoEstate Pro',
    list: [
      'Scanning, designs and the 3D view are free. Guests can scan without an account.',
      <>EcoEstate Pro adds saving and browsing your properties, project tracking, project exports and the community. <b>It costs $10 per month (plus any tax that applies) and renews automatically every month, charging the card you used, until you cancel.</b> If you used a referral code or promo code, your first month costs the discounted amount shown at checkout, and every month after that costs $10. There is no minimum term.</>,
      <><b>Cancel anytime online</b>: open your account menu, choose “Manage subscription”, then “Cancel subscription”. You can also email {mail} and we will cancel for you. Canceling stops future charges; Pro stays active until the end of the month you already paid for, and then ends. We don’t give refunds or partial-month credits for canceling mid-month, except where the law requires.</>,
      <>Our <Link to="/refunds" className="underline underline-offset-2">Refund Policy</Link> explains refunds and cancellations in one place.</>,
      'If a payment fails, we and Stripe may retry it for a few weeks. Pro stays on while we retry, and the subscription ends if payment can’t be collected.',
      'We email you a confirmation when you subscribe, and a reminder at least once a year with the price, how often you’re charged and how to cancel.',
      'If we change the price of EcoEstate Pro, we will email you between 7 and 30 days before the new price first applies to your subscription, with the new price, the date it starts and how to cancel. If you don’t want to pay the new price, cancel before that date.',
      'Students and educators who sign in with a school email address get the Pro features free (no payment details needed). We check the email’s domain against a public list of school domains. We may end this offer, or remove free access for an account that doesn’t qualify or misuses it, with notice to the affected accounts.',
    ],
  },
  {
    title: 'Referrals',
    list: [
      'A friend who subscribes with your referral link or code gets $5 off their first month, and you get a $10 credit (one free month) once their first payment goes through.',
      'One reward per new subscriber. Credits apply to your EcoEstate Pro bills, have no cash value and can’t be transferred. If your account is closed, unused credits end.',
      'Referring yourself, using fake or duplicate accounts, or other abuse voids the credits, and we may close the accounts involved.',
      'We may change or end the referral program at any time; credits you have already earned stay on your account.',
    ],
  },
  {
    title: 'Your content',
    body: ['You keep ownership of the photos, posts and other content you add. You give EcoEstate a non-exclusive, royalty-free, worldwide license to host, store, copy, resize, display and process it only to run and improve the service, including showing it to the people you share it with and letting our service providers store it. This license ends when you delete the content or your account, except for backup copies that expire on schedule. You confirm you have the rights to post it and that it follows these terms.'],
  },
  {
    title: 'Community rules',
    list: [
      'Be respectful: no harassment, hate, threats or spam.',
      'Don’t post other people’s private information, or photos you don’t have the right to share.',
      'Don’t post anything illegal, misleading or sexually explicit.',
    ],
    after: [<>Report anything that breaks these rules to {mail}. We may remove content or suspend accounts that break them.</>],
  },
  {
    title: 'Fair use of the service',
    body: ['Don’t try to break, overload, scrape or reverse-engineer EcoEstate, get around its limits or paywalls, access other people’s data, or use it to build a competing data set. Automated or excessive scanning may be limited or blocked.'],
  },
  {
    title: 'Copyright complaints',
    body: [
      <>If you believe content on EcoEstate infringes your copyright, send a notice to {OPERATOR}, {ADDRESS}, or {mail}. Include: your physical or electronic signature; the work you say is infringed; the content on EcoEstate and where to find it; your contact details; a statement that you believe in good faith the use isn’t authorized by the owner, its agent or the law; and a statement, under penalty of perjury, that your notice is accurate and you are the owner or authorized to act for them. If your content was removed and you believe that was a mistake, you can send a counter-notice as described in 17 U.S.C. § 512(g). We close the accounts of repeat infringers when appropriate.</>,
    ],
  },
  {
    title: 'Third-party services',
    body: ['EcoEstate relies on other services, including Clerk for sign-in, Stripe for payments and public map and imagery data. Their own terms apply to your use of them, and we are not responsible for their availability or accuracy.'],
  },
  {
    title: 'Disclaimers',
    body: ['EcoEstate is provided “as is” and “as available”. To the fullest extent the law allows, we make no warranties, express or implied, including about accuracy, fitness for a particular purpose or uninterrupted service.'],
  },
  {
    title: 'Limitation of liability',
    body: ['To the fullest extent the law allows, EcoEstate is not liable for indirect, incidental, special or consequential damages, or for lost profits, savings or data. Our total liability for any claim about the service is limited to the greater of the amount you paid us in the 12 months before the claim, or $50. Nothing in these terms limits liability that can’t be limited by law, such as for fraud, gross negligence or willful misconduct. Some places don’t allow these limits, so they may not all apply to you.'],
  },
  {
    title: 'Indemnity',
    body: ['If someone brings a claim against us because of content you posted or your breaking these terms or the law, you agree to cover our reasonable losses and costs from that claim, to the extent the law allows.'],
  },
  {
    title: 'Ending your account',
    body: [<>You can stop using EcoEstate at any time and delete your account from your account menu, or ask us to at {mail}. We may suspend or close accounts that break these terms. Sections that by their nature should continue (such as disclaimers, limits of liability and indemnity) continue after your account ends.</>],
  },
  {
    title: 'Changes to these terms',
    body: ['We may update these terms. If a change is material, we will email account holders at least 14 days before it takes effect and update the date above; changes to Pro’s price or renewal terms follow the notice rules in “Free features and EcoEstate Pro”. If you keep using EcoEstate after a change takes effect, the new terms apply; if you don’t agree, stop using EcoEstate and cancel Pro. Changes don’t apply to disputes that arose before the change.'],
  },
  {
    title: 'Disputes',
    body: [<>Please contact us first at {mail}; most problems can be fixed quickly. These terms are governed by California law, without regard to conflict-of-law rules. Any lawsuit about EcoEstate or these terms must be brought in the state or federal courts located in Santa Clara County, California, and you and we consent to those courts. Either of us may bring a qualifying claim in small claims court instead. Nothing here limits rights you have under the consumer protection laws of the state where you live.</>],
  },
  {
    title: 'Other terms',
    body: ['These terms and the Privacy Policy are the whole agreement between you and us about EcoEstate. If any part is found unenforceable, the rest stays in effect. If we don’t enforce a term right away, we haven’t waived it. You may not transfer these terms; we may transfer them to someone who takes over EcoEstate, and we will tell you if that happens. We aren’t responsible for delays caused by events outside our reasonable control. You agree that we may send notices, receipts and agreements electronically to the email on your account, and that these count as “in writing”.'],
  },
  {
    title: 'Contact',
    body: [<>{OPERATOR}, doing business as EcoEstate · {ADDRESS} · {mail}. See also our {privacyLink} and these {termsLink}.</>],
  },
];

const COOKIES = [
  {
    title: 'The short version',
    body: [
      'EcoEstate uses only the cookies and browser storage it needs to work. There are no advertising, analytics or social-media tracking cookies, and nothing that follows you to other websites, so there is nothing to opt out of.',
    ],
  },
  {
    title: 'Cookies',
    list: [
      <><b>Sign-in (Clerk)</b>: <code>__session</code>, <code>__client_uat</code> and similar cookies keep you signed in securely. Set when you sign in; they expire when you sign out or after your session ends. Strictly necessary.</>,
      <><b>Security (Cloudflare)</b>: our sign-in and hosting providers may set a short-lived bot-protection cookie such as <code>__cf_bm</code>. Strictly necessary.</>,
    ],
  },
  {
    title: 'Storage in your browser',
    body: ['These stay on your device; most are never sent to us:'],
    list: [
      <><code>understory.projects.v1</code>: scans you make as a guest, so they aren’t lost before you sign in.</>,
      <><code>ecoestate_ref</code>: a friend’s referral code you arrived with, so the discount applies at checkout.</>,
      <><code>ecoestate_session_id</code> (this tab only): a random id sent with requests so we can see what each visit costs us in map and address lookups and stop abuse. It isn’t linked to other sites and disappears when you close the tab.</>,
      <><code>ecoestate_premium_pending</code>, <code>ecoestate_auth_prompt_dismissed</code>, <code>ecoestate_minimap_size</code>, <code>ecoestate_cookie_notice</code>: small settings, like whether you closed a prompt or this notice.</>,
    ],
  },
  {
    title: 'Third-party content',
    body: ['Map tiles (Esri) and plant photos (Wikimedia) load directly in your browser, so those services see your IP address, as with any image on the web. Payment pages are hosted by Stripe under its own policy.'],
  },
  {
    title: 'Your choices',
    body: [<>You can clear cookies and site data in your browser at any time; you’ll be signed out and guest scans will be lost. Questions: {mail}. See also our {privacyLink}.</>],
  },
];

const REFUNDS = [
  {
    title: 'EcoEstate Pro',
    list: [
      'EcoEstate Pro costs $10 a month (plus any tax) and renews automatically every month until you cancel. There is no minimum term.',
      'Cancel anytime online: account menu → “Manage subscription” → “Cancel subscription”, or email us and we’ll cancel for you.',
      'When you cancel, you won’t be charged again. Pro stays on until the end of the month you already paid for, then ends.',
      'Payments are non-refundable, and we don’t give partial-month credits for canceling mid-month, except where the law requires a refund.',
    ],
  },
  {
    title: 'When we will refund you',
    list: [
      'If you were charged by mistake, charged twice, or charged after you canceled, email us and we will refund the charge.',
      'If a problem on our side stopped Pro from working for a significant part of a month, email us and we will credit or refund that month.',
      'Refunds go back to the card you paid with, usually within 5–10 business days after we approve them.',
    ],
  },
  {
    title: 'Referral and promo discounts',
    body: ['Discounts and referral credits have no cash value and can’t be refunded. If a referred friend’s payment is refunded, the referral credit it earned may be removed.'],
  },
  {
    title: 'How to ask',
    body: [<>Email {mail} from the address on your account with the date and amount of the charge. See also our {termsLink}.</>],
  },
];

function Section({ title, body = [], list, after = [] }) {
  return (
    <section className="mt-9">
      <h2 className="font-display text-xl tracking-tight">{title}</h2>
      {body.map((p, i) => (
        <p key={i} className="mt-3">{p}</p>
      ))}
      {list && (
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {list.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
      {after.map((p, i) => (
        <p key={i} className="mt-3">{p}</p>
      ))}
    </section>
  );
}

function LegalPage({ label, title, sections }) {
  usePageMeta({ title, description: `EcoEstate ${title.toLowerCase()}.` });
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12">
      <p className="label-xs">{label}</p>
      <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight">{title}</h1>
      <p className="mt-3 text-[13px] text-muted-foreground">Effective {EFFECTIVE_DATE}</p>
      <div className="text-[14px] leading-relaxed text-foreground/90">
        {sections.map((s) => (
          <Section key={s.title} {...s} />
        ))}
      </div>
    </div>
  );
}

export function Privacy() {
  return <LegalPage label="Legal" title="Privacy Policy" sections={PRIVACY} />;
}

export function Cookies() {
  return <LegalPage label="Legal" title="Cookie Policy" sections={COOKIES} />;
}

export function Refunds() {
  return <LegalPage label="Legal" title="Refund Policy" sections={REFUNDS} />;
}

export function Terms() {
  return <LegalPage label="Legal" title="Terms of Service" sections={TERMS} />;
}
