import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { usePageMeta } from '@/hooks/usePageMeta';

const usd = (n) =>
  n == null ? '—' : `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function fetchOverview() {
  const token = await window.Clerk?.session?.getToken();
  const res = await fetch('/api/admin/overview', { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function Figure({ label, value, note }) {
  return (
    <div className="border-t border-border pt-3">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-[1.9rem] leading-none tracking-tight">{value}</p>
      {note && <p className="mt-1.5 text-[12.5px] text-muted-foreground">{note}</p>}
    </div>
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
  const down = data?.health?.filter((h) => !h.ok) || [];

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
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {data.health.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                  <span className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${h.ok ? 'bg-emerald-600' : 'bg-destructive'}`} aria-hidden />
                    {h.name}
                    <span className="sr-only">{h.ok ? 'working' : 'not working'}</span>
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {h.detail} · {h.ms} ms
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-12">
            <h2 className="text-[17px] font-medium">Money</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Stripe {m.mode} mode. Recurring revenue counts active subscriptions; costs are your plans plus metered API use in the last 30 days.
            </p>
            {(m.error || m.subscriptionsError || m.chargesError) && (
              <p className="mt-2 text-[13px] text-destructive">{m.error || m.subscriptionsError || m.chargesError}</p>
            )}
            <div className="mt-5 grid gap-6 sm:grid-cols-4">
              <Figure label="Monthly recurring revenue" value={usd(m.mrrUsd)} note={`${m.activeSubscriptions ?? 0} active subscriptions`} />
              <Figure label="Payments, last 30 days" value={usd(m.gross30dUsd)} note={`${m.charges30d ?? 0} charges · ${usd(m.refunded30dUsd)} refunded`} />
              <Figure label="Costs per month" value={usd(m.costs.fixedMonthlyUsd + m.costs.metered30dUsd)} note={`${usd(m.costs.fixedMonthlyUsd)} plans + ${usd(m.costs.metered30dUsd)} usage`} />
              <Figure label="Net per month" value={usd(m.netMonthlyUsd)} note="Recurring revenue minus costs" />
            </div>
            <div className="mt-8 grid gap-8 sm:grid-cols-2">
              <table className="w-full text-[14px]">
                <caption className="pb-2 text-left text-[13px] font-medium">Plans</caption>
                <tbody>
                  {m.costs.fixed.map((c) => (
                    <tr key={c.name} className="border-t border-border/70">
                      <td className="py-2 pr-4">{c.name}</td>
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
                      <td className="py-2 pr-4">{r.service.replace(/_/g, ' ')}</td>
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
              <Figure label="Accounts" value={data.users.total} />
              <Figure label="New this week" value={data.users.new7d} note={`${data.users.new30d} in 30 days`} />
              <Figure label="Pro members" value={data.users.pro} />
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
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-muted-foreground">To add a project, add it to PROJECTS in server/ops.js; its health then shows here and alerts like the rest.</p>
          </section>
        </>
      )}
    </div>
  );
}
