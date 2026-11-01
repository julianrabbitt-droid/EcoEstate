import { Satellite, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

const METHODS = [
  { key: 'satellite', label: 'Satellite', hint: 'Trace over imagery', icon: Satellite },
  { key: 'upload', label: 'Upload', hint: 'Enter your size', icon: Upload },
];

export default function MethodPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {METHODS.map((m) => {
        const Icon = m.icon;
        const active = value === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            className={cn(
              'flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition',
              active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/30'
            )}
          >
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
              <Icon className="h-3.5 w-3.5" />
              {m.label}
            </span>
            <span className={cn('text-[10px] leading-tight', active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
              {m.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}