import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Leaf, Loader2 } from 'lucide-react';
import { getLawn, getLawnForParcel, locateAddress, measureArea, mergeLawnOutlines } from '@/api/lawnApi';
import LocationConfirm from '@/components/scan/LocationConfirm';
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
import { autoDesign, financials, money } from '@/lib/landscapeMath';
import { useAutoScanAccess } from '@/hooks/useAutoScanAccess';
import { usePageMeta } from '@/hooks/usePageMeta';
// "920, Moreno Avenue, Palo Alto, Santa Clara County, …" -> "920 Moreno Avenue, Palo Alto".
function shortAddress(label) {
  const parts = String(label || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (/^\d+[a-z]?$/i.test(parts[0] || '') && parts[1]) parts.splice(0, 2, `${parts[0]} ${parts[1]}`);
  return parts.slice(0, 2).join(', ');
}

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
  { t: 'Scan your lawn', d: 'Enter an address and we outline the lawn from aerial imagery. Adjust it if anything’s off.' },
  { t: 'Design a native garden', d: 'Plants that belong in your area, laid out on your lawn in 3D.' },
  { t: 'See the payoff', d: 'Water and money saved, local rebates, the cost to install, and a plan to build it.' },
];

// Kept to differences that hold generally; specifics depend on the plants chosen.
const COMPARISON = [
  ['Water', 'Needs regular watering through dry months', 'Little extra water once established, when plants suit your area'],
  ['Wildlife', 'Feeds almost no local insects or birds', 'Food and shelter for local pollinators and birds'],
  ['Upkeep', 'Weekly mowing, fertilizer and weed control', 'No mowing; some weeding and seasonal pruning'],
  ['Cost', 'Cheap to keep as is, but water and mowing never stop', 'Costs money to install; lower ongoing costs, often with rebates'],
  ['Look', 'Uniform green, brown in drought', 'Changing color, flowers and texture through the year'],
];

const SOURCE_LABEL = {
  auto: 'Auto-detected scan',
  satellite: 'Scanned from satellite imagery',
  streetview: 'Scanned from street view',
  manual: 'Drawn by hand',
  upload: 'Uploaded estimate',
};

