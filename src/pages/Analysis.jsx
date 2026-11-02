import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Loader2, Sprout } from 'lucide-react';
import StepNav from '@/components/StepNav';
import ScanDiagram from '@/components/ScanDiagram';
import EditScanPanel from '@/components/EditScanPanel';
import { Button } from '@/components/ui/button';
import { updateProject } from '@/lib/projectStore';
import { useProject } from '@/hooks/useProjects';
import { useAutosave } from '@/hooks/useAutosave';
import { num } from '@/lib/landscapeMath';
import FullAutoScanUpsell from '@/components/FullAutoScanUpsell';
import { cleanAddress } from '@/lib/geo';

const TURF_WATER = {
  'Tall fescue': 46,
  'Bermuda grass': 30,
  'St. Augustine': 40,
  'Kentucky bluegrass': 50,
  'Perennial ryegrass': 44,
  'Buffalograss': 18,
  'Unknown grass type': 46,
  'Artificial turf': 0,
};
const TURF_OPTIONS = Object.keys(TURF_WATER);
const SUN_OPTIONS = ['Full sun', 'Part shade', 'Mixed'];
const SOIL_OPTIONS = ['Loam', 'Clay', 'Sandy', 'Unknown'];

function ConfidenceBar({ value }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full bg-accent transition-all"
        style={{ width: `${Math.round((value || 0) * 100)}%` }}
      />
    </div>
  );
}

