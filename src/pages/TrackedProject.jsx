import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { useProjects } from '@/hooks/useProjects';
import EntryTimeline from '@/components/tracking/EntryTimeline';
import ImpactDashboard from '@/components/tracking/ImpactDashboard';
import PlantHelp from '@/components/tracking/PlantHelp';
import ProgressForm from '@/components/tracking/ProgressForm';
import TrackingSettings from '@/components/tracking/TrackingSettings';
import TrackingUpsell from '@/components/tracking/TrackingUpsell';
import { convertedSqft } from '@/lib/trackingMath';

// One tracked project: connected property, progress form, impact dashboard,
// settings and the update timeline.
export default function TrackedProject() {
  const { id } = useParams();
  const { user } = useAuth();
  const { premium, threeD, loading: accessLoading, refresh } = usePremiumAccess();
  const entitled = premium || threeD;
  const { projects: scanned } = useProjects();
  const [tracked, setTracked] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!entitled || !user?.id) return;
    let alive = true;
    (async () => {
      try {
        const [t, list] = await Promise.all([
          base44.entities.TrackedProject.get(id),
          base44.entities.ProgressEntry.filter({ trackedId: id, created_by_id: user.id }, { sort: 'date', limit: 500 }),
        ]);
        if (!alive) return;
        setTracked(t);
        setEntries(Array.from(list.items || list));
      } catch {
        if (alive) setTracked(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, user?.id, entitled]);

  const update = useCallback(
    async (patch) => {
      const next = await base44.entities.TrackedProject.update(id, patch);
      setTracked((prev) => ({ ...prev, ...patch, ...next }));
    },
    [id],
  );

  // Keep the project's convertedSqft equal to the latest cumulative entry.
  const syncConverted = async (list, patch = {}) => {
    const latest = convertedSqft({}, list);
    await update({ convertedSqft: latest, ...patch });
  };

  const onSaved = async (entry, newestPhotoUri) => {
    const list = [...entries, entry];
    setEntries(list);
    await syncConverted(list, !tracked.coverPhotoUri && newestPhotoUri ? { coverPhotoUri: newestPhotoUri } : {});
  };

  const removeEntry = async (entry) => {
    if (!window.confirm('Delete this progress update?')) return;
    setError('');
    try {
      await base44.entities.ProgressEntry.delete(entry.id);
      const list = entries.filter((e) => e.id !== entry.id);
      setEntries(list);
      await syncConverted(list);
    } catch (e) {
      setError(e?.message || 'Could not delete that update.');
    }
  };

  const reconnect = async (scannedId) => {
    const p = scanned.find((s) => s.id === scannedId);
    if (!p) return;
    setError('');
    try {
      await update({
        projectId: p.id,
        name: p.address,
        address: p.address,
        lawnSqft: Math.round(p.breakdown?.turf || 0),
        center: p.center,
      });
    } catch (e) {
      setError(e?.message || 'Could not change the connected property.');
    }
  };

  if (accessLoading || (entitled && loading)) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entitled) {
    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-10">
        <h1 className="font-display text-3xl tracking-tight">My projects</h1>
        <div className="mt-8">
          <TrackingUpsell onUnlocked={refresh} />
        </div>
      </div>
    );
  }

  if (!tracked) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl">Project not found</h1>
        <Link to="/my-projects" className="mt-4 inline-block text-[13px] underline underline-offset-2">
          Back to My projects
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10">
      <Link to="/my-projects" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> My projects
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs">Tracking since {tracked.startDate ? new Date(`${tracked.startDate}T00:00`).toLocaleDateString() : '—'}</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-[2.4rem]">{tracked.name || tracked.address}</h1>
          <Link to={`/project/${tracked.projectId}`} className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
            View scanned property <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        {scanned.length > 0 && (
          <div>
            <label htmlFor="reconnect" className="label-xs block">Connected property</label>
            <select
              id="reconnect"
              value={tracked.projectId}
              onChange={(e) => reconnect(e.target.value)}
              className="field mt-1.5 h-10 max-w-xs"
            >
              {!scanned.some((p) => p.id === tracked.projectId) && <option value={tracked.projectId}>{tracked.address}</option>}
              {scanned.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                  {scanned.filter((o) => o.address === p.address).length > 1 && p.created_date
                    ? ` · scanned ${new Date(p.created_date).toLocaleDateString()}`
                    : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}

      <div className="mt-8">
        <ImpactDashboard project={tracked} entries={entries} />
      </div>

      <div className="mt-8">
        <PlantHelp
          tracked={tracked}
          project={scanned.find((s) => s.id === tracked.projectId)}
          latestEntry={entries.length ? entries[entries.length - 1] : null}
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <ProgressForm tracked={tracked} lastConverted={convertedSqft({}, entries) || null} onSaved={onSaved} />
        <TrackingSettings key={tracked.id} tracked={tracked} onSave={update} />
      </div>

      <h2 className="mt-10 mb-3 text-[15px] font-medium tracking-tight">Timeline</h2>
      <EntryTimeline entries={entries} onDelete={removeEntry} />
    </div>
  );
}
