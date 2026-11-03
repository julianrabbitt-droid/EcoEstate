import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { plantById } from '@/data/nativePlants';
import { designOrDefault } from '@/lib/landscapeMath';
import { INSTALL_TASKS, installAction } from '@/lib/installs';

const inAWeek = () => {
  const d = new Date(Date.now() + 7 * 86400e3);
  if (d.getDay() !== 6) d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7)); // the Saturday after
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Hosting a community install for a property: the day, how many helpers and
// what they'll do. Creates the install, or updates the open one.
export default function HostInstallForm({ project, install = null, onSaved, onCancel }) {
  const [f, setF] = useState(() => ({
    title: install?.title || 'Lawn to native garden planting day',
    date: install?.date || inAWeek(),
    startTime: install?.startTime || '09:00',
    hours: install?.hours || 4,
    spots: install?.spots || 8,
    tasks: install?.tasks || ['Sheet mulching', 'Planting', 'Watering in'],
    whatToBring: install?.whatToBring ?? 'Gloves, water, sun hat. Tools and snacks provided.',
    description: install?.description || '',
    kidsWelcome: install?.kidsWelcome ?? true,
    hostConfirmed: Boolean(install),
  }));
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const submit = async (e) => {
    e.preventDefault();
    setState('saving');
    setError('');
    try {
      const plants = designOrDefault(project).map((d) => ({ name: plantById(d.speciesId)?.common, count: d.quantity })).filter((p) => p.name);
      const saved = await installAction('start', { ...f, hours: Number(f.hours), spots: Number(f.spots), projectId: project.id, plants, lawnSqft: project.breakdown?.turf || 0 });
      setState('idle');
      onSaved?.(saved);
    } catch (err) {
      setError(err?.message || 'Could not save the install.');
      setState('idle');
    }
  };

  const label = 'mb-1 block text-[12px] text-muted-foreground';
  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className={label} htmlFor="ci-title">Title</label>
        <input id="ci-title" className="field" value={f.title} onChange={set('title')} maxLength={120} required />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <label className={label} htmlFor="ci-date">Day</label>
          <input id="ci-date" type="date" className="field" value={f.date} onChange={set('date')} required />
        </div>
        <div>
          <label className={label} htmlFor="ci-time">Starts</label>
          <input id="ci-time" type="time" className="field" value={f.startTime} onChange={set('startTime')} />
        </div>
        <div>
          <label className={label} htmlFor="ci-hours">Hours</label>
          <input id="ci-hours" type="number" min={1} max={12} step={0.5} className="field" value={f.hours} onChange={set('hours')} required />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={label} htmlFor="ci-spots">Helpers wanted</label>
          <input id="ci-spots" type="number" min={1} max={100} className="field" value={f.spots} onChange={set('spots')} required />
        </div>
      </div>
      <fieldset>
        <legend className={label}>Jobs on the day</legend>
        <div className="flex flex-wrap gap-1.5">
          {INSTALL_TASKS.map((t) => {
            const on = f.tasks.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => set('tasks')(on ? f.tasks.filter((x) => x !== t) : [...f.tasks, t])}
                className={`rounded-full border px-2.5 py-1 text-[11.5px] transition ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div>
        <label className={label} htmlFor="ci-bring">What to bring</label>
        <input id="ci-bring" className="field" value={f.whatToBring} onChange={set('whatToBring')} maxLength={300} />
      </div>
      <div>
        <label className={label} htmlFor="ci-desc">About the day (optional)</label>
        <textarea id="ci-desc" rows={3} className="field h-auto py-2" value={f.description} onChange={set('description')} maxLength={2000} placeholder="Parking, the plan for lunch, who to ask for on arrival…" />
      </div>
      <label className="flex items-start gap-2 text-[12.5px]">
        <input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={f.kidsWelcome} onChange={set('kidsWelcome')} />
        Families with children are welcome
      </label>
      <label className="flex items-start gap-2 text-[12.5px]">
        <input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={f.hostConfirmed} onChange={set('hostConfirmed')} required />
        I own this property, or have the owner’s permission, to host volunteers here. I’ll share the address with the people who sign up.
      </label>
      {error && <p role="alert" className="text-[12px] text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={state === 'saving' || !f.hostConfirmed} className="rounded-full">
          {state === 'saving' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {install ? 'Save changes' : 'Post the install'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="rounded-full">Cancel</Button>
        )}
      </div>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Everyone sees the day, the city and your first name. Your address stays private until you send it to helpers. Volunteers’ names and emails come to you when they sign up.
      </p>
    </form>
  );
}