export default function Analysis() {
  const [searchParams] = useSearchParams();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { project, loading, reload } = useProject(id, location.state);
  const [turf, setTurf] = useState({});
  const [breakdown, setBreakdown] = useState({ turf: 0, beds: 0, bare: 0 });
  const [sun, setSun] = useState('Full sun');
  const [soil, setSoil] = useState('Loam');
  const [zip, setZip] = useState('');
  const [synced, setSynced] = useState(false);
  // Edits save as they happen, so leaving via StepNav or the header keeps them.
  const fields = useMemo(() => ({ breakdown, turf, sun, soil, zip }), [breakdown, turf, sun, soil, zip]);
  const autosave = useAutosave(fields, (patch) => updateProject(id, patch));

  useEffect(() => {
    if (!project || synced) return;
    setTurf(project.turf || {});
    setBreakdown(project.breakdown || { turf: 0, beds: 0, bare: 0 });
    setSun(project.sun || 'Full sun');
    setSoil(project.soil || 'Loam');
    setZip(project.zip || '');
    setSynced(true);
  }, [project, synced]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Opening your scan…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl">This property scan is gone</h1>
        <p className="mt-3 text-sm text-muted-foreground">Sign in to keep your scans saved in My Properties. Start a new one to continue.</p>
        <Button asChild className="mt-6 rounded-full">
          <Link to="/">Scan a property</Link>
        </Button>
      </div>
    );
  }

  const total = Number(breakdown.turf || 0) + Number(breakdown.beds || 0) + Number(breakdown.bare || 0);

  const setArea = (key, value) => {
    autosave.markDirty();
    setBreakdown((prev) => ({ ...prev, [key]: Math.max(0, Math.round(Number(value) || 0)) }));
  };

  const edit = (setter) => (value) => {
    autosave.markDirty();
    setter(value);
  };

  const save = async () => {
    autosave.cancel();
    const next = await updateProject(id, { breakdown, turf, sun, soil, zip });
    navigate(`/project/${id}/design`, { state: { project: next } });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <StepNav projectId={id} project={project} current="scan" />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs">Existing landscape</p>
          <h1 className="mt-2 max-w-xl font-display text-3xl leading-tight tracking-tight sm:text-[2.4rem]">
            {cleanAddress(project.address)}
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {project.scanSource === 'auto'
              ? 'Auto-detected from satellite & records'
              : project.scanSource === 'streetview'
                ? 'Scanned from street view'
                : project.scanSource === 'manual'
                  ? 'Drawn by hand'
                  : project.scanSource === 'upload'
                    ? 'Uploaded estimate'
                    : 'Scanned from satellite imagery'}{' '}
            · {num(project.totalSqft)} sq ft outlined
          </p>
        </div>
        <Button onClick={save} className="rounded-full" size="lg">
          Generate native design
        </Button>
      </div>

      <div className="mt-6 space-y-4">
        <ScanDiagram project={project} />
        <EditScanPanel
          project={project}
          defaultOpen={searchParams.get('edit') === '1'}
          onApplied={() => {
            autosave.cancel();
            setSynced(false);
            reload();
          }}
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <section className="surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-medium tracking-tight">Landscape breakdown</h2>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[12px] text-muted-foreground">
              imagery estimate
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Correct anything the imagery got wrong. The convertible turf drives water, cost and plant counts.
          </p>

          <div className="mt-5 space-y-3">
            {[
              ['turf', 'Turf / lawn', '#a8a06a'],
              ['beds', 'Ornamental beds', '#7d8f6e'],
              ['bare', 'Bare soil or gravel', '#c2b191'],
            ].map(([key, label, color]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                <label className="flex-1 text-[13px]">{label}</label>
                <input
                  type="number"
                  min={0}
                  value={breakdown[key] ?? 0}
                  onChange={(e) => setArea(key, e.target.value)}
                  className="field h-10 w-28 text-right text-[13px]"
                />
                <span className="w-8 text-[11px] text-muted-foreground">sq ft</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3 text-[12.5px]">
            <span className="text-muted-foreground">Total measured</span>
            <span className="font-medium">{num(total)} sq ft</span>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-primary px-3.5 py-2.5 text-primary-foreground">
            <span className="text-[12px] text-primary-foreground/70">Convertible</span>
            <span className="font-display text-lg">{num(breakdown.turf)} sq ft</span>
          </div>
        </section>

        <section className="surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-medium tracking-tight">What grows there</h2>
            <span className="text-[12px] text-muted-foreground">
              {turf.source === 'camera' ? 'confirmed by camera' : 'estimated'}
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4">
            <div className="flex items-baseline justify-between">
              <p className="font-display text-xl tracking-tight">{turf.name || 'Unknown turf'}</p>
              <span className="text-[13px] font-medium text-accent">
                {Math.round((turf.confidence || 0.72) * 100)}%
              </span>
            </div>
            <p className="mt-0.5 font-display text-[12.5px] italic text-muted-foreground">
              {turf.scientific || 'Festuca arundinacea'}
            </p>
            <ConfidenceBar value={turf.confidence ?? 0.72} />
            <div className="mt-3 flex flex-wrap gap-1.5 text-[10.5px]">
              <span className="rounded-full bg-card px-2 py-0.5">{turf.nativeStatus || 'Non-native'}</span>
              <span className="rounded-full bg-card px-2 py-0.5">{turf.galPerSqft ?? 46} gal / sq ft / yr</span>
            </div>
            {turf.note && <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">{turf.note}</p>}
            {turf.name === 'Artificial turf' && (
              <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11.5px] leading-relaxed text-foreground">
                <p className="font-medium text-destructive">Artificial turf isn't a free pass.</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                  <li>It can be 40–60°F hotter than real grass on a sunny day and radiates heat back at the house.</li>
                  <li>No roots, no infiltration: rain runs off instead of soaking in, which strains storm drains.</li>
                  <li>It sheds microplastics and needs infill replaced every few years.</li>
                  <li>It supports no soil life, no pollinators, and no birds. It’s a dead patch in the yard.</li>
                </ul>
              </div>
            )}
          </div>

          <label className="mt-4 block text-[12px] text-muted-foreground">
            Or input your own values
          </label>
          <div className="mt-1.5 flex gap-2">
            <select
              value={TURF_OPTIONS.includes(turf.name) ? turf.name : ''}
              onChange={(e) => edit(setTurf)((prev) => ({ ...prev, name: e.target.value, galPerSqft: TURF_WATER[e.target.value], confidence: 1, source: 'manual' }))}
              className="field flex-1"
            >
              <option value="">Select turf species…</option>
              {TURF_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={turf.galPerSqft ?? 46}
              onChange={(e) => edit(setTurf)((prev) => ({ ...prev, galPerSqft: Math.max(0, Number(e.target.value) || 0) }))}
              className="field h-11 w-28 text-right text-[13px]"
              aria-label="Water use in gallons per square foot per year"
            />
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
            Pick a species to auto-fill its typical water use, or enter your own gal / sq ft / yr.
          </p>
        </section>

        <section className="surface p-5 lg:col-span-2">
          <h2 className="text-[15px] font-medium tracking-tight">Site conditions</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Sun and soil help guide planting. Your property's country, state and postal code set the regional native palette.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[12px] text-muted-foreground">Sun exposure</label>
              <div className="mt-1.5 flex gap-1.5">
                {SUN_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => edit(setSun)(option)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-[11.5px] transition ${
                      sun === option ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/30'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] text-muted-foreground">Soil</label>
                <select value={soil} onChange={(e) => edit(setSoil)(e.target.value)} className="field mt-1.5">
                  {SOIL_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground">ZIP / postal code</label>
                <input value={zip} onChange={(e) => edit(setZip)(e.target.value)} placeholder="95126" className="field mt-1.5" />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
            <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-accent" />
              Everything here is editable later. Nothing is locked in.
            </p>
            <Button onClick={save} className="rounded-full">
              <Sprout className="mr-2 h-4 w-4" />
              Generate native design
            </Button>
          </div>
        </section>
      </div>

      <div className="mt-6">
        <FullAutoScanUpsell />
      </div>
    </div>
  );
}