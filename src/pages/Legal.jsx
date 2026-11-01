import { Link } from 'react-router-dom';

// Privacy Policy and Terms of Service. Plain-language, and kept in step with
// what the app actually does: if a feature starts collecting or sharing new
// data, update the matching section and EFFECTIVE_DATE.
const EFFECTIVE_DATE = 'November 1, 2026';
const CONTACT = 'support@ecoestate.org';

const mail = <a href={`mailto:${CONTACT}`} className="underline underline-offset-2">{CONTACT}</a>;

const PRIVACY = [
  {
    title: 'Who we are',
    body: [
      <>EcoEstate (“EcoEstate”, “we”, “us”) runs ecoestate.org, which measures lawns and helps people replace them with native plants. This policy explains what we collect, why, who helps us run the service, and the choices you have. Questions: {mail}.</>,
    ],
  },
  {
    title: 'What we collect',
    list: [
      <><b>Account details.</b> When you sign up: your email address and name, and your profile picture if you sign in with Google. Sign-in is handled by Clerk; if you set a password, Clerk stores it securely and we never see it.</>,
      <><b>Properties you scan.</b> The address or place you search for, its location, the property and lawn outlines, and the designs, plant choices and settings you make.</>,
      <><b>Things you post or upload.</b> Progress photos, project updates, community posts, comments and messages to other members.</>,
      <><b>Payments.</b> If you subscribe to EcoEstate Pro, Stripe processes your payment. We receive your subscription status, the email and name on the payment, and the amount, but never your full card number.</>,
      <><b>Referrals.</b> Your referral code, and the first names of friends who subscribed with it.</>,
      <><b>Technical data.</b> Your IP address and basic request logs, used to run the site, prevent abuse (for example, limiting how many scans run at once) and fix problems. Your browser also keeps some data on your device, such as sign-in cookies from Clerk and unsaved scans for guests.</>,
    ],
  },
  {
    title: 'How we use it',
    list: [
      'To provide the service: measure lawns, build designs and savings estimates, save your properties, and track your conversion.',
      'To run the community features you choose to use, and to deliver messages between members.',
      'To handle subscriptions, referral credits and the free student unlock (we check whether your verified email belongs to a school).',
      'To keep the service secure, prevent fraud and abuse, and fix bugs.',
      'To contact you about your account, such as sign-in codes and billing receipts.',
    ],
    after: [
      'We do not sell your personal information, share it for targeted advertising, or use advertising trackers.',
    ],
  },
  {
    title: 'What other people can see',
    list: [
      'Your scans, designs, photos and tracked projects are private to your account unless you choose to share them.',
      'Community posts and comments show your name and the photos you attach, to other members.',
      'If you turn on “share on the map” for a tracked project, other members see its progress and an approximate location (about 1 km), never your exact address.',
      'Messages are visible only to you and the member you are messaging.',
    ],
  },
  {
    title: 'Services that help us run EcoEstate',
    body: ['We share only what each service needs to do its job:'],
    list: [
      <><b>Clerk</b>: sign-in, account security and sign-in emails.</>,
      <><b>Supabase</b>: our database and private file storage.</>,
      <><b>Render</b>: hosting for the website and servers.</>,
      <><b>Stripe</b>: payments and subscriptions.</>,
      <><b>Google</b>: only if you choose “Continue with Google” to sign in.</>,
      <><b>Address and map data</b>: the addresses and areas you search are sent to geocoding and mapping services (Geocodio, OpenStreetMap/Nominatim, Esri and county parcel maps). Aerial imagery and tree and building data come from public sources (USDA NAIP via Microsoft Planetary Computer, Meta and WRI canopy data, Overture Maps). Your browser loads map tiles from Esri and plant photos from Wikimedia, which see your IP address.</>,
    ],
    after: ['We may also disclose information if the law requires it, to protect the safety or rights of people or the service, or as part of a sale or merger of EcoEstate (in which case this policy still applies to your data).'],
  },
  {
    title: 'How long we keep it',
    body: [
      <>We keep your data while your account is open. If you ask us to delete your account, we delete your account data and uploads within 30 days, except records we must keep for legal, tax or fraud-prevention reasons (such as payment records) and backups that expire on their own schedule. Email {mail} to delete your account.</>,
    ],
  },
  {
    title: 'Your choices and rights',
    list: [
      'You can view and edit your projects in the app, delete saved properties, posts and messages, and turn map sharing off at any time.',
      <>You can ask us for a copy of your data, to correct it, or to delete it, by emailing {mail}. We will respond within 30 days.</>,
      'You can cancel EcoEstate Pro at any time from “Manage subscription” in your account menu.',
      'Depending on where you live (for example California, under the CCPA/CPRA), you may have additional rights, including the right to know what we collect and to not be discriminated against for using your rights. We honor these requests for everyone.',
    ],
  },
  {
    title: 'Security',
    body: ['We use encrypted connections (HTTPS), keep uploads in private storage behind expiring links, limit who and what can access the database, and rely on established providers for sign-in and payments. No service is perfectly secure, so please use a strong password or Google sign-in and tell us if you notice anything wrong.'],
  },
  {
    title: 'Children',
    body: ['EcoEstate is not meant for children under 13, and we do not knowingly collect their information. If you believe a child under 13 has an account, contact us and we will delete it.'],
  },
  {
    title: 'Changes',
    body: ['If we change this policy in a way that matters, we will update the date above and let account holders know before the change takes effect.'],
  },
];

