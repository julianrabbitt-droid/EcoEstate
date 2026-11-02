import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { convertedSeries, fmtNum, fmtUsd, moneySeries, summarize } from '@/lib/trackingMath';

const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 12,
  fontSize: 12,
};
const axisTick = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };

function Stat({ label, value, unit, tag, note }) {
  return (
    <div className="surface p-4">
      <p className="label-xs">{label}</p>
      <p className="mt-1.5 font-display text-2xl tracking-tight">
        {value}
        {unit && value !== '—' && <span className="ml-1 text-[12px] font-sans text-muted-foreground">{unit}</span>}
      </p>
      {tag && value !== '—' && (
        <span className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[12px] text-muted-foreground">
          {tag}
        </span>
      )}
      {note && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{note}</p>}
    </div>
  );
}

// Environmental + economic impact computed from the tracked project and its
// progress entries (see lib/trackingMath.js). Estimates and measured values are
// labelled; missing data shows an em dash.
export default function ImpactDashboard({ project, entries }) {
  const s = summarize(project, entries);
  const sqftData = convertedSeries(entries);
  const moneyData = moneySeries(project, entries);
  const hasPrice = project?.waterPricePer1000Gal > 0;

  return (
    <section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Lawn converted"
          value={fmtNum(s.converted)}
          unit="sq ft"
          note={s.percent == null ? undefined : `${fmtNum(s.percent, 1)}% of ${fmtNum(project.lawnSqft)} sq ft lawn`}
        />
        <Stat label="Plants installed" value={s.plants > 0 ? fmtNum(s.plants) : '—'} />
        <Stat
          label="Water saved / yr"
          value={fmtNum(s.waterPerYear)}
          unit="gal"
          tag={s.waterSource === 'measured' ? 'Measured' : 'Estimate'}
          note={
            s.waterSource === 'measured'
              ? `Model estimate: ${fmtNum(s.estWaterPerYear)} gal`
              : 'Modelled from lawn converted. Log water bills and a baseline for a measured figure.'
          }
        />
        <Stat
          label="Water bill savings / yr"
          value={fmtUsd(s.yearlySavings)}
          tag={s.waterSource === 'measured' ? 'Measured' : 'Estimate'}
          note={hasPrice ? undefined : 'Set your water price in settings.'}
        />
        <Stat label="Spent" value={fmtUsd(s.spent)} />
        <Stat label="Rebates received" value={fmtUsd(s.rebates)} />
        <Stat label="Net cost" value={fmtUsd(s.netCost)} note="Spent minus rebates" />
        <Stat
          label="Simple payback"
          value={s.payback == null ? '—' : fmtNum(s.payback, 1)}
          unit="years"
          tag={s.waterSource === 'measured' ? 'Measured' : 'Estimate'}
          note="Net cost ÷ yearly water savings"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="surface p-5">
          <h3 className="text-[15px] font-medium tracking-tight">Lawn converted</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">Cumulative sq ft at each progress update.</p>
          {sqftData.length < 1 ? (
            <p className="mt-6 text-[12px] text-muted-foreground">Add a progress update to see the chart.</p>
          ) : (
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sqftData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trackSqft" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${fmtNum(v)} sq ft`, 'Converted']} />
                  <Area type="monotone" dataKey="sqft" stroke="hsl(var(--accent))" strokeWidth={2} fill="url(#trackSqft)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="surface p-5">
          <h3 className="text-[15px] font-medium tracking-tight">Spending vs. savings</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Net spend (after rebates) against estimated water-bill savings accrued from the lawn converted so far.
          </p>
          {moneyData.length < 1 || !hasPrice ? (
            <p className="mt-6 text-[12px] text-muted-foreground">
              {hasPrice ? 'Add a progress update to see the chart.' : 'Set your water price in settings to chart savings.'}
            </p>
          ) : (
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={moneyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={axisTick} axisLine={false} tickLine={false} width={48} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmtUsd(v), name]} />
                  <Line type="monotone" name="Net spend" dataKey="spend" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                  <Line type="monotone" name="Est. savings" dataKey="savings" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
