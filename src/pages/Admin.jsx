import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { usePageMeta } from '@/hooks/usePageMeta';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Chart colours: categorical slots 1 and 2 of the validated default palette.
const REVENUE = '#2a78d6';
const COSTS = '#eb6834';
const AXIS = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
const GRID = 'hsl(var(--border))';
const monthLabel = (m) => new Date(`${m}-15`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
const shortUsd = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n) >= 1000 ? `${(Math.abs(n) / 1000).toFixed(1)}k` : Math.round(Math.abs(n))}`;

function ChartCard({ title, note, children }) {
  return (
    <figure className="rounded-xl border border-border p-4">
      <figcaption className="text-[13px] font-medium">{title}</figcaption>
      {note && <p className="mt-0.5 text-[12px] text-muted-foreground">{note}</p>}
      <div className="mt-3 h-56">{children}</div>
    </figure>
  );
}

function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-[12px] shadow">
      <p className="font-medium">{monthLabel(label)}</p>
      <p>Revenue after fees: {usd(d.revenue)}</p>
      <p>Costs: {usd(d.costs)}</p>
      <p className="font-medium">Net: {usd(d.net)}</p>
      {d.cumulative !== undefined && <p className="text-muted-foreground">Running total: {usd(d.cumulative)}</p>}
    </div>
  );
}

const usd = (n) =>
  n == null ? '—' : `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function fetchOverview() {
  const token = await window.Clerk?.session?.getToken();
  const res = await fetch('/api/admin/overview', { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Opens a service's own dashboard in a new tab; plain content when there's no link.
function Out({ href, className = '', children }) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`group block rounded-sm transition-colors hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${className}`}>
      {children}
    </a>
  );
}

function Figure({ label, value, note, href }) {
  return (
    <Out href={href} className="border-t border-border pt-3 pb-2">
      <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
        {label}
        {href && <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </p>
      <p className="mt-1 font-display text-[1.9rem] leading-none tracking-tight">{value}</p>
      {note && <p className="mt-1.5 text-[12.5px] text-muted-foreground">{note}</p>}
    </Out>
  );
}

function Cell({ href, children }) {
  if (!href) return children;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
      {children}
      <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />
    </a>
  );
}

