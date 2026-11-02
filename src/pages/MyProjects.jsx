import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Droplets, Loader2, Plus, Sprout, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { useProjects } from '@/hooks/useProjects';
import { Button } from '@/components/ui/button';
import SignedImage from '@/components/tracking/SignedImage';
import TrackingUpsell from '@/components/tracking/TrackingUpsell';
import { estimatedWaterSavedPerYear, fmtNum, fmtUsd, percentConverted } from '@/lib/trackingMath';
import { useConfirm } from '@/components/ConfirmProvider';

// Paid feature: tracked real-world conversions of the user's scanned properties.
// `?project=<scanned property id>` (from Build / Legacy / My properties) starts
// tracking that property, or opens its existing tracked project.
export default function MyProjects() {
  const confirm = useConfirm();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const wanted = params.get('project');
  const { premium, threeD, loading: accessLoading, refresh } = usePremiumAccess();
  const entitled = premium || threeD;
  const { projects: scanned, loading: scansLoading } = useProjects();
  const [tracked, setTracked] = useState(null);
  const [starting, setStarting] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState('');

  // Stops tracking a property: deletes the tracked project with its progress
  // updates. The scanned property itself is kept.
  const removeTracked = async (t) => {
    if (!(await confirm({ title: `Remove “${t.name || t.address}” from My projects?`, description: 'Its progress updates will be deleted. The scanned property stays in My properties.', confirmLabel: 'Remove' }))) return;
    setRemoving(t.id);
    setError('');
    try {
      const entries = await base44.entities.ProgressEntry.filter({ trackedId: t.id });
      await Promise.all(entries.map((row) => base44.entities.ProgressEntry.delete(row.id)));
      await base44.entities.TrackedProject.delete(t.id);
      setTracked((prev) => prev.filter((x) => x.id !== t.id));
    } catch {
      setError('Could not remove that project. Please try again.');
    }
    setRemoving('');
  };
  const autoStarted = useRef(false);

  useEffect(() => {
    if (!entitled || !user?.id) return;
    base44.entities.TrackedProject.filter({ created_by_id: user.id }, { sort: '-created_date', limit: 50 })
      .then((res) => setTracked(Array.from(res.items || res)))
      .catch(() => setTracked([]));
  }, [entitled, user?.id]);

  const start = async (projectId) => {
    setError('');
    setStarting(projectId);
    try {
      const res = await base44.functions.invoke('startTracking', { projectId });
      navigate(`/my-projects/${res.data.id}`);
    } catch (e) {
      setError(e?.message || 'Could not start tracking this property.');
      setStarting('');
    }
  };

  // Deep link from another page: reuse the existing tracked project, else start one.
  useEffect(() => {
    if (!wanted || !tracked || scansLoading || autoStarted.current) return;
    autoStarted.current = true;
    const existing = tracked.find((t) => t.projectId === wanted);
    if (existing) navigate(`/my-projects/${existing.id}`, { replace: true });
    else if (scanned.some((p) => p.id === wanted)) start(wanted);
  }, [wanted, tracked, scansLoading, scanned]);

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const heading = (
    <div>
      <p className="label-xs">Pro</p>
      <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-[2.4rem]">My projects</h1>
    </div>
  );

  if (!entitled) {
    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-10">
        {heading}
        <div className="mt-8">
          <TrackingUpsell onUnlocked={refresh} />
        </div>
      </div>
    );
  }

  // Scanned properties that are not tracked yet.
  const trackedIds = new Set((tracked || []).map((t) => t.projectId));
  const available = scanned.filter((p) => !trackedIds.has(p.id));

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10">
      {heading}
      <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
        Track the real conversion of a scanned property: progress photos, plants, spending and water savings.
      </p>

      {error && <p className="mt-4 text-[12px] text-destructive">{error}</p>}

      {tracked === null ? (
        <div className="mt-10 flex justify-center py-12">
          <div className="h-7 w-7 rounded-full border-2 border-border border-t-foreground animate-spin" />
        </div>
      ) : (
        <>
          {tracked.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center">
              <Sprout className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-3 text-[14px] font-medium">No projects yet</p>
              <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
                Start tracking one of your scanned properties below.
              </p>
            </div>
          ) : (
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {tracked.map((t) => {
                const pct = percentConverted(t.convertedSqft || 0, t.lawnSqft);
                const water = estimatedWaterSavedPerYear(t.convertedSqft || 0);
                const price = t.waterPricePer1000Gal;
                return (
                  <li key={t.id} className="surface group relative overflow-hidden">
                    <Link to={`/my-projects/${t.id}`} className="block">
                      {t.coverPhotoUri && <SignedImage uri={t.coverPhotoUri} className="h-36 w-full object-cover" />}
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display text-[19px] leading-snug tracking-tight">{t.name || t.address}</p>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${pct ?? 0}%` }} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 pr-10 text-[11.5px] text-muted-foreground">
                          <span>
                            <span className="font-medium text-foreground">{pct == null ? '—' : `${fmtNum(pct, 0)}%`}</span> converted
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Droplets className="h-3 w-3" />
                            <span className="font-medium text-foreground">{fmtNum(water)}</span> gal/yr saved (est.)
                          </span>
                          <span>
                            <span className="font-medium text-foreground">
                              {price > 0 ? fmtUsd((water / 1000) * price) : '—'}
                            </span>{' '}
                            / yr (est.)
                          </span>
                        </div>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeTracked(t)}
                      disabled={removing === t.id}
                      aria-label={`Remove ${t.name || t.address} from My projects`}
                      title="Remove from My projects"
                      className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground transition hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                    >
                      {removing === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <section className="surface mt-8 p-5">
            <h2 className="text-[15px] font-medium tracking-tight">Start a project</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">Pick one of your scanned properties to track.</p>
            {scansLoading ? (
              <Loader2 className="mt-4 h-4 w-4 animate-spin text-muted-foreground" />
            ) : available.length === 0 ? (
              <p className="mt-4 text-[12.5px] text-muted-foreground">
                {scanned.length === 0 ? 'You have no scanned properties yet. ' : 'All your scanned properties are tracked. '}
                <Link to="/" className="underline underline-offset-2">Scan a property</Link>
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border/60">
                {available.map((p) => (
                  <li key={p.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${p.id === wanted ? 'rounded-lg bg-accent/5 px-3' : ''}`}>
                    <div>
                      <p className="text-[13.5px] font-medium">{p.address}</p>
                      <p className="text-[11.5px] text-muted-foreground">{fmtNum(p.breakdown?.turf || 0)} sq ft of lawn</p>
                    </div>
                    <Button size="sm" onClick={() => start(p.id)} disabled={!!starting} className="rounded-full">
                      {starting === p.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                      Track
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
