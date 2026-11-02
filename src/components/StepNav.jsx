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
        <div className="absolute inset-0 bg-[#e4e8da]/45" />
      </div>
    )}
    <nav className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <ol className="flex min-w-max items-center gap-1 text-[12.5px]">
        {STEPS.map((step, i) => {
          const active = step.key === current;
          return (
            <li key={step.key} className="flex items-center gap-1">
              {i > 0 && <span className="mx-1 h-px w-5 bg-border" aria-hidden />}
              <Link
                to={step.path(projectId)}
                state={project ? { project } : undefined}
                className={cn(
                  'rounded-full px-3 py-1.5 transition',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <span className="mr-1.5 font-mono text-[10px] opacity-60">0{i + 1}</span>
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