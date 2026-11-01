import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MapPin, Sprout, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { financials, money, num } from '@/lib/landscapeMath';
import { deleteProject } from '@/lib/projectStore';
import { useProjects } from '@/hooks/useProjects';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import TrackingUpsell from '@/components/tracking/TrackingUpsell';

// My properties is a Pro feature (or free with a school email); scanning
// and the 3D view stay free, and a scan's own pages open from its link.
export default function Projects() {
  const { member, loading: accessLoading, refresh } = usePremiumAccess();
  if (accessLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl justify-center px-5 py-24">
        <div className="h-7 w-7 rounded-full border-2 border-border border-t-foreground animate-spin" />
      </div>
    );
  }
  if (!member) {
    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-12">
        <p className="label-xs">Saved scans</p>
        <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-[2.4rem]">My properties</h1>
        <div className="mt-8">
          <TrackingUpsell feature="properties" onUnlocked={refresh} />
        </div>
      </div>
    );
  }
  return <PropertyList />;
}

function PropertyList() {
  const { projects, loading, reload } = useProjects();

  const [deleteError, setDeleteError] = useState('');

  const remove = async (project) => {
    if (!window.confirm(`Delete ${project.address || 'this property'}? Its design and numbers will be removed.`)) return;
    setDeleteError('');
    try {
      await deleteProject(project.id);
    } catch (e) {
      setDeleteError(e?.message || 'Couldn’t delete that property. Please try again.');
    }
    reload();
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs">Saved scans</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-[2.4rem]">My properties</h1>
        </div>
        <Button asChild className="rounded-full">
          <Link to="/">Scan another property</Link>
        </Button>
      </div>

      {deleteError && (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12.5px] text-destructive">
          {deleteError}
        </p>
      )}

      {loading ? (
        <div className="mt-10 flex items-center justify-center py-12">
          <div className="h-7 w-7 rounded-full border-2 border-border border-t-foreground animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center">
          <MapPin className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-3 text-[14px] font-medium">No properties scanned yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
            Enter an address, outline the lawn on satellite imagery, and your design and numbers are saved here.
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {projects.map((project) => {
            const fin = financials(project, project.design || []);
            return (
              <li key={project.id} className="surface group relative p-5">
                <Link to={`/project/${project.id}`} className="block">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {project.city || 'Property'} · {new Date(project.createdAt || Date.now()).toLocaleDateString()}
                  </p>
                  <p className="mt-1.5 pr-8 font-display text-[19px] leading-snug tracking-tight">{project.address}</p>
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[11.5px] text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">{num(fin.turfSqft)}</span> sq ft turf
                    </span>
                    <span>
                      <span className="font-medium text-foreground">{money(fin.annualSavings)}</span> / yr saved
                    </span>
                    <span>
                      <span className="font-medium text-foreground">{(project.design || []).length}</span> species
                    </span>
                  </div>
                </Link>
                <Link
                  to={`/my-projects?project=${project.id}`}
                  className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                >
                  <Sprout className="h-3 w-3" /> Track as project
                </Link>
                <div className="absolute right-4 top-4 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => remove(project)}
                    className="rounded-full p-1.5 text-muted-foreground opacity-100 transition hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    aria-label={`Delete ${project.address}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}