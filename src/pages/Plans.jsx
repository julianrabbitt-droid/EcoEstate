import { Link } from 'react-router-dom';
import { Check, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/hooks/usePageMeta';

// Every plan side by side. Mirrors the server's entitlements
// (server/shared/entitlements.ts): scanning, design and payoff are free; Pro
// and the student/educator unlock add saving, tracking and the community; a
// city or organization partnership gives its residents everything free.
const PLANS = [
  { id: 'free', name: 'Free', price: '$0', note: 'No account needed to scan' },
  { id: 'student', name: 'Student / educator', price: '$0', note: 'With a verified school email' },
  { id: 'pro', name: 'Pro', price: '$10/mo', note: 'Cancel anytime; first month half off with LAUNCH50' },
  { id: 'city', name: 'City partner', price: 'Sponsored', note: 'Your city or water district covers it; residents pay nothing' },
];

const ALL = ['free', 'student', 'pro', 'city'];
const PAID = ['student', 'pro', 'city'];
const FEATURES = [
  {
    group: 'Scan',
    rows: [
      ['Lawn outlined from aerial imagery, height maps and USGS lidar, including lawn under trees', ALL],
      ['Confirm your property on the map before scanning', ALL],
      ['Edit the 2D plan: lawn, buildings and trees', ALL],
    ],
  },
  {
    group: 'Design',
    rows: [
      ['3D model of your property with native plants for your region', ALL],
      ['Real 3D: your street and neighbours from Google 3D around your model', ALL],
      ['Walk-through, agronomist arrangements and design-from-a-sentence', ALL],
    ],
  },
  {
    group: 'Payoff',
    rows: [
      ['Water, money, carbon and habitat over 10 and 30 years', ALL],
      ['Rebates for your ZIP code and water utility', ALL],
      ['Step-by-step build plan and plant list', ALL],
    ],
  },
  {
    group: 'Keep going',
    rows: [
      ['Save and browse your properties', PAID],
      ['Track your project as it grows, with plant help', PAID],
      ['Community: share your garden, comment, message, see projects on the map', PAID],
    ],
  },
  {
    group: 'For cities and organizations',
    rows: [
      ['Every resident gets all features free, under your program name', ['city']],
      ['Area-wide lawn and water-savings estimates for planning and grants', ['city']],
      ['Rebate program linked from every scan in your service area', ['city']],
    ],
  },
];

export default function Plans() {
  usePageMeta({ title: 'Plans', description: 'What each EcoEstate plan includes: free scans and 3D design for everyone, Pro and student features, and city partnerships that make everything free for residents.' });
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-14">
      <h1 className="font-display text-[2.6rem] leading-tight tracking-tight">Plans</h1>
      <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground">
        Scanning your lawn, designing a native garden and seeing the payoff are free for everyone. Pro and the student
        unlock add saving, tracking and the community. Cities, water districts and organizations can sponsor EcoEstate so
        every resident gets all of it free.
      </p>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-[14px]">
          <caption className="sr-only">Features included in each plan</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[34%] pb-4 text-left align-bottom font-normal text-muted-foreground">Feature</th>
              {PLANS.map((p) => (
                <th key={p.id} scope="col" className="px-3 pb-4 text-left align-bottom">
                  <span className="block text-[15px] font-medium">{p.name}</span>
                  <span className="mt-0.5 block font-display text-[1.5rem] font-normal">{p.price}</span>
                  <span className="mt-0.5 block text-[12px] font-normal leading-snug text-muted-foreground">{p.note}</span>
                </th>
              ))}
            </tr>
          </thead>
          {FEATURES.map((g) => (
            <tbody key={g.group}>
              <tr>
                <th colSpan={5} scope="colgroup" className="border-t border-border pb-2 pt-6 text-left text-[13px] font-medium">
                  {g.group}
                </th>
              </tr>
              {g.rows.map(([label, plans]) => (
                <tr key={label} className="border-t border-border/60">
                  <th scope="row" className="py-2.5 pr-4 text-left font-normal">{label}</th>
                  {PLANS.map((p) => (
                    <td key={p.id} className="px-3 py-2.5">
                      {plans.includes(p.id) ? (
                        <Check className="h-4 w-4 text-emerald-700" aria-label="Included" />
                      ) : (
                        <Minus className="h-4 w-4 text-muted-foreground/60" aria-label="Not included" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild className="rounded-full">
          <Link to="/">Scan my lawn free</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <a href="mailto:support@ecoestate.org?subject=City%20or%20organization%20partnership">Partner with us</a>
        </Button>
      </div>
      <p className="mt-4 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
        Pro renews monthly until you cancel; see the <Link to="/terms" className="underline underline-offset-2">Terms</Link> and{' '}
        <Link to="/refunds" className="underline underline-offset-2">Refunds</Link>. Student and educator access is checked
        against a public directory of school email domains.
      </p>
    </div>
  );
}
