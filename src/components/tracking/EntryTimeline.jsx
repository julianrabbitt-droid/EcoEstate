import { Trash2 } from 'lucide-react';
import SignedImage from '@/components/tracking/SignedImage';
import { fmtNum, fmtUsd, sortEntries } from '@/lib/trackingMath';

const has = (v) => typeof v === 'number';

// Progress entries, newest first, with photos and logged values.
export default function EntryTimeline({ entries, onDelete }) {
  const list = sortEntries(entries).reverse();

  if (!list.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <p className="text-[14px] font-medium">No updates yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-muted-foreground">
          Add your first progress update above — a before photo is a great start.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {list.map((e) => (
        <li key={e.id} className="surface group p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="label-xs">{new Date(`${e.date}T00:00`).toLocaleDateString()}</p>
              <p className="mt-1 font-display text-xl tracking-tight">{fmtNum(e.convertedSqft)} sq ft converted</p>
            </div>
            <button
              type="button"
              onClick={() => onDelete(e)}
              className="rounded-full p-1.5 text-muted-foreground transition hover:text-destructive"
              aria-label="Delete update"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-muted-foreground">
            {has(e.plantsInstalled) && <span><span className="font-medium text-foreground">{fmtNum(e.plantsInstalled)}</span> plants</span>}
            {has(e.spentUsd) && <span><span className="font-medium text-foreground">{fmtUsd(e.spentUsd)}</span> spent</span>}
            {has(e.rebateUsd) && <span><span className="font-medium text-foreground">{fmtUsd(e.rebateUsd)}</span> rebate</span>}
            {has(e.waterGallons) && (
              <span>
                <span className="font-medium text-foreground">{fmtNum(e.waterGallons)}</span> gal{has(e.waterDays) ? ` over ${e.waterDays} days` : ''}
              </span>
            )}
          </div>
          {e.notes && <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{e.notes}</p>}
          {e.photoUris?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {e.photoUris.map((uri) => (
                <SignedImage key={uri} uri={uri} className="h-28 w-28 rounded-lg border border-border object-cover" />
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
