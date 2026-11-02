import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useProject } from '@/hooks/useProjects';
import { ArrowRight, Bird, Droplets, Leaf, Loader2, Sprout, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
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

// Long-term view: savings compound as water rates rise.
const INFLATION = 0.03;
const HORIZONS = [10, 30];

const axisTick = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };
const yearTick = (v) => (v === 0 ? 'Now' : `Yr ${v}`);
const dollarTick = (v) => {
  const a = Math.abs(v);
  const body = a >= 1000 ? `$${Math.round(a / 100) / 10}k` : `$${Math.round(a)}`;
  return v < 0 ? `-${body}` : body;
};
const tooltipStyle = { borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12, background: 'hsl(var(--card))' };

// The payoff step: what the conversion costs, what comes back, and how money,
// water, carbon and habitat add up over 10 or 30 years.
export default function Impact() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { project, loading } = useProject(id, location.state);
  const [fin, setFin] = useState(null);
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
        setFin(data.financials);
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
      const saved = fin.annualSavings > 0 ? (fin.annualSavings * (Math.pow(1 + INFLATION, y) - 1)) / INFLATION : 0;
      const grown = Math.min(1, y / Math.max(1, sched.establishYears));
      return {
        year: y,
        net: Math.round(saved - fin.outOfPocket),
        water: fin.gallonsSaved * y,
        co2: co2PerYear * y,
        score: Math.round(env.before + (env.after - env.before) * grown),
      };
    });
    return { series, co2PerYear };
  }, [fin, env, sched.establishYears]);

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

  if (error && (!fin || !env)) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <p className="text-[14px] font-medium">We couldn’t crunch the numbers</p>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">{error}</p>
        <Button onClick={() => setAttempt((n) => n + 1)} variant="outline" className="mt-5 rounded-full">
          Retry
        </Button>
      </div>
    );
  }

  if (!fin || !env || !projection) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Crunching the numbers…</p>
      </div>
    );
  }

  const series = projection.series.slice(0, horizon + 1);
  const net = series[horizon].net;
  const breakEven = projection.series.find((p) => p.year > 0 && p.net >= 0)?.year ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <StepNav projectId={id} project={project} current="impact" />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs">Financial & environmental payoff</p>
          <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-[2.4rem]">
            {money(fin.outOfPocket)} out of pocket, {money(fin.annualSavings)} back each year
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {num(fin.turfSqft)} sq ft converted · {num(fin.plantCount)} native plants · payback in{' '}
            {fin.payback.toFixed(1)} years
          </p>
        </div>
        <Button onClick={() => navigate(`/project/${id}/plan`, { state: { project } })} className="rounded-full" size="lg">
          Build this garden
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Estimated cost" value={money(fin.totalCost)} sub="Plants, mulch, drip and installation" />
        <StatTile label="Rebates available" value={money(fin.rebate)} sub="Programs that serve this address" />
        <StatTile label="Annual savings" value={money(fin.annualSavings)} sub="Water, mowing and inputs" accent />
        <StatTile label={`${horizon}-year net`} value={money(net)} sub={breakEven ? `Break-even in year ${breakEven}` : 'No payback at current rates'} />
      </div>

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
            <span className="text-[11px] uppercase tracking-[0.14em] text-primary-foreground/80">Your cost</span>
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
            <div role="group" aria-label="Time horizon" className="flex rounded-full border border-border p-0.5 text-[11.5px]">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  aria-pressed={horizon === h}
                  className={`rounded-full px-3 py-1 transition ${horizon === h ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {h} years
                </button>
              ))}
            </div>
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
                <XAxis dataKey="year" tickFormatter={yearTick} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={dollarTick} tick={axisTick} axisLine={false} tickLine={false} width={52} />
                <Tooltip formatter={(value) => [money(value), 'Net position']} labelFormatter={(label) => `Year ${label}`} contentStyle={tooltipStyle} />
                <ReferenceLine y={0} stroke="hsl(var(--accent))" strokeDasharray="4 4" />
                {breakEven && breakEven <= horizon && (
                  <ReferenceLine x={breakEven} stroke="hsl(var(--accent))" strokeDasharray="4 4" label={{ value: 'Break-even', fontSize: 10, fill: 'hsl(var(--accent))', position: 'top' }} />
                )}
                <Area type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#netFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            <TrendingUp className="mr-1 inline h-3 w-3" aria-hidden />
            Savings grow about 3% a year as water rates rise.
            {breakEven ? ` The project pays for itself in year ${breakEven}.` : ''}
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
            <h3 className="flex items-center gap-1.5 text-[13px] font-medium"><Droplets className="h-3.5 w-3.5 text-accent" aria-hidden /> Water saved</h3>
            <div className="mt-3 h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--chart-5))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="year" tickFormatter={yearTick} tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={axisTick} axisLine={false} tickLine={false} width={40} />
                  <Tooltip formatter={(value) => [`${num(value)} gal`, 'Water saved']} labelFormatter={(label) => `Year ${label}`} contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="water" stroke="hsl(var(--chart-5))" strokeWidth={2} fill="url(#waterFill)" />
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
                  <XAxis dataKey="year" tickFormatter={yearTick} tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} width={32} />
                  <Tooltip formatter={(value) => [`${value}/100`, 'Biodiversity']} labelFormatter={(label) => `Year ${label}`} contentStyle={tooltipStyle} />
                  <ReferenceLine y={env.before} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="score" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
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
          lawn they replace.
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

      <div className="mt-6 flex justify-end">
        <Button onClick={() => navigate(`/project/${id}/plan`, { state: { project } })} className="rounded-full" size="lg">
          Get the planting plan
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}