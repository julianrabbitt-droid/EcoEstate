import { Check, Droplets, Plus, Sun } from 'lucide-react';
import { money } from '@/lib/landscapeMath';
import { cn } from '@/lib/utils';
import { photoCredit } from '@/hooks/usePlantPhotos';

export default function PlantCard({ plant, selected, onToggle, photo }) {
  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition',
        selected ? 'border-primary/40 shadow-[0_12px_30px_-24px_rgba(16,35,28,0.7)]' : 'border-border hover:border-primary/25'
      )}
    >
      <div className="relative h-32 w-full overflow-hidden bg-secondary">
        {photo ? (
          <>
            <img
              src={photo}
              alt={plant.common}
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            />
            <PhotoCredit id={plant.id} />
          </>
        ) : (
          <div
            className="h-full w-full"
            style={{ background: `linear-gradient(135deg, ${plant.accent}, ${plant.color})` }}
          />
        )}
      </div>

      <div className="flex items-start gap-3 p-4 pb-0">
        <span
          className="mt-0.5 h-9 w-9 shrink-0 rounded-full ring-4 ring-secondary/60"
          style={{ background: `linear-gradient(135deg, ${plant.accent}, ${plant.color})` }}
        />
        <div className="min-w-0">
          <h3 className="truncate text-[14.5px] font-medium leading-tight tracking-tight">{plant.common}</h3>
          <p className="mt-0.5 truncate font-display text-[12.5px] italic text-muted-foreground">{plant.scientific}</p>
        </div>
      </div>

      <p className="mt-3 px-4 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{plant.blurb}</p>

      <div className="mt-3 flex flex-wrap gap-1.5 px-4 text-[10.5px]">
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
          <Droplets className="h-2.5 w-2.5" />
          {plant.water}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
          <Sun className="h-2.5 w-2.5" />
          {plant.sun}
        </span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">{plant.wildlife.join(' · ')}</span>
      </div>

      <div className="mx-4 mt-3 flex items-end justify-between border-t border-border/70 pt-3">
        <div className="text-[11px] leading-tight text-muted-foreground">
          <span className="block font-medium text-foreground">{money(plant.cost)}</span>
          {plant.h} ft tall · {plant.spacing} ft spacing
        </div>
        <button
          type="button"
          onClick={() => onToggle(plant.id)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] font-medium transition',
            selected
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-foreground hover:border-primary/40 hover:bg-secondary'
          )}
        >
          {selected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {selected ? 'Added' : 'Add'}
        </button>
      </div>
    </div>
  );
}
// License credit for a Wikimedia Commons photo (author and license, linked).
function PhotoCredit({ id }) {
  const credit = photoCredit(id);
  if (!credit) return null;
  const text = `Photo: ${credit.artist} · ${credit.license}`;
  return (
    <span className="absolute bottom-0 right-0 max-w-full truncate rounded-tl-md bg-black/60 px-1.5 py-0.5 text-[9.5px] text-white">
      {credit.url ? (
        <a href={credit.url} target="_blank" rel="noreferrer" className="hover:underline" title={text}>
          {text}
        </a>
      ) : (
        text
      )}
    </span>
  );
}
