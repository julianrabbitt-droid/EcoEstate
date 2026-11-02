import { useState } from 'react';
import { ChevronDown, ScanLine } from 'lucide-react';
import { Image } from '@/components/ui/image';
import ScanContours from '@/components/scan/ScanContours';

// Reusable, collapsible scan diagram (satellite image + traced property/lawn
// outlines) shown across the phases after a scan is confirmed. Only renders for
// auto scans that captured a satellite image; manual scans have no diagram.
export default function ScanDiagram({ project, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!project?.satelliteImage) return null;

  return (
    <section className="surface p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-[15px] font-medium tracking-tight">
          <ScanLine className="h-4 w-4 text-accent" /> Scan diagram
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <figure className="relative mt-3 aspect-square w-full max-w-md overflow-hidden rounded-xl border border-border bg-secondary">
          <Image
            src={project.satelliteImage}
            alt="Property scan with estimated property and lawn boundaries"
            fittingType="fit"
            className="absolute inset-0 h-full w-full object-contain"
          />
          <ScanContours estimate={project.scanEstimate} />
          <figcaption className="absolute left-2 top-2 rounded-full bg-foreground/85 px-2.5 py-1 text-[12px] text-background">
            Satellite · scan
          </figcaption>
        </figure>
      )}
    </section>
  );
}