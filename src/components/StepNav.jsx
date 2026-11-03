import { Link } from 'react-router-dom';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const centerOf = (project) => {
  const c = project?.center;
  if (!Array.isArray(c) || c.length < 2) return null;
  return Math.abs(c[0]) > 90 ? [c[1], c[0]] : c; // some older projects stored [lng, lat]
};

const STEPS = [
  { key: 'scan', label: 'Scan', path: (id) => `/project/${id}` },
  { key: 'design', label: 'Design', path: (id) => `/project/${id}/design` },
  { key: 'impact', label: 'Payoff', path: (id) => `/project/${id}/impact` },
  { key: 'plan', label: 'Build', path: (id) => `/project/${id}/plan` },
];

// The project's steps, and behind the top of every step page the property
// from above, fading into the page: the same view the scan started from.
export default function StepNav({ projectId, current, project }) {
  const center = centerOf(project);
  return (
    <>
    {center && (
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[75vh] opacity-60"
        style={{ maskImage: 'linear-gradient(180deg, #000 0%, rgba(0,0,0,.55) 45%, transparent 100%)', WebkitMaskImage: 'linear-gradient(180deg, #000 0%, rgba(0,0,0,.55) 45%, transparent 100%)' }}
        aria-hidden
      >
        <MapContainer
          center={center}
          zoom={19}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          boxZoom={false}
          keyboard={false}
          className="h-full w-full"
        >
          <TileLayer url={IMAGERY} maxNativeZoom={19} />
        </MapContainer>
        <div className="absolute inset-0 bg-[#0d1611]/50" />
      </div>
    )}
    <nav aria-label="Project steps" className="-mx-5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
      <ol className="inline-flex min-w-max items-center gap-1 rounded-full border border-white/15 bg-[#14211a]/80 p-1 text-[12.5px] text-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md">
        {STEPS.map((step, i) => {
          const active = step.key === current;
          const done = STEPS.findIndex((x) => x.key === current) > i;
          return (
            <li key={step.key} className="flex items-center">
              {i > 0 && <span className={cn('mx-0.5 h-px w-4 sm:w-6', done || active ? 'bg-[#a9bfa0]' : 'bg-white/25')} aria-hidden />}
              <Link
                to={step.path(projectId)}
                state={project ? { project } : undefined}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3.5 py-1.5 transition',
                  active ? 'bg-[#a9bfa0] text-[#14211a] shadow-[0_6px_18px_-6px_rgba(0,0,0,0.5)]' : 'text-white/75 hover:bg-white/10 hover:text-white'
                )}
              >
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px]', active ? 'bg-[#14211a] text-[#a9bfa0]' : done ? 'bg-[#a9bfa0]/25 text-[#a9bfa0]' : 'bg-white/10')}>
                  {done ? '✓' : i + 1}
                </span>
                {step.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
    </>
  );
}