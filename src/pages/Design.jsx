import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2, Minus, Plus, Trash2, X } from 'lucide-react';
import Garden3DView from '@/components/Garden3DView';
import PhotoCompare from '@/components/PhotoCompare';
import PlantCard from '@/components/PlantCard';

import StepNav from '@/components/StepNav';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { GOALS, matchesGoal, plantById } from '@/data/nativePlants';
import { plantsForProject } from '@/data/regions';
import NativeSourcePanel from '@/components/NativeSourcePanel';
import { autoPlan, clearanceOf, fitDesignToArea, money, mulchPerPlant, mulchTotals, num, plantTotals, quantityForShare, suggestedQuantity } from '@/lib/landscapeMath';
import { updateProject } from '@/lib/projectStore';
import { useProject } from '@/hooks/useProjects';
import { usePlantPhotos } from '@/hooks/usePlantPhotos';
import { useAutosave } from '@/hooks/useAutosave';

export default function Design() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { project, loading } = useProject(id, location.state);
  const [entries, setEntries] = useState([]);
  const [goals, setGoals] = useState([]);
  const [arrangement, setArrangement] = useState(null);
  // Edits save as they happen, so leaving via StepNav or the header keeps them.
  const autosave = useAutosave(entries, (design) => updateProject(id, { design, nativeListAdjusted: false }));

  useEffect(() => {
    if (!project) return;
    if (project.design?.length) {
      setEntries(fitDesignToArea(project.design, project.breakdown?.turf || 0));
      return;
    }
    // A new design: small lawns start from the fullest planting formation.
    const plan = autoPlan(project);
    setEntries(fitDesignToArea(plan.entries, project.breakdown?.turf || 0));
    setArrangement(plan.arrangement?.id ?? null);
  }, [project]);

  // The house's wall colour from a street photo, looked up once per property
  // (only when the server has a Google Maps key) and saved on the project.
  const [wallColor, setWallColor] = useState(null);
  useEffect(() => {
    if (!project || project.building?.wallColor || project.wallColorChecked) return undefined;
    const ring = project.buildings?.[0];
    let point = Array.isArray(ring) && ring.length
      ? ring.reduce((acc, p) => [acc[0] + p[0] / ring.length, acc[1] + p[1] / ring.length], [0, 0])
      : project.center;
    if (!Array.isArray(point)) return undefined;
    if (Math.abs(point[0]) > 90) point = [point[1], point[0]]; // stored as [lng, lat]
    let cancelled = false;
    base44.functions
      .invoke('houseColor', { building: point })
      .then(({ data }) => {
        if (cancelled || !data?.available) return; // no key on the server: try again later
        if (data.wallColor) setWallColor(data.wallColor);
        updateProject(id, {
          building: { ...(project.building || {}), ...(data.wallColor ? { wallColor: data.wallColor, wallColorSource: 'street-view', wallPhotoDate: data.panoDate || null } : {}) },
          wallColorChecked: data.reason !== 'daily limit' && data.reason !== 'lookup failed',
        }).catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project, id]);
  const viewProject = useMemo(
    () => (project && wallColor ? { ...project, building: { ...(project.building || {}), wallColor } } : project),
    [project, wallColor]
  );

  const regionPlants = useMemo(() => plantsForProject(project), [project]);

  const filtered = useMemo(() => {
    if (!goals.length) return regionPlants;
    return regionPlants.filter((plant) => goals.some((goal) => matchesGoal(plant, goal)));
  }, [goals, regionPlants]);

  // Small plants form the default palette; larger shrubs and trees are offered
  // separately so a user can add them when the site has room.
  const { smallPlants, largePlants } = useMemo(() => {
    const small = [];
    const large = [];
    filtered.forEach((plant) => {
      if (plant.form === 'tree' || clearanceOf(plant) >= 5) large.push(plant);
      else small.push(plant);
    });
    return { smallPlants: small, largePlants: large };
  }, [filtered]);

  const photos = usePlantPhotos(filtered);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Opening your design…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl">This property scan is gone</h1>
        <Button asChild className="mt-6 rounded-full">
          <Link to="/">Scan a property</Link>
        </Button>
      </div>
    );
  }

  const turfSqft = project.breakdown?.turf || 0;
  // The property's name: the place name or street address, before the city.
  const nameParts = String(project.address || '').split(',').map((p) => p.trim()).filter(Boolean);
  const propertyName =
    (/^\d+[a-z]?$/i.test(nameParts[0] || '') && nameParts[1] ? `${nameParts[0]} ${nameParts[1]}` : nameParts[0]) || 'Your property';
  const totals = plantTotals(entries);
  const mulch = mulchTotals(entries);

  const togglePlant = (speciesId) => {
    autosave.markDirty();
    setEntries((prev) =>
      prev.some((entry) => entry.speciesId === speciesId)
        ? prev.filter((entry) => entry.speciesId !== speciesId)
        : [...prev, { speciesId, quantity: suggestedQuantity(speciesId, turfSqft, prev.length + 1) }]
    );
  };

  const setQuantity = (speciesId, delta) => {
    autosave.markDirty();
    setEntries((prev) =>
      prev
        .map((entry) =>
          entry.speciesId === speciesId ? { ...entry, quantity: Math.max(0, entry.quantity + delta) } : entry
        )
        .filter((entry) => entry.quantity > 0)
    );
  };

  const save = async () => {
    autosave.cancel();
    const next = await updateProject(id, { design: entries, nativeListAdjusted: false });
    navigate(`/project/${id}/impact`, { state: { project: next } });
  };

  const applyArrangement = (arr) => {
    const picks = arr.species.map((s) => ({
      speciesId: s.speciesId,
      quantity: quantityForShare(s.share, s.speciesId, turfSqft),
    }));
    autosave.markDirty();
    setEntries(picks);
    setArrangement(arr.id);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <StepNav projectId={id} project={project} current="design" />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs">Native design</p>
          <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-[2.4rem]">
            {propertyName}, <em className="italic text-accent">reimagined</em>
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {num(turfSqft)} sq ft of lawn becomes native garden · {totals.speciesCount} species · {totals.count} plants · {money(totals.cost)} in plants
          </p>
          {project.nativeListAdjusted && (
            <p className="mt-2 max-w-lg text-[12px] text-muted-foreground">
              This preview corrects an older plant list to match your location. Your saved choices stay unchanged until you continue with See the payoff.
            </p>
          )}
        </div>
        <Button onClick={save} className="rounded-full" size="lg">
          See the payoff
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <section className="surface p-4">
          <Garden3DView
            entries={entries}
            project={viewProject}
            activeArrangement={arrangement}
            onApplyArrangement={applyArrangement}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/60 px-4 py-3">
            <p className="text-[13px] text-foreground">Lawn, house or trees not quite right?</p>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to={`/project/${id}?edit=1`} state={{ project }}>
                Edit the scan
              </Link>
            </Button>
          </div>
        </section>

        <section className="surface p-5 lg:sticky lg:top-24">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-medium tracking-tight">Your planting list</h2>
            <span className="text-[11px] text-muted-foreground">{totals.count} plants</span>
          </div>

          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => {
                autosave.markDirty();
                setEntries([]);
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground transition hover:border-destructive/40 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              Clear all plants
            </button>
          )}

          {entries.length === 0 ? (
            <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">
              Add species below and they appear in the garden view at their mature size.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border/70">
              {entries.map((entry) => {
                const plant = plantById(entry.speciesId);
                if (!plant) return null;
                return (
                  <li key={entry.speciesId} className="flex items-center gap-2.5 py-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: plant.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium leading-tight">{plant.common}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {money(plant.cost)} ea · {money(plant.cost * entry.quantity)}
                      </p>
                      <p className="text-[10.5px] text-muted-foreground/80">
                        ≈{mulchPerPlant(plant).toFixed(1)} cu ft mulch/plant
                      </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-full border border-border">
                      <button
                        type="button"
                        onClick={() => setQuantity(entry.speciesId, -1)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                        aria-label={`One fewer ${plant.common}`}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center text-[11.5px] tabular-nums">{entry.quantity}</span>
                      <button
                        type="button"
                        onClick={() => setQuantity(entry.speciesId, 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                        aria-label={`One more ${plant.common}`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePlant(entry.speciesId)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${plant.common}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3">
            <span className="text-[12px] text-muted-foreground">Plants</span>
            <span className="font-display text-lg">{money(totals.cost)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">Mulch (3" layer)</span>
            <span className="text-[12px] tabular-nums text-foreground">
              {num(mulch.cuft)} cu ft · {num(mulch.bags)} bags
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Installation and drip irrigation are added on the next screen.
          </p>
        </section>
      </div>

      <section className="mt-9 surface p-5">
        <p className="label-xs">Before / after</p>
        <h2 className="mt-1.5 font-display text-2xl tracking-tight">See it on your own photos</h2>
        <p className="mt-1.5 max-w-2xl text-[13px] text-muted-foreground">
          Upload a current photo of the yard and we'll render the same view planted with your native palette, then let you drag between the two.
        </p>
        <div className="mt-4">
          <PhotoCompare entries={entries} />
        </div>
      </section>

      <section className="mt-9">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-xs">Recommended for your location</p>
            <h2 className="mt-1.5 font-display text-2xl tracking-tight">Species worth planting here</h2>
            <div className="mt-3 max-w-md">
              <NativeSourcePanel project={project} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GOALS.map((goal) => {
              const active = goals.includes(goal.id);
              return (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() =>
                    setGoals((prev) => (active ? prev.filter((g) => g !== goal.id) : [...prev, goal.id]))
                  }
                  className={`rounded-full border px-3 py-1.5 text-[11.5px] transition ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground'
                  }`}
                >
                  {goal.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {smallPlants.map((plant) => (
            <PlantCard
              key={plant.id}
              plant={plant}
              selected={entries.some((entry) => entry.speciesId === plant.id)}
              onToggle={togglePlant}
              photo={photos[plant.id]}
            />
          ))}
        </div>

        {largePlants.length > 0 && (
          <div className="mt-8">
            <p className="label-xs">Larger plants & trees</p>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
              Add these only if the yard has room. They anchor a corner or screen a fence and are skipped on small lawns to keep the planting dense.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {largePlants.map((plant) => (
                <PlantCard
                  key={plant.id}
                  plant={plant}
                  selected={entries.some((entry) => entry.speciesId === plant.id)}
                  onToggle={togglePlant}
                  photo={photos[plant.id]}
                />
              ))}
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            {regionPlants.length === 0
              ? 'A verified native plant list is not available for this location yet. Check the botanical sources above; we do not substitute plants from California or another region.'
              : 'No species match those goals. Remove a filter to widen the list.'}
          </p>
        )}
      </section>
    </div>
  );
}