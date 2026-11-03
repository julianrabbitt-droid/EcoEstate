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
import { cleanAddress } from '@/lib/geo';

export default function Design() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { project, loading } = useProject(id, location.state);
  // Wide screens keep the planting list beside the garden, so the view shifts left.
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= 1024);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
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
  const nameParts = cleanAddress(project.address).split(',').map((p) => p.trim()).filter(Boolean);
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

  // Plant density: the share of the lawn the grown plants cover. Moving the
  // slider scales every species' count together, so the mix stays the same.
  const coverOf = (list) => list.reduce((a, e) => a + e.quantity * clearanceOf(plantById(e.speciesId)) ** 2, 0) / Math.max(1, turfSqft);
  const cover = Math.round(Math.min(1.2, coverOf(entries)) * 100);
  const setCover = (percent) => {
    autosave.markDirty();
    setEntries((prev) => {
      const now = coverOf(prev);
      if (!now) return prev;
      const k = percent / 100 / now;
      return prev.map((e) => ({ ...e, quantity: Math.max(1, Math.round(e.quantity * k)) }));
    });
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
    <div>
      {/* The garden fills the screen; the planting list floats beside it. */}
      <section className="relative h-[calc(100svh-4rem)] min-h-[560px] overflow-hidden">
        <Garden3DView
          entries={entries}
          project={viewProject}
          activeArrangement={arrangement}
          onApplyArrangement={applyArrangement}
          fill
          viewShift={wide ? [-230, 40] : [0, 40]}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 sm:p-5">
          <div className="pointer-events-auto inline-block max-w-full"><StepNav projectId={id} project={project} current="design" /></div>
          <div className="pointer-events-auto mt-3 w-fit max-w-[min(34rem,calc(100vw-1.5rem))] rounded-2xl border border-border/60 bg-card/85 px-4 py-3 shadow-lg backdrop-blur-md lg:max-w-[calc(100vw-30rem)]">
            <h1 className="font-display text-[1.6rem] leading-tight tracking-tight sm:text-[2rem]">
              {propertyName}, <em className="italic text-accent">reimagined</em>
            </h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {num(turfSqft)} sq ft of lawn becomes native garden · {totals.speciesCount} species · {totals.count} plants · {money(totals.cost)} in plants
            </p>
            {project.nativeListAdjusted && (
              <p className="mt-1.5 max-w-lg text-[11.5px] text-muted-foreground">
                This preview corrects an older plant list to match your location. Your saved choices stay unchanged until you continue with See the payoff.
              </p>
            )}
          </div>
        </div>
        <aside className="absolute bottom-3 right-3 top-3 z-20 hidden w-[26rem] flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/92 shadow-2xl backdrop-blur-md lg:flex">
          <div className="flex-1 overflow-y-auto p-5">

          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-medium tracking-tight">Your planting list</h2>
            <span className="text-[11px] text-muted-foreground">{totals.count} plants</span>
          </div>

          {entries.length > 0 && turfSqft > 0 && (
            <label className="mt-3 block">
              <span className="flex items-baseline justify-between text-[12px]">
                <span className="text-foreground">Plant density</span>
                <span className="text-muted-foreground">{cover}% of the lawn covered when grown</span>
              </span>
              <input
                type="range"
                min={25}
                max={100}
                step={5}
                value={Math.max(25, Math.min(100, cover))}
                onChange={(e) => setCover(Number(e.target.value))}
                className="mt-1.5 w-full accent-[hsl(var(--primary))]"
                aria-label="Plant density"
              />
              <span className="flex justify-between text-[10.5px] text-muted-foreground">
                <span>Sparse, lower cost</span>
                <span>Full</span>
              </span>
            </label>
          )}

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

          </div>
          <div className="border-t border-border/70 p-4">
            <Button onClick={save} className="w-full rounded-full" size="lg">
              See the payoff
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Link to={`/project/${id}?edit=1`} state={{ project }} className="mt-2 block text-center text-[12px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
              3D not right? Fix the 2D plan
            </Link>
          </div>
        </aside>
      </section>

      <div className="mx-auto w-full max-w-6xl px-5 py-10">
        {/* Phones: the planting list below the garden. */}
        <section className="surface p-5 lg:hidden">

          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-medium tracking-tight">Your planting list</h2>
            <span className="text-[11px] text-muted-foreground">{totals.count} plants</span>
          </div>

          {entries.length > 0 && turfSqft > 0 && (
            <label className="mt-3 block">
              <span className="flex items-baseline justify-between text-[12px]">
                <span className="text-foreground">Plant density</span>
                <span className="text-muted-foreground">{cover}% of the lawn covered when grown</span>
              </span>
              <input
                type="range"
                min={25}
                max={100}
                step={5}
                value={Math.max(25, Math.min(100, cover))}
                onChange={(e) => setCover(Number(e.target.value))}
                className="mt-1.5 w-full accent-[hsl(var(--primary))]"
                aria-label="Plant density"
              />
              <span className="flex justify-between text-[10.5px] text-muted-foreground">
                <span>Sparse, lower cost</span>
                <span>Full</span>
              </span>
            </label>
          )}

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

          <Button onClick={save} className="mt-4 w-full rounded-full" size="lg">
            See the payoff
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </section>

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
    </div>
  );
}