import { ExternalLink, MapPin } from 'lucide-react';
import { money } from '@/lib/landscapeMath';

const checkedOn = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

// Rebates and incentives that serve this property, found from its water
// utility (EPA service areas), county and state. Each links to the official
// program page; amounts are estimates for the scanned lawn.
export default function RebatesSection({ incentives }) {
  const { rows = [], best, place } = incentives || {};
  const utility = place?.utilities?.[0]?.name;
  const where = [place?.city, place?.state, place?.zip].filter(Boolean).join(', ');

  return (
    <section className="mt-5 surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-medium tracking-tight">Rebates for this address</h2>
        <span className="text-[12px] text-muted-foreground">
          Estimated total <span className="font-medium text-foreground">{money(incentives?.total || 0)}</span>
        </span>
      </div>
      {(utility || where) && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          {where}
          {utility && <> · Water from {utility}</>}
        </p>
      )}

      {rows.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((program) => (
            <div key={program.id} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium leading-tight">{program.name}</p>
                <span className="whitespace-nowrap font-display text-[15px] text-accent">
                  {program.upTo != null ? `Up to ${money(program.upTo)}` : money(program.amount)}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">{program.provider}</p>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{program.desc}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <a
                  href={program.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  Official program page <ExternalLink className="h-3 w-3" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
                <span className="text-muted-foreground">
                  {program.id === best?.id ? 'Counted · ' : program.stacks ? 'Adds on · ' : program.upTo != null ? 'Not counted · ' : 'Alternative · '}
                  checked {checkedOn(program.verified)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-[12.5px] leading-relaxed text-muted-foreground">
          We don’t have a lawn-replacement rebate on file for this address yet, so none is counted in your numbers.
          {utility ? ` Ask ${utility} about turf or landscape rebates` : ' Ask your water utility about turf or landscape rebates'},
          and check your city and county stormwater programs.
        </p>
      )}

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
        Amounts are estimates for your scanned lawn using each program’s published rate and cap. Most programs need
        approval before you remove any grass, funding can run out, and only one lawn-replacement rebate usually
        applies. Your provider confirms eligibility.
      </p>
    </section>
  );
}