const TERMS = [
  {
    title: 'Agreement',
    body: [
      <>These terms are an agreement between you and EcoEstate for your use of ecoestate.org. By using the site or creating an account you agree to them and to our <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>. If you don't agree, please don't use EcoEstate.</>,
    ],
  },
  {
    title: 'Who can use EcoEstate',
    body: ['You must be at least 13. If you are under 18, you need a parent or guardian’s permission, and they agree to these terms for you. You are responsible for your account and for keeping your sign-in secure; tell us right away if you think someone else is using it.'],
  },
  {
    title: 'Estimates, not professional advice',
    body: ['Lawn measurements, plant counts, costs, rebates, water and money savings and payback times are modeled estimates from aerial imagery and public data. They can be wrong. They are not engineering, landscaping, financial or legal advice. Before you build: check the numbers on site, confirm rebate rules with the program, follow local rules and any HOA requirements, and call 811 to have utility lines marked before you dig. You are responsible for the work done on your property.'],
  },
  {
    title: 'Free features and EcoEstate Pro',
    list: [
      'Scanning, designs and the 3D view are free.',
      'EcoEstate Pro costs $10 per month (plus any applicable tax) and adds saved properties, project tracking and the community. It renews monthly until you cancel.',
      'You can cancel any time from “Manage subscription”. Pro stays active until the end of the period you already paid for. Payments are non-refundable except where the law requires otherwise.',
      'Students and educators who sign in with a verified school email get the Pro features for free while that email stays verified. We may end this offer, with notice.',
      'We may change prices with at least 30 days’ notice before your next renewal.',
    ],
  },
  {
    title: 'Referrals',
    list: [
      'A friend who subscribes with your referral link or code gets $5 off their first month, and you get a $10 credit (one free month) once their first payment goes through.',
      'One reward per new subscriber. Credits apply to your EcoEstate Pro bills, have no cash value and can’t be transferred.',
      'Referring yourself, using fake or duplicate accounts, or other abuse voids the credits, and we may close the accounts involved.',
    ],
  },
  {
    title: 'Your content',
    body: ['You keep ownership of the photos, posts and other content you add. You give EcoEstate permission to store, display and process it to run the service, including showing it to the people you share it with. Make sure you have the right to post it.'],
  },
  {
    title: 'Community rules',
    list: [
      'Be respectful: no harassment, hate, threats or spam.',
      'Don’t post other people’s private information, or photos you don’t have the right to share.',
      'Don’t post anything illegal, misleading or sexually explicit.',
    ],
    after: ['We may remove content or suspend accounts that break these rules.'],
  },
  {
    title: 'Fair use of the service',
    body: ['Don’t try to break, overload, scrape or reverse-engineer EcoEstate, get around its limits or paywalls, access other people’s data, or use it to build a competing data set. Automated or excessive scanning may be limited or blocked.'],
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
    body: ['To the fullest extent the law allows, EcoEstate is not liable for indirect, incidental, special or consequential damages, or for lost profits, savings or data. Our total liability for any claim about the service is limited to the greater of the amount you paid us in the 12 months before the claim, or $50. Some places don’t allow these limits, so they may not all apply to you.'],
  },
  {
    title: 'Ending your account',
    body: [<>You can stop using EcoEstate at any time and ask us to delete your account at {mail}. We may suspend or close accounts that break these terms. Sections that by their nature should continue (such as disclaimers and limits of liability) continue after your account ends.</>],
  },
  {
    title: 'Changes and governing law',
    body: ['We may update these terms. If a change matters, we will update the date above and notify account holders before it takes effect; continuing to use EcoEstate after that means you accept the new terms. These terms are governed by the laws of the State of California, without regard to its conflict-of-law rules.'],
  },
  {
    title: 'Contact',
    body: [<>Questions about these terms: {mail}.</>],
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

export function Terms() {
  return <LegalPage label="Legal" title="Terms of Service" sections={TERMS} />;
}
