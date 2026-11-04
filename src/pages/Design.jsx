import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Minus, Plus, Trash2, X } from 'lucide-react';
import { StageAside, StageOverlay, StageTitle, useStage, useStagePanels, useWide } from '@/components/ProjectStage';
import PhotoCompare from '@/components/PhotoCompare';
import PlantCard from '@/components/PlantCard';

import StepNav from '@/components/StepNav';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { GOALS, matchesGoal, plantById } from '@/data/nativePlants';
import { plantsForProject } from '@/data/regions';
import NativeSourcePanel from '@/components/NativeSourcePanel';
import { autoPlan, bedMulch, clearanceOf, fitDesignToArea, money, num, plantTotals, quantityForShare, suggestedQuantity } from '@/lib/landscapeMath';
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
  const wide = useWide();
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

  // The garden fills the screen (the steps' shared 3D view); the planting
  // list floats beside it.
  const applyRef = useRef(null);
  const onApplyArrangement = useCallback((arr) => applyRef.current?.(arr), []);
  // The side panel's two tabs: the planting list, and the arrangements (the
  // 3D view draws those into arrEl, in the panel, rather than over the garden).
  const { asideOpen } = useStagePanels() || { asideOpen: true };
  const [panelTab, setPanelTab] = useState('plants');
  const [arrEl, setArrEl] = useState(null);
  const panelShown = wide && asideOpen;
  useStage(
    loading ? null : !project ? { missing: true } : { project: viewProject, entries, scene: 'design', viewShift: panelShown ? [-230, 40] : [0, 40], activeArrangement: arrangement, onApplyArrangement, arrangementsEl: panelShown ? arrEl : null },
    [loading, project, viewProject, entries, panelShown, arrangement, onApplyArrangement, arrEl],
  );

  // The density slider while it's being dragged: the counts the drag started
  // from, and the value under the thumb.
  const densityDrag = useRef(null);
  const [densityDraft, setDensityDraft] = useState(null);

  if (loading) return null;

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
  const mulch = bedMulch(turfSqft);

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

  // Plant density: the share of the lawn the grown plants cover. A drag works
  // from the counts it started with (rescaling already-rounded counts drifts),
  // keeps the mix by sharing plants out by largest remainder, so the counts
  // add up to exactly the total the slider asks for, and leaves every species
  // at least one plant.
  const coverOf = (list) => list.reduce((a, e) => a + e.quantity * clearanceOf(plantById(e.speciesId)) ** 2, 0) / Math.max(1, turfSqft);
  const cover = Math.round(Math.min(1.2, coverOf(entries)) * 100);
  const setCover = (percent) => {
    autosave.markDirty();
    setDensityDraft(percent);
    if (!densityDrag.current) densityDrag.current = entries;
    const base = densityDrag.current;
    const baseCover = coverOf(base);
    if (!baseCover || !base.length) return;
    const raw = base.map((e) => (e.quantity * percent) / 100 / baseCover);
    const total = Math.max(base.length, Math.round(raw.reduce((a, b) => a + b, 0)));
    const scale = total / (raw.reduce((a, b) => a + b, 0) || 1);
    const share = raw.map((r) => r * scale);
    const counts = share.map(Math.floor);
    let left = total - counts.reduce((a, b) => a + b, 0);
    for (const [, i] of share.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0])) {
      if (left <= 0) break;
      counts[i]++;
      left--;
    }
    // Every species keeps at least one plant, taken from the most numerous.
    counts.forEach((c, i) => {
      if (c > 0) return;
      const most = counts.indexOf(Math.max(...counts));
      counts[most]--;
      counts[i] = 1;
    });
    setEntries(base.map((e, i) => ({ ...e, quantity: counts[i] })));
  };
  const endDensityDrag = () => {
    densityDrag.current = null;
    setDensityDraft(null);
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
  applyRef.current = applyArrangement;

  return (
    <div>
      <StageOverlay>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 sm:p-5">
          <div className="pointer-events-auto inline-block max-w-full"><StepNav projectId={id} project={project} current="design" /></div>
          <StageTitle
            below={[{ label: 'Planting list', heading: 'Your planting list', only: 'phone' }, { label: 'Before & after', heading: 'Before / after' }, { label: 'Plants for your area', heading: 'Species worth planting here' }, { label: 'Trees & shrubs', heading: 'Larger plants & trees', only: 'wide' }]}
            title={(
              <h1 className="font-display text-[1.6rem] leading-tight tracking-tight sm:text-[2rem]">
                {propertyName}, <em className="italic text-accent">reimagined</em>
              </h1>
            )}
          >
            <p className="text-[12.5px] text-muted-foreground">
              {num(turfSqft)} sq ft of lawn becomes native garden · {totals.speciesCount} species · {totals.count} plants · {money(totals.cost)} in plants
            </p>
            {project.nativeListAdjusted && (
              <p className="mt-1.5 max-w-lg text-[11.5px] text-muted-foreground">
                This preview corrects an older plant list to match your location. Your saved choices stay unchanged until you continue with See the payoff.
              </p>
            )}
          </StageTitle>
        </div>
        <StageAside
          label="Your garden"
          summary={`${totals.count} plants`}
          width="w-[26rem]"
          footer={(
            <>
              <Button onClick={save} className="w-full rounded-full" size="lg">
                See the payoff
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Link to={`/project/${id}?edit=1`} state={{ project }} className="block text-center text-[12px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
                3D not right? Fix the 2D plan
              </Link>
            </>
          )}
        >
          <div role="tablist" aria-label="Garden panel" className="mb-4 flex rounded-full border border-border bg-background/40 p-0.5 text-[12px]">
            {[['plants', `Planting list · ${totals.count}`], ['arrangements', 'Arrangements & ideas']].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={panelTab === k} onClick={() => setPanelTab(k)} className={`flex-1 rounded-full px-3 py-1.5 transition ${panelTab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {l}
              </button>
            ))}
          </div>
          <div ref={setArrEl} role="tabpanel" hidden={panelTab !== 'arrangements'} />
          <div role="tabpanel" hidden={panelTab !== 'plants'}>
          {entries.length > 0 && turfSqft > 0 && (
            <label className="mt-3 block">
              <span className="flex items-baseline justify-between text-[12px]">
                <span className="text-foreground">Plant density</span>
                <span className="text-muted-foreground">{totals.count} plants · {cover}% of the lawn covered when grown</span>
              </span>
              <input
                type="range"
                min={25}
                max={100}
                step={5}
                value={densityDraft ?? Math.max(25, Math.min(100, cover))}
                onChange={(e) => setCover(Number(e.target.value))}
                onPointerUp={endDensityDrag}
                onBlur={endDensityDrag}
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
        </StageAside>
      </StageOverlay>

      <div id="step-details" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-10">
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
                <span className="text-muted-foreground">{totals.count} plants · {cover}% of the lawn covered when grown</span>
              </span>
              <input
                type="range"
                min={25}
                max={100}
                step={5}
                value={densityDraft ?? Math.max(25, Math.min(100, cover))}
                onChange={(e) => setCover(Number(e.target.value))}
                onPointerUp={endDensityDrag}
                onBlur={endDensityDrag}
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
          <div className="w-full min-w-0 sm:w-auto">
            <p className="label-xs">Recommended for your location</p>
            <h2 className="mt-1.5 font-display text-2xl tracking-tight">Species worth planting here</h2>
            <div className="mt-3 w-full max-w-md">
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