import ScanStat from '@/components/scan/ScanStat';

const sqft = value => typeof value === 'number' ? `${Math.round(value).toLocaleString()} sq ft` : '—';
const legend = [['Property', 'bg-chart-4'], ['Lawns', 'bg-chart-3/50'], ['Paths', 'bg-foreground/40'], ['Trees', 'bg-primary/60'], ['Other', 'bg-accent/40']];

export default function ScanSummary({ estimate }) {
  const e = estimate || {};
  const count = (e.lawns || []).length;
  const confidence = Math.round((e.confidence || 0) * 100);
  return (
    <div className="space-y-3 px-4">
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {legend.map(([label, color]) => <span key={label} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}</span>)}
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2"><p className="text-[13px] font-medium">Estimated property outline</p><span className="text-[10px] text-muted-foreground">{count} lawn{count === 1 ? '' : 's'} detected</span></div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{e.notes || 'Boundaries traced from visible features in the satellite image.'}</p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">{e.boundarySource === 'public_parcel' ? `Boundary: ${e.boundaryLabel}, for reference, not a legal survey.` : 'Visual estimate, not a surveyed parcel boundary.'} Areas use the map scale, not a guessed lawn percentage.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ScanStat label="Lawn" value={sqft(e.lawnAreaSqft)} />
        <ScanStat label="Lot estimate" value={sqft(e.lotSizeSqft)} />
        <ScanStat label="Roof footprint" value={sqft(e.houseFootprintSqft)} />
      </div>
      {e.recordLotSizeSqft > 0 && <p className="text-[11px] leading-relaxed text-muted-foreground">Address-matched record: {sqft(e.recordLotSizeSqft)}.{e.recordMismatch ? ' It differs from the visible boundary; please verify the lot before continuing.' : ' Outlines have not been stretched to match this figure.'}</p>}
      {e.boundaryClipped && <p role="status" className="text-xs text-destructive">The whole property is still not visible after zooming out. This partial scan cannot be confirmed.</p>}
      {!e.boundaryClipped && !e.lawnAreaSqft && <p role="status" className="text-xs text-muted-foreground">No clearly visible turf was found inside this property. No lawn area has been invented.</p>}
      <div>
        <div className="flex justify-between text-[11px] text-muted-foreground"><span>Confidence</span><span>{confidence}%</span></div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-accent" style={{ width: `${confidence}%` }} /></div>
      </div>
      {e.turfSpecies && <p className="text-[11.5px] text-muted-foreground">Likely turf: <span className="text-foreground">{e.turfSpecies}</span></p>}
    </div>
  );
}