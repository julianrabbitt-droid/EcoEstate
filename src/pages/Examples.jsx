import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/hooks/usePageMeta';

// Real lawn-to-garden projects, each checked against the organization's own
// page (see `source`). Their photos belong to them, so we link rather than copy.
// Add a project only with a source that states the facts quoted here.
const PROJECTS = [
  {
    place: 'Hayward, California',
    title: 'Hayward City Hall',
    stat: '5,000 sq ft',
    statLabel: 'of lawn replaced',
    body: 'In 2017 more than 85 volunteers sheet-mulched the lawn outside City Hall and planted a water-wise, Bay-friendly garden. The project team estimated it would save 15,000 to 25,000 gallons of water in its first year.',
    by: 'Occidental Arts & Ecology Center with the City of Hayward and Earth Team',
    source: 'https://oaec.org/projects/hayward-city-hall-garden/',
  },
  {
    place: 'Martinez, California',
    title: 'The Dundon garden',
    stat: '30%',
    statLabel: 'less household water',
    body: 'A small backyard lawn became a dry creek bed with blue oak and manzanitas, then the front lawn was sheet-mulched and planted with manzanita, California lilac and coffeeberry. The garden now draws butterflies, bees and hummingbirds.',
    by: 'Featured on the Bringing Back the Natives Garden Tour',
    source: 'https://bringingbackthenatives.net/chris-and-marianne-dundons-garden',
  },
  {
    place: 'Orange County, California',
    title: 'NatureScape front yards',
    stat: '15,000+',
    statLabel: 'native plants in front yards',
    body: 'Homeowners turn turf front yards into native gardens that also catch rainwater, with swales and rain gardens. Since 2017 the program has added more than 120 green infrastructure features, with rebates from the local water district.',
    by: 'Moulton Niguel Water District, Tree of Life Nursery and Jodie Cook Design',
    source: 'https://www.asla.org/focus-areas/climate-biodiversity-action/case-studies/climate-action-case-studies/naturescape',
  },
  {
    place: 'Santa Clara County, California',
    title: 'Lawn Busters',
    stat: '500 sq ft',
    statLabel: 'minimum lawn to qualify',
    body: 'Our City Forest planned and planted water-wise lawn conversions for qualifying homeowners, including seniors, veterans and low-income households, covering the design, materials and labor. Its waitlist closed in April 2025.',
    by: 'Our City Forest',
    source: 'https://www.ourcityforest.org/lawnbusters',
  },
];

const RESOURCES = [
  { name: 'Calscape', what: 'Find California native plants for your exact address', by: 'California Native Plant Society', url: 'https://calscape.org/' },
  { name: 'WaterSense: outdoors', what: 'How outdoor watering adds up, and ways to use less', by: 'US EPA', url: 'https://www.epa.gov/watersense/outdoors' },
  { name: 'Bringing Back the Natives Garden Tour', what: 'Visit East Bay gardens that replaced lawns with natives', by: 'Bringing Back the Natives', url: 'https://bringingbackthenatives.net/' },
  { name: 'Your local rebates', what: 'Scan your address to see the lawn-replacement programs that serve it', by: 'EcoEstate', to: '/' },
];

export default function Examples() {
  usePageMeta({
    title: 'Real lawn-to-native-garden examples',
    description: 'Real projects where lawns became native gardens, with links to the organizations behind them, plus trusted guides to native plants and rebates.',
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:py-20">
      <h1 className="max-w-3xl font-display text-[2.6rem] leading-[1.05] tracking-tight sm:text-[3.4rem]">
        Real gardens that used to be lawns
      </h1>
      <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
        A few real projects from community programs and homeowners. Each links to the people who did it, where you
        can see their photos and read more.
      </p>

      <ul className="mt-12 divide-y divide-border border-y border-border">
        {PROJECTS.map((p) => (
          <li key={p.title} className="grid gap-4 py-8 sm:grid-cols-[1fr_2fr] sm:gap-10">
            <div>
              <p className="text-[13px] text-muted-foreground">{p.place}</p>
              <p className="mt-3 font-display text-[2.2rem] leading-none tracking-tight">{p.stat}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{p.statLabel}</p>
            </div>
            <div>
              <h2 className="font-display text-[1.6rem] leading-tight tracking-tight">{p.title}</h2>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-foreground/85">{p.body}</p>
              <p className="mt-3 text-[13px] text-muted-foreground">{p.by}</p>
              <a
                href={p.source}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[14px] font-medium underline underline-offset-4"
              >
                See the project <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-16 rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:px-10">
        <h2 className="font-display text-[2rem] leading-tight tracking-tight">What could your lawn become?</h2>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-primary-foreground/80">
          Scan your address to see your lawn outlined, a native garden designed for it, and what it could save.
        </p>
        <Button asChild variant="secondary" className="mt-6 rounded-full px-6">
          <Link to="/">Scan my lawn</Link>
        </Button>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-[2rem] tracking-tight">Trusted places to learn more</h2>
        <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">
          Independent guides we point people to. EcoEstate isn’t affiliated with these organizations.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {RESOURCES.map((r) => {
            const inner = (
              <>
                <span className="block text-[16px] font-medium">{r.name}</span>
                <span className="mt-1 block text-[14px] leading-relaxed text-muted-foreground">{r.what}</span>
                <span className="mt-2 block text-[12.5px] text-muted-foreground">{r.by}</span>
              </>
            );
            const cls = 'block h-full rounded-2xl border border-border p-5 transition hover:border-primary/40';
            return (
              <li key={r.name}>
                {r.to ? (
                  <Link to={r.to} className={cls}>{inner}</Link>
                ) : (
                  <a href={r.url} target="_blank" rel="noreferrer" className={cls}>
                    {inner}
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
