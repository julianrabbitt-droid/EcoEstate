import { useEffect, useMemo, useState } from 'react';
import { applyPayoffInputs, breakEvenYears, PAYOFF_FIELDS, payoffEstimates, readPayoffInputs, savedBy, savePayoffInputs } from '@/lib/payoffNumbers';
import { peopleFor, purchaseFor } from '@/lib/payoffStacks';
import { StageAside, StageOverlay, StageTitle, useStage, useStagePanels, useWide } from '@/components/ProjectStage';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useProject } from '@/hooks/useProjects';
import { ArrowRight, Banknote, Bird, Droplets, Leaf, Loader2, Share2, Sprout, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import StepNav from '@/components/StepNav';
import StatTile from '@/components/StatTile';
import { Button } from '@/components/ui/button';
import { designOrDefault, money, num } from '@/lib/landscapeMath';
import { plantById } from '@/data/nativePlants';
import { defaultMixForProject, plantsForProject } from '@/data/regions';
import { buildSchedule } from '@/lib/buildSchedule';
import RebatesSection from '@/components/RebatesSection';

const HORIZONS = [1, 5, 10, 30];
// A biodiversity score from here up is a good result for an average home
// garden: about five native species in a few layers, feeding bees, butterflies
// and birds, in place of the lawn (see computeLandscape for the score).
const GOOD_SCORE = 60;

const axisTick = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };
const yearTick = (v) => (v === 0 ? 'Now' : `Yr ${v}`);
// Whole years along the axis: every year up to 10, every 5 beyond.
const yearTicks = (horizon) => {
  const step = horizon > 10 ? 5 : 1;
  return Array.from({ length: Math.floor(horizon / step) + 1 }, (_, i) => i * step);
};
const gallonTick = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v)}`);
const dollarTick = (v) => {
  const a = Math.abs(v);
  const body = a >= 1000 ? `$${Math.round(a / 100) / 10}k` : `$${Math.round(a)}`;
  return v < 0 ? `-${body}` : body;
};
const tooltipStyle = { borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12, background: 'hsl(var(--card))' };

// The payoff step: what the conversion costs, what comes back, and how money,
// water, carbon and habitat add up over the years. Up top, the property turns
// to face the street with the money and water saved standing beside it as 3D
// stacks (the steps' shared view); the full numbers follow below.
export default function Impact() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { project, loading } = useProject(id, location.state);
  const wide = useWide();
  const { asideOpen } = useStagePanels() || { asideOpen: true };
  const [serverFin, setServerFin] = useState(null); // our estimates for the property
  // The person's own numbers, in place of any of ours (kept in this browser).
  const [mine, setMine] = useState(() => readPayoffInputs(id));
  useEffect(() => savePayoffInputs(id, mine), [id, mine]);
  const fin = useMemo(() => applyPayoffInputs(serverFin, mine), [serverFin, mine]);
  const estimates = useMemo(() => (serverFin ? payoffEstimates(serverFin) : null), [serverFin]);
  const [env, setEnv] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [horizon, setHorizon] = useState(10);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    setError('');
    const design = designOrDefault(project);
    const entries = design
      .map((e) => {
        const p = plantById(e.speciesId);
        return p ? { speciesId: e.speciesId, quantity: e.quantity, w: p.w, spacing: p.spacing, cost: p.cost, wildlife: p.wildlife, form: p.form } : null;
      })
      .filter(Boolean);
    const catalog = plantsForProject(project).map((p) => ({ id: p.id, w: p.w, spacing: p.spacing, cost: p.cost, wildlife: p.wildlife, form: p.form, sun: p.sun, water: p.water }));
    base44.functions
      .invoke('computeLandscape', {
        turfSqft: project.breakdown?.turf || 0,
        entries,
        catalog,
        defaultPalette: defaultMixForProject(project),
        location: Array.isArray(project.center) ? { lat: project.center[0], lon: project.center[1] } : null,
      })
      .then(({ data }) => {
        if (cancelled) return;
        if (!data?.financials || !data?.environmental) throw new Error('The numbers came back empty.');
        setServerFin(data.financials);
        setEnv(data.environmental);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Couldn’t crunch the numbers.');
      });
    return () => { cancelled = true; };
  }, [project, attempt]);

  const sched = useMemo(() => buildSchedule(fin?.turfSqft || 0), [fin?.turfSqft]);
  const projection = useMemo(() => {
    if (!fin || !env) return null;
    const co2PerYear = Math.round(fin.turfSqft * 0.8 + (env.canopySqft || 0) * 1.2); // lbs CO2 / yr
    const series = Array.from({ length: 31 }, (_, y) => {
      const saved = savedBy(fin.annualSavings, fin.increase, y);
      const grown = Math.min(1, y / Math.max(1, sched.establishYears));
      return {
        year: y,
        saved: Math.round(saved),
        net: Math.round(saved - fin.outOfPocket),
        water: fin.gallonsSaved * y,
        co2: co2PerYear * y,
        score: Math.round(env.before + (env.after - env.before) * grown),
      };
    });
    return { series, co2PerYear };
  }, [fin, env, sched.establishYears]);

  const entries = useMemo(() => (project ? designOrDefault(project) : []), [project]);
  const point = projection?.series[horizon];
  const payoff = useMemo(
    () => (fin && point ? { dollars: point.saved, gallons: fin.gallonsSaved * horizon, years: horizon } : null),
    [fin, point, horizon],
  );
  useStage(
    loading ? null : !project ? { missing: true } : { project, entries, scene: 'payoff', payoff, viewShift: wide && asideOpen ? [-210, 0] : [0, 40] },
    [loading, project, entries, payoff, wide, asideOpen],
  );

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

  if (!fin || !env || !projection) {
    return (
      <StageOverlay>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 sm:p-5">
          <div className="pointer-events-auto inline-block max-w-full"><StepNav projectId={id} project={project} current="impact" /></div>
          <div className="pointer-events-auto mt-3 w-fit max-w-[min(30rem,calc(100vw-1.5rem))] rounded-2xl border border-border/60 bg-card/85 px-4 py-3 shadow-lg backdrop-blur-md">
            {error ? (
              <>
                <p className="text-[14px] font-medium">We couldn’t crunch the numbers</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">{error}</p>
                <Button onClick={() => setAttempt((n) => n + 1)} variant="outline" size="sm" className="mt-3 rounded-full">
                  Retry
                </Button>
              </>
            ) : (
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Crunching the numbers…
              </p>
            )}
          </div>
        </div>
      </StageOverlay>
    );
  }

  const series = projection.series.slice(0, horizon + 1);
  // A summary for a community post: city, size, plants and savings only. The
  // server keeps nothing else (server/shared/sharedProject.js).
  const shareProject = () => {
    const plants = designOrDefault(project)
      .map((e) => ({ name: plantById(e.speciesId)?.common, count: e.quantity }))
      .filter((x) => x.name);
    const city = [project.city, project.state].filter(Boolean).join(', ');
    navigate('/social', {
      state: {
        shareProject: {
          city,
          lawnSqft: fin.turfSqft,
          plantCount: fin.plantCount,
          plants,
          arrangement: project.arrangementName || '',
          gallonsSaved: fin.gallonsSaved,
          annualSavings: fin.annualSavings,
          installCost: fin.totalCost,
          rebate: fin.rebate,
          co2PerYear: projection.co2PerYear,
          paybackYears: fin.payback,
        },
      },
    });
  };
  const net = series[horizon].net;
  // When the running total crosses zero (fractional years), and the year it happens in.
  const crossing = breakEvenYears(projection.series);
  const breakEven = crossing == null ? null : Math.max(0, Math.ceil(crossing - 1e-9));
  const paysBack = breakEven == null ? null : breakEven === 0 ? 'right away' : `in year ${breakEven}`;
  const ticks = yearTicks(horizon);
  const setMineField = (key, value) => setMine((m) => ({ ...m, [key]: value }));
  const toBuild = () => navigate(`/project/${id}/plan`, { state: { project } });
  const years = (n) => `${n} year${n === 1 ? '' : 's'}`;
  const horizonSwitch = (
    <div role="group" aria-label="Years" className="flex rounded-full border border-border bg-background/40 p-0.5 text-[11.5px]">
      {HORIZONS.map((h) => (
        <button
          key={h}
          type="button"
          onClick={() => setHorizon(h)}
          aria-pressed={horizon === h}
          className={`flex-1 whitespace-nowrap rounded-full px-3 py-1 transition ${horizon === h ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {years(h)}
        </button>
      ))}
    </div>
  );
  const figures = (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
        <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Banknote className="h-3.5 w-3.5 text-primary" aria-hidden />Money saved</p>
        <p className="mt-1 font-display text-[1.6rem] leading-none tracking-tight">{money(series[horizon].saved)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{net >= 0 ? `${money(net)} ahead after the cost` : `${money(-net)} to go to break even`} · buys {purchaseFor(series[horizon].saved).name}</p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
        <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Droplets className="h-3.5 w-3.5 text-chart-2" aria-hidden />Water saved</p>
        <p className="mt-1 font-display text-[1.6rem] leading-none tracking-tight">{num(series[horizon].water)}<span className="ml-1 text-[13px] text-muted-foreground">gal</span></p>
        <p className="mt-1 text-[11px] text-muted-foreground">{num(fin.gallonsSaved)} a year · {fin.reductionPct}% less · {(() => {
          const { people } = peopleFor(series[horizon].water);
          return people < 1 ? `${Math.max(1, Math.round(people * 12))} months of one person’s water` : `a year’s water for ${num(Math.round(people))} ${Math.round(people) === 1 ? 'person' : 'people'}`;
        })()}</p>
      </div>
    </div>
  );

  return (
    <div>
      <StageOverlay>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 sm:p-5">
          <div className="pointer-events-auto inline-block max-w-full"><StepNav projectId={id} project={project} current="impact" /></div>
          <StageTitle
            title={(
              <h1 className="font-display text-[1.5rem] leading-tight tracking-tight sm:text-[1.9rem]">
                {money(fin.outOfPocket)} in, <em className="italic text-primary">{money(fin.annualSavings)} back</em> every year
              </h1>
            )}
          >
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {num(fin.turfSqft)} sq ft converted · {num(fin.plantCount)} native plants · {paysBack ? `pays for itself ${paysBack}` : 'no payback at these numbers'}
            </p>
            {/* Phones: the two numbers and the years here, the view below them. */}
            <div className="mt-3 space-y-2 lg:hidden">
              {horizonSwitch}
              {figures}
            </div>
          </StageTitle>
        </div>
        <StageAside
          label="What comes back"
          summary={`${money(fin.annualSavings)} a year`}
          footer={(
            <>
              <Button onClick={toBuild} className="w-full rounded-full" size="lg">
                Build this garden
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={shareProject} className="w-full rounded-full">
                <Share2 className="mr-2 h-4 w-4" />
                Share in the community
              </Button>
            </>
          )}
        >
          <div className="space-y-4">
            <div>
              <p className="text-[12.5px] text-muted-foreground">Beside your house: the money and the water this garden saves (the water at its true size), and what the money could buy.</p>
            </div>
            {horizonSwitch}
            {figures}
            <dl className="space-y-2 rounded-2xl border border-border/60 bg-background/40 p-4 text-[12.5px]">
              <div className="flex justify-between text-[11.5px]">
                <dt className="text-muted-foreground">{fin.edited ? 'With your numbers' : 'Our estimates'}</dt>
                <dd><button type="button" onClick={() => document.getElementById('your-numbers')?.scrollIntoView({ behavior: 'smooth' })} className="text-primary underline underline-offset-2">Use your own numbers</button></dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Estimated cost</dt><dd className="tabular-nums">{money(fin.totalCost)}</dd></div>
              <div className="flex justify-between text-accent"><dt>Rebates and incentives</dt><dd className="tabular-nums">−{money(fin.rebate)}</dd></div>
              <div className="flex justify-between border-t border-border/60 pt-2 font-medium"><dt>Your cost</dt><dd className="tabular-nums">{money(fin.outOfPocket)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Back each year</dt><dd className="tabular-nums text-primary">{money(fin.annualSavings)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Break-even</dt><dd className="tabular-nums">{breakEven == null ? 'Not at these numbers' : breakEven === 0 ? 'Right away' : `Year ${breakEven}`}</dd></div>
            </dl>
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                <p className="text-muted-foreground">Biodiversity</p>
                <p className="mt-0.5 font-display text-[1.25rem]">{env.before} → {env.after}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                <p className="text-muted-foreground">CO₂ drawn down</p>
                <p className="mt-0.5 font-display text-[1.25rem]">{num(series[horizon].co2)} lb</p>
              </div>
            </div>
          </div>
        </StageAside>
      </StageOverlay>

    <div id="step-details" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs">Financial & environmental payoff</p>
          <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight">The numbers behind it</h2>
        </div>
        <Button onClick={toBuild} className="rounded-full lg:hidden" size="lg">
          Build this garden
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Estimated cost" value={money(fin.totalCost)} sub="Plants, mulch, drip and installation" />
        <StatTile label="Rebates available" value={money(fin.rebate)} sub="Programs that serve this address" />
        <StatTile label="Annual savings" value={money(fin.annualSavings)} sub="Water, mowing and inputs" accent />
        <StatTile label={`${horizon}-year net`} value={money(net)} sub={paysBack ? `Pays for itself ${paysBack}` : 'No payback at these numbers'} />
      </div>

      <section id="your-numbers" className="mt-5 scroll-mt-24 surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-medium tracking-tight">Your numbers</h2>
            <p className="mt-1 max-w-2xl text-[12.5px] text-muted-foreground">
              These start as our estimates for {num(fin.turfSqft)} sq ft at this address. Put in your own (your water bill,
              your gardener, a quote) and every figure and chart on this page follows. Kept in this browser.
            </p>
          </div>
          {fin.edited && (
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setMine({})}>
              Reset to our estimates
            </Button>
          )}
        </div>
        <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {PAYOFF_FIELDS.map((f) => {
            const own = mine[f.key] !== undefined && mine[f.key] !== '';
            return (
              <label key={f.key} className="block text-[12.5px]">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{f.label}</span>
                  {own && <button type="button" onClick={() => setMineField(f.key, '')} className="text-[11px] text-muted-foreground underline underline-offset-2">use ours ({estimates[f.key].toLocaleString('en-US', { maximumFractionDigits: 2 })})</button>}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={f.step}
                    value={own ? mine[f.key] : ''}
                    placeholder={String(estimates[f.key])}
                    onChange={(e) => setMineField(f.key, e.target.value)}
                    className={`h-9 w-28 rounded-lg border bg-card px-2.5 text-right tabular-nums shadow-sm outline-none transition placeholder:text-foreground/55 hover:border-foreground/30 focus:ring-2 focus:ring-ring ${own ? 'border-primary/70 font-medium' : 'border-border'}`}
                    aria-label={`${f.label} (${f.unit})`}
                  />
                  <span className="text-[11.5px] text-muted-foreground">{f.unit}</span>
                </span>
                {f.hint && <span className="mt-1 block text-[11px] text-muted-foreground">{f.hint}</span>}
              </label>
            );
          })}
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <section className="surface p-5">
          <h2 className="text-[15px] font-medium tracking-tight">Where the money goes</h2>
          <dl className="mt-4 space-y-2.5 text-[13px]">
            {[
              ['Native plants', fin.plantCost],
              ['Installation labor', fin.install],
              ['Drip irrigation conversion', fin.irrigation],
              ['Mulch and soil prep', fin.mulch],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums">{money(value)}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border/70 pt-2.5">
              <dt className="font-medium">Total project</dt>
              <dd className="font-medium tabular-nums">{money(fin.totalCost)}</dd>
            </div>
            <div className="flex items-center justify-between text-accent">
              <dt>Rebates and incentives</dt>
              <dd className="tabular-nums">−{money(fin.rebate)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground">
            <span className="text-[12px] text-primary-foreground/80">Your cost</span>
            <span className="font-display text-2xl">{money(fin.outOfPocket)}</span>
          </div>
          <div className="mt-4 space-y-2 border-t border-border/70 pt-3 text-[12.5px]">
            {[
              ['Water savings', fin.waterSavings],
              ['Mowing and maintenance', fin.maintenanceSavings],
              ['Fertilizer and pesticide', fin.inputSavings],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="tabular-nums">{money(value)} / yr</span>
              </div>
            ))}
          </div>
        </section>

        <section className="surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-medium tracking-tight">Cumulative cash position</h2>
            <div className="w-full sm:w-auto">{horizonSwitch}</div>
          </div>
          <div className="mt-4 h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
                <XAxis type="number" dataKey="year" domain={[0, horizon]} ticks={ticks} tickFormatter={yearTick} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={dollarTick} tick={axisTick} axisLine={false} tickLine={false} width={52} />
                <Tooltip formatter={(value) => [money(value), 'Net position']} labelFormatter={(label) => `Year ${label}`} contentStyle={tooltipStyle} />
                <ReferenceLine y={0} stroke="hsl(var(--accent))" strokeDasharray="4 4" />
                {/* Straight lines between the yearly points, so the marker sits exactly where the line crosses zero. */}
                <Area type="linear" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#netFill)" />
                {crossing != null && crossing > 0 && crossing <= horizon && (
                  <ReferenceLine x={crossing} stroke="hsl(var(--accent))" strokeDasharray="4 4" label={{ value: `Break-even · ${crossing < 1 ? `${Math.max(1, Math.round(crossing * 12))} mo` : `${Math.round(crossing * 10) / 10} yr`}`, fontSize: 10, fill: 'hsl(var(--accent))', position: 'insideTopLeft' }} />
                )}
                {crossing != null && crossing > 0 && crossing <= horizon && (
                  <ReferenceDot x={crossing} y={0} r={4} fill="hsl(var(--accent))" stroke="hsl(var(--card))" strokeWidth={2} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            <TrendingUp className="mr-1 inline h-3 w-3" aria-hidden />
            Savings grow {Math.round(fin.increase * 1000) / 10}% a year as water and lawn-care prices rise.
            {paysBack ? ` The project pays for itself ${paysBack}.` : ''}
          </p>
        </section>
      </div>

      <RebatesSection incentives={fin.incentives} />

      <section className="mt-5 surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-medium tracking-tight">Environmental impact</h2>
          <span className="text-[11px] text-muted-foreground">Over {horizon} years</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Water saved" value={`${num(series[horizon].water)} gal`} sub={`${num(fin.gallonsSaved)} gal a year · ${fin.reductionPct}% less irrigation`} />
          <StatTile label="CO₂ drawn down" value={`${num(series[horizon].co2)} lb`} sub={`${num(projection.co2PerYear)} lb a year at maturity`} />
          <StatTile label="Native species" value={`+${env.speciesAdded}`} sub={`${env.pollinators} support pollinators · ${env.birds} feed birds`} />
          <StatTile label="Biodiversity" value={`${env.before} → ${env.after}`} sub={`Out of 100, mature in ${sched.establishYears} year${sched.establishYears > 1 ? 's' : ''}`} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-[13px] font-medium"><Droplets className="h-3.5 w-3.5 text-chart-2" aria-hidden /> Water saved</h3>
            <div className="mt-3 h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis type="number" dataKey="year" domain={[0, horizon]} ticks={ticks} tickFormatter={yearTick} tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={gallonTick} tick={axisTick} axisLine={false} tickLine={false} width={40} />
                  <Tooltip formatter={(value) => [`${num(value)} gal`, 'Water saved']} labelFormatter={(label) => `Year ${label}`} contentStyle={tooltipStyle} />
                  <Area type="linear" dataKey="water" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#waterFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h3 className="flex items-center gap-1.5 text-[13px] font-medium"><Bird className="h-3.5 w-3.5 text-accent" aria-hidden /> Biodiversity score</h3>
            <div className="mt-3 h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis type="number" dataKey="year" domain={[0, horizon]} ticks={ticks} tickFormatter={yearTick} tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, GOOD_SCORE, 75, 100]} tick={axisTick} axisLine={false} tickLine={false} width={32} />
                  {/* Green: a good score for an average home garden. */}
                  <ReferenceArea y1={GOOD_SCORE} y2={100} fill="hsl(var(--chart-1))" fillOpacity={0.14} stroke="none" label={{ value: `Good for an average home: ${GOOD_SCORE}+`, fontSize: 10, fill: 'hsl(var(--chart-1))', position: 'insideTopLeft' }} />
                  <ReferenceLine y={GOOD_SCORE} stroke="hsl(var(--chart-1))" strokeOpacity={0.6} />
                  <Tooltip formatter={(value) => [`${value}/100`, 'Biodiversity']} labelFormatter={(label) => `Year ${label}`} contentStyle={tooltipStyle} />
                  <ReferenceLine y={env.before} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: 'Lawn today', fontSize: 10, fill: 'hsl(var(--muted-foreground))', position: 'insideBottomRight' }} />
                  <Line type="linear" dataKey="score" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <span><Droplets className="mr-1 inline h-3.5 w-3.5 text-accent" aria-hidden />{num(fin.gallonsBefore)} → {num(fin.gallonsAfter)} gallons of irrigation a year</span>
          <span><Sprout className="mr-1 inline h-3.5 w-3.5 text-accent" aria-hidden />{num(env.canopySqft)} sq ft of eventual canopy</span>
          <span><Leaf className="mr-1 inline h-3.5 w-3.5 text-accent" aria-hidden />CO₂ is an estimate for mature native planting</span>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          The biodiversity score (0–100) estimates how much habitat your yard supports for pollinators, birds and soil
          life, from the number and variety of native plants, the canopy and groundcover layers they form, and how much
          lawn they replace. The green band, {GOOD_SCORE} and up, is a good score for an average home garden: about
          five native species in a few layers, feeding bees, butterflies and birds.{' '}
          {env.after >= GOOD_SCORE ? 'This design gets there.' : `This design reaches ${env.after}; more native species, especially ones that feed birds and pollinators, would lift it.`}
        </p>
      </section>

      <section className="mt-5 rounded-2xl border border-accent/30 bg-accent/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label-xs">My projects</p>
            <h2 className="mt-1.5 font-display text-2xl tracking-tight">Track your conversion</h2>
            <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
              Log progress, photos and your real water and money savings as you convert this lawn. Part of Pro
              ($10/month), free for students with a school email.
            </p>
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link to={`/my-projects?project=${id}`}>Track this property</Link>
          </Button>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={shareProject} className="rounded-full" size="lg">
          <Share2 className="mr-2 h-4 w-4" />
          Share in the community
        </Button>
        <Button onClick={() => navigate(`/project/${id}/plan`, { state: { project } })} className="rounded-full" size="lg">
          Get the planting plan
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
    </div>
  );
}