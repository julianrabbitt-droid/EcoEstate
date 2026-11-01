import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Leaf, Loader2 } from 'lucide-react';
import { getLawn, getLawnForParcel, measureArea, mergeLawnOutlines } from '@/api/lawnApi';
import { Button } from '@/components/ui/button';
import MethodPicker from '@/components/scan/MethodPicker';
import SatelliteMethod from '@/components/scan/SatelliteMethod';
import UploadMethod from '@/components/scan/UploadMethod';
import LawnApiResult from '@/components/scan/LawnApiResult';
import LawnImpact from '@/components/scan/LawnImpact';
import AutoScanNotice from '@/components/scan/AutoScanNotice';
import ScanFacts from '@/components/scan/ScanFacts';
import { geocodeAddress, geoJsonOuterRings, outlinesToFeatureCollection, zoomForLotSize } from '@/lib/geo';
import { carryBuildingHeights } from '@/lib/gardenLayout';
import AddressAutocomplete from '@/components/scan/AddressAutocomplete';
import { createProject } from '@/lib/projectStore';
import { autoDesign, financials, money, num } from '@/lib/landscapeMath';
import { useAutoScanAccess } from '@/hooks/useAutoScanAccess';
const DEFAULT_CENTER = [37.4422168, -122.1189345]; // Greer Park, Palo Alto
const NO_AREA = { lawnSqft: null, impact: null, updating: false, error: '' };
const US_ONLY = {
  title: 'Automatic lawn measurement is only available in the United States',
  detail: 'Property boundaries and lawn detection cover US addresses only. You can still outline your lawn manually below.',
};
const isOutsideUS = (hit) => Boolean(hit?.countryCode) && hit.countryCode !== 'US';

// Buildings and trees from the lawn API in the project's format: building
// outlines with their measured heights (same order), trees with height and crown.
function scannedStructures(d) {
  const buildings = [];
  const buildingHeightsFt = [];
  for (const f of d?.buildings?.features || []) {
    const ring = geoJsonOuterRings(f.geometry)[0];
    if (!ring) continue;
    buildings.push(ring);
    buildingHeightsFt.push(f.properties?.heightFt ?? null);
  }
  const trees = (d?.trees || []).map((t) => ({ latLng: [t.lat, t.lon], radiusFt: t.radiusFt, heightFt: t.heightFt }));
  const paths = [...(d?.paths?.features || []), ...(d?.nearbyRoads?.features || [])]
    .map((f) => ({ polygonLatLng: geoJsonOuterRings(f.geometry)[0], kind: f.properties?.kind, name: f.properties?.name || null }))
    .filter((p) => p.polygonLatLng);
  return { buildings, buildingHeightsFt, trees, paths };
}

const STEPS = [
  {
    t: 'Measure the lawn',
    d: 'Enter your address and we measure the lawn from aerial imagery, mapping it alongside the buildings, trees and paths around it.',
  },
  {
    t: 'Adjust the outline',
    d: 'Check the lawn map and adjust its outline to fix anything the imagery missed — or trace it yourself, or enter your own size.',
  },
  {
    t: 'Design the replacement',
    d: 'Regional native species matched to your location — swapped one by one and grown to maturity in 3D.',
  },
  {
    t: 'See the payoff',
    d: 'Rebates, water savings, payback and habitat value, then a materials list and a crew to install it.',
  },
  {
    t: 'Track the long-term',
    d: 'Watch the garden mature over 30 years — canopy, habitat and carbon accumulating as the ecosystem takes hold.',
  },
];

const SOURCE_LABEL = {
  auto: 'Auto-detected scan',
  satellite: 'Scanned from satellite imagery',
  streetview: 'Scanned from street view',
  manual: 'Drawn by hand',
  upload: 'Uploaded estimate',
};

