import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, Crosshair, Loader2, Maximize2, Minus } from 'lucide-react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { getLawn, getLawnForParcel, locateAddress, measureArea, mergeLawnOutlines } from '@/api/lawnApi';
import { Button } from '@/components/ui/button';
import MethodPicker from '@/components/scan/MethodPicker';
import SatelliteMethod from '@/components/scan/SatelliteMethod';
import UploadMethod from '@/components/scan/UploadMethod';
import LawnApiResult from '@/components/scan/LawnApiResult';
import LawnImpact from '@/components/scan/LawnImpact';
import AutoScanNotice from '@/components/scan/AutoScanNotice';
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
// The opening screen's backdrop: tree-lined lawns in Crescent Park, Palo Alto, from above.
const HERO_VIEW = [37.4538, -122.1468];
const HERO_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
// Glides the backdrop to the property being scanned (or back to the neighbourhood).
function Backdrop({ center, zoom = 18 }) {
  const map = useMap();
  const [lat, lng] = center;
  useEffect(() => {
    map.flyTo([lat, lng], zoom, { duration: 1.4 });
  }, [map, lat, lng, zoom]);
  return null;
}
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:26px;height:26px;border-radius:50%;background:#c4673b;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.5)"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});
// While the location is being checked the aerial view is a map: pan, zoom, and
// drag the pin (or tap) onto the house.
function PinLayer({ active, pin, onPin }) {
  const map = useMap();
  useEffect(() => {
    for (const h of [map.dragging, map.scrollWheelZoom, map.touchZoom, map.doubleClickZoom]) (active ? h.enable() : h.disable());
  }, [map, active]);
  useMapEvents({ click: (e) => active && onPin([e.latlng.lat, e.latlng.lng]) });
  if (!active || !pin) return null;
  return (
    <Marker
      position={pin}
      icon={pinIcon}
      draggable
      eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); onPin([ll.lat, ll.lng]); } }}
    />
  );
}
// The scan in progress, kept for this browser tab, so leaving the Scan page and
// coming back returns to it. Cleared once the scan is saved as a project.
const SAVED_SCAN = 'ecoestate.scan';
const readSavedScan = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SAVED_SCAN) || 'null') || {};
  } catch {
    return {};
  }
};
const clearSavedScan = () => {
  try {
    sessionStorage.removeItem(SAVED_SCAN);
  } catch {
    /* storage blocked: nothing was kept */
  }
};
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
  const buildingRoofs = []; // { color, shape } from the aerial photo and canopy heights, same order
  for (const f of d?.buildings?.features || []) {
    const ring = geoJsonOuterRings(f.geometry)[0];
    if (!ring) continue;
    buildings.push(ring);
    buildingHeightsFt.push(f.properties?.heightFt ?? null);
    const p = f.properties || {};
    buildingRoofs.push({
      color: p.roofColor || null,
      shape: p.roofShape || null,
      // What mappers recorded (OpenStreetMap via Overture), and chimneys found in lidar.
      use: p.use || null,
      mappedShape: p.mappedRoofShape || null,
      material: p.roofMaterial || null,
      facadeMaterial: p.facadeMaterial || null,
      facadeColor: p.facadeColor || null,
      chimneys: (p.chimneys || []).map((c) => ({ latLng: [c.lat, c.lon], topFt: c.topFt })),
    });
  }
  const trees = (d?.trees || []).map((t) => ({ latLng: [t.lat, t.lon], radiusFt: t.radiusFt, heightFt: t.heightFt }));
  const paths = [...(d?.paths?.features || []), ...(d?.nearbyRoads?.features || []), ...(d?.paved?.features || [])]
    .map((f) => ({ polygonLatLng: geoJsonOuterRings(f.geometry)[0], kind: f.properties?.kind, name: f.properties?.name || null }))
    .filter((p) => p.polygonLatLng);
  // Fences on the lot lines (from lidar), as [lat, lng] lines.
  const fences = (d?.fences?.features || []).map((f) => f.geometry.coordinates.map(([lon, lat]) => [lat, lon]));
  // Swimming pools, as [lat, lng] outlines.
  const pools = (d?.pools?.features || []).map((f) => geoJsonOuterRings(f.geometry)[0]).filter((ring) => ring && ring.length >= 3);
  // The yard from above (public-domain NAIP), for the model's ground.
  const groundImage = d?.groundImage ? { url: `data:image/png;base64,${d.groundImage.png}`, west: d.groundImage.west, south: d.groundImage.south, east: d.groundImage.east, north: d.groundImage.north } : null;
  return { buildings, buildingHeightsFt, buildingRoofs, trees, paths, fences, pools, groundImage };
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
  const [saved] = useState(readSavedScan);
  const [query, setQuery] = useState(saved.query || '');
  const [center, setCenter] = useState(saved.center || DEFAULT_CENTER);
  const [zoom, setZoom] = useState(saved.zoom || 17);
  const [loading, setLoading] = useState(false);
  const [place, setPlace] = useState(saved.place || null);
  const [note, setNote] = useState('');
  const [unavailable, setUnavailable] = useState(saved.unavailable || null);
  // A scan that was still running when the person left is started again (see below).
  const [phase, setPhase] = useState(saved.phase === 'locating' || saved.phase === 'scanning' ? 'idle' : saved.phase || 'idle'); // idle | locating | confirm | scanning | lawn | manual
  const [pending, setPending] = useState(saved.pending || null); // { address, hit } waiting for "is this your property?"
  const [lawnData, setLawnData] = useState(saved.lawnData || null);
  const lastScan = useRef(saved.lastScan || null); // { address, hit } of the scan last started
  const [stageEl, setStageEl] = useState(null); // where the 3D model is drawn, full screen
  const [modelShown, setModelShown] = useState(false);
  // The scan check's panel folds away to a pill, to see the whole property.
  const [checkOpen, setCheckOpen] = useState(true);
  const [pin, setPin] = useState(null); // the pin being checked on the aerial view
  // Scrolling down fades the aerial into the page's green.
  const [scrollY, setScrollY] = useState(0);
  const [viewH, setViewH] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  const [viewW, setViewW] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    const on = () => { setScrollY(window.scrollY); setViewH(window.innerHeight); setViewW(window.innerWidth); };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, []);
  const aerialOpacity = Math.max(0, 1 - scrollY / (viewH * 0.85));
  const [areaCalc, setAreaCalc] = useState(NO_AREA);
  const areaRequest = useRef(0);
  // The scan of the shown pin starts while the person is still confirming it,
  // so it is usually done by the time they click; a moved pin scans afresh.
  const earlyScan = useRef(null); // { key, promise }
  const picked = useRef(saved.place || null); // the suggestion last picked from the address list
  const [hits, setHits] = useState([]); // the list's current suggestions
  const scanKey = (address, hit) => `${address}|${hit?.lat}|${hit?.lng}|${hit?.osm || ''}`;
  const [editSeed, setEditSeed] = useState(saved.editSeed || null);
  // Each full-screen phase starts at the top of the page, with the whole
  // stage in view (typing in the address box can leave it scrolled).
  useEffect(() => {
    if (['locating', 'confirm', 'scanning', 'lawn'].includes(phase) || (phase === 'manual' && editSeed)) window.scrollTo({ top: 0, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  const [method, setMethod] = useState(saved.method || 'satellite');
  const [result, setResult] = useState(saved.result || { area: 0, source: 'satellite', boundary: [], turf: null });
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
    lastScan.current = { address, hit: knownHit };
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

  // Only an address picked from the suggestions (or typed exactly as one) is
  // scanned, so it is always one the map knows; until then Scan is greyed out.
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const chosen = picked.current && same(picked.current.label, query) ? picked.current : hits.find((h) => same(h.label, query) || same(h.short, query)) || null;
  const handleScan = (e) => {
    e?.preventDefault();
    if (!query.trim()) {
      setNote('Enter an address to scan it.');
      return;
    }
    if (chosen) {
      locate(chosen.label, chosen);
      return;
    }
    setNote('Choose your address from the suggestions as you type.');
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

  // "No, fix it" saves the scan too and opens it in the next screen's editor.
  const confirmLawn = async ({ edit = false } = {}) => {
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
    clearSavedScan();
    navigate(`/project/${rec.id}${edit ? '?edit=1' : ''}`, { state: { project: rec } });
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
    clearSavedScan();
    navigate(`/project/${rec.id}`, { state: { project: rec } });
  };

  // Keep the scan in progress for this tab (see SAVED_SCAN).
  useEffect(() => {
    if (phase === 'idle' && !query) return;
    try {
      sessionStorage.setItem(SAVED_SCAN, JSON.stringify({
        query, center, zoom, place, unavailable, phase, pending, lawnData, editSeed, method, result, lastScan: lastScan.current,
      }));
    } catch {
      /* storage full or blocked: the page just won't be restored */
    }
  }, [query, center, zoom, place, unavailable, phase, pending, lawnData, editSeed, method, result]);
  // A scan that was still running when the person left starts again on return
  // (the lawn service has usually kept the result, so it is quick).
  useEffect(() => {
    if ((saved.phase === 'scanning' || saved.phase === 'locating') && saved.lastScan?.address) {
      scanAddress(saved.lastScan.address, saved.lastScan.hit);
    }
  }, []); // only on arriving at the page

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

  useEffect(() => {
    if (phase === 'confirm' && pending) setPin([pending.hit.lat, pending.hit.lng]);
    if (phase !== 'lawn') setModelShown(false);
  }, [phase, pending]);
  const startOver = () => {
    clearSavedScan();
    setPhase('idle');
    setPending(null);
    setLawnData(null);
    setQuery('');
    setModelShown(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const searchKey = `${center[0]},${center[1]}`;
  const measured = result.source === 'satellite' && areaCalc.lawnSqft !== null ? areaCalc.lawnSqft : result.area;
  const turfDisplay = result.source === 'upload' || result.source === 'satellite' ? measured : measured * 0.76;

  // Typed but not yet picked: say why Locate is still grey.
  const mustPick = query.trim().length > 3 && !chosen && !loading;
  const addressForm = (dark) => (
    <form onSubmit={handleScan} className="flex flex-col gap-2.5 sm:flex-row">
      <AddressAutocomplete
        value={query}
        onChange={setQuery}
        onSuggestions={setHits}
        onSelect={(hit) => {
          picked.current = hit;
          locate(hit.label || query, hit);
        }}
        placeholder="Enter your address"
        hint={mustPick ? (hits.length ? 'Pick your address from the list to locate it.' : 'Keep typing, then pick your address from the list.') : null}
        hintClassName={dark ? 'text-white/90 drop-shadow' : 'text-muted-foreground'}
      />
      <Button type="submit" disabled={loading || !chosen} className={`h-12 rounded-full px-6 text-[15px] ${dark ? 'disabled:opacity-80' : ''}`}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Crosshair className="mr-1.5 h-4 w-4" aria-hidden />Locate property</>}
      </Button>
    </form>
  );

  return (
    <div className="relative isolate">
      {/* One full-screen stage for the whole scan. Behind everything, fixed: the
          aerial view, a neighbourhood at first, then the property (the pin is
          checked on it directly), crossfading into the property's 3D model once
          it is built; scrolling down fades it into the page's bone. */}
      <div className="pointer-events-none fixed inset-0 -z-10" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #e9e6dc 0%, #f1efe9 55%, #f5f3ee 100%)' }} aria-hidden={phase !== 'confirm'}>
        <div
          className={`absolute inset-0 transition-opacity duration-1000 ${phase === 'confirm' ? 'pointer-events-auto' : ''}`}
          style={{ opacity: modelShown ? 0 : aerialOpacity, filter: scrollY > 0 ? `blur(${Math.min(6, (scrollY / viewH) * 8).toFixed(1)}px)` : 'none' }}
        >
          <MapContainer
            center={HERO_VIEW}
            zoom={18}
            maxZoom={21}
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
            <TileLayer url={HERO_IMAGERY} maxNativeZoom={19} maxZoom={21} />
            <Backdrop center={phase === 'idle' ? HERO_VIEW : phase === 'confirm' && pin ? pin : center} zoom={phase === 'idle' ? 18 : 19} />
            <PinLayer active={phase === 'confirm'} pin={pin} onPin={setPin} />
          </MapContainer>
          <div className={`pointer-events-none absolute inset-0 ${phase === 'confirm' ? 'bg-gradient-to-b from-black/35 via-transparent to-black/40' : 'bg-gradient-to-b from-black/45 via-black/30 to-black/65'}`} />
        </div>
      </div>

      <section className="pointer-events-none relative min-h-[calc(100svh-var(--header-h,4rem))]">
        {/* The 3D model fills the stage once it is built. */}
        {phase === 'lawn' && previewProject && (
          <div
            ref={setStageEl}
            className={`absolute inset-0 transition-opacity duration-1000 ${modelShown ? 'pointer-events-auto opacity-100' : 'opacity-0'}`}
            style={{ background: 'linear-gradient(180deg, #b9cad6 0%, #e8ebe3 100%)' }}
          />
        )}

        {phase === 'idle' && (
          <div className="pointer-events-auto mx-auto flex min-h-[calc(100svh-var(--header-h,4rem))] w-full max-w-3xl flex-col items-center justify-center px-5 pb-20 pt-10 text-center text-white duration-500 animate-in fade-in">
            <h1 className="font-display text-[3rem] leading-[0.95] tracking-[-0.045em] drop-shadow sm:text-[5.4rem]">
              Your lawn could be <em>doing more.</em>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[16.5px] leading-relaxed text-white/90 drop-shadow">
              Enter your address. We find your lawn from above, design a native garden for it in 3D, and show what it
              would save in water and money.
            </p>
            <div className="mt-8 w-full max-w-xl text-left text-foreground">{addressForm(true)}</div>
            {note && <p className="mx-auto mt-3 max-w-xl text-[13px] text-white/90">{note}</p>}
            <p className="mx-auto mt-4 max-w-xl text-[13px] leading-relaxed text-white/80">
              Free with an account.{' '}
              <button type="button" onClick={() => setPhase('manual')} className="font-medium text-white underline underline-offset-4">
                Outline it by hand
              </button>
              {' · '}
              <Link to="/examples" className="font-medium text-white underline underline-offset-4">See real examples</Link>
            </p>
            <p className="mx-auto mt-10 max-w-xl text-[14px] text-white/90">
              Typical lawns save about{' '}
              <span className="font-display text-[1.35rem] text-white">{money(sampleRange.save[0])}–{money(sampleRange.save[1])}</span> a
              year in water and upkeep.
            </p>
            <a href="#how-it-works" className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center text-[11px] text-white/80 hover:text-white">
              More below
              <ChevronDown className="h-5 w-5 animate-bounce" aria-hidden />
            </a>
          </div>
        )}

        {phase === 'locating' && (
          <div className="flex min-h-[calc(100svh-var(--header-h,4rem))] items-center justify-center duration-500 animate-in fade-in">
            <p className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-card/90 px-5 py-2.5 text-[14px] text-foreground shadow-lg backdrop-blur">
              <Loader2 className="h-4 w-4 animate-spin" /> Finding {pending?.address || query || 'the address'}…
            </p>
          </div>
        )}

        {phase === 'confirm' && pending && pin && (
          // The pin sits on the aerial view itself; this panel just asks.
          <div className="flex min-h-[calc(100svh-var(--header-h,4rem))] items-end justify-center px-4 pb-8 duration-700 animate-in fade-in slide-in-from-bottom-6">
            <div className="pointer-events-auto w-full max-w-xl rounded-3xl border border-border/60 bg-card/92 p-5 text-foreground shadow-2xl backdrop-blur-md">
              <p className="font-display text-[1.6rem] leading-tight tracking-tight">Is this your property?</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                <span className="text-foreground">{pending.hit.short || shortAddress(pending.hit.label) || pending.address}.</span>{' '}
                {['range_interpolation', 'nearest_rooftop_match', 'point'].includes(pending.hit.accuracy)
                  ? 'This pin is an estimate along the street. Drag it onto your house, or tap your house, before we scan.'
                  : 'Check the pin sits on your house. If not, drag it there or tap your house.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="rounded-full" onClick={() => confirmLocation(pin)}>
                  {pin[0] !== pending.hit.lat || pin[1] !== pending.hit.lng ? 'Scan this spot' : 'Yes, scan my property'}
                </Button>
                {(pin[0] !== pending.hit.lat || pin[1] !== pending.hit.lng) && (
                  <Button variant="ghost" className="rounded-full" onClick={() => setPin([pending.hit.lat, pending.hit.lng])}>
                    Reset pin
                  </Button>
                )}
                <Button variant="ghost" className="ml-auto rounded-full text-muted-foreground" onClick={startOver}>
                  Different address
                </Button>
              </div>
            </div>
          </div>
        )}

        {phase === 'scanning' && (
          <div className="flex min-h-[calc(100svh-var(--header-h,4rem))] flex-col items-center justify-center px-5 text-center text-white duration-700 animate-in fade-in zoom-in-95">
            <div className="relative h-40 w-40" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full border-2 border-white/60" />
              <span className="absolute inset-6 rounded-full border border-white/40" />
              <span className="absolute inset-[4.5rem] rounded-full bg-primary shadow-[0_0_24px_hsl(var(--primary)/0.45)]" />
            </div>
            <p className="mt-6 font-display text-2xl tracking-tight drop-shadow">Scanning the property…</p>
            <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-white/85 drop-shadow">
              Finding the lawn from the aerial survey and lidar, then building your property in 3D.
            </p>
          </div>
        )}

        {phase === 'lawn' && previewProject && (
          // Over the 3D model: the question and the numbers, at the side (below on phones).
          <div className="flex min-h-[calc(100svh-var(--header-h,4rem))] items-end justify-end p-3 duration-700 animate-in fade-in slide-in-from-right-8 sm:p-6 lg:items-center">
            {!checkOpen && (
              <button type="button" onClick={() => setCheckOpen(true)} aria-expanded={false} className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/92 px-4 py-2.5 text-[13px] shadow-lg backdrop-blur-md">
                <Maximize2 className="h-4 w-4" aria-hidden />Is this scan right?
              </button>
            )}
            {/* Folded, it only hides: the 3D view is drawn from inside it. */}
            <div className={`pointer-events-auto relative max-h-[calc(100svh-var(--header-h,4rem)-9rem)] w-full overflow-y-auto rounded-3xl lg:max-h-[78svh] border border-border/60 bg-card/92 shadow-2xl backdrop-blur-md sm:max-w-md ${checkOpen ? '' : 'hidden'}`}>
              <button type="button" onClick={() => setCheckOpen(false)} aria-label="Fold the panel away" title="Fold away" className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground">
                <Minus className="h-4 w-4" />
              </button>
              <LawnApiResult
                data={lawnData}
                preview={previewProject}
                stage={stageEl}
                onModelReady={setModelShown}
                viewShift={viewW >= 1024 ? [-250, 0] : [0, -Math.round(viewH * 0.16)]}
                onConfirm={() => confirmLawn()}
                onFix={editLawn}
                onEdit={editLawn}
                onRescan={() => scanAddress(lawnData?.address || query, place)}
                onRemeasure={remeasureLawn}
              />
              <button type="button" onClick={startOver} className="mx-auto mb-4 block text-[12px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Start over
              </button>
            </div>
          </div>
        )}

        {(phase === 'manual' || (phase === 'lawn' && !previewProject)) && (
          <div className={`mx-auto w-full px-4 pb-12 pt-6 duration-700 animate-in fade-in slide-in-from-bottom-4 ${editSeed ? 'max-w-4xl' : 'max-w-2xl'}`}>
            {editSeed ? (
              <div className="pointer-events-auto text-white">
                <p className="font-display text-[1.8rem] leading-tight tracking-tight drop-shadow">Fix the scan</p>
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-white/85 drop-shadow">
                  Drag the corners of the green lawn outlines, add or remove a lawn, or fix the house and property line.
                  The 3D model is rebuilt from this plan.
                </p>
              </div>
            ) : (
              <div className="pointer-events-auto text-foreground">{addressForm(true)}</div>
            )}
            {note && <p className="mt-2 text-[13px] text-white/90">{note}</p>}
            <div className="pointer-events-auto mt-4">
        <div className="overflow-hidden rounded-[26px] border border-border bg-card shadow-[0_30px_70px_-40px_rgba(16,35,28,0.55)]">
          {phase === 'lawn' ? (
              <LawnApiResult
                data={lawnData}
                preview={previewProject}
                onConfirm={() => confirmLawn()}
                onFix={() => confirmLawn({ edit: true })}
                onEdit={editLawn}
                onRescan={() => scanAddress(lawnData?.address || query, place)}
                onRemeasure={remeasureLawn}
              />
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
                    Back to the 3D scan
                  </button>
                )}
              </div>
            </>
          )}
        </div>
            </div>
            <button type="button" onClick={startOver} className="pointer-events-auto mx-auto mt-4 block text-[12px] text-white/80 underline underline-offset-4 hover:text-white">
              Start over
            </button>
          </div>
        )}
        {!modelShown && <span className="absolute bottom-2 right-3 text-[9.5px] text-white/60">Imagery © Esri, Maxar, Earthstar Geographics</span>}
      </section>

      <section id="how-it-works" className="border-t border-border/70 py-16 sm:py-20">
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