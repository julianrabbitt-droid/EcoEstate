import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, MapPin, Pencil } from 'lucide-react';
import EditableLawnMap from '@/components/scan/EditableLawnMap';
import { Button } from '@/components/ui/button';
import { mergeLawnOutlines } from '@/api/lawnApi';
import { updateProject } from '@/lib/projectStore';
import { carryBuildingHeights, carryBuildingRoofs } from '@/lib/gardenLayout';
import { zoomForLotSize } from '@/lib/geo';
import { num } from '@/lib/landscapeMath';

// Same lawn outlines, to about a centimetre (the map re-emits the seeded shapes).
function sameOutlines(a, b) {
  const key = (rings) => JSON.stringify((rings || []).map((r) => r.map(([y, x]) => [y.toFixed(7), x.toFixed(7)])));
  try {
    return key(a) === key(b);
  } catch {
    return false;
  }
}

// Lets a user reopen the drawing tool and re-trace the lawn even after the scan
// is confirmed. Seeds the map with the project's existing lawn, building, tree
// and lot outlines, then writes the new geometry back to the project.
export default function EditScanPanel({ project, onApplied, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionRef = useRef(null);
  // Arriving from "Edit the scan" on the Design step: open and bring it into view.
  useEffect(() => {
    if (defaultOpen) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [defaultOpen]);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const center = Array.isArray(project.center) && project.center.length === 2 ? project.center : null;
  const zoom = zoomForLotSize(project.lotSizeSqft || 0);
  const newTurf = Math.round(result?.area || 0);
  const beds = Number(project.breakdown?.beds || 0);
  const bare = Number(project.breakdown?.bare || 0);
  const canApply = newTurf >= 1;

  if (!center) return null;

  const apply = async () => {
    if (!canApply || saving) return;
    setSaving(true);
    // Unchanged lawns keep the scan's measurement (re-measuring a simplified
    // outline would shift it even though nothing was edited). Edited lawns:
    // overlapping or touching ones are saved as one group (one shared mulch bed).
    const sameLawns = sameOutlines(result.boundary, project.boundary);
    const merged = sameLawns ? null : await mergeLawnOutlines(result.boundary);
    const turf = sameLawns ? Math.round(project.breakdown?.turf || newTurf) : merged ? Math.round(merged.lawnSqft) : newTurf;
    const next = await updateProject(project.id, {
      center: result.center || center,
      boundary: sameLawns ? project.boundary : merged?.outlines || result.boundary || [],
      features: result.features || [],
      buildings: result.buildings || [],
      buildingHeightsFt: carryBuildingHeights(result.buildings, project.buildings, project.buildingHeightsFt),
      buildingRoofs: carryBuildingRoofs(result.buildings, project.buildings, project.buildingRoofs),
      trees: result.trees || [],
      lotOutline: result.lotOutline || project.lotOutline || null,
      totalSqft: turf + beds + bare,
      breakdown: { turf, beds, bare },
      scanSource: project.scanSource === 'auto' ? 'manual' : project.scanSource,
    });
    setSaving(false);
    setOpen(false);
    setResult(null);
    onApplied?.(next);
  };

  return (
    <section ref={sectionRef} className="surface scroll-mt-24 p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-[15px] font-medium tracking-tight">
          <Pencil className="h-4 w-4 text-accent" /> Edit the scan
        </span>
        <span className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">Redraw the lawn anytime</span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">
            Drag the corners to fine-tune the confirmed lawn, or trace a new section. Applying recalculates the
            outlined area and convertible turf.
          </p>
          <div className="overflow-hidden rounded-xl border border-border">
            <EditableLawnMap
              center={center}
              zoom={zoom}
              lotSizeSqft={project.lotSizeSqft || 0}
              lotOutline={project.lotOutline || null}
              initialShapes={project.boundary || []}
              initialTrees={project.trees || []}
              initialBuildings={project.buildings || []}
              onResult={setResult}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {newTurf > 0
                ? `${num(newTurf)} sq ft of convertible turf in the new outline`
                : 'Trace at least three corners to set a new lawn area'}
            </p>
            <Button onClick={apply} disabled={!canApply || saving} className="rounded-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply new outline
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}