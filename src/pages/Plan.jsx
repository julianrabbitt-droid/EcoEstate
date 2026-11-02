import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useProject } from '@/hooks/useProjects';
import { ArrowRight, ClipboardCheck, Hammer, Loader2, Printer, ShoppingBasket, Users } from 'lucide-react';
import BuildTimeline from '@/components/BuildTimeline';
import StepNav from '@/components/StepNav';
import { Button } from '@/components/ui/button';
import { organizationsFor, NURSERIES } from '@/data/organizations';
import { plantById } from '@/data/nativePlants';
import { designOrDefault, financials, money, num } from '@/lib/landscapeMath';
import { buildSchedule } from '@/lib/buildSchedule';
import ProjectExports from '@/components/ProjectExports';
import { useRebates } from '@/hooks/useRebates';
import { cleanAddress } from '@/lib/geo';

const STEPS = [
  ['Mark the beds', 'Spray the outline of the new beds with marking paint, then strip turf or sheet-mulch it with cardboard.'],
  ['Fix the soil', 'No tilling. Spread 3 inches of arborist mulch over the beds and keep it off plant crowns.'],
  ['Run drip first', 'Lay pressure-regulated drip lines 12–18 inches apart before planting, so nothing gets trampled later.'],
  ['Place, then plant', 'Set every pot out at its spacing, step back, adjust, then plant at the same depth it grew in the nursery.'],
  ['Water to establish', 'Deep water twice a week for the first summer, then once a month, then only in extreme heat.'],
];