export default function Scan() {
  const [query, setQuery] = useState('');
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(17);
  const [loading, setLoading] = useState(false);
  const [place, setPlace] = useState(null);
  const [note, setNote] = useState('');
  const [unavailable, setUnavailable] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [lawnData, setLawnData] = useState(null);
  const [areaCalc, setAreaCalc] = useState(NO_AREA);
  const areaRequest = useRef(0);
  const [editSeed, setEditSeed] = useState(null);
  const [method, setMethod] = useState('satellite');
  const [result, setResult] = useState({ area: 0, source: 'satellite', boundary: [], turf: null });
  const navigate = useNavigate();
  const autoAccess = useAutoScanAccess();
  const sampleFin = useMemo(
    () => financials({ breakdown: { turf: 1200 } }, autoDesign({ countryCode: 'US', state: 'California', zip: '94301', breakdown: { turf: 1200 } })),
    [],
  );

  const buildProject = async (over) =>
    createProject({
      address: place?.label?.split(',').slice(0, 3).join(', ') || query.trim() || 'Greer Park, Palo Alto',
      zip: place?.zip || '',
      city: place?.city || '',
      state: place?.state || '',
      country: place?.country || '',
      countryCode: place?.countryCode || '',
      center,
      boundary: [],
      totalSqft: 0,
      breakdown: { turf: 0, beds: 0, bare: 0 },
      scanSource: 'satellite',
      sun: 'Full sun',
      soil: 'Loam',
      design: [],
      ...over,
    });

  // Look the address up with the lawn-to-native API (GET /v1/lawn). On failure
  // its error message is shown and the user can outline the lawn by hand.
  const scanAddress = async (address, knownHit = null) => {
    setLoading(true);
    setNote('');
    setUnavailable(null);
    setEditSeed(null);
    setAreaCalc(NO_AREA);
    setLawnData(null);
    if (knownHit) {
      setPlace(knownHit);
      setCenter([knownHit.lat, knownHit.lng]);
      setZoom(19);
      if (isOutsideUS(knownHit)) {
        setMethod('satellite');
        setUnavailable(US_ONLY);
        setPhase('manual');
        setLoading(false);
        return;
      }
    }
    setPhase('scanning');
    let found = false;
    try {
      const data = await getLawn(address, knownHit);
      found = true;
      setLawnData(data);
      setCenter([data.location.lat, data.location.lon]);
      setZoom(zoomForLotSize(data.parcel?.areaSqft || 0));
      setPhase('lawn');
    } catch (err) {
      setMethod('satellite');
      setUnavailable({
        title: err.code === 'not_configured' ? 'Automatic lawn detection isn’t set up yet' : 'We couldn’t measure this lawn',
        detail: `${err.message} You can still outline your lawn manually below.`,
      });
      setPhase('manual');
    } finally {
      setLoading(false);
    }
    // City, state and ZIP for the project come from the app's own geocoder.
    // It runs after the API call so the two don't hit Nominatim at once.
    if (!knownHit) {
      try {
        const hit = await geocodeAddress(address);
        if (hit) {
          setPlace(hit);
          if (!found) setCenter([hit.lat, hit.lng]);
          if (!found && isOutsideUS(hit)) setUnavailable(US_ONLY);
        }
      } catch {
        /* place details are optional */
      }
    }
  };

  const handleScan = (e) => {
    e?.preventDefault();
    scanAddress(query.trim() || 'Greer Park, Palo Alto');
  };

  // Re-detect the lawn inside a property line the user adjusted (estimated boundaries).
  const remeasureLawn = async (parcel) => {
    const next = await getLawnForParcel({ parcel, address: lawnData.address, location: lawnData.location });
    setLawnData(next);
  };

  const editLawn = () => {
    const d = lawnData;
    setEditSeed({
      center: [d.location.lat, d.location.lon],
      zoom: zoomForLotSize(d.parcel?.areaSqft || 0),
      lotSizeSqft: d.parcel?.areaSqft || 0,
      lotOutline: geoJsonOuterRings(d.parcel?.geometry)[0] || null,
      initialShapes: geoJsonOuterRings(d.lawn),
      ...scannedStructures(d),
      paths: [],
    });
    setUnavailable(null);
    setMethod('satellite');
    setPhase('manual');
  };

  const confirmLawn = async () => {
    const d = lawnData;
    if (!d || d.lawnSqft < 1) return;
    const confidences = (d.lawn?.features || []).map((f) => f.properties?.confidence).filter((c) => typeof c === 'number');
    const rec = await buildProject({
      address: (place?.label || d.address || '').split(',').slice(0, 3).join(', '),
      center: [d.location.lat, d.location.lon],
      boundary: geoJsonOuterRings(d.lawn),
      totalSqft: d.lawnSqft,
      breakdown: { turf: d.lawnSqft, beds: 0, bare: 0 },
      scanSource: 'auto',
      lotOutline: geoJsonOuterRings(d.parcel?.geometry)[0] || null,
      lotSizeSqft: d.parcel?.areaSqft || 0,
      lawnImpact: d.impact,
      ...scannedStructures(d),
      turf: {
        name: 'Unidentified turf',
        scientific: '',
        confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
        nativeStatus: 'Non-native',
        galPerSqft: 46,
        source: 'auto',
      },
    });
    navigate(`/project/${rec.id}`, { state: { project: rec } });
  };

  // Whenever the drawn lawn outlines change, recalculate size and impact with
  // POST /v1/area (debounced; stale responses are ignored).
  const outlines = method === 'satellite' && phase === 'manual' ? result.boundary : null;
  useEffect(() => {
    const valid = (outlines || []).filter((pts) => pts.length >= 3);
    const id = ++areaRequest.current;
    if (!valid.length) {
      setAreaCalc(NO_AREA);
      return undefined;
    }
    setAreaCalc((prev) => ({ ...prev, updating: true }));
    const timer = setTimeout(async () => {
      try {
        const res = await measureArea(outlinesToFeatureCollection(valid));
        if (id === areaRequest.current) setAreaCalc({ lawnSqft: res.lawnSqft, impact: res.impact, updating: false, error: '' });
      } catch (err) {
        if (id === areaRequest.current) setAreaCalc({ ...NO_AREA, error: err.message });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [outlines]);

  const saveManual = async () => {
    // Drawn lawns that overlap or touch are saved as one lawn group (one shared
    // mulch bed), measured by the lawn API. Falls back to the drawing as-is.
    const merged = result.source === 'satellite' ? await mergeLawnOutlines(result.boundary) : null;
    const area = merged ? merged.lawnSqft : result.area;
    if (area < 1) return;
    const isLawnDirect = result.source === 'upload' || result.source === 'satellite';
    const turfArea = isLawnDirect ? Math.round(area) : Math.round(area * 0.76);
    const turf =
      result.turf ||
      {
        name: 'Tall fescue',
        scientific: 'Festuca arundinacea',
        confidence: 0.72,
        nativeStatus: 'Non-native',
        galPerSqft: 46,
        source: 'imagery',
      };
    const rec = await buildProject({
      boundary: merged?.outlines || result.boundary || [],
      totalSqft: Math.round(area),
      breakdown: {
        turf: turfArea,
        beds: isLawnDirect ? 0 : Math.round(area * 0.15),
        bare: isLawnDirect ? 0 : Math.round(area * 0.09),
      },
      scanSource: result.source,
      features: result.features || [],
      turf,
      lotOutline: result.lotOutline || editSeed?.lotOutline || null,
      lotSizeSqft: editSeed?.lotSizeSqft || 0,
      buildings: result.buildings?.length ? result.buildings : (editSeed?.buildings || []),
      buildingHeightsFt: carryBuildingHeights(
        result.buildings?.length ? result.buildings : (editSeed?.buildings || []),
        editSeed?.buildings,
        editSeed?.buildingHeightsFt,
      ),
      building: editSeed?.building || null,
      trees: result.trees?.length ? result.trees : (editSeed?.trees || []),
      paths: editSeed?.paths || [],
      lawnImpact: merged?.impact || areaCalc.impact || null,
    });
    navigate(`/project/${rec.id}`, { state: { project: rec } });
  };

  const searchKey = `${center[0]},${center[1]}`;
  const showAuto = phase === 'scanning' || phase === 'lawn';
  const measured = result.source === 'satellite' && areaCalc.lawnSqft !== null ? areaCalc.lawnSqft : result.area;
  const turfDisplay = result.source === 'upload' || result.source === 'satellite' ? measured : measured * 0.76;

  return (
    <div>
      <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 pb-16 pt-12 lg:grid-cols-[1fr_1.1fr] lg:items-start lg:pt-20">
        <div className="lg:sticky lg:top-24">
          <span className="label-xs">Scan your lawn</span>
          <h1 className="mt-5 font-display text-[2.3rem] font-normal leading-[1.05] tracking-tight text-foreground sm:text-[2.7rem]">
            Replace your lawn with <em className="italic text-accent">native plants</em>, save thousands.
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            We scan your lawn to measure its size and water use — the starting point for calculating how much water,
            money and habitat you'd gain by replacing it with native plants. Confirm the scan, fine-tune it, or
            upload your own photos, and we'll show the payoff.
          </p>

          <form onSubmit={handleScan} className="mt-9 flex flex-col gap-2.5 sm:flex-row">
            <AddressAutocomplete
              value={query}
              onChange={setQuery}
              onSelect={(hit) => scanAddress(hit.label || query, hit)}
              placeholder="Try Greer Park, Palo Alto"
            />
            <Button type="submit" disabled={loading} className="h-12 rounded-full px-6 text-[15px]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Scan property<ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          </form>
          <p className="mt-3 max-w-md text-[11.5px] leading-relaxed text-muted-foreground">
            Automatic lawn measurement is available for properties in the United States only. Elsewhere, you can
            outline your lawn by hand.
          </p>
          {note && <p className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">{note}</p>}

          {!autoAccess.loading && autoAccess.needsSignIn && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-foreground shadow-sm">
              <Leaf className="h-3.5 w-3.5 text-accent" />
              Sign in to run a free Full Auto Scan
            </div>
          )}

          <dl className="mt-10 grid max-w-md grid-cols-2 gap-x-6 gap-y-5 border-t border-border/70 pt-6">
            {[
              [money(sampleFin.annualSavings), 'saved per year'],
              [`${num(sampleFin.gallonsSaved)} gal`, 'water cut annually'],
              [money(sampleFin.rebate), 'typical rebate'],
              [`${Math.max(1, Math.round(sampleFin.payback))} yr`, 'to pay back'],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="font-display text-2xl tracking-tight">{v}</dt>
                <dd className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{l}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 max-w-md text-[11px] leading-relaxed text-muted-foreground">
            Based on a typical 1,200 sq ft lawn. Your actual savings are computed from your scan.
          </p>
        </div>

        <div className="overflow-hidden rounded-[26px] border border-border bg-card shadow-[0_30px_70px_-40px_rgba(16,35,28,0.55)]">
          {showAuto ? (
            phase === 'scanning' ? (
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                  <Leaf className="h-5 w-5 text-accent" />
                </div>
                <p className="mt-4 font-display text-lg tracking-tight">Scanning the property…</p>
                <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-muted-foreground">
                  Separating the building from the property, then checking its front, back and side grounds for lawn without crossing the estimated boundary. For larger properties this can take up to a minute.
                </p>
                <div className="mt-5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  If no lawn is found, we check other parts of the property before offering drawing.
                </div>
                <ScanFacts />
              </div>
            ) : (
              <LawnApiResult
                data={lawnData}
                onConfirm={confirmLawn}
                onEdit={editLawn}
                onRescan={() => scanAddress(lawnData?.address || query, place)}
                onRemeasure={remeasureLawn}
              />
            )
          ) : (
            <>
              {unavailable && (
                <div className="border-b border-border/70">
                  <AutoScanNotice title={unavailable.title} detail={unavailable.detail} />
                </div>
              )}
              {phase === 'idle' && (
                <div className="border-b border-border/70 bg-secondary/30 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  Enter an address to scan your lawn, or measure it manually below — either way we'll calculate the
                  impact of replacing it with a native garden.
                  {!autoAccess.loading && autoAccess.needsSignIn && (
                    <span className="ml-1 text-foreground">Sign in to run a free Full Auto Scan.</span>
                  )}
                </div>
              )}
              {phase === 'manual' && editSeed && (
                <div className="border-b border-border/70 bg-accent/10 px-4 py-2.5 text-[11px] leading-relaxed text-foreground">
                  The auto-detected lawn is drawn below — drag the corners to fine-tune it, or add a new section. Then hit Analyze this lawn.
                </div>
              )}
              <div className="border-b border-border/70 px-4 py-3">
                <MethodPicker value={method} onChange={setMethod} />
              </div>

              {method === 'satellite' && (
                <SatelliteMethod
                  key={editSeed ? 'edit' : searchKey}
                  center={editSeed?.center || center}
                  zoom={editSeed?.zoom || zoom}
                  lotSizeSqft={editSeed?.lotSizeSqft || 0}
                  lotOutline={editSeed?.lotOutline || null}
                  initialShapes={editSeed?.initialShapes || null}
                  initialTrees={editSeed?.trees || null}
                  initialBuildings={editSeed?.buildings || null}
                  measuredSqft={areaCalc.lawnSqft}
                  onResult={setResult}
                />
              )}
              {method === 'upload' && <UploadMethod onResult={setResult} />}

              {method === 'satellite' && (areaCalc.lawnSqft !== null || areaCalc.updating || areaCalc.error) && (
                <div className="border-t border-border/70 py-4">
                  <LawnImpact {...areaCalc} />
                </div>
              )}

              <div className="border-t border-border/70 px-4 py-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {result.area > 0
                    ? `${SOURCE_LABEL[result.source]} · roughly ${Math.round(turfDisplay).toLocaleString()} sq ft of convertible turf.`
                    : 'Measure your lawn to calculate the convertible square footage.'}
                </p>
                <Button
                  disabled={result.area < 1}
                  onClick={saveManual}
                  className="mt-3 w-full rounded-full"
                  size="lg"
                >
                  Analyze this lawn
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                {phase === 'manual' && lawnData && (
                  <button
                    type="button"
                    onClick={() => setPhase('lawn')}
                    className="mt-2 w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Back to the auto estimate
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="border-t border-border/70 bg-secondary/40 py-16">
        <div className="mx-auto w-full max-w-6xl px-5">
          <span className="label-xs">How it works</span>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <div key={s.t} className="border-t border-border pt-4">
                <span className="font-mono text-[11px] text-accent">0{i + 1}</span>
                <h3 className="mt-2 text-[15px] font-medium tracking-tight">{s.t}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/70 py-16">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 sm:grid-cols-2">
          <div className="surface p-6">
            <div className="flex items-center gap-2">
              <span className="label-xs">Free for everyone</span>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-accent">
                Unlimited
              </span>
            </div>
            <h2 className="mt-3 font-display text-2xl tracking-tight">Scanning and 3D are free.</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              Sign in to run unlimited Full Auto Scans and explore your garden in the full 3D view, including the
              orbit camera and first-person walk-through, at no cost. EcoEstate Pro ($10/month) adds the
              community, project tracking and project exports, and is free for students with a school email. Manual
              outlining, analysis and planning are always free.
            </p>
          </div>

          <div className="surface p-6">
            <span className="label-xs">Support</span>
            <h2 className="mt-3 font-display text-2xl tracking-tight">Need a hand?</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              Questions about a scan, a plant list or a rebate? Email me and I'll help you get the most out of your
              property.
            </p>
            <a
              href="mailto:julianrabbitt@gmail.com"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              julianrabbitt@gmail.com
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}