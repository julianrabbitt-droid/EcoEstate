import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { GeoJSON, MapContainer, Marker, Polygon, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, Check, Loader2, Pencil, RefreshCw, Ruler, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LawnImpact from '@/components/scan/LawnImpact';
import { geoJsonOuterRings } from '@/lib/geo';

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const PARCEL_STYLE = { color: '#f7f3ea', weight: 2, dashArray: '6 5', fillOpacity: 0 };
const ESTIMATE_STYLE = { color: '#f0a03c', weight: 2.5, dashArray: '6 5', fillColor: '#f0a03c', fillOpacity: 0.08 };
const LAWN_STYLE = { color: '#f0f4ec', weight: 1.5, fillColor: '#7d8f6e', fillOpacity: 0.45 };
// Small isolated patches (counted in the total) are drawn faintly so the main
// lawn regions stand out.
const SCATTERED_STYLE = { color: '#7d8f6e', weight: 0, fillColor: '#7d8f6e', fillOpacity: 0.25 };
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

// Result of GET /v1/lawn: the parcel outline and detected lawn drawn on a
// satellite map, with the lawn size and conversion impact. When the property
// line is only estimated, the user adjusts it first and the lawn is then
// measured inside their line (POST /v1/lawn via onRemeasure).
export default function LawnApiResult({ data, onConfirm, onEdit, onRescan, onRemeasure }) {
  const center = useMemo(() => [data.location?.lat, data.location?.lon], [data.location]);
  const estimated = data.parcelSource === 'estimated';
  const initialCorners = useMemo(() => geoJsonOuterRings(data.parcel?.geometry)[0] || [], [data.parcel]);
  const [corners, setCorners] = useState(initialCorners);
  const [adjusting, setAdjusting] = useState(estimated);
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setCorners(initialCorners);
    setAdjusting(estimated);
    setError('');
  }, [initialCorners, estimated]);

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
                {data.parcel?.geometry && <GeoJSON key={`p-${data.parcel.id}`} data={data.parcel.geometry} style={PARCEL_STYLE} />}
                {lawnCount > 0 && <GeoJSON key={`l-${data.parcel?.id}`} data={data.lawn} style={lawnStyle} />}
                {data.paths?.features?.length > 0 && <GeoJSON key={`w-${data.parcel?.id}`} data={data.paths} style={pathStyle} />}
                {data.nearbyRoads?.features?.length > 0 && <GeoJSON key={`r-${data.parcel?.id}`} data={data.nearbyRoads} style={pathStyle} />}
              </>
            )}
            <FitTo geo={data.parcel?.geometry} fallback={center} />
          </MapContainer>
          <span className="pointer-events-none absolute right-2 top-2 z-[500] rounded-full bg-foreground/85 px-2.5 py-1 text-[9.5px] uppercase tracking-[0.14em] text-background">
            {adjusting ? 'Estimated property line' : `Satellite · ${regionCount} lawn area${regionCount === 1 ? '' : 's'}`}
          </span>
        </div>
        {!adjusting && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-foreground/60" />{data.parcelSource === 'place' ? 'Property outline (OpenStreetMap)' : `Property line${data.parcelSource === 'user' ? ' (adjusted)' : ''}`}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#7d8f6e]" />Lawn</span>
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
          <p className="mt-2 px-4 text-[11px] leading-relaxed text-muted-foreground">
            {data.address}
            {data.parcel?.areaSqft ? ` · lot ${data.parcel.areaSqft.toLocaleString()} sq ft` : ''}
            {lawnCount === 0 ? ' · No green lawn was detected on this property.' : ''}
            {scattered ? ` · includes ${scattered.areaSqft.toLocaleString()} sq ft in ${scattered.patches} small scattered patches (shown faintly)` : ''}
          </p>
          <p className="mt-1 px-4 text-[10.5px] leading-relaxed text-muted-foreground">
            Detected from green vegetation in the aerial survey. Brown or dormant lawn isn’t picked up, so edit the outline if
            some is missing.
          </p>

          <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row">
            {data.lawnSqft > 0 && (
              <Button onClick={onConfirm} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
                <Check className="mr-1.5 h-4 w-4 shrink-0" />Looks right, analyze
              </Button>
            )}
            <Button variant={data.lawnSqft > 0 ? 'outline' : 'default'} onClick={onEdit} className="flex-1 rounded-full whitespace-normal text-center leading-tight">
              <Pencil className="mr-1.5 h-4 w-4 shrink-0" />{data.lawnSqft > 0 ? 'Edit lawn outline' : 'Draw lawn'}
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
