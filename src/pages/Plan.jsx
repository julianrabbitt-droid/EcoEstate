import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useProject } from '@/hooks/useProjects';
import { ArrowRight, Box, CalendarDays, ClipboardCheck, Hammer, HandHeart, LayoutGrid, Printer, ShoppingBasket, Users } from 'lucide-react';
import { StageOverlay, useStage, useWide } from '@/components/ProjectStage';
import HostInstallForm from '@/components/HostInstallForm';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { installWhen, spotsLeft } from '@/lib/installs';
import { speciesKey } from '@/lib/speciesColors';
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

// The build step: the view moves in over the beds, each plant on a disc in its
// species' colour and number (or straight down, as a planting plan), with the
// list beside it; then the materials, the order of work, and the ways to get
// it built, a community install among them.
export default function Plan() {
  const { id } = useParams();
  const location = useLocation();
  const { project, loading } = useProject(id, location.state);
  const rebates = useRebates(project);
  const wide = useWide();
  const { user, isAuthenticated, navigateToLogin } = useAuth();
  const [copied, setCopied] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [planView, setPlanView] = useState(false);
  const design = useMemo(() => (project ? designOrDefault(project) : []), [project]);
  useStage(
    loading ? null : !project ? { missing: true } : { project, entries: design, scene: 'build', highlight, planView, viewShift: wide ? [-220, 20] : [0, 70] },
    [loading, project, design, highlight, planView, wide],
  );
  // This property's community install, if its owner is hosting one.
  const [install, setInstall] = useState(undefined);
  const [hostForm, setHostForm] = useState(false);
  useEffect(() => {
    if (!user?.id || !project) return;
    base44.entities.CommunityInstall.filter({ projectId: id, created_by_id: user.id }, { sort: '-date', limit: 10 })
      .then((list) => setInstall(list.find((i) => i.status === 'open' || i.status === 'full') || list[0] || null))
      .catch(() => setInstall(null));
  }, [user?.id, project, id]);
  // Arriving from "Edit" on the install page opens the form there.
  useEffect(() => {
    if (location.hash !== '#community-install' || install === undefined) return;
    if (install) setHostForm(true);
    setTimeout(() => document.getElementById('community-install')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, [location.hash, install]);
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

  if (loading) return null;

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

  const key = speciesKey(design);
  const plantRows = design.map((entry) => ({ entry, plant: plantById(entry.speciesId), k: key.get(entry.speciesId) })).filter((r) => r.plant && r.k);
  const plantCount = plantRows.reduce((a, r) => a + r.entry.quantity, 0);
  const toInstall = () => document.getElementById('community-install')?.scrollIntoView({ behavior: 'smooth' });
  const viewSwitch = (
    <div role="group" aria-label="View" className="flex rounded-full border border-border bg-background/40 p-0.5 text-[11.5px]">
      {[[false, '3D garden', Box], [true, 'Planting plan', LayoutGrid]].map(([on, l, Icon]) => (
        <button key={l} type="button" aria-pressed={planView === on} onClick={() => setPlanView(on)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1 transition ${planView === on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden />{l}
        </button>
      ))}
    </div>
  );
  // How the plants divide up, one bar segment per species in its colour.
  const shareBar = (
    <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Share of plants by species">
      {plantRows.map(({ entry, k }) => (
        <span key={entry.speciesId} style={{ width: `${(entry.quantity / Math.max(1, plantCount)) * 100}%`, background: k.color, opacity: !highlight || highlight === entry.speciesId ? 1 : 0.3 }} />
      ))}
    </div>
  );
  const legend = (
    <ul className="space-y-1">
      {plantRows.map(({ entry, plant, k }) => {
        const on = highlight === entry.speciesId;
        return (
          <li key={entry.speciesId}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => setHighlight(on ? null : entry.speciesId)}
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition ${on ? 'bg-secondary' : 'hover:bg-secondary/60'} ${highlight && !on ? 'opacity-55' : ''}`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-white font-mono text-[10.5px] font-semibold text-white" style={{ background: k.color }}>{k.n}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-tight">{plant.common}</span>
                <span className="block text-[11px] text-muted-foreground">{plant.spacing} ft apart · {money(entry.quantity * plant.cost)}</span>
              </span>
              <span className="text-[13px] tabular-nums">{entry.quantity}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div>
      <StageOverlay>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 sm:p-5 print:hidden">
          <div className="pointer-events-auto inline-block max-w-full"><StepNav projectId={id} project={project} current="plan" /></div>
          <div className="pointer-events-auto mt-3 w-fit max-w-[min(34rem,calc(100vw-1.5rem))] rounded-2xl border border-border/60 bg-card/85 px-4 py-3 shadow-lg backdrop-blur-md lg:max-w-[calc(100vw-29rem)]">
            <h1 className="font-display text-[1.5rem] leading-tight tracking-tight sm:text-[1.9rem]">
              Make this garden <em className="italic text-primary">real</em>
            </h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {plantCount} plants · {design.length} species · {money(materialsTotal)} in materials and labor
            </p>
            <div className="mt-3 space-y-2 lg:hidden">
              {viewSwitch}
              {shareBar}
              <details>
                <summary className="cursor-pointer text-[12px] text-muted-foreground">The {plantRows.length} species, by number</summary>
                <div className="mt-1 max-h-[24svh] overflow-y-auto">{legend}</div>
              </details>
            </div>
          </div>
        </div>
        <aside className="pointer-events-auto absolute bottom-16 right-3 top-3 z-20 hidden w-[25rem] flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/88 shadow-2xl backdrop-blur-md lg:flex print:hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div>
              <p className="label-xs">Planting plan</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">Every plant on a disc of its species’ colour, sized to its spacing. Pick a species to find it in the garden.</p>
            </div>
            {viewSwitch}
            <div className="space-y-1.5">
              {shareBar}
              <p className="text-[11px] text-muted-foreground">Share of the {plantCount} plants, by species</p>
            </div>
            {legend}
          </div>
          <div className="space-y-2 border-t border-border/60 p-4">
            <Button onClick={toInstall} className="w-full rounded-full" size="lg">
              <HandHeart className="mr-2 h-4 w-4" />
              {install && install.status !== 'cancelled' && install.status !== 'done' ? 'Your community install' : 'Host a community install'}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => window.print()} className="rounded-full">
                <Printer className="mr-1.5 h-4 w-4" />
                Print plan
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link to={`/my-projects?project=${id}`}>Track it</Link>
              </Button>
            </div>
          </div>
        </aside>
      </StageOverlay>

    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs">Planting plan & materials</p>
          <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight">Everything it takes</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {cleanAddress(project.address)} · {design.length} species · {money(materialsTotal)} in materials and labor
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
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
            { icon: ClipboardCheck, title: 'Community install', body: 'Host a planting day: neighbours and students sign up to help and earn volunteer hours.', highlight: true, onClick: toInstall },
          ].map((option) => (
            <div
              key={option.title}
              role={option.onClick ? 'button' : undefined}
              tabIndex={option.onClick ? 0 : undefined}
              onClick={option.onClick}
              onKeyDown={option.onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); option.onClick(); } } : undefined}
              className={`rounded-2xl border p-4 ${
                option.highlight ? 'cursor-pointer border-primary/40 bg-primary/5 transition hover:border-primary/70' : 'border-border bg-card'
              }`}
            >
              <option.icon className={`h-4 w-4 ${option.highlight ? 'text-primary' : 'text-accent'}`} />
              <h3 className="mt-2.5 text-[13.5px] font-medium leading-tight">{option.title}</h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{option.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="community-install" className="mt-8 scroll-mt-24 rounded-2xl border border-primary/30 bg-primary/5 p-6 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <p className="label-xs flex items-center gap-1.5"><HandHeart className="h-3.5 w-3.5 text-primary" aria-hidden />Community install</p>
            <h2 className="mt-1.5 font-display text-2xl tracking-tight">Plant it together</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Post a planting day. Neighbours, students and volunteer groups sign up to help, learn how it’s done and earn volunteer hours you confirm afterwards. They can message you with questions; your address stays private until you send it.
            </p>
          </div>
          {install && install.status !== 'cancelled' && !hostForm && (
            <div className="surface min-w-[16rem] bg-card/80 p-4">
              <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{installWhen(install)}</p>
              <p className="mt-1 text-[15px] font-medium">{install.title}</p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{install.status === 'done' ? 'Planted' : `${install.joined || 0} of ${install.spots} helpers · ${spotsLeft(install)} spots left`}</p>
              <div className="mt-3 flex gap-2">
                <Button asChild size="sm" className="rounded-full"><Link to={`/installs/${install.id}`}><Users className="mr-1.5 h-3.5 w-3.5" />Helpers</Link></Button>
                {install.status !== 'done' && <Button size="sm" variant="outline" onClick={() => setHostForm(true)} className="rounded-full">Edit</Button>}
              </div>
            </div>
          )}
        </div>
        {!isAuthenticated ? (
          <Button onClick={navigateToLogin} className="mt-4 rounded-full">Sign in to host</Button>
        ) : hostForm || (!install || install.status === 'cancelled' || install.status === 'done') ? (
          hostForm ? (
            <div className="surface mt-5 bg-card/85 p-5">
              <HostInstallForm
                project={project}
                install={install && install.status !== 'cancelled' && install.status !== 'done' ? install : null}
                onSaved={(saved) => { setInstall(saved); setHostForm(false); }}
                onCancel={() => setHostForm(false)}
              />
            </div>
          ) : (
            <Button onClick={() => setHostForm(true)} className="mt-4 rounded-full"><HandHeart className="mr-1.5 h-4 w-4" />Host a community install</Button>
          )
        ) : null}
        <p className="mt-4 text-[12px] text-muted-foreground">
          Want to help at someone else’s? <Link to="/installs" className="underline underline-offset-2">See planting days near you</Link>.
        </p>
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
    </div>
  );
}