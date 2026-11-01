import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useProject } from '@/hooks/useProjects';
import { ArrowRight, Droplets, Loader2, Sprout, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  Area,
  AreaChart,
  CartesianGrid,
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
export default function Impact() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { project, loading } = useProject(id, location.state);
  const [fin, setFin] = useState(null);
  const [env, setEnv] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

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
      .invoke('computeLandscape', { turfSqft: project.breakdown?.turf || 0, entries, catalog, defaultPalette: defaultMixForProject(project) })
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

  if (!fin || !env) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Crunching the numbers…</p>
      </div>
    );
  }

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
        <StatTile label="Rebates available" value={money(fin.rebate)} sub="Best-fit programs for this address" />
        <StatTile label="Annual savings" value={money(fin.annualSavings)} sub="Water, mowing and inputs" accent />
        <StatTile label="10-year net" value={money(fin.tenYearNet)} sub={`Payback in ${fin.payback.toFixed(1)} years`} />
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
            <span className="text-[11px] uppercase tracking-[0.14em] text-primary-foreground/70">Your cost</span>
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
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-medium tracking-tight">Cumulative cash position</h2>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <TrendingUp className="h-3 w-3" /> 10 years
            </span>
          </div>
          <div className="mt-4 h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fin.series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="year"
                  tickFormatter={(v) => (v === 0 ? 'Now' : `Yr ${v}`)}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v / 1000))}k`}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={46}
                />
                <Tooltip
                  formatter={(value) => [money(value), 'Net position']}
                  labelFormatter={(label) => `Year ${label}`}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid hsl(var(--border))',
                    fontSize: 12,
                    background: 'hsl(var(--card))',
                  }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--accent))" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#netFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            Break-even lands in year {Math.ceil(fin.payback)}. Water rates and maintenance costs only move in this
            direction from here.
          </p>
        </section>
      </div>

      <section className="mt-5 surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-medium tracking-tight">Incentives you may qualify for</h2>
          <span className="text-[12px] text-muted-foreground">
            Estimated total <span className="font-medium text-foreground">{money(fin.rebate)}</span>
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fin.incentives.rows.map((program) => (
            <div key={program.id} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium leading-tight">{program.name}</p>
                <span className="whitespace-nowrap font-display text-[15px] text-accent">{money(program.amount)}</span>
              </div>
              <p className="mt-1 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">{program.provider}</p>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{program.desc}</p>
              <a
                href={program.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[11px] font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                Program details
              </a>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Programs cannot always be combined with each other, and eligibility is confirmed by your water district.
          The total here pairs the best turf rebate with the smaller add-on programs.
        </p>
      </section>

      <section className="mt-5 surface p-5">
        <h2 className="text-[15px] font-medium tracking-tight">Environmental impact</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Water saved" value={`${num(fin.gallonsSaved)} gal`} sub={`${fin.reductionPct}% less irrigation per year`} />
          <StatTile label="Turf converted" value={`${num(fin.turfSqft)} sq ft`} sub="Non-native lawn taken out" />
          <StatTile label="Native species" value={`+${env.speciesAdded}`} sub={`${env.pollinators} support pollinators`} />
          <StatTile label="Bird plants" value={`${env.birds}`} sub="Species with a berry or seed crop" />
        </div>

        <div className="mt-5 rounded-xl bg-secondary/50 p-5">
          <div className="flex items-baseline justify-between text-[12px] text-muted-foreground">
            <span>Property biodiversity score</span>
            <span>
              <span className="text-foreground">{env.before}</span> → <span className="font-medium text-foreground">{env.after}</span> / 100
            </span>
          </div>
          <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-accent/40" style={{ width: `${env.before}%` }} />
            <div className="absolute inset-y-0 left-0 h-full rounded-full bg-primary" style={{ width: `${env.after}%`, opacity: 0.35 }} />
          </div>
          <div className="mt-4 flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Droplets className="h-4 w-4 text-accent" />
            {num(fin.gallonsBefore)} → {num(fin.gallonsAfter)} gallons of irrigation a year
            <Sprout className="ml-2 h-4 w-4 text-accent" />
            {num(env.canopySqft)} sq ft of eventual canopy
          </div>
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