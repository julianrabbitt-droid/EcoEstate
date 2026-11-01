import { Loader2 } from 'lucide-react';
import ScanStat from '@/components/scan/ScanStat';
import { money, num } from '@/lib/landscapeMath';

// Lawn size and conversion impact from the lawn-to-native API.
export default function LawnImpact({ lawnSqft, impact, updating = false, error = '' }) {
  return (
    <div className="space-y-3 px-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Lawn area</p>
          <p className="font-display text-[2.1rem] leading-none tracking-tight">
            {typeof lawnSqft === 'number' ? num(lawnSqft) : '—'}
            <span className="ml-1.5 text-sm text-muted-foreground">sq ft</span>
          </p>
        </div>
        {updating && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ScanStat label="Water saved / yr" value={impact ? `${num(impact.gallonsSavedPerYear)} gal` : '—'} />
        <ScanStat label="Saved / yr" value={impact ? money(impact.dollarsSavedPerYear) : '—'} />
        <ScanStat label="Est. rebate" value={impact ? money(impact.estimatedRebate) : '—'} />
      </div>
      {error && (
        <p role="alert" className="text-[11.5px] leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
