import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, HandHeart, Loader2, MapPin, Printer, Search, Sprout, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { hostedInstalls, installWhen, mySignups, spotsLeft, upcomingInstalls } from '@/lib/installs';

function DateBadge({ date }) {
  const d = new Date(`${date}T12:00:00`);
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
      <span className="text-[10.5px] font-medium uppercase tracking-wide">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
      <span className="font-display text-[22px] leading-none">{d.getDate()}</span>
    </div>
  );
}

export function InstallCard({ install }) {
  const left = spotsLeft(install);
  return (
    <Link to={`/installs/${install.id}`} className="surface flex gap-4 bg-card/80 p-4 backdrop-blur transition hover:border-primary/40">
      <DateBadge date={install.date} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium leading-tight">{install.title}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{install.city}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />{installWhen(install)} · {install.hours} h</span>
          <span>Hosted by {install.hostName}</span>
        </p>
        {install.tasks?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {install.tasks.slice(0, 4).map((t) => <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{t}</span>)}
          </div>
        )}
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <p className={`text-[13px] font-medium ${left ? 'text-primary' : 'text-muted-foreground'}`}>{left ? `${left} spot${left === 1 ? '' : 's'} left` : 'Full'}</p>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">{install.plantCount ? `${install.plantCount} plants` : ''}{install.lawnSqft ? ` · ${install.lawnSqft.toLocaleString()} sq ft` : ''}</p>
      </div>
    </Link>
  );
}

// Community installs: planting days hosts post for their lawn conversions,
// open to anyone who wants to help, and each helper's volunteer hours.
export default function Installs() {
  const { user, isAuthenticated, navigateToLogin } = useAuth();
  const [installs, setInstalls] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [signups, setSignups] = useState([]);
  const [hosting, setHosting] = useState([]);

  useEffect(() => {
    upcomingInstalls().then(setInstalls).catch((e) => { setError(e?.message || 'Could not load installs.'); setInstalls([]); });
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    mySignups(user.id).then(setSignups).catch(() => setSignups([]));
    hostedInstalls(user.id).then(setHosting).catch(() => setHosting([]));
  }, [user?.id]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (installs || []).filter((i) => !t || `${i.city} ${i.title} ${i.hostName}`.toLowerCase().includes(t));
  }, [installs, q]);
  const done = signups.filter((s) => s.status === 'attended' && s.hoursLogged > 0);
  const upcoming = signups.filter((s) => s.status === 'signed_up');
  const totalHours = done.reduce((a, s) => a + s.hoursLogged, 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12">
      <div className="print:hidden">
        <p className="label-xs flex items-center gap-1.5"><HandHeart className="h-3.5 w-3.5 text-primary" aria-hidden />Community installs</p>
        <h1 className="mt-2 max-w-2xl font-display text-[2.4rem] leading-[1.08] tracking-tight sm:text-[3rem]">
          Help a neighbour plant a <em className="italic text-primary">native garden</em>
        </h1>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
          Homeowners post planting days for their lawn conversions. Join one to learn hands-on, earn volunteer hours the host confirms, and leave a yard full of habitat behind.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by city" aria-label="Filter by city" className="field pl-9" />
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/projects"><Sprout className="mr-1.5 h-4 w-4" aria-hidden />Host one for your property</Link>
          </Button>
        </div>
      </div>

      <section className="mt-8 space-y-3 print:hidden" aria-label="Upcoming installs">
        {installs === null ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Finding planting days…</p>
        ) : error ? (
          <p role="alert" className="text-[13px] text-destructive">{error}</p>
        ) : shown.length ? (
          shown.map((i) => <InstallCard key={i.id} install={i} />)
        ) : (
          <div className="surface bg-card/80 p-6 text-center">
            <CalendarDays className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-[14px] font-medium">{q ? `No planting days in “${q}” yet` : 'No planting days posted yet'}</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Scan a lawn and host the first one: it’s the Build step of every project.</p>
            <Button asChild className="mt-4 rounded-full"><Link to="/">Scan a property</Link></Button>
          </div>
        )}
      </section>

      {hosting.length > 0 && (
        <section className="mt-10 print:hidden">
          <h2 className="font-display text-2xl tracking-tight">You’re hosting</h2>
          <div className="mt-3 space-y-3">{hosting.map((i) => <InstallCard key={i.id} install={i} />)}</div>
        </section>
      )}

      <section className="mt-10" aria-labelledby="hours-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="hours-heading" className="font-display text-2xl tracking-tight">Your volunteer hours</h2>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Hours count once the host confirms them after the day.</p>
          </div>
          {done.length > 0 && (
            <Button variant="outline" onClick={() => window.print()} className="rounded-full print:hidden"><Printer className="mr-1.5 h-4 w-4" aria-hidden />Print record</Button>
          )}
        </div>
        {!isAuthenticated ? (
          <div className="surface mt-3 flex flex-wrap items-center justify-between gap-3 bg-card/80 p-4">
            <p className="text-[13px] text-muted-foreground">Sign in to sign up for installs and keep a record of your hours.</p>
            <Button onClick={navigateToLogin} className="rounded-full">Sign in</Button>
          </div>
        ) : (
          <div className="surface mt-3 overflow-hidden bg-card/80">
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <p className="text-[13px] text-muted-foreground">{user?.full_name || user?.email} · EcoEstate community installs</p>
              <p className="font-display text-[1.6rem] leading-none">{totalHours} <span className="text-[13px] text-muted-foreground">hours</span></p>
            </div>
            {done.length ? (
              <table className="w-full text-[12.5px]">
                <thead className="text-left text-[11.5px] text-muted-foreground">
                  <tr><th className="px-5 py-2 font-normal">Date</th><th className="px-2 py-2 font-normal">Install</th><th className="hidden px-2 py-2 font-normal sm:table-cell">Host</th><th className="px-5 py-2 text-right font-normal">Hours</th></tr>
                </thead>
                <tbody>
                  {done.map((s) => (
                    <tr key={s.id} className="border-t border-border/60">
                      <td className="whitespace-nowrap px-5 py-2.5">{s.installDate}</td>
                      <td className="px-2 py-2.5">{s.installTitle}<span className="block text-[11px] text-muted-foreground">{s.city} · confirmed {String(s.hoursConfirmedAt || '').slice(0, 10)} · ref {s.id.slice(-8)}</span></td>
                      <td className="hidden px-2 py-2.5 sm:table-cell">{s.hostName}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{s.hoursLogged}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-4 text-[12.5px] text-muted-foreground">No confirmed hours yet.</p>
            )}
            {upcoming.length > 0 && (
              <div className="border-t border-border/70 px-5 py-4 print:hidden">
                <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Users className="h-3.5 w-3.5" aria-hidden />Coming up</p>
                <ul className="mt-2 space-y-1.5 text-[13px]">
                  {upcoming.map((s) => (
                    <li key={s.id}><Link to={`/installs/${s.installId}`} className="underline-offset-2 hover:underline">{s.installDate} · {s.installTitle}</Link> <span className="text-muted-foreground">in {s.city}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-10 grid gap-3 sm:grid-cols-3 print:hidden">
        {[
          ['Learn by doing', 'Sheet mulching, planting at the right depth, drip irrigation: the skills to convert your own yard.'],
          ['Hours that count', 'Every host confirms who came and for how long. Print your record for school, a club or a job application.'],
          ['Safe and simple', 'Hosts share their address only with helpers. Under 18? Come with, or with the permission of, a parent or guardian.'],
        ].map(([t, b]) => (
          <div key={t} className="surface bg-card/80 p-4">
            <p className="text-[13.5px] font-medium">{t}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{b}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
