import { useEffect, useState } from 'react';

// Upload estimate method: a manual lawn-size entry for properties where the
// satellite tracer isn't suitable. The photo-based turf identification that
// lived here used an LLM and has been removed; turf species is chosen later on
// the Analysis screen.
export default function UploadMethod({ onResult }) {
  const [area, setArea] = useState(0);

  useEffect(() => {
    onResult({
      area: Number(area) || 0,
      source: 'upload',
      boundary: [],
      turf: null,
    });
  }, [area, onResult]);

  return (
    <div className="px-4 py-6">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Enter your lawn size by hand. You can measure it from a site plan, a property survey, or pace it off.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Your lawn size</label>
        <input
          type="number"
          min={0}
          value={area || ''}
          onChange={(e) => setArea(Math.max(0, Math.round(Number(e.target.value) || 0)))}
          placeholder="e.g. 1800"
          className="field h-10 flex-1 text-right text-[14px]"
        />
        <span className="text-[11px] text-muted-foreground">sq ft</span>
      </div>
    </div>
  );
}