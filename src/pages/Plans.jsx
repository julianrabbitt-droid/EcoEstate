import { Link } from 'react-router-dom';
import { Check, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/hooks/usePageMeta';

// Every plan side by side. Mirrors what the server enforces
// (server/shared/entitlements.ts, server/entities.js, the designFromPrompt
// function): each plan is for a different person and adds something real.
const PLANS = [
  { id: 'free', name: 'Free', price: '$0', who: 'Curious homeowners', note: 'See your lawn, a native design and the payoff with a free account. Drawing your lawn by hand needs no account at all.' },
  { id: 'student', name: 'Student / educator', price: '$0', who: 'Classes and school projects', note: 'Verified school email. Study real properties and share work with the community.' },
  { id: 'pro', name: 'Pro', price: '$10/mo', who: 'Homeowners doing the conversion', note: 'Plan it, build it and track it to maturity. Cancel anytime; first month half off with LAUNCH50.' },
  { id: 'city', name: 'City partner', price: 'Sponsored', who: 'Cities, water districts, organizations', note: 'Your program covers it, so every resident gets Pro free, plus tools for running the program.' },
];

const ALL = ['free', 'student', 'pro', 'city'];
const PAID = ['student', 'pro', 'city'];
const RESIDENTS = ['pro', 'city'];
// A row lists the plans that include it, or { planId: 'detail' } for limits.
const FEATURES = [
  {
    group: 'See it',
    rows: [
      ['Lawn scan from aerial imagery, height maps and USGS lidar, including lawn under trees', ALL],
      ['Confirm your property, then fix the 2D plan: lawn, buildings, trees', ALL],
      ['3D model of your property with native plants for your region, walk-through', ALL],
      ['Water, money, carbon and habitat over 10 and 30 years; rebates for your ZIP code', ALL],
      ['Plant list and step-by-step build plan', ALL],
    ],
  },
  {
    group: 'Design it',
    rows: [
      ['Real 3D: your street and neighbours from Google 3D around your model', PAID],
      ['Design from a sentence ("drought-tolerant pollinator hedge")', PAID],
      ['Saved properties', { student: 'Latest 10', pro: 'Unlimited', city: 'Unlimited' }],
      ['Export the plan: printable PDF and shopping list', RESIDENTS],
    ],
  },
  {
    group: 'Build and share it',
    rows: [
      ['Track your project as it grows, with plant care and problem help', PAID],
      ['Community: share your garden, comment, message, projects on the map', PAID],
      ['Priority support and early access to new features', RESIDENTS],
    ],
  },
  {
    group: 'Run a program',
    rows: [
      ['Pro free for every resident, under your program name', ['city']],
      ['Area-wide lawn and water-savings estimates for planning and grant reports', ['city']],
      ['Your rebate program linked from every scan in your service area', ['city']],
      ['Example scans of your own city properties for outreach', ['city']],
    ],
  },
];

export default function Plans() {
  usePageMeta({ title: 'Plans', description: 'What each EcoEstate plan includes: free scans and 3D design for everyone, Pro and student features, and city partnerships that make everything free for residents.' });
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-14">
      <h1 className="font-display text-[2.6rem] leading-tight tracking-tight">Plans</h1>
      <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground">
        Anyone can see what their lawn could become, free. Students and educators get the design tools for class work.
        Pro is for homeowners carrying out the conversion. City partners sponsor Pro for every resident and get the tools
        to run a lawn-replacement program.
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
                  <span className="mt-0.5 block text-[12px] font-normal text-accent">{p.who}</span>
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
                      {!Array.isArray(plans) ? (
                        plans[p.id] ? <span className="text-[13px]">{plans[p.id]}</span> : <Minus className="h-4 w-4 text-muted-foreground/60" aria-label="Not included" />
                      ) : plans.includes(p.id) ? (
                        <Check className="h-4 w-4 text-primary" aria-label="Included" />
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
          <Link to="/cities">Partner with us</Link>
        </Button>
      </div>
      <p className="mt-4 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
        Pro renews monthly until you cancel; see the <Link to="/terms" className="underline underline-offset-2">Terms</Link> and{' '}
        <Link to="/refunds" className="underline underline-offset-2">Refunds</Link>. Student and educator access is checked
        against a public directory of school email domains. City partnerships are arranged directly; email us.
      </p>
    </div>
  );
}
