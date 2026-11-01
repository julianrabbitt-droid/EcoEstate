import { cn } from '@/lib/utils';

export default function StatTile({ label, value, sub, accent = false, className }) {
  return (
    <div className={cn('surface px-4 py-4', accent && 'bg-primary text-primary-foreground', className)}>
      <p
        className={cn(
          'text-[10px] uppercase tracking-[0.16em]',
          accent ? 'text-primary-foreground/60' : 'text-muted-foreground'
        )}
      >
        {label}
      </p>
      <p className="mt-1.5 font-display text-[26px] leading-none tracking-tight">{value}</p>
      {sub && (
        <p className={cn('mt-1.5 text-[11.5px] leading-snug', accent ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
          {sub}
        </p>
      )}
    </div>
  );
}