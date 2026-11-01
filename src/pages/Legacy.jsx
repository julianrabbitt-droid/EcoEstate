import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProject } from '@/hooks/useProjects';
import { ArrowRight, Bird, Droplets, Leaf, Loader2, TrendingUp } from 'lucide-react';
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
import { environmental, financials, money, num } from '@/lib/landscapeMath';
import { buildSchedule } from '@/lib/buildSchedule';
const HORIZON = 30;
const INFLATION = 0.03;

export default function Legacy() {
  const { id } = useParams();
  const { project, loading } = useProject(id);

  const design = project?.design || [];
  const fin = useMemo(() => (project ? financials(project, design) : null), [project, design]);
  const env = useMemo(() => (project ? environmental(project, design) : null), [project, design]);
  const sched = useMemo(() => buildSchedule(fin?.turfSqft || 0), [fin?.turfSqft]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Opening your scan…</p>
      </div>
    );
  }

  const missing = !project;
  if (missing || !fin || !env) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl">This property scan is gone</h1>
        <Button asChild className="mt-6 rounded-full">
          <Link to="/">Scan a property</Link>
        </Button>
      </div>
    );
  }

  // Economic projection: annual savings compound with water-rate inflation.
  const econSeries = Array.from({ length: HORIZON + 1 }, (_, y) => {
    const cumulative = fin.annualSavings > 0 ? (fin.annualSavings * (Math.pow(1 + INFLATION, y) - 1)) / INFLATION : 0;
    return {
      year: y,
      net: Math.round(cumulative - fin.outOfPocket),
      saved: Math.round(cumulative),
    };
  });
  const net30 = econSeries[HORIZON].net;
  const breakEvenYear = fin.annualSavings > 0 ? Math.ceil(fin.payback) : null;

  // Environmental projection: water and CO2 accumulate linearly; biodiversity
  // climbs through the establishment window then plateaus at maturity.
  const co2PerYear = Math.round(fin.turfSqft * 0.8 + env.canopySqft * 1.2); // lbs CO2 / yr
  const envSeries = Array.from({ length: HORIZON + 1 }, (_, y) => {
    const grown = Math.min(1, y / Math.max(1, sched.establishYears));
    const score = Math.round(env.before + (env.after - env.before) * grown);
    return {
      year: y,
      water: fin.gallonsSaved * y,
      co2: co2PerYear * y,
      score,
    };
  });
  const water30 = envSeries[HORIZON].water;
  const co230 = envSeries[HORIZON].co2;

  const tooltipStyle = {
    borderRadius: 12,
    border: '1px solid hsl(var(--border))',
    fontSize: 12,
    background: 'hsl(var(--card))',
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <StepNav projectId={id} current="legacy" />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs">Long-term economic & environmental effect</p>
          <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-[2.4rem]">
            {money(fin.annualSavings)} a year, compounding for {HORIZON} years
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Projections scale with {num(fin.turfSqft)} sq ft of converted turf · {num(fin.plantCount)} native plants · {sched.establishYears} year{sched.establishYears > 1 ? 's' : ''} to establish
          </p>
        </div>
        <Button asChild className="rounded-full" size="lg">
          <Link to={`/project/${id}/plan`}>
            Back to the build plan
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="30-year net" value={money(net30)} sub={`After ${money(fin.outOfPocket)} upfront`} accent />
        <StatTile label="30-year water saved" value={`${num(water30)} gal`} sub={`${num(fin.gallonsSaved)} gal / yr`} />
        <StatTile label="30-year CO₂ sequestered" value={`${num(co230)} lb`} sub={`${num(co2PerYear)} lb / yr at maturity`} />
        <StatTile label="Break-even" value={breakEvenYear ? `Year ${breakEvenYear}` : '—'} sub={`Biodiversity ${env.before} → ${env.after}`} />
      </div>

      <section className="mt-5 surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-medium tracking-tight">Cumulative economic position</h2>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <TrendingUp className="h-3 w-3" /> {HORIZON} years · 3% annual escalation
          </span>
        </div>
        <div className="mt-4 h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={econSeries} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="netFill2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="year" tickFormatter={(v) => (v === 0 ? 'Now' : `Yr ${v}`)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v / 1000))}k`} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(value) => [money(value), 'Net position']} labelFormatter={(label) => `Year ${label}`} contentStyle={tooltipStyle} />
              <ReferenceLine y={0} stroke="hsl(var(--accent))" strokeDasharray="4 4" />
              {breakEvenYear && <ReferenceLine x={breakEvenYear} stroke="hsl(var(--accent))" strokeDasharray="4 4" label={{ value: 'Break-even', fontSize: 10, fill: 'hsl(var(--accent))', position: 'top' }} />}
              <Area type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#netFill2)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          Water, mowing and input savings compound as water rates rise. The curve crosses zero in year {breakEvenYear ?? '—'} and keeps climbing.
        </p>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="surface p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-medium tracking-tight">Cumulative water saved</h2>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Droplets className="h-3 w-3" /> gallons
            </span>
          </div>
          <div className="mt-4 h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={envSeries} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--chart-5))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(v) => (v === 0 ? 'Now' : `Yr ${v}`)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(value) => [`${num(value)} gal`, 'Water saved']} labelFormatter={(label) => `Year ${label}`} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="water" stroke="hsl(var(--chart-5))" strokeWidth={2} fill="url(#waterFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            {num(fin.gallonsSaved)} gal every year vs. the old turf, stacking to {num(water30)} gal over {HORIZON} years.
          </p>
        </section>

        <section className="surface p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-medium tracking-tight">Cumulative CO₂ sequestered</h2>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Leaf className="h-3 w-3" /> pounds
            </span>
          </div>
          <div className="mt-4 h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={envSeries} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="co2Fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(v) => (v === 0 ? 'Now' : `Yr ${v}`)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(value) => [`${num(value)} lb`, 'CO₂']} labelFormatter={(label) => `Year ${label}`} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="co2" stroke="hsl(var(--chart-3))" strokeWidth={2} fill="url(#co2Fill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            Native canopy and soils draw down carbon as it matures — {num(co2PerYear)} lb/yr rising to {num(co230)} lb over {HORIZON} years.
          </p>
        </section>
      </div>

      <section className="mt-5 surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-medium tracking-tight">Biodiversity score trajectory</h2>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Bird className="h-3 w-3" /> {env.before} → {env.after} / 100
          </span>
        </div>
        <div className="mt-4 h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={envSeries} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="year" tickFormatter={(v) => (v === 0 ? 'Now' : `Yr ${v}`)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip formatter={(value) => [`${value}/100`, 'Biodiversity']} labelFormatter={(label) => `Year ${label}`} contentStyle={tooltipStyle} />
              <ReferenceLine y={env.before} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="score" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          Score climbs as the planting matures over {sched.establishYears} year{sched.establishYears > 1 ? 's' : ''}, then holds at {env.after}/100 — a {Math.round(((env.after - env.before) / Math.max(1, env.before)) * 100)}% lift over the lawn.
        </p>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          The biodiversity score (0–100) estimates how much habitat your yard supports for pollinators, birds and soil life, based on the number and variety of native plants, the canopy and groundcover layers they form, and how much monoculture turf they replace. A standard lawn sits low; a mature native planting can reach the high 90s.
        </p>
      </section>
      <section className="mt-8 rounded-2xl border border-accent/30 bg-accent/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label-xs">My projects</p>
            <h2 className="mt-1.5 font-display text-2xl tracking-tight">Track your conversion</h2>
            <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
              Log progress, photos and your real water and money savings as you convert this lawn. Part of Premium, free for students.
            </p>
          </div>
          <Button asChild className="rounded-full">
            <Link to={`/my-projects?project=${id}`}>Track this property</Link>
          </Button>
        </div>
      </section>

    </div>
  );
}