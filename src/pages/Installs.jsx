import { useEffect, useMemo, useState } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { Link, useNavigate } from 'react-router-dom';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Award, CalendarDays, Clock, Droplets, FileCheck2, GraduationCap, Hammer, HandHeart, Loader2, LocateFixed, MapPin, Printer, Search, Sprout, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CityStamp from '@/components/CityStamp';
import { useAuth } from '@/lib/AuthContext';
import { useProjects } from '@/hooks/useProjects';
import { byDistance, gallonsSavedPerYear, hostedInstalls, installWhen, mySignups, spotsLeft, upcomingInstalls, VOLUNTEER_MILESTONES } from '@/lib/installs';

const BASEMAP = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';

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
  const saves = gallonsSavedPerYear(install.lawnSqft);
  return (
    <Link to={`/installs/${install.id}`} className="surface flex gap-4 bg-card/80 p-4 backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/40">
      <DateBadge date={install.date} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium leading-tight">{install.title}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{install.city}{install.miles != null ? ` · ${install.miles < 1 ? 'under a mile' : `${Math.round(install.miles)} mi away`}` : ''}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />{installWhen(install)} · {install.hours} h</span>
          <span>Hosted by {install.hostName}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {saves > 0 && <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"><Droplets className="h-3 w-3" aria-hidden />Saves ~{saves.toLocaleString()} gal a year</span>}
          {(install.tasks || []).slice(0, 3).map((t) => <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{t}</span>)}
        </div>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <p className={`text-[13px] font-medium ${left ? 'text-primary' : 'text-muted-foreground'}`}>{left ? `${left} spot${left === 1 ? '' : 's'} left` : 'Full'}</p>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">{install.plantCount ? `${install.plantCount} plants` : ''}{install.lawnSqft ? ` · ${install.lawnSqft.toLocaleString()} sq ft` : ''}</p>
      </div>
      <CityStamp city={install.city} size={52} className="hidden sm:block" />
    </Link>
  );
}

// Frames every planting day on the map (or the nearest few around you).
function FitInstalls({ points, near }) {
  const map = useMap();
  useEffect(() => {
    const pts = near ? [near, ...points.slice(0, 5)] : points;
    if (pts.length === 1) map.setView(pts[0], 10);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
  }, [map, points, near]);
  return null;
}