export default function Scan() {
  usePageMeta();
  const [query, setQuery] = useState('');
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(17);
  const [loading, setLoading] = useState(false);
  const [place, setPlace] = useState(null);
  const [note, setNote] = useState('');
  const [unavailable, setUnavailable] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | locating | confirm | scanning | lawn | manual
  const [pending, setPending] = useState(null); // { address, hit } waiting for "is this your property?"
  const [lawnData, setLawnData] = useState(null);
  const [areaCalc, setAreaCalc] = useState(NO_AREA);
  const areaRequest = useRef(0);
  // The scan of the shown pin starts while the person is still confirming it,
  // so it is usually done by the time they click; a moved pin scans afresh.
  const earlyScan = useRef(null); // { key, promise }
  const scanKey = (address, hit) => `${address}|${hit?.lat}|${hit?.lng}|${hit?.osm || ''}`;
  const [editSeed, setEditSeed] = useState(null);
  const [method, setMethod] = useState('satellite');
  const [result, setResult] = useState({ area: 0, source: 'satellite', boundary: [], turf: null });
  const navigate = useNavigate();
  const autoAccess = useAutoScanAccess();
  // An honest range from the app's own model for common lawn sizes, rather
  // than one confident number: yearly savings next to what installing costs.
  const sampleRange = useMemo(() => {
    const at = (turf) => {
      const p = { countryCode: 'US', state: 'California', zip: '94301', breakdown: { turf } };
      return financials(p, autoDesign(p));
    };
    const [small, large] = [at(800), at(2000)];
    // 30 years of savings with costs rising 3% a year (the Payoff step's assumption).
    const thirty = (yearly) => Math.round((yearly * (1.03 ** 30 - 1)) / 0.03 / 1000) * 1000;
    return {
      save: [small.annualSavings, large.annualSavings],
      cost: [small.totalCost, large.totalCost],
      lifetime: [thirty(small.annualSavings), thirty(large.annualSavings)],
    };
  }, []);

  const buildProject = async (over) =>
    createProject({
      address: place?.short || shortAddress(place?.label) || query.trim() || 'Your property',
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
      const early = earlyScan.current;
      earlyScan.current = null;
      const data = await (early && early.key === scanKey(address, knownHit) ? early.promise : getLawn(address, knownHit));
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

  // First find where the address is and ask the person to confirm (or move
  // the pin onto) their property; the scan only runs on a confirmed spot.
  const locate = async (address, knownHit = null) => {
    setNote('');
    setUnavailable(null);
    let hit = knownHit;
    if (!hit) {
      setLoading(true);
      setPhase('locating');
      try {
        hit = await geocodeAddress(address);
      } catch {
        hit = null;
      } finally {
        setLoading(false);
      }
    }
    const hasPoint = hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng);
    // A street address (not a named site with its own outline) is moved onto the
    // county's published address point when there is one. If our quick lookup
    // missed the address entirely, the lawn service looks it up instead.
    if (!hasPoint || (hit.outlineKind !== 'site' && /^\s*\d/.test(address))) {
      setLoading(true);
      setPhase('locating');
      try {
        const found = await locateAddress(address, hasPoint ? hit : null);
        if (hasPoint) {
          if (found.accuracy === 'address_point' && found.movedM > 3) hit = { ...hit, lat: found.lat, lng: found.lon, osm: undefined, accuracy: 'address_point' };
        } else {
          hit = { lat: found.lat, lng: found.lon, label: found.label || address, zip: found.zip || '', city: found.city || '', state: found.state || '', countryCode: 'US', country: 'United States', outline: null, outlineKind: 'unknown', accuracy: found.accuracy };
        }
      } catch {
        /* keep the quick lookup's point; the person can still move the pin */
      } finally {
        setLoading(false);
      }
    }
    if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) {
      // Nothing found anywhere: scan directly so the lawn service's message is shown.
      scanAddress(address);
      return;
    }
    setPlace(hit);
    setCenter([hit.lat, hit.lng]);
    setPending({ address, hit });
    if (!isOutsideUS(hit) && !autoAccess.needsSignIn) {
      const promise = getLawn(address, hit);
      promise.catch(() => {}); // reported when the scan is shown
      earlyScan.current = { key: scanKey(address, hit), promise };
    }
    setPhase('confirm');
  };

  const confirmLocation = ([lat, lng]) => {
    const { address, hit } = pending;
    setPending(null);
    // A moved pin means the parcel is found from the point, not the address's own lookup.
    const moved = lat !== hit.lat || lng !== hit.lng;
    scanAddress(address, { ...hit, lat, lng, ...(moved ? { osm: undefined } : {}) });
  };

  const handleScan = (e) => {
    e?.preventDefault();
    if (!query.trim()) {
      setNote('Enter an address to scan it.');
      return;
    }
    locate(query.trim());
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
      address: place?.short || shortAddress(place?.label || d.address),
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

  // The scan in the project's shape, for the 3D check before anything is saved.
  const previewProject = useMemo(() => {
    const d = lawnData;
    const boundary = d?.lawnSqft > 0 ? geoJsonOuterRings(d.lawn) : [];
    if (!d?.location || !boundary.length) return null;
    return {
      address: d.address,
      city: place?.city || '',
      state: place?.state || '',
      zip: place?.zip || '',
      countryCode: 'US',
      center: [d.location.lat, d.location.lon],
      boundary,
      totalSqft: d.lawnSqft,
      breakdown: { turf: d.lawnSqft, beds: 0, bare: 0 },
      lotOutline: geoJsonOuterRings(d.parcel?.geometry)[0] || null,
      lotSizeSqft: d.parcel?.areaSqft || 0,
      ...scannedStructures(d),
    };
  }, [lawnData, place]);
  // Fetch the 3D view's code while the scan runs, so the check opens at once.
  useEffect(() => {
    if (phase === 'scanning' || phase === 'confirm') import('@/components/Garden3DView').catch(() => {});
  }, [phase]);

  const searchKey = `${center[0]},${center[1]}`;
  const showAuto = phase === 'scanning' || phase === 'lawn' || phase === 'confirm' || phase === 'locating';
  const measured = result.source === 'satellite' && areaCalc.lawnSqft !== null ? areaCalc.lawnSqft : result.area;
  const turfDisplay = result.source === 'upload' || result.source === 'satellite' ? measured : measured * 0.76;

  return (
    <div>
      <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 pb-16 pt-12 lg:grid-cols-[1fr_1.1fr] lg:items-start lg:pt-20">
        <div className="lg:sticky lg:top-24">
          <h1 className="font-display text-[2.6rem] font-normal leading-[1.02] tracking-[-0.015em] text-foreground sm:text-[3.4rem]">
            Your lawn could be doing more.
          </h1>
          <p className="mt-6 max-w-md text-[16.5px] leading-relaxed text-foreground/80">
            Enter your address. We outline your lawn from satellite imagery and show what replacing it with native
            plants could save in water and money, and what it could look like.
          </p>

          <form onSubmit={handleScan} className="mt-9 flex flex-col gap-2.5 sm:flex-row">
            <AddressAutocomplete
              value={query}
              onChange={setQuery}
              onSelect={(hit) => locate(hit.label || query, hit)}
              placeholder="Enter your address"
            />
            <Button type="submit" disabled={loading} className="h-12 rounded-full px-6 text-[15px]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Scan my lawn'}
            </Button>
          </form>
          {note && <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted-foreground">{note}</p>}
          <p className="mt-4 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Free. Sign in with a free account and US addresses scan automatically; without one, or outside the US, you can outline your lawn by hand.{' '}
            <Link to="/examples" className="font-medium text-foreground underline underline-offset-4">See real examples</Link>
          </p>

          <div className="mt-10 max-w-md border-t border-border/70 pt-6">
            <p className="text-[14px] text-foreground">
              Typical lawns of 800 to 2,000 sq ft could save about{' '}
              <span className="font-display text-[1.35rem]">{money(sampleRange.save[0])}–{money(sampleRange.save[1])}</span> a year in
              water and upkeep.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Over 30 years, as water and upkeep costs rise, that adds up to about{' '}
              <span className="text-foreground">{money(sampleRange.lifetime[0])}–{money(sampleRange.lifetime[1])}</span> kept in your
              pocket: several times the {money(sampleRange.cost[0])}–{money(sampleRange.cost[1])} it costs to install before
              rebates. Your scan shows the numbers for your own lawn, your local rebates and the assumptions behind them.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[26px] border border-border bg-card shadow-[0_30px_70px_-40px_rgba(16,35,28,0.55)]">
          {showAuto ? (
            phase === 'locating' ? (
              <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <p className="mt-3 text-[13px] text-muted-foreground">Finding the address…</p>
              </div>
            ) : phase === 'confirm' && pending ? (
              <LocationConfirm
                key={`${pending.hit.lat},${pending.hit.lng}`}
                label={pending.hit.short || shortAddress(pending.hit.label) || pending.address}
                point={[pending.hit.lat, pending.hit.lng]}
                estimated={['range_interpolation', 'nearest_rooftop_match', 'point'].includes(pending.hit.accuracy)}
                onConfirm={confirmLocation}
                onCancel={() => { setPending(null); setPhase('idle'); }}
              />
            ) : phase === 'scanning' ? (
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                  <Leaf className="h-5 w-5 text-accent" />
                </div>
                <p className="mt-4 font-display text-lg tracking-tight">Scanning the property…</p>
                <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-muted-foreground">
                  Separating the building from the property, then checking its front, back and side grounds for lawn without crossing the estimated boundary. Homes take a few seconds; campuses and parks can take a few minutes.
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
                preview={previewProject}
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
                  Enter an address to scan your lawn, or measure it manually below. Either way we'll calculate the
                  impact of replacing it with a native garden.
                  {!autoAccess.loading && autoAccess.needsSignIn && (
                    <span className="ml-1 text-foreground">Sign in to run a free Full Auto Scan.</span>
                  )}
                </div>
              )}
              {phase === 'manual' && editSeed && (
                <div className="border-b border-border/70 bg-accent/10 px-4 py-2.5 text-[11px] leading-relaxed text-foreground">
                  The auto-detected lawn is drawn below. Drag the corners to fine-tune it, or add a new section. Then hit Analyze this lawn.
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

      <section className="border-t border-border/70 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-5">
          <h2 className="font-display text-[2rem] tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.t} className="border-t border-border pt-4">
                <span className="font-display text-[1.6rem] text-accent">{i + 1}</span>
                <h3 className="mt-1 text-[16px] font-medium tracking-tight">{step.t}</h3>
                <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted-foreground">{step.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-border/70 bg-secondary/40 py-16 sm:py-20">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="font-display text-[2rem] leading-tight tracking-tight">A lawn, or a native garden?</h2>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              Native plants are the ones that grow naturally where you live, alongside the local climate and
              wildlife. Chosen for your area, they can look beautiful with far less water and mowing.
            </p>
            <Link to="/why-native" className="mt-5 inline-block text-[14px] font-medium underline underline-offset-4">
              Why native plants matter
            </Link>
          </div>
          <table className="w-full text-left text-[14px]">
            <caption className="sr-only">How a conventional lawn compares with a native garden</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-4 font-medium text-muted-foreground"><span className="sr-only">Topic</span></th>
                <th scope="col" className="py-2 pr-4 font-medium">Conventional lawn</th>
                <th scope="col" className="py-2 font-medium">Native garden</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map(([topic, lawn, native]) => (
                <tr key={topic} className="border-b border-border/70 align-top">
                  <th scope="row" className="py-3 pr-4 font-medium">{topic}</th>
                  <td className="py-3 pr-4 text-muted-foreground">{lawn}</td>
                  <td className="py-3 text-foreground">{native}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-t border-border/70 py-16 sm:py-20">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-end justify-between gap-6 px-5">
          <div className="max-w-xl">
            <h2 className="font-display text-[2rem] leading-tight tracking-tight">See what other lawns became</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Real lawn-to-garden projects from community programs, with links to their own write-ups, plus trusted
              guides to native plants and local rebates.
            </p>
          </div>
          <Button asChild variant="outline" className="rounded-full px-6">
            <Link to="/examples">Browse examples</Link>
          </Button>
        </div>
        <p className="mx-auto mt-12 w-full max-w-6xl px-5 text-[13px] leading-relaxed text-muted-foreground">
          Scanning, design and the 3D model are free with an account. Pro ($10/month) adds Real 3D, design from a
          sentence, project tracking, exports and the community; students and educators get all of it except exports
          free with a school email.{' '}
          <Link to="/plans" className="text-foreground underline underline-offset-4">Compare plans</Link>. Questions?{' '}
          <a href="mailto:support@ecoestate.org" className="text-foreground underline underline-offset-4">support@ecoestate.org</a>
        </p>
      </section>
    </div>
  );
}