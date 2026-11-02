import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { Circle, GeoJSON, MapContainer, Marker, Polygon, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, Box, Check, Leaf, Loader2, Pencil, RefreshCw, Ruler, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LawnImpact from '@/components/scan/LawnImpact';
import { geoJsonOuterRings } from '@/lib/geo';
import { num } from '@/lib/landscapeMath';

// The 3D view (three.js) loads only when a scan result is shown.
const Garden3DView = lazy(() => import('@/components/Garden3DView'));

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
// The property line is white over a dark halo, and the lawn a clear green with
// a bright edge drawn above trees and buildings, so both read on any imagery.
const PARCEL_HALO_STYLE = { color: '#14211a', weight: 5, opacity: 0.45, fillOpacity: 0 };
const PARCEL_STYLE = { color: '#ffffff', weight: 2.5, dashArray: '7 5', fillOpacity: 0 };
// What the 3D model is built from, drawn on the same map as the lawn.
const BUILDING_STYLE = { color: '#e9e2d4', weight: 1.5, fillColor: '#b9ad99', fillOpacity: 0.45 };
const TREE_STYLE = { color: '#2f5a2a', weight: 1, fillColor: '#3f6b35', fillOpacity: 0.3 };
const NEARBY_TREE_STYLE = { ...TREE_STYLE, dashArray: '3 3', fillOpacity: 0.18 };
const ESTIMATE_STYLE = { color: '#f0a03c', weight: 2.5, dashArray: '6 5', fillColor: '#f0a03c', fillOpacity: 0.08 };
const LAWN_STYLE = { color: '#d9ffb8', weight: 2.5, fillColor: '#4fbf3f', fillOpacity: 0.5 };
// Small isolated patches (counted in the total) are drawn faintly so the main
// lawn regions stand out.
const SCATTERED_STYLE = { color: '#d9ffb8', weight: 1, fillColor: '#4fbf3f', fillOpacity: 0.35 };
// Roads dark with a pale curb line, paths light with darker edging, so both
// stand out against lawn and imagery.
const ROAD_KINDS = new Set(['service', 'living_street', 'residential', 'unclassified', 'tertiary', 'secondary', 'primary']);
const pathStyle = (feature) =>
  ROAD_KINDS.has(feature?.properties?.kind)
    ? { color: '#f2eee6', weight: 1.5, fillColor: '#3f4044', fillOpacity: 0.9 }
    : { color: '#7a6f5c', weight: 1.5, fillColor: '#e6dcc8', fillOpacity: 0.95 };
const lawnStyle = (feature) => (feature?.properties?.kind === 'scattered' ? SCATTERED_STYLE : LAWN_STYLE);

const cornerIcon = L.divIcon({
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  html: '<div style="width:16px;height:16px;border-radius:9999px;background:#f7f3ea;border:2px solid #c4673b;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
});
const midpointIcon = L.divIcon({
  className: '',
  iconSize: [11, 11],
  iconAnchor: [5, 5],
  html: '<div style="width:11px;height:11px;border-radius:9999px;background:rgba(247,243,234,.75);border:1.5px solid #c4673b"></div>',
});

function FitTo({ geo, fallback }) {
  const map = useMap();
  useEffect(() => {
    const bounds = geo ? L.geoJSON(geo).getBounds() : null;
    if (bounds?.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 20 });
    else if (fallback) map.setView(fallback, 19);
    // Only refit when a new result arrives, not while corners are dragged.
  }, [map, fallback]);
  return null;
}