export default function Plan() {
  const { id } = useParams();
  const location = useLocation();
  const { project, loading } = useProject(id, location.state);
  const rebates = useRebates(project);
  const [copied, setCopied] = useState(false);
  // Local organizations: start with the 5 closest (city-tier) matches, then
  // widen the range — county, region, statewide — 20 more at a time.
  const [orgTier, setOrgTier] = useState(0);
  const [orgLimit, setOrgLimit] = useState(5);

  useEffect(() => {
    if (!project) return;
    setOrgTier(() => {
      for (let t = 0; t <= 3; t++) if (organizationsFor(project, t).length) return t;
      return 3;
    });
  }, [project]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Opening your scan…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl">This property scan is gone</h1>
        <Button asChild className="mt-6 rounded-full">
          <Link to="/">Scan a property</Link>
        </Button>
      </div>
    );
  }

  const design = designOrDefault(project);
  const allOrgs = organizationsFor(project, orgTier);
  const shownOrgs = allOrgs.slice(0, orgLimit);
  const orgsHasMore = orgLimit < allOrgs.length || orgTier < 3;
  const seeMoreOrgs = () => {
    if (orgLimit < allOrgs.length) {
      setOrgLimit((l) => l + 20);
    } else if (orgTier < 3) {
      setOrgTier((t) => t + 1);
      setOrgLimit(allOrgs.length + 20);
    }
  };
  const RANGE_LABEL = ['in your city', 'across your county', 'across your region', 'across California'][orgTier];
  const fin = financials(project, design, rebates);
  const mulchYards = Math.max(1, Math.round((fin.turfSqft * 0.25) / 27));

  const rows = [
    ...design.map((entry) => {
      const plant = plantById(entry.speciesId);
      if (!plant) return null;
      return { label: plant.common, note: `${plant.spacing} ft spacing`, qty: `${entry.quantity} plants`, cost: entry.quantity * plant.cost };
    }).filter(Boolean),
    { label: 'Arborist mulch', note: '3 inches deep', qty: `${mulchYards} cu yd`, cost: fin.mulch },
    { label: 'Drip irrigation kit', note: 'Pressure-regulated, 12–18 in spacing', qty: `${num(fin.turfSqft)} sq ft`, cost: fin.irrigation },
    { label: 'Installation labor', note: 'Planting, grading, mulch spread', qty: 'Crew', cost: fin.install },
  ];
  const materialsTotal = rows.reduce((sum, row) => sum + row.cost, 0);

  const brief = [
    `Property: ${cleanAddress(project.address)}`,
    `Convertible turf: ${num(fin.turfSqft)} sq ft`,
    `Species: ${design.map((entry) => `${plantById(entry.speciesId)?.common} × ${entry.quantity}`).join(', ')}`,
    `Estimated water saved: ${num(fin.gallonsSaved)} gallons/year`,
    `Estimated project cost before rebates: ${money(materialsTotal)}`,
    `Notes: native conversion, drip irrigation, no synthetic fertilizer.`,
  ].join('\n');

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <StepNav projectId={id} current="plan" />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs">Planting plan & materials</p>
          <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-[2.4rem]">
            Make this garden real
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {cleanAddress(project.address)} · {design.length} species · {money(materialsTotal)} in materials and labor
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()} className="rounded-full">
            <Printer className="mr-2 h-4 w-4" />
            Print plan
          </Button>
          <Button asChild className="rounded-full">
            <Link to={`/my-projects?project=${id}`}>
              Track this property
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        <section className="surface overflow-hidden">
          <div className="border-b border-border/70 px-5 py-4">
            <h2 className="text-[15px] font-medium tracking-tight">Bill of materials</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">Quantities follow the mature spacing of each species.</p>
          </div>
          <table className="w-full text-[12.5px]">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-medium leading-tight">{row.label}</p>
                    <p className="text-[11px] text-muted-foreground">{row.note}</p>
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-right text-muted-foreground">{row.qty}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{money(row.cost)}</td>
                </tr>
              ))}
              <tr className="bg-secondary/40">
                <td className="px-5 py-3 font-medium">Total</td>
                <td />
                <td className="px-5 py-3 text-right font-display text-lg">{money(materialsTotal)}</td>
              </tr>
              <tr>
                <td className="px-5 py-3 text-accent">Rebates and incentives</td>
                <td />
                <td className="px-5 py-3 text-right tabular-nums text-accent">−{money(fin.rebate)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="surface p-5">
          <h2 className="text-[15px] font-medium tracking-tight">Installation sequence</h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[10px]">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[13px] font-medium leading-tight">{title}</p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <ProjectExports projectId={id} project={project} design={design} />

      <section className="mt-8">
        <p className="label-xs">Get it built</p>
        <h2 className="mt-1.5 font-display text-2xl tracking-tight">Four ways to finish this</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Hammer, title: 'Do it yourself', body: 'You have the quantities, spacing and sequence: a weekend for most of this yard.' },
            { icon: ShoppingBasket, title: 'Buy the materials', body: 'Take the bill of materials to a native nursery; most deliver by the pallet.' },
            { icon: Users, title: 'Hire a crew', body: 'Send the brief to an ecological landscape contractor for a fixed quote.' },
            { icon: ClipboardCheck, title: 'Community install', body: 'Volunteer crews convert yards at scheduled planting events.', highlight: true },
          ].map((option) => (
            <div
              key={option.title}
              className={`rounded-2xl border p-4 ${
                option.highlight ? 'border-accent/40 bg-accent/5' : 'border-border bg-card'
              }`}
            >
              <option.icon className="h-4 w-4 text-accent" />
              <h3 className="mt-2.5 text-[13.5px] font-medium leading-tight">{option.title}</h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{option.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 surface p-5">
        <p className="label-xs">Build timeline</p>
        <h2 className="mt-1.5 font-display text-2xl tracking-tight">{buildSchedule(fin.turfSqft).title}</h2>
        <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
          Scaled to {num(fin.turfSqft)} sq ft of converted turf. Most of the work is weekends; the first summer of watering is what makes it stick.
        </p>
        <BuildTimeline sqft={fin.turfSqft} />
      </section>

      <section className="mt-8 rounded-2xl border border-accent/30 bg-accent/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label-xs">Community</p>
            <h2 className="mt-1.5 font-display text-2xl tracking-tight">Share your progress and see others</h2>
            <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
              Post before-and-after photos, follow other conversions, ask questions in the comments, and message members near you.
            </p>
          </div>
          <Button asChild className="rounded-full">
            <Link to="/social">Open the community</Link>
          </Button>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-accent/30 bg-accent/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label-xs">My projects</p>
            <h2 className="mt-1.5 font-display text-2xl tracking-tight">Track your conversion</h2>
            <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
              Log progress, photos and your real water and money savings as you convert this lawn. Part of Pro ($10/month), free for students with a school email.
            </p>
          </div>
          <Button asChild className="rounded-full">
            <Link to={`/my-projects?project=${id}`}>Track this property</Link>
          </Button>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section className="surface p-5">
          <h2 className="text-[15px] font-medium tracking-tight">Local organizations</h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Groups that run planting projects {project.city ? <>in <span className="text-foreground">{project.city}</span> and nearby</> : `near ${cleanAddress(project.address)}`}. Showing matches {RANGE_LABEL}.
          </p>
          <ul className="mt-4 space-y-4">
            {shownOrgs.map((org) => (
              <li key={org.id} className={org.highlight ? 'rounded-xl border border-accent/30 bg-accent/5 p-4' : 'border-b border-border/60 pb-4'}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13.5px] font-medium">{org.name}</p>
                  <span className="text-[12px] text-muted-foreground">{org.kind}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{org.area}</p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{org.desc}</p>
                <a
                  href={org.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-block text-[11.5px] font-medium underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  Contact {org.name}
                </a>
              </li>
            ))}
          </ul>
          {orgsHasMore && (
            <Button variant="outline" onClick={seeMoreOrgs} className="mt-4 w-full rounded-full">
              See more organizations
            </Button>
          )}
        </section>

        <section className="surface p-5">
          <h2 className="text-[15px] font-medium tracking-tight">Project brief</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
            Copy this into an email or a volunteer application. It has everything a crew or nursery needs.
          </p>
          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-secondary/50 p-3 font-mono text-[10.5px] leading-relaxed text-foreground">
{brief}
          </pre>
          <Button onClick={copyBrief} className="mt-3 w-full rounded-full" variant={copied ? 'secondary' : 'default'}>
            {copied ? 'Copied to clipboard' : 'Copy project brief'}
          </Button>

          <h3 className="mt-5 text-[12px] text-muted-foreground">Where to buy plants</h3>
          <ul className="mt-2 space-y-1.5 text-[11.5px]">
            {NURSERIES.map((nursery) => (
              <li key={nursery.name} className="flex justify-between gap-2 border-b border-border/50 pb-1.5">
                <span className="font-medium">{nursery.name}</span>
                <span className="text-right text-muted-foreground">{nursery.note} · {nursery.area}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-8 flex justify-end">
        <Button asChild className="rounded-full">
          <Link to={`/my-projects?project=${id}`}>
            Track this property
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}