function InstallsMap({ installs, near }) {
  const navigate = useNavigate();
  const placed = useMemo(() => installs.filter((i) => Array.isArray(i.mapPoint)), [installs]);
  const points = useMemo(() => placed.map((i) => i.mapPoint), [placed]);
  if (!placed.length) return null;
  return (
    <div className="surface relative h-[260px] overflow-hidden sm:h-[320px]">
      <MapContainer center={points[0]} zoom={9} scrollWheelZoom={false} className="h-full w-full" attributionControl={false}>
        <TileLayer url={BASEMAP} maxNativeZoom={16} maxZoom={18} />
        <FitInstalls points={points} near={near} />
        {near && <CircleMarker center={near} radius={7} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2f78b7', fillOpacity: 1 }}><Tooltip>You</Tooltip></CircleMarker>}
        {placed.map((i) => (
          <CircleMarker
            key={i.id}
            center={i.mapPoint}
            radius={9}
            pathOptions={{ color: '#ffffff', weight: 2.5, fillColor: spotsLeft(i) ? '#4c8a2b' : '#8a8f86', fillOpacity: 0.95 }}
            eventHandlers={{ click: () => navigate(`/installs/${i.id}`) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>{installWhen(i)} · {i.city} · {spotsLeft(i) ? `${spotsLeft(i)} spots left` : 'full'}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <p className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-full bg-card/90 px-2.5 py-1 text-[10.5px] text-muted-foreground shadow">Approximate areas · the host shares the address with helpers</p>
    </div>
  );
}

// Why help: what a planting day gives the people who come, students most of all.
const GAINS = [
  { Icon: GraduationCap, title: 'Service hours for school', body: 'Many high schools, honor societies and scholarships ask for community service. Every hour here is confirmed by the host.' },
  { Icon: FileCheck2, title: 'A record for applications', body: 'Print a dated record with reference numbers for college, internship and job applications.' },
  { Icon: Hammer, title: 'Skills you can use', body: 'Sheet mulching, planting, drip irrigation and plant ID: the start of landscaping, horticulture and restoration work.' },
  { Icon: Users, title: 'A reference and a network', body: 'Work alongside homeowners, native plant people and other volunteers who can vouch for you.' },
  { Icon: Droplets, title: 'Impact you can measure', body: 'Each day turns thirsty lawn into habitat; every card shows the water the garden will save each year.' },
  { Icon: Award, title: 'Milestones', body: 'From First planting to Coast redwood at 100 hours, your record shows how far you’ve come.' },
];

// Community installs: planting days hosts post for their lawn conversions,
// open to anyone who wants to help, and each helper's volunteer hours.
export default function Installs() {
  usePageMeta({ title: 'Community installs', description: 'Help a neighbor turn a lawn into a native garden: join a planting day near you, earn confirmed volunteer hours and learn real skills. Free to join.' });
  const { user, isAuthenticated, navigateToLogin } = useAuth();
  const { projects } = useProjects();
  const [installs, setInstalls] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [signups, setSignups] = useState([]);
  const [hosting, setHosting] = useState([]);
  const [here, setHere] = useState(null); // [lat, lon] from the browser, when asked
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    upcomingInstalls().then(setInstalls).catch((e) => { setError(e?.message || 'Could not load installs.'); setInstalls([]); });
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    mySignups(user.id).then(setSignups).catch(() => setSignups([]));
    hostedInstalls(user.id).then(setHosting).catch(() => setHosting([]));
  }, [user?.id]);

  // Nearest first: from where you are (if you asked), else your latest property.
  const property = (projects || []).find((p) => Array.isArray(p.center))?.center || null;
  const near = here || property;
  const findNearMe = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setHere([pos.coords.latitude, pos.coords.longitude]); setLocating(false); },
      () => setLocating(false),
      { maximumAge: 600000, timeout: 10000 },
    );
  };

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return byDistance((installs || []).filter((i) => !t || `${i.city} ${i.title} ${i.hostName}`.toLowerCase().includes(t)), near);
  }, [installs, q, near]);
  const done = signups.filter((s) => s.status === 'attended' && s.hoursLogged > 0);
  const upcoming = signups.filter((s) => s.status === 'signed_up');
  const totalHours = done.reduce((a, s) => a + s.hoursLogged, 0);
  const reached = VOLUNTEER_MILESTONES.filter((m) => totalHours >= m.hours);
  const next = VOLUNTEER_MILESTONES.find((m) => totalHours < m.hours);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12">
      <div className="print:hidden">
        <p className="label-xs flex items-center gap-1.5"><HandHeart className="h-3.5 w-3.5 text-primary" aria-hidden />Community installs · free to join</p>
        <h1 className="mt-2 max-w-2xl font-display text-[2.4rem] leading-[1.08] tracking-tight sm:text-[3rem]">
          Help a neighbor plant a <em className="italic text-primary">native garden</em>
        </h1>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
          Homeowners post planting days for their lawn conversions. Join one to learn hands-on, earn volunteer hours the host confirms, and leave a yard full of habitat behind.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button onClick={findNearMe} disabled={locating} className="rounded-full">
            {locating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="mr-1.5 h-4 w-4" aria-hidden />}
            {here ? 'Nearest to you first' : 'Find ones near me'}
          </Button>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by city" aria-label="Filter by city" className="field pl-9" />
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/projects"><Sprout className="mr-1.5 h-4 w-4" aria-hidden />Host one (Pro)</Link>
          </Button>
        </div>
      </div>

      <section className="mt-8 space-y-3 print:hidden" aria-label="Upcoming installs">
        {installs === null ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Finding planting days…</p>
        ) : error ? (
          <p role="alert" className="text-[13px] text-destructive">{error}</p>
        ) : shown.length ? (
          <>
            <InstallsMap installs={shown} near={near} />
            <p className="pt-1 text-[12px] text-muted-foreground">
              {shown.length} planting day{shown.length === 1 ? '' : 's'} coming up{near ? `, nearest ${here ? 'to you' : 'to your property'} first` : ''}.
            </p>
            {shown.map((i) => <InstallCard key={i.id} install={i} />)}
          </>
        ) : (
          <div className="surface bg-card/80 p-6 text-center">
            <CalendarDays className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-[14px] font-medium">{q ? `No planting days in “${q}” yet` : 'No planting days posted yet'}</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">New ones appear here as hosts post them. Scan a lawn and host the first one: it’s the Build step of every project.</p>
            <Button asChild className="mt-4 rounded-full"><Link to="/">Scan a property</Link></Button>
          </div>
        )}
      </section>

      <section className="mt-12 print:hidden" aria-labelledby="gains-heading">
        <p className="label-xs">Why volunteer</p>
        <h2 id="gains-heading" className="mt-1.5 font-display text-2xl tracking-tight sm:text-3xl">Good for the garden, <em className="italic text-primary">good for you</em></h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GAINS.map(({ Icon, title, body }) => (
            <div key={title} className="surface bg-card/80 p-4">
              <Icon className="h-4 w-4 text-primary" aria-hidden />
              <p className="mt-2 text-[13.5px] font-medium">{title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          Check with your school or program which kinds of service they accept; the printed record shows each day, its host and the hours they confirmed. Under 18? Come with, or with the permission of, a parent or guardian.
        </p>
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
            <p className="text-[13px] text-muted-foreground">Sign in (free) to sign up for installs and keep a record of your hours.</p>
            <Button onClick={navigateToLogin} className="rounded-full">Sign in</Button>
          </div>
        ) : (
          <div className="surface mt-3 overflow-hidden bg-card/80">
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <p className="text-[13px] text-muted-foreground">{user?.full_name || user?.email} · EcoEstate community installs</p>
              <p className="font-display text-[1.6rem] leading-none">{totalHours} <span className="text-[13px] text-muted-foreground">hours</span></p>
            </div>
            {/* Milestones: the ones reached, and how far to the next. */}
            <div className="border-b border-border/70 px-5 py-4">
              <div className="flex flex-wrap gap-1.5">
                {VOLUNTEER_MILESTONES.map((m) => {
                  const got = totalHours >= m.hours;
                  return (
                    <span key={m.name} title={m.note} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] ${got ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                      <Award className="h-3 w-3" aria-hidden />{m.name}<span className="opacity-70">· {m.hours} h</span>
                    </span>
                  );
                })}
              </div>
              {next && (
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (totalHours / next.hours) * 100)}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                    {reached.length ? `${reached[reached.length - 1].name} reached. ` : ''}{next.hours - totalHours} hour{next.hours - totalHours === 1 ? '' : 's'} to {next.name}.
                  </p>
                </div>
              )}
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
              <p className="px-5 py-4 text-[12.5px] text-muted-foreground">No confirmed hours yet. Pick a planting day above to start.</p>
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
    </div>
  );
}