const toGeoJson = (corners) => {
  const ring = corners.map(([lat, lng]) => [lng, lat]);
  return { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
};

// Draggable corners for an estimated property line. Dragging a midpoint adds a corner there.
function EditableLine({ corners, onChange }) {
  const latLng = (e) => [e.target.getLatLng().lat, e.target.getLatLng().lng];
  return (
    <>
      <Polygon positions={corners} pathOptions={ESTIMATE_STYLE} />
      {corners.map((pt, i) => (
        <Marker
          key={`c-${i}-${pt[0]}-${pt[1]}`}
          position={pt}
          icon={cornerIcon}
          alt={`Property line corner ${i + 1}, drag to move`}
          draggable
          eventHandlers={{ dragend: (e) => onChange(corners.map((p, j) => (j === i ? latLng(e) : p))) }}
        />
      ))}
      {corners.map((pt, i) => {
        const next = corners[(i + 1) % corners.length];
        const mid = [(pt[0] + next[0]) / 2, (pt[1] + next[1]) / 2];
        return (
          <Marker
            key={`m-${i}-${mid[0]}-${mid[1]}`}
            position={mid}
            icon={midpointIcon}
            alt={`Add a corner between ${i + 1} and ${((i + 1) % corners.length) + 1}`}
            draggable
            eventHandlers={{ dragend: (e) => onChange([...corners.slice(0, i + 1), latLng(e), ...corners.slice(i + 1)]) }}
          />
        );
      })}
    </>
  );
}

// Result of GET /v1/lawn. First the property in 3D as scanned (the house,
// trees and the lawn found), with one question: is this right? If it isn't,
// the scan is saved and opened in the next screen's editor (onFix); for an
// estimated property line the 2D satellite plan opens here instead, to adjust
// that line (the lawn is then measured inside it, POST /v1/lawn via
// onRemeasure) or re-scan. `preview` is the scan in the project's shape, for
// the 3D view; without it (no lawn found) the 2D plan shows straight away.
// stage: a full-screen element the 3D model is drawn into (the Scan page's
// backdrop), with only the question and numbers here; onModelReady is told once
// it is drawn.
export default function LawnApiResult({ data, preview, onConfirm, onFix, onEdit, onRescan, onRemeasure, stage = null, onModelReady, viewShift = null }) {
  const center = useMemo(() => [data.location?.lat, data.location?.lon], [data.location]);
  const estimated = data.parcelSource === 'estimated';
  const initialCorners = useMemo(() => geoJsonOuterRings(data.parcel?.geometry)[0] || [], [data.parcel]);
  const [corners, setCorners] = useState(initialCorners);
  const [view, setView] = useState(preview ? '3d' : '2d');
  // Scanning and building the 3D model are one step for the person: the
  // result shows once the model is drawn (or after a while regardless).
  const [modelReady, setModelReady] = useState(false);
  useEffect(() => {
    setModelReady(false);
    const giveUp = setTimeout(() => setModelReady(true), 15000);
    return () => clearTimeout(giveUp);
  }, [preview]);
  useEffect(() => {
    onModelReady?.(view === '3d' && modelReady);
  }, [view, modelReady, onModelReady]);
  const lawnLabel = useMemo(
    () => (data.lawnSqft > 0 ? [`${num(data.lawnSqft)} sq ft of lawn`, data.impact?.gallonsSavedPerYear ? `${num(data.impact.gallonsSavedPerYear)} gal of water a year` : null].filter(Boolean) : null),
    [data.lawnSqft, data.impact],
  );
  const [adjusting, setAdjusting] = useState(estimated && !preview);
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setCorners(initialCorners);
    setView(preview ? '3d' : '2d');
    setAdjusting(estimated && !preview);
    setError('');
  }, [initialCorners, estimated, preview]);

  const moved = JSON.stringify(corners) !== JSON.stringify(initialCorners);
  const measure = async () => {
    setError('');
    if (!moved) {
      setAdjusting(false); // the API already measured inside the estimated line
      return;
    }
    setMeasuring(true);
    try {
      await onRemeasure(toGeoJson(corners));
    } catch (err) {
      setError(err.message);
    } finally {
      setMeasuring(false);
    }
  };

  const lawnCount = data.lawn?.features?.length || 0;
  const regionCount = data.lawn?.features?.filter((f) => f.properties?.kind !== 'scattered').length || 0;
  const scattered = data.lawn?.features?.find((f) => f.properties?.kind === 'scattered')?.properties;
  const details = (
    <p className="mt-2 px-4 text-[11px] leading-relaxed text-muted-foreground">
      {data.address}
      {data.parcel?.areaSqft ? ` · lot ${data.parcel.areaSqft.toLocaleString()} sq ft` : ''}
      {lawnCount === 0 ? ' · No green lawn was detected on this property.' : ''}
      {scattered ? ` · includes ${scattered.areaSqft.toLocaleString()} sq ft in ${scattered.patches} small scattered patches (shown faintly)` : ''}
      {data.dormant?.sqft >= 50 ? ` · includes ${data.dormant.sqft.toLocaleString()} sq ft of lawn that was dry when the survey was flown` : ''}
    </p>
  );

  if (view === '3d' && stage) {
    return (
      <div>
        {createPortal(
          <Suspense fallback={null}>
            <Garden3DView project={preview} mode="check" fill viewShift={viewShift} lawnLabel={lawnLabel} onReady={() => setModelReady(true)} />
          </Suspense>,
          stage,
        )}
        <div className="p-5">
          {!modelReady ? (
            <p className="flex items-center gap-2 text-[14px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lawn found. Building your property in 3D…
            </p>
          ) : (
            <>
              <p className="font-display text-[1.6rem] leading-tight tracking-tight">Is this scan right?</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                Your property as we scanned it: the lawn in green, the house and trees from public map and lidar data.
                {estimated ? ' There’s no public parcel map here, so the dashed property line is estimated.' : ''}
                {' '}Drag to look around, or try Real 3D.
              </p>
            </>
          )}
        </div>
        {modelReady && (
          <>
            {/* Phones: one line, so the panel stays small and off the property. */}
            <p className="px-5 text-[13px] text-foreground lg:hidden">
              <span className="font-display text-[1.3rem]">{num(data.lawnSqft)}</span> sq ft of lawn
              {data.impact?.gallonsSavedPerYear ? ` · ${num(data.impact.gallonsSavedPerYear)} gal of water a year` : ''}
            </p>
            <div className="hidden lg:block">
              <LawnImpact lawnSqft={data.lawnSqft} impact={data.impact} />
              {details}
            </div>
            <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row">
              <Button onClick={onConfirm} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
                <Check className="mr-1.5 h-4 w-4 shrink-0" />Yes, looks right
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (estimated || !onFix) {
                    setView('2d');
                    if (estimated) setAdjusting(true);
                  } else onFix();
                }}
                className="flex-1 rounded-full whitespace-normal text-center leading-tight"
              >
                <Pencil className="mr-1.5 h-4 w-4 shrink-0" />No, fix it
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (view === '3d') {
    return (
      <div className="relative">
        {!modelReady && (
          <div className="absolute inset-0 z-20 flex flex-col items-center bg-card px-6 pt-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Leaf className="h-5 w-5 text-accent" />
            </div>
            <p className="mt-4 font-display text-lg tracking-tight">Scanning the property…</p>
            <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-muted-foreground">Lawn found. Building your property in 3D.</p>
            <Loader2 className="mt-5 h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        <div className="p-4">
          <p className="font-display text-[1.5rem] leading-tight tracking-tight">Is this scan right?</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Your property in 3D as we scanned it: the lawn we found in green, and the house and trees from public map
            and lidar data. Try Real 3D to see it among Google’s 3D surroundings.
            {estimated ? ' There’s no public parcel map here, so the dashed property line is estimated.' : ''}
          </p>
          <div className="mt-3">
            <Suspense
              fallback={(
                <div className="flex h-[360px] items-center justify-center rounded-2xl border border-border bg-secondary sm:h-[460px]">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            >
              <Garden3DView project={preview} mode="check" lawnLabel={lawnLabel} onReady={() => setModelReady(true)} />
            </Suspense>
          </div>
        </div>
        <LawnImpact lawnSqft={data.lawnSqft} impact={data.impact} />
        {details}
        <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row">
          <Button onClick={onConfirm} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
            <Check className="mr-1.5 h-4 w-4 shrink-0" />Yes, looks right
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              // A guessed property line is fixed here first (the lawn is measured
              // inside it); otherwise the scan opens in the next screen's editor.
              if (estimated || !onFix) {
                setView('2d');
                if (estimated) setAdjusting(true);
              } else onFix();
            }}
            className="flex-1 rounded-full whitespace-normal text-center leading-tight"
          >
            <Pencil className="mr-1.5 h-4 w-4 shrink-0" />No, fix it
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {adjusting && (
        <div className="flex items-start gap-3 border-b border-border/70 bg-[#f0a03c]/12 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b86e14]" />
          <div>
            <p className="text-[12.5px] font-medium text-foreground">Check the property line before we measure</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              There’s no public parcel map for this address, so the orange outline is estimated from the building. Drag
              the corners to match your property (drag a small dot to add a corner), then measure.
            </p>
          </div>
        </div>
      )}
      <div className="p-4">
        <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-secondary">
          <MapContainer center={center} zoom={19} maxZoom={21} scrollWheelZoom={false} className="h-full w-full">
            <TileLayer url={IMAGERY} attribution="Imagery © Esri, Maxar, Earthstar Geographics" maxNativeZoom={19} maxZoom={21} />
            {adjusting ? (
              <EditableLine corners={corners} onChange={setCorners} />
            ) : (
              <>
                {data.paths?.features?.length > 0 && <GeoJSON key={`w-${data.parcel?.id}`} data={data.paths} style={pathStyle} />}
                {data.nearbyRoads?.features?.length > 0 && <GeoJSON key={`r-${data.parcel?.id}`} data={data.nearbyRoads} style={pathStyle} />}
                {data.buildings?.features?.length > 0 && <GeoJSON key={`b-${data.parcel?.id}`} data={data.buildings} style={BUILDING_STYLE} />}
                {(data.trees || []).map((t, i) => (
                  <Circle key={`t-${i}`} center={[t.lat, t.lon]} radius={(t.radiusFt || 6) * 0.3048} pathOptions={t.street ? NEARBY_TREE_STYLE : TREE_STYLE} />
                ))}
                {lawnCount > 0 && <GeoJSON key={`l-${data.parcel?.id}`} data={data.lawn} style={lawnStyle} />}
                {data.parcel?.geometry && <GeoJSON key={`ph-${data.parcel.id}`} data={data.parcel.geometry} style={PARCEL_HALO_STYLE} interactive={false} />}
                {data.parcel?.geometry && <GeoJSON key={`p-${data.parcel.id}`} data={data.parcel.geometry} style={PARCEL_STYLE} interactive={false} />}
              </>
            )}
            <FitTo geo={data.parcel?.geometry} fallback={center} />
          </MapContainer>
          <span className="pointer-events-none absolute right-2 top-2 z-[500] rounded-full bg-foreground/85 px-2.5 py-1 text-[12px] text-background">
            {adjusting ? 'Estimated property line' : `Satellite · ${regionCount} lawn area${regionCount === 1 ? '' : 's'}`}
          </span>
        </div>
        {!adjusting && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-foreground/60" />{data.parcelSource === 'place' ? 'Property outline (OpenStreetMap)' : `Property line${data.parcelSource === 'user' ? ' (adjusted)' : ''}`}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-[#2f7a25] bg-[#4fbf3f]" />Lawn</span>
            {data.buildings?.features?.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#b9ad99]" />Buildings</span>}
            {data.trees?.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#3f6b35]" />Trees (dashed: next to the property)</span>}
            {data.surveyDate && <span className="ml-auto">Aerial survey {data.surveyDate}</span>}
          </div>
        )}
      </div>

      {adjusting ? (
        <div className="space-y-2 px-4 pb-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">{data.address}</p>
          {error && <p role="alert" className="text-[11.5px] leading-relaxed text-destructive">{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={measure} disabled={measuring || corners.length < 3} className="flex-1 rounded-full">
              {measuring ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Ruler className="mr-1.5 h-4 w-4" />}
              Measure lawn inside this line
            </Button>
            <Button variant="outline" onClick={() => setCorners(initialCorners)} disabled={!moved || measuring} className="flex-1 rounded-full">
              <Undo2 className="mr-1.5 h-4 w-4" />Reset outline
            </Button>
          </div>
        </div>
      ) : (
        <>
          <LawnImpact lawnSqft={data.lawnSqft} impact={data.impact} />
          {details}
          <p className="mt-1 px-4 text-[10.5px] leading-relaxed text-muted-foreground">
            This 2D plan is what your 3D model is built from: lawn from green in the aerial survey, minus anything a
            height map or USGS lidar shows is taller than about 2 ft; lawn that was dry when the survey was flown is
            found from the survey before. Buildings and trees come from public map, canopy and lidar data. If something
            is off, edit the plan.
          </p>

          <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row">
            {data.lawnSqft > 0 && !preview && (
              <Button onClick={onConfirm} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
                <Check className="mr-1.5 h-4 w-4 shrink-0" />Looks right, analyze
              </Button>
            )}
            {preview && (
              <Button variant="outline" onClick={() => setView('3d')} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
                <Box className="mr-1.5 h-4 w-4 shrink-0" />Back to 3D
              </Button>
            )}
            <Button variant={data.lawnSqft > 0 && !preview ? 'outline' : 'default'} onClick={onEdit} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
              <Pencil className="mr-1.5 h-4 w-4 shrink-0" />{data.lawnSqft > 0 ? 'Edit the plan' : 'Draw lawn'}
            </Button>
            {data.parcelSource === 'county' ? (
              <Button variant="outline" onClick={onRescan} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
                <RefreshCw className="mr-1.5 h-4 w-4 shrink-0" />Re-scan
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setAdjusting(true)} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
                <Ruler className="mr-1.5 h-4 w-4 shrink-0" />Adjust property line
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
