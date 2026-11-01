import { Slider } from '@/components/ui/slider';

// Preset walking speeds in ft/s, shown as labeled reference points under the
// slider so the user can snap to a recognizable gait.
const MARKS = [
  { value: 2, label: 'Stroll' },
  { value: 4.5, label: 'Walk' },
  { value: 6.5, label: 'Brisk' },
  { value: 9, label: 'Jog' },
  { value: 12, label: 'Run' },
  { value: 20, label: 'Sprint' },
  { value: 30, label: 'Top' },
];

export default function WalkSpeedControl({ value, onChange }) {
  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 w-44 rounded-md bg-background/70 px-2.5 py-1.5 shadow-md backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-foreground">Speed</span>
        <span className="text-[10px] text-muted-foreground">{value.toFixed(1)} ft/s</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        min={1}
        max={30}
        step={0.1}
        className="mt-2"
      />
      <div className="mt-1 flex justify-between text-[8px] uppercase tracking-wide text-muted-foreground">
        {MARKS.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => onChange(m.value)}
            className={`transition hover:text-foreground ${Math.abs(value - m.value) < 0.25 ? 'text-foreground' : ''}`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}