// Feedback and scan reports from the site (the Feedback button and "Report
// this scan"), newest first. A scan report carries what was on screen; Copy
// gives its full details to paste into a scanner fix.
function FeedbackInbox() {
  const [items, setItems] = useState(null);
  const [kind, setKind] = useState('all');
  const [copied, setCopied] = useState('');
  useEffect(() => {
    base44.entities.Feedback.filter({}, { sort: '-created_date', limit: 100 }).then(setItems).catch(() => setItems([]));
  }, []);
  const shown = (items || []).filter((f) => kind === 'all' || (f.kind || 'general') === kind);
  const copy = async (f) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ message: f.message, page: f.page, kind: f.kind, context: f.context, at: f.created_date }, null, 2));
      setCopied(f.id);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('');
    }
  };
  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-xs">Inbox</p>
          <h2 className="mt-1 font-display text-2xl tracking-tight">Feedback and scan reports</h2>
        </div>
        <div role="group" aria-label="Show" className="flex rounded-full border border-border p-0.5 text-[12px]">
          {[['all', 'All'], ['scan', 'Scan reports'], ['general', 'Feedback']].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1 ${kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
          ))}
        </div>
      </div>
      {items === null ? (
        <Loader2 className="mt-6 h-5 w-5 animate-spin text-muted-foreground" />
      ) : shown.length ? (
        <ul className="mt-4 space-y-3">
          {shown.map((f) => {
            const c = f.context || {};
            return (
              <li key={f.id} className="surface p-4 text-[13px]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${f.kind === 'scan' ? 'bg-accent/15 text-accent' : 'bg-secondary text-muted-foreground'}`}>{f.kind === 'scan' ? 'Scan report' : 'Feedback'}{f.beta ? ' · tester' : ''}</span>
                  <span className="text-[11.5px] text-muted-foreground">{new Date(f.created_date).toLocaleString()}</span>
                </div>
                <p className="mt-2 whitespace-pre-line">{f.message}</p>
                <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                  {[c.address, c.view && `view: ${c.view}`, c.screen && `on: ${c.screen}`, f.page, f.email].filter(Boolean).join(' · ')}
                </p>
                <button type="button" onClick={() => copy(f)} className="mt-2 text-[12px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  {copied === f.id ? 'Copied' : 'Copy the details'}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-[13px] text-muted-foreground">Nothing here yet.</p>
      )}
    </section>
  );
}

// Owner dashboard: money in and out, users, service health and alerts, for
// every project listed in server/ops.js. Admins only.
export default function Admin() {
  usePageMeta({ title: 'Owner dashboard' });
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchOverview());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (user && user.role !== 'admin') {
    return <p className="mx-auto max-w-xl px-5 py-24 text-center text-[15px] text-muted-foreground">This page is for the site owner.</p>;
  }

  const m = data?.money;
  const down = data?.health?.filter((h) => !h.ok && !h.quiet) || [];
  const degraded = data?.health?.filter((h) => !h.ok && h.quiet) || [];

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2.6rem] leading-tight tracking-tight">Owner dashboard</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {data ? `Updated ${new Date(data.generatedAt).toLocaleString()}` : 'Money, users and service health across your projects.'}
          </p>
        </div>
        <Button variant="outline" className="rounded-full" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {error && <p role="alert" className="mt-6 text-[14px] text-destructive">{error}</p>}
      {!data && loading && <Loader2 className="mt-10 h-6 w-6 animate-spin text-muted-foreground" />}

      {data && (
        <>
          <section className="mt-10">
            <h2 className="text-[17px] font-medium">Status</h2>
            <p className={`mt-2 text-[15px] ${down.length ? 'text-destructive' : 'text-foreground'}`}>
              {down.length ? `${down.length} service${down.length > 1 ? 's' : ''} need attention: ${down.map((d) => d.name).join(', ')}.` : 'Everything is running.'}
            </p>
            {degraded.length > 0 && (
              <p className="mt-1 text-[13.5px] text-accent">
                Using a fallback (nothing to do; they usually recover on their own): {degraded.map((d) => d.name).join(', ')}.
              </p>
            )}
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {data.health.map((h) => (
                <li key={h.id}>
                  <Out href={h.url} className="flex flex-wrap items-center justify-between gap-2 px-1 py-2.5 text-[14px]">
                    <span className="flex items-center gap-2.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${h.ok ? 'bg-primary' : h.quiet ? 'bg-amber-500' : 'bg-destructive'}`} aria-hidden />
                      {h.name}
                      <span className="sr-only">{h.ok ? 'working' : 'not working'}</span>
                      {h.url && <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {h.detail} · {h.ms} ms
                    </span>
                  </Out>
                </li>
              ))}
            </ul>
          </section>

          {data.metrics && (
            <section className="mt-12">
              <h2 className="text-[17px] font-medium">Server</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {data.metrics.render && !data.metrics.render.error
                  ? 'From Render, last 24 hours.'
                  : `Sampled by the server every 5 minutes since it last restarted.${data.metrics.render?.error ? ` Render metrics: ${data.metrics.render.error}.` : ' Add RENDER_API_KEY and RENDER_SERVICE_ID in Render for its own graphs.'}`}
              </p>
              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                {[
                  { key: 'cpu', title: 'CPU', unit: '%', data: data.metrics.render?.cpu?.length ? data.metrics.render.cpu.map((p) => ({ t: p.t, v: Math.round(p.value * 1000) / 10 })) : data.metrics.process.map((p) => ({ t: p.t, v: p.cpuPct })) },
                  { key: 'mem', title: 'Memory', unit: ' MB', data: data.metrics.render?.memory?.length ? data.metrics.render.memory.map((p) => ({ t: p.t, v: Math.round(p.value / 1e6) })) : data.metrics.process.map((p) => ({ t: p.t, v: p.memoryMb })) },
                ].map((c) => (
                  <ChartCard key={c.key} title={c.title} note={c.data.length ? `Latest ${c.data.at(-1).v}${c.unit}` : 'Collecting the first samples…'}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={c.data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={GRID} />
                        <XAxis dataKey="t" tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: 'numeric' })} tick={AXIS} axisLine={false} tickLine={false} minTickGap={40} />
                        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} />
                        <Tooltip formatter={(v) => [`${v}${c.unit}`, c.title]} labelFormatter={(t) => new Date(t).toLocaleString()} />
                        <Line type="monotone" dataKey="v" stroke={REVENUE} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                ))}
              </div>
            </section>
          )}

          <section className="mt-12">
            <h2 className="text-[17px] font-medium">Money</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Stripe {m.mode} mode. Recurring revenue counts active subscriptions; costs are your plans plus metered API use in the last 30 days.
            </p>
            {(m.error || m.subscriptionsError || m.chargesError) && (
              <p className="mt-2 text-[13px] text-destructive">{m.error || m.subscriptionsError || m.chargesError}</p>
            )}
            <div className="mt-5 grid gap-6 sm:grid-cols-4">
              <Figure label="Monthly recurring revenue" value={usd(m.mrrUsd)} note={`${m.activeSubscriptions ?? 0} active subscriptions`} href={m.links?.subscriptions} />
              <Figure label="Payments, last 30 days" value={usd(m.gross30dUsd)} note={`${m.charges30d ?? 0} charges · ${usd(m.refunded30dUsd)} refunded`} href={m.links?.payments} />
              <Figure label="Costs per month" value={usd(m.costs.fixedMonthlyUsd + m.costs.metered30dUsd)} note={`${usd(m.costs.fixedMonthlyUsd)} plans + ${usd(m.costs.metered30dUsd)} usage`} />
              <Figure label="Net per month" value={usd(m.netMonthlyUsd)} note="Recurring revenue minus costs" />
            </div>
            {data.history?.months?.length > 0 && (
              <div className="mt-8 grid gap-5 lg:grid-cols-2">
                <ChartCard title="Money by month" note="Revenue after Stripe fees and refunds, and running costs. Hover for net.">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.history.months} barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={GRID} />
                      <XAxis dataKey="month" tickFormatter={monthLabel} tick={AXIS} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={shortUsd} tick={AXIS} axisLine={false} tickLine={false} width={48} />
                      <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="revenue" name="Revenue" fill={REVENUE} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="costs" name="Costs" fill={COSTS} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Net money over time" note="Running total of revenue minus costs since the first month.">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.history.months} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={GRID} />
                      <XAxis dataKey="month" tickFormatter={monthLabel} tick={AXIS} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={shortUsd} tick={AXIS} axisLine={false} tickLine={false} width={48} />
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                      <Tooltip content={<MoneyTooltip />} />
                      <Line type="monotone" dataKey="cumulative" name="Running net" stroke={REVENUE} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            )}
            {data.history?.sources && (
              <ul className="mt-4 space-y-1 text-[12.5px]">
                {Object.entries(data.history.sources).map(([k, v]) => (
                  <li key={k} className="flex gap-2">
                    <span className={v.ok ? 'text-primary' : 'text-destructive'} aria-hidden>{v.ok ? '●' : '○'}</span>
                    <span className="text-muted-foreground"><span className="capitalize text-foreground">{k}</span>: {v.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-8 grid gap-8 sm:grid-cols-2">
              <table className="w-full text-[14px]">
                <caption className="pb-2 text-left text-[13px] font-medium">Plans</caption>
                <tbody>
                  {m.costs.fixed.map((c) => (
                    <tr key={c.name} className="border-t border-border/70">
                      <td className="py-2 pr-4"><Cell href={c.url}>{c.name}</Cell></td>
                      <td className="py-2 text-right tabular-nums">{usd(c.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="w-full text-[14px]">
                <caption className="pb-2 text-left text-[13px] font-medium">Metered API use, last 30 days</caption>
                <tbody>
                  {m.costs.metered30d.length === 0 && (
                    <tr className="border-t border-border/70"><td className="py-2 text-muted-foreground">None</td></tr>
                  )}
                  {m.costs.metered30d.map((r) => (
                    <tr key={r.service} className="border-t border-border/70">
                      <td className="py-2 pr-4"><Cell href={r.url}>{r.service.replace(/_/g, ' ')}</Cell></td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{Math.round(r.units).toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">{usd(r.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-[17px] font-medium">Users</h2>
            <div className="mt-5 grid gap-6 sm:grid-cols-4">
              <Figure label="Accounts" value={data.users.total} href={data.users.url} />
              <Figure label="New this week" value={data.users.new7d} note={`${data.users.new30d} in 30 days`} href={data.users.url} />
              <Figure label="Pro members" value={data.users.pro} href={data.users.proUrl} />
              <Figure label="Student unlocks" value={data.users.studentUnlocks} />
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-[17px] font-medium">Recent alerts</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Checked every 15 minutes on the live site. A service that fails twice in a row emails support@ecoestate.org, then again when it recovers.
            </p>
            {data.alerts.length === 0 ? (
              <p className="mt-3 text-[14px] text-muted-foreground">No alerts since the server last restarted.</p>
            ) : (
              <ul className="mt-3 space-y-1.5 text-[14px]">
                {data.alerts.map((a) => (
                  <li key={a.at + a.subject}>
                    <span className="text-muted-foreground">{new Date(a.at).toLocaleString()}</span> · {a.subject}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-12">
            <h2 className="text-[17px] font-medium">Projects</h2>
            <ul className="mt-3 space-y-1.5 text-[14px]">
              {data.projects.map((p) => (
                <li key={p.id}>
                  {p.name} · <a href={p.url} className="underline underline-offset-4">{p.url.replace('https://', '')}</a>
                  {p.console && (
                    <>
                      {' · '}
                      <a href={p.console} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">hosting</a>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-muted-foreground">Click any service, figure or cost to open its own dashboard. To add a project, add it to PROJECTS in server/ops.js; its health then shows here and alerts like the rest.</p>
          </section>
        </>
      )}
      {user?.role === 'admin' && <FeedbackInbox />}
    </div>
  );
}
