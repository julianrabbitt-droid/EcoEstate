import { MapPin, Shovel, Droplets, Sprout, CloudRain } from 'lucide-react';
import { buildSchedule } from '@/lib/buildSchedule';

const PHASE_META = [
  { icon: MapPin, title: 'Mark & prep', body: 'Paint the bed outlines, strip or sheet-mulch the turf, and order materials for delivery.' },
  { icon: Shovel, title: 'Soil & mulch', body: 'Spread 3 inches of arborist mulch over the beds; keep it off plant crowns and the house foundation.' },
  { icon: Droplets, title: 'Run drip', body: 'Lay pressure-regulated drip lines 12–18 inches apart and flush before planting so nothing gets trampled.' },
  { icon: Sprout, title: 'Plant', body: 'Set every pot at its spacing, step back, adjust, then plant at nursery depth. Water each one in.' },
];

export default function BuildTimeline({ sqft = 0 }) {
  const sched = buildSchedule(sqft);
  const phases = PHASE_META.map((m, i) => ({ ...m, when: sched.phases[i].when }));
  const establish = {
    icon: CloudRain,
    when: sched.establishLabel,
    title: 'Establish',
    body: `Deep water twice weekly through the first summer${sched.establishYears > 1 ? 's' : ''}, then taper to monthly, then only in extreme heat.`,
  };

  return (
    <div className="relative mt-5 pl-2">
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-foreground">{sched.buildLabel}</span>
        <span className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">
          {sched.establishYears} year{sched.establishYears > 1 ? 's' : ''} to establish
        </span>
      </div>
      <div className="absolute left-[15px] top-14 bottom-2 w-px bg-border" />
      <ol className="space-y-5">
        {[...phases, establish].map((p) => (
          <li key={p.title} className="relative flex gap-4">
            <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-accent">
              <p.icon className="h-4 w-4" />
            </span>
            <div className="pt-0.5">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{p.when}</p>
              <p className="mt-0.5 text-[13px] font-medium leading-tight">{p.title}</p>
              <p className="mt-1 max-w-md text-[11.5px] leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}