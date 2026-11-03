import { useCallback, useEffect, useState } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock, Loader2, Mail, MapPin, Pencil, Send, Sprout, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CityStamp from '@/components/CityStamp';
import { useAuth } from '@/lib/AuthContext';
import { getInstall, helpersOf, installAction, installWhen, mySignups, spotsLeft } from '@/lib/installs';

// What helping gives you, at a glance beside the sign-up.
function VolunteerGains() {
  return (
    <ul className="mt-2.5 flex flex-wrap gap-1.5 text-[11.5px]">
      {['Confirmed service hours', 'Printable record for school and applications', 'Hands-on planting skills', 'A host who can vouch for you'].map((t) => (
        <li key={t} className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{t}</li>
      ))}
    </ul>
  );
}

const STATUS = { open: 'Taking helpers', full: 'Full', done: 'Planted', cancelled: 'Called off' };
const todayLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 10);

function MessageBox({ placeholder, onSend, cta = 'Send' }) {
  const [text, setText] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const send = async (e) => {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      await onSend(text);
      setText('');
      setState('sent');
    } catch (err) {
      setError(err?.message || 'Could not send.');
      setState('idle');
    }
  };
  return (
    <form onSubmit={send} className="space-y-2">
      <textarea value={text} onChange={(e) => { setText(e.target.value); if (state === 'sent') setState('idle'); }} rows={3} maxLength={2000} placeholder={placeholder} className="field h-auto py-2 text-[13px]" />
      {error && <p role="alert" className="text-[12px] text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={state === 'sending' || text.trim().length < 3} className="rounded-full">
          {state === 'sending' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
          {cta}
        </Button>
        {state === 'sent' && <span className="flex items-center gap-1 text-[12px] text-primary"><Check className="h-3.5 w-3.5" />Sent by email</span>}
      </div>
    </form>
  );
}

// One community install: the day and what it involves, signing up to help,
// asking the host a question, and for the host, the helpers, messages to
// them, and confirming everyone's hours afterwards.
export default function Install() {
  const { id } = useParams();
  const { user, isAuthenticated, navigateToLogin } = useAuth();
  const [install, setInstall] = useState(null);
  const [missing, setMissing] = useState(false);
  const [mine, setMine] = useState(null); // my sign-up, if any
  const [helpers, setHelpers] = useState([]);
  const [form, setForm] = useState({ name: '', role: 'volunteer', groupSize: 1, message: '', consent: false });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [hours, setHours] = useState({}); // signupId -> { attended, hours }
  const [hoursSaved, setHoursSaved] = useState(false);

  const isHost = Boolean(user?.id && install?.created_by_id === user.id);
  usePageMeta({ title: install ? `${install.title} · ${install.city}` : 'Community install' });
  const load = useCallback(async () => {
    try {
      setInstall(await getInstall(id));
    } catch {
      setMissing(true);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!user?.id || !install) return;
    if (user.full_name) setForm((f) => (f.name ? f : { ...f, name: user.full_name }));
    if (install.created_by_id === user.id) {
      helpersOf(install.id).then((list) => {
        setHelpers(list);
        setHours(Object.fromEntries(list.map((h) => [h.id, { attended: h.status !== 'no_show', hours: h.hoursLogged || install.hours }])));
      }).catch(() => setHelpers([]));
    } else {
      mySignups(user.id).then((list) => setMine(list.find((s) => s.installId === install.id && s.status !== 'cancelled') || null)).catch(() => setMine(null));
    }
  }, [user?.id, user?.full_name, install]);

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy('');
    }
  };
  const join = (e) => {
    e.preventDefault();
    run('join', async () => {
      const res = await installAction('join', { installId: id, ...form, groupSize: form.role === 'group' ? Number(form.groupSize) : 1 });
      setMine(res.signup);
      if (res.install) setInstall(res.install);
    });
  };
  const leave = () => run('leave', async () => {
    const res = await installAction('leave', { installId: id });
    setMine(null);
    if (res.install) setInstall(res.install);
  });
  const saveHours = () => run('hours', async () => {
    const entries = helpers.filter((h) => h.status !== 'cancelled').map((h) => ({ signupId: h.id, ...hours[h.id] }));
    const res = await installAction('hours', { installId: id, entries, done: true });
    if (res.install) setInstall(res.install);
    setHelpers(await helpersOf(id));
    setHoursSaved(true);
  });
  const callOff = () => {
    if (!window.confirm('Call off this planting day? Everyone signed up gets an email.')) return;
    run('cancel', async () => setInstall(await installAction('cancel', { installId: id })));
  };

  if (missing) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl">This install isn’t here</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">It may have been called off.</p>
        <Button asChild className="mt-6 rounded-full"><Link to="/installs">See other installs</Link></Button>
      </div>
    );
  }
  if (!install) {
    return <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const left = spotsLeft(install);
  const past = install.date < todayLocal();
  const active = helpers.filter((h) => h.status !== 'cancelled');
  const label = 'mb-1 block text-[12px] text-muted-foreground';

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10">
      <Link to="/installs" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />All community installs</Link>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <section className="surface bg-card/85 p-6 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] ${install.status === 'open' ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}>{STATUS[install.status] || install.status}</span>
              <h1 className="mt-3 font-display text-[2rem] leading-tight tracking-tight">{install.title}</h1>
            </div>
            <CityStamp city={install.city} size={76} />
          </div>
          <div className="mt-3 space-y-1.5 text-[13px]">
            <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" aria-hidden />{installWhen(install, { long: true })} · about {install.hours} hours</p>
            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />{install.city} · the host sends the address to helpers</p>
            <p className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" aria-hidden />Hosted by {install.hostName} · {install.joined || 0} of {install.spots} helpers{install.kidsWelcome ? ' · families welcome' : ''}</p>
          </div>
          {install.description && <p className="mt-4 whitespace-pre-line text-[13.5px] leading-relaxed">{install.description}</p>}
          {install.tasks?.length > 0 && (
            <div className="mt-5">
              <p className="label-xs">Jobs on the day</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{install.tasks.map((t) => <span key={t} className="rounded-full bg-secondary px-2.5 py-1 text-[12px]">{t}</span>)}</div>
            </div>
          )}
          {install.whatToBring && (
            <div className="mt-5">
              <p className="label-xs">Bring</p>
              <p className="mt-1 text-[13px]">{install.whatToBring}</p>
            </div>
          )}
          {install.plants?.length > 0 && (
            <div className="mt-5">
              <p className="label-xs flex items-center gap-1.5"><Sprout className="h-3.5 w-3.5 text-primary" aria-hidden />Going in the ground{install.lawnSqft ? ` · ${install.lawnSqft.toLocaleString()} sq ft of lawn` : ''}</p>
              <ul className="mt-2 grid gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-2">
                {install.plants.map((p) => <li key={p.name} className="flex justify-between border-b border-border/50 py-1"><span>{p.name}</span><span className="tabular-nums text-muted-foreground">{p.count}</span></li>)}
              </ul>
            </div>
          )}
        </section>

        <div className="space-y-4">
          {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">{error}</p>}

          {!isHost && (
            <section className="surface bg-card/85 p-5 backdrop-blur">
              {mine ? (
                <>
                  <div className="flex items-center gap-3">
                    <CityStamp city={install.city} size={48} />
                    <p className="flex items-center gap-2 text-[15px] font-medium"><Check className="h-4 w-4 text-primary" />You’re helping in {install.city}</p>
                  </div>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">{install.hostName} will email you the address. After the day they confirm your hours, which go on <Link to="/installs" className="underline underline-offset-2">your volunteer record</Link>.</p>
                  {mine.status === 'signed_up' && !past && (
                    <Button variant="outline" size="sm" onClick={leave} disabled={busy === 'leave'} className="mt-3 rounded-full">
                      {busy === 'leave' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}I can’t make it
                    </Button>
                  )}
                  {mine.status === 'attended' && <p className="mt-2 text-[13px]">Confirmed: <span className="font-medium">{mine.hoursLogged} hours</span></p>}
                </>
              ) : install.status !== 'open' || past ? (
                <p className="text-[13px] text-muted-foreground">{install.status === 'full' ? 'Every spot is taken. ' : 'This install isn’t taking helpers. '}<Link to="/installs" className="underline underline-offset-2">Find another one</Link>.</p>
              ) : !isAuthenticated ? (
                <>
                  <p className="text-[15px] font-medium">Help on the day</p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">{left} spot{left === 1 ? '' : 's'} left. Free to join: sign in to sign up and get your hours confirmed.</p>
                  <VolunteerGains />
                  <Button onClick={navigateToLogin} className="mt-3 rounded-full">Sign in to sign up</Button>
                </>
              ) : (
                <form onSubmit={join} className="space-y-3">
                  <p className="text-[15px] font-medium">Help on the day <span className="text-[12.5px] font-normal text-muted-foreground">· {left} spot{left === 1 ? '' : 's'} left · free</span></p>
                  <VolunteerGains />
                  <div>
                    <label className={label} htmlFor="j-name">Your name</label>
                    <input id="j-name" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} required />
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div>
                      <label className={label} htmlFor="j-role">Coming as</label>
                      <select id="j-role" className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                        <option value="volunteer">A volunteer</option>
                        <option value="student">A student, for volunteer hours</option>
                        <option value="group">A group</option>
                      </select>
                    </div>
                    {form.role === 'group' && (
                      <div className="w-24">
                        <label className={label} htmlFor="j-size">People</label>
                        <input id="j-size" type="number" min={2} max={Math.min(10, left)} className="field" value={form.groupSize} onChange={(e) => setForm({ ...form, groupSize: e.target.value })} />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={label} htmlFor="j-note">Note to {install.hostName} (optional)</label>
                    <textarea id="j-note" rows={2} className="field h-auto py-2 text-[13px]" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={2000} placeholder="Experience, when you can arrive, a question…" />
                  </div>
                  <label className="flex items-start gap-2 text-[12.5px]">
                    <input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} required />
                    I’m 18 or older, or I have a parent’s or guardian’s permission to volunteer.
                  </label>
                  <Button type="submit" disabled={busy === 'join' || !form.consent} className="w-full rounded-full">
                    {busy === 'join' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Sign me up
                  </Button>
                  <p className="text-[11.5px] text-muted-foreground">Your name, email and note go to {install.hostName}.</p>
                </form>
              )}
            </section>
          )}

          {!isHost && isAuthenticated && install.status !== 'cancelled' && (
            <section className="surface bg-card/85 p-5 backdrop-blur">
              <p className="flex items-center gap-2 text-[14px] font-medium"><Mail className="h-4 w-4 text-muted-foreground" />Ask {install.hostName} a question</p>
              <p className="mb-2 mt-0.5 text-[12px] text-muted-foreground">It goes by email; their reply comes straight to you.</p>
              <MessageBox placeholder="Is there parking? Should I bring a shovel?" onSend={(message) => installAction('contact', { installId: id, message })} />
            </section>
          )}

          {isHost && (
            <>
              <section className="surface bg-card/85 p-5 backdrop-blur">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-medium">Your helpers <span className="text-[12.5px] font-normal text-muted-foreground">· {install.joined || 0} of {install.spots}</span></p>
                  {install.projectId && (
                    <Button asChild variant="ghost" size="sm" className="rounded-full"><Link to={`/project/${install.projectId}/plan#community-install`}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Link></Button>
                  )}
                </div>
                {active.length ? (
                  <ul className="mt-3 space-y-3">
                    {active.map((h) => (
                      <li key={h.id} className="rounded-xl border border-border/60 bg-background/40 p-3 text-[12.5px]">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium">{h.name}{h.groupSize > 1 ? ` +${h.groupSize - 1}` : ''}</span>
                          <a href={`mailto:${h.email}`} className="text-muted-foreground underline-offset-2 hover:underline">{h.email}</a>
                        </div>
                        <p className="mt-0.5 text-muted-foreground">{h.role === 'student' ? 'Student, for volunteer hours' : h.role === 'group' ? 'Group' : 'Volunteer'}{h.status === 'attended' ? ` · ${h.hoursLogged} h confirmed` : h.status === 'no_show' ? ' · didn’t come' : ''}</p>
                        {h.message && <p className="mt-1.5">“{h.message}”</p>}
                        {past && install.status !== 'cancelled' && (
                          <div className="mt-2 flex items-center gap-3">
                            <label className="flex items-center gap-1.5">
                              <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={hours[h.id]?.attended ?? true} onChange={(e) => setHours({ ...hours, [h.id]: { ...hours[h.id], attended: e.target.checked } })} />Came
                            </label>
                            <label className="flex items-center gap-1.5">
                              <input type="number" min={0} max={16} step={0.25} className="field h-8 w-20" value={hours[h.id]?.hours ?? install.hours} disabled={hours[h.id]?.attended === false} onChange={(e) => setHours({ ...hours, [h.id]: { ...hours[h.id], hours: e.target.value } })} aria-label={`Hours for ${h.name}`} />hours
                            </label>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[12.5px] text-muted-foreground">Nobody yet. Share this page’s link with neighbors, a school club or a native plant society.</p>
                )}
                {past && active.length > 0 && install.status !== 'cancelled' && (
                  <div className="mt-3">
                    <Button onClick={saveHours} disabled={busy === 'hours'} className="rounded-full">
                      {busy === 'hours' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Confirm hours
                    </Button>
                    {hoursSaved && <span className="ml-3 text-[12px] text-primary">Saved; helpers get an email.</span>}
                  </div>
                )}
                {!past && active.length > 0 && <p className="mt-3 text-[11.5px] text-muted-foreground">After the day, confirm who came and their hours here.</p>}
              </section>
              {active.length > 0 && install.status !== 'cancelled' && (
                <section className="surface bg-card/85 p-5 backdrop-blur">
                  <p className="text-[14px] font-medium">Message everyone</p>
                  <p className="mb-2 mt-0.5 text-[12px] text-muted-foreground">Send the address, parking and the plan. Replies come to your email.</p>
                  <MessageBox placeholder="The address is… Park on the street; we start with sheet mulching in the front yard." onSend={(message) => installAction('contact', { installId: id, message })} cta="Send to helpers" />
                </section>
              )}
              {install.status !== 'cancelled' && install.status !== 'done' && (
                <Button variant="ghost" onClick={callOff} disabled={busy === 'cancel'} className="rounded-full text-destructive hover:text-destructive">Call off this day</Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
