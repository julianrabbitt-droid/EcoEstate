import { useState } from 'react';
import { ChevronDown, ExternalLink, MapPin } from 'lucide-react';
import { plantsForProject, regionForProject } from '@/data/regions';
import { countryCodeFor } from '@/data/locationRegions';

// Official, authoritative resources for researching native plants further.
const FURTHER_SOURCES = [
  { label: 'USDA PLANTS Database', detail: 'federal range & plant profiles', url: 'https://plants.usda.gov/' },
  { label: 'NWF Native Plant Finder', detail: 'zip-level natives by wildlife supported', url: 'https://www.nwf.org/nativeplantfinder/' },
  { label: 'Xerces Society', detail: 'pollinator-conservation plant lists', url: 'https://xerces.org/pollinator-conservation/native-plants' },
  { label: 'Audubon Native Plant Database', detail: 'plants that support local birds', url: 'https://www.audubon.org/native-plants' },
];

// A clickable disclosure that confirms the native-plant source for the
// property's ZIP: which region the plants come from, the ecoregion, the
// states covered, and a link to the authority that defines the list.
export default function NativeSourcePanel({ project }) {
  const [open, setOpen] = useState(false);
  const region = regionForProject(project);
  const covered = plantsForProject(project).length > 0;
  const location = [project?.city, project?.state, project?.country, project?.zip].filter(Boolean).join(', ') || 'your area';
  const sources = countryCodeFor(project || {}) === 'US' ? FURTHER_SOURCES : [
    { label: 'Kew Plants of the World Online', detail: 'native versus introduced ranges', url: 'https://powo.science.kew.org/' },
    { label: 'Botanic Gardens Conservation International', detail: 'find botanical expertise near this location', url: 'https://www.bgci.org/' },
  ];

  return (
    <div className="surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-secondary/40"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <MapPin className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium tracking-tight text-foreground">
            {covered ? `Regional shortlist: ${region.name}` : `Local plant coverage unavailable: ${region.name}`}
          </span>
          <span className="block truncate text-[11.5px] text-muted-foreground">
            {location} · sources and native-range guidance
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border/70 px-4 py-3.5">
          <p className="text-[12.5px] leading-relaxed text-foreground">
            {covered
              ? `This shortlist uses ${region.name} native plant records (${region.ecoregion.toLowerCase()}). Regional or country nativity does not guarantee a species is indigenous to this exact site; confirm local provenance, soil and exposure before planting. Size, water use and prices are planning estimates.`
              : 'We do not yet have a verified shortlist for this location. No plants from California, a similar climate, or another country have been substituted. Use these botanical sources to confirm local native ranges.'}
          </p>

          <p className="mt-4 label-xs">Regional source</p>
          <a
            href={region.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11.5px] font-medium text-foreground transition hover:border-accent/40 hover:text-accent"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {region.source.label}
          </a>

          <p className="mt-4 label-xs">Official sources for further information</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] text-foreground underline-offset-2 hover:text-accent hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground">— {s.detail}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}