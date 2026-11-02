import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { House, PenLine, Plus, RotateCcw, Trash2, TreePine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { polygonAreaSqFt } from '@/lib/geo';

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const STYLES = {
  lawn: { color: '#7d8f6e', stroke: '#f0f4ec' },
  building: { color: '#9a8c7a', stroke: '#3a3128' },
};
const featureStyle = (type) => STYLES[type] || STYLES.lawn;

function rectPoints(center, areaSqft) {
  const side = Math.sqrt(Math.max(areaSqft, 64));
  const [lat, lng] = center;
  const halfLat = side / 2 / 364000;
  const cosLat = Math.cos((lat * Math.PI) / 180) || 0.0001;
  const halfLng = side / 2 / (364000 * cosLat);
  return [
    [lat - halfLat, lng - halfLng],
    [lat - halfLat, lng + halfLng],
    [lat + halfLat, lng + halfLng],
    [lat + halfLat, lng - halfLng],
  ];
}

function vertexIcon(active) {
  return L.divIcon({
    className: '',
    iconSize: [15, 15],
    iconAnchor: [7, 7],
    html: `<div style="width:15px;height:15px;border-radius:9999px;background:#f7f3ea;border:2px solid ${active ? '#c4673b' : '#10231c'};box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
  });
}
function pinIcon() {
  return L.divIcon({
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `<div style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:9999px;background:#10231c;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5)"><div style="width:6px;height:6px;border-radius:9999px;background:#fff"></div></div>`,
  });
}
function treeIcon(selected) {
  return L.divIcon({
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:#3f5d2e;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)${selected ? ';box-shadow:0 0 0 2px #c4673b,0 1px 4px rgba(0,0,0,.5)' : ''}"></div>`,
  });
}

function Recenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom || map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], zoom]);
  return null;
}

function MapInteraction({ picking, placingTree, editingLot, onPick, onTrace, onPlaceTree, onLotTrace }) {
  useMapEvents({
    click(e) {
      const ll = [e.latlng.lat, e.latlng.lng];
      if (editingLot) onLotTrace(ll);
      else if (picking) onPick(ll);
      else if (placingTree) onPlaceTree(ll);
      else onTrace(ll);
    },
  });
  return null;
}

let counter = 0;
const newId = () => `s${++counter}`;

export default function EditableLawnMap({ center, zoom = 19, lotSizeSqft = 0, lotOutline = null, initialShapes = null, initialTrees = null, initialBuildings = null, measuredSqft = null, onResult }) {
  const [viewCenter, setViewCenter] = useState(center);
  const [propCenter, setPropCenter] = useState(center);
  const [shapes, setShapes] = useState(() => {
    const lawns = (initialShapes || []).filter((pts) => Array.isArray(pts) && pts.length >= 3).map((pts, i) => ({ id: `seed${i}`, type: 'lawn', points: pts }));
    const buildings = (initialBuildings || []).filter((pts) => Array.isArray(pts) && pts.length >= 3).map((pts, i) => ({ id: `bseed${i}`, type: 'building', points: pts }));
    return [...lawns, ...buildings];
  });
  const [active, setActive] = useState(initialShapes && initialShapes.length ? 'seed0' : null);
  const [picking, setPicking] = useState(false);
  const [type, setType] = useState('lawn');
  const [placingTree, setPlacingTree] = useState(false);
  const lastAdded = useRef(null); // { kind: 'tree', id } — what Undo takes back when nothing is selected
  const [trees, setTrees] = useState(
    () => (initialTrees || []).filter((t) => Array.isArray(t?.latLng)).map((t, i) => ({ id: `tseed${i}`, latLng: t.latLng, radiusFt: Math.max(2, Number(t.radiusFt) || 6), heightFt: t.heightFt ?? null })),
  );
  const [activeTree, setActiveTree] = useState(null);
  const [showLot, setShowLot] = useState(true);
  const [lot, setLot] = useState(() => (lotOutline && lotOutline.length >= 3 ? lotOutline.map((p) => [...p]) : null));
  const [editingLot, setEditingLot] = useState(false);

  const activeShape = shapes.find((s) => s.id === active) || null;
  const selectedTree = trees.find((t) => t.id === activeTree) || null;
  const lawnArea = useMemo(
    () => shapes.filter((s) => s.type === 'lawn').reduce((sum, s) => sum + polygonAreaSqFt(s.points), 0),
    [shapes]
  );
  const buildingCount = shapes.filter((s) => s.type === 'building').length;
  const lotDisplay = useMemo(() => {
    if (lot) return lot;
    if (!showLot) return null;
    if (lotOutline && lotOutline.length >= 3) return lotOutline;
    if (lotSizeSqft > 0) return rectPoints(propCenter, lotSizeSqft);
    return null;
  }, [lot, showLot, lotOutline, lotSizeSqft, propCenter]);

  useEffect(() => {
    onResult({
      area: lawnArea,
      source: 'satellite',
      boundary: shapes.filter((s) => s.type === 'lawn').map((s) => s.points),
      features: shapes.map((s) => ({ type: s.type, points: s.points, area: polygonAreaSqFt(s.points) })),
      buildings: shapes.filter((s) => s.type === 'building').map((s) => s.points),
      trees: trees.map((t) => ({ latLng: t.latLng, radiusFt: t.radiusFt, heightFt: t.heightFt ?? null })),
      lotOutline: lot,
      center: propCenter,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lawnArea, shapes, trees, lot, propCenter]);

  const relocate = (latlng) => {
    setViewCenter(latlng);
    setPropCenter(latlng);
    setShapes([]);
    setActive(null);
    setPicking(false);
    setPlacingTree(false);
  };

  const trace = (latlng) => {
    if (placingTree) return;
    setShapes((prev) => {
      const current = prev.find((s) => s.id === active);
      if (!current) {
        const id = newId();
        setActive(id);
        return [...prev, { id, type, points: [latlng] }];
      }
      return prev.map((s) => (s.id === active ? { ...s, points: [...s.points, latlng] } : s));
    });
  };

  const placeTree = (latlng) => {
    const id = newId();
    lastAdded.current = { kind: 'tree', id };
    setTrees((prev) => [...prev, { id, latLng: latlng, radiusFt: 6 }]);
    setActiveTree(id);
    setActive(null);
  };

  const newShape = (t) => {
    setType(t);
    setPlacingTree(false);
    setEditingLot(false);
    if (activeShape && activeShape.points.length === 0) {
      setShapes((prev) => prev.map((s) => (s.id === active ? { ...s, type: t } : s)));
      return;
    }
    const id = newId();
    setShapes((prev) => [...prev, { id, type: t, points: [] }]);
    setActive(id);
    setActiveTree(null);
  };

  const undo = () => {
    if (editingLot) {
      setLot((prev) => (!prev || prev.length <= 1 ? null : prev.slice(0, -1)));
      return;
    }
    // Nothing selected: undo the most recent change (the last tree placed, or
    // the last corner of the last shape traced).
    const recentTree = lastAdded.current?.kind === 'tree' && trees.some((t) => t.id === lastAdded.current.id);
    if (!activeShape && recentTree) {
      const treeId = lastAdded.current.id;
      setTrees((prev) => prev.filter((t) => t.id !== treeId));
      setActiveTree(null);
      lastAdded.current = null;
      return;
    }
    const target = activeShape || [...shapes].reverse().find((sh) => sh.points.length);
    if (!target) return;
    const np = target.points.slice(0, -1);
    if (np.length === 0) {
      setShapes((prev) => prev.filter((s) => s.id !== target.id));
      setActive(null);
    } else {
      setShapes((prev) => prev.map((s) => (s.id === target.id ? { ...s, points: np } : s)));
    }
  };

  const removeActive = () => {
    if (editingLot) {
      setLot(null);
      return;
    }
    if (activeTree) {
      setTrees((prev) => prev.filter((t) => t.id !== activeTree));
      setActiveTree(null);
      return;
    }
    setShapes((prev) => prev.filter((s) => s.id !== active));
    setActive(null);
  };

  const setVertex = (si, vi, latlng) => {
    setShapes((prev) => prev.map((sh, i) => (i === si ? { ...sh, points: sh.points.map((p, j) => (j === vi ? latlng : p)) } : sh)));
  };

  const traceLot = (latlng) => setLot((prev) => (prev ? [...prev, latlng] : [latlng]));
  const setLotVertex = (vi, latlng) => setLot((prev) => (prev ? prev.map((p, j) => (j === vi ? latlng : p)) : prev));
  const toggleEditLot = () => {
    if (!editingLot) {
      setPlacingTree(false);
      setActive(null);
      setActiveTree(null);
      if (!lot && lotSizeSqft > 0) setLot(rectPoints(propCenter, lotSizeSqft));
      setEditingLot(true);
    } else {
      setEditingLot(false);
    }
  };

  const labelActive = (t) => {
    setType(t);
    if (activeShape) setShapes((prev) => prev.map((s) => (s.id === active ? { ...s, type: t } : s)));
  };

  const setTreeRadius = (r) => {
    if (!activeTree) return;
    setTrees((prev) => prev.map((t) => (t.id === activeTree ? { ...t, radiusFt: r } : t)));
  };

  const selectShape = (id) => { setActive(id); setActiveTree(null); };
  const selectTree = (id) => { setActiveTree(id); setActive(null); };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 px-4 py-3">
        <Button size="sm" variant="outline" onClick={() => newShape('lawn')} className="rounded-full" disabled={picking || placingTree}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New lawn
        </Button>
        <Button size="sm" variant="outline" onClick={() => newShape('building')} className="rounded-full" disabled={picking || placingTree}>
          <House className="mr-1.5 h-3.5 w-3.5" /> Outline building
        </Button>
        <Button size="sm" variant={placingTree ? 'default' : 'outline'} onClick={() => { setEditingLot(false); setPlacingTree((v) => !v); setActive(null); }} className="rounded-full" disabled={picking || editingLot}>
          <TreePine className="mr-1.5 h-3.5 w-3.5" /> {placingTree ? 'Placing trees…' : 'Add tree'}
        </Button>
        <Button size="sm" variant={editingLot ? 'default' : 'outline'} onClick={toggleEditLot} className="rounded-full" disabled={picking || placingTree}>
          <PenLine className="mr-1.5 h-3.5 w-3.5" /> {editingLot ? 'Editing line…' : 'Edit property line'}
        </Button>
        <Button size="sm" variant="ghost" onClick={undo} className="rounded-full text-muted-foreground" disabled={picking || placingTree || (editingLot ? !lot : !activeShape && !trees.length && !shapes.some((sh) => sh.points.length))}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Undo
        </Button>
        <Button size="sm" variant="ghost" onClick={removeActive} className="rounded-full text-muted-foreground" disabled={picking || placingTree || (editingLot ? !lot : (!activeShape && !activeTree))}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
        </Button>
        {lotSizeSqft > 0 && (
          <Button size="sm" variant={showLot ? 'default' : 'outline'} onClick={() => setShowLot((v) => !v)} className="rounded-full">
            Lot outline
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 px-4 py-2.5">
        {activeShape ? (
          <>
            <span className="mr-1 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">Label</span>
            {['lawn', 'building'].map((t) => {
              const st = featureStyle(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => labelActive(t)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] capitalize transition ${activeShape.type === t ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.color }} />
                  {t}
                </button>
              );
            })}
          </>
        ) : selectedTree ? (
          <>
            <span className="mr-1 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">Canopy</span>
            <input
              type="range"
              min={3}
              max={20}
              value={selectedTree.radiusFt}
              onChange={(e) => setTreeRadius(Number(e.target.value))}
              className="garden-slider w-28"
            />
            <span className="text-[11px] tabular-nums text-muted-foreground">{selectedTree.radiusFt} ft</span>
          </>
        ) : editingLot ? (
          <span className="text-[11px] text-muted-foreground">
            Click the map to add property-line corners · drag corners to adjust
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {placingTree ? 'Click the map to drop a tree (keeps placing until you pick another tool)' : 'Trace lawns, outline the building, or add trees'}
          </span>
        )}
        <div className="ml-auto flex items-baseline gap-1.5 rounded-full bg-secondary px-3.5 py-1.5">
          <span className="font-display text-lg leading-none tracking-tight">
            {measuredSqft !== null ? Math.round(measuredSqft).toLocaleString() : lawnArea > 0 ? Math.round(lawnArea).toLocaleString() : '—'}
          </span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">lawn sq ft</span>
        </div>
      </div>

      <div className={`relative h-[330px] w-full sm:h-[400px] cursor-crosshair`}>
        <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-full w-full" attributionControl>
          <TileLayer url={IMAGERY} attribution="Imagery © Esri, Maxar, Earthstar Geographics" maxZoom={20} />
          <Recenter center={viewCenter} zoom={zoom} />
          <MapInteraction picking={picking} placingTree={placingTree} editingLot={editingLot} onPick={relocate} onTrace={trace} onPlaceTree={placeTree} onLotTrace={traceLot} />
          <Marker
            position={propCenter}
            icon={pinIcon()}
            alt="Property center, drag to move"
            draggable
            eventHandlers={{ dragend: (e) => setPropCenter([e.target.getLatLng().lat, e.target.getLatLng().lng]) }}
          >
            <Tooltip permanent direction="top" offset={[0, -12]} className="property-center-tooltip">
              Property center
            </Tooltip>
          </Marker>
          {lotDisplay && (
            <Polygon positions={lotDisplay} pathOptions={{ color: '#10231c', weight: editingLot ? 2 : 1.5, dashArray: '6 5', fillColor: '#10231c', fillOpacity: 0.05 }} />
          )}
          {editingLot && lot && lot.map((pt, j) => (
            <Marker
              key={`lv-${j}`}
              position={pt}
              icon={vertexIcon(true)}
              alt={`Property line corner ${j + 1}, drag to move`}
              draggable
              eventHandlers={{ dragend: (e) => setLotVertex(j, [e.target.getLatLng().lat, e.target.getLatLng().lng]) }}
            />
          ))}
          {trees.map((t) => (
            <Circle
              key={`c-${t.id}`}
              center={t.latLng}
              radius={t.radiusFt * 0.3048}
              pathOptions={{ color: '#3f5d2e', weight: 1, fillColor: '#5a7344', fillOpacity: t.id === activeTree ? 0.45 : 0.3 }}
            />
          ))}
          {trees.map((t) => (
            <Marker
              key={`t-${t.id}`}
              position={t.latLng}
              icon={treeIcon(t.id === activeTree)}
              draggable
              eventHandlers={{
                click: () => selectTree(t.id),
                dragend: (e) => setTrees((prev) => prev.map((x) => (x.id === t.id ? { ...x, latLng: [e.target.getLatLng().lat, e.target.getLatLng().lng] } : x))),
              }}
            />
          ))}
          {shapes.map((shape, i) => {
            const st = featureStyle(shape.type);
            const isActive = shape.id === active;
            return (
              <Polygon
                key={shape.id}
                positions={shape.points}
                pathOptions={{
                  color: st.stroke,
                  weight: isActive ? 2.5 : 1.5,
                  fillColor: st.color,
                  fillOpacity: isActive ? 0.42 : 0.3,
                }}
                eventHandlers={{ click: () => selectShape(shape.id) }}
              />
            );
          })}
          {shapes.map((shape, i) =>
            shape.points.map((pt, j) => (
              <Marker
                key={`v-${shape.id}-${j}`}
                position={pt}
                icon={vertexIcon(shape.id === active)}
                draggable
                eventHandlers={{
                  click: () => selectShape(shape.id),
                  dragstart: () => selectShape(shape.id),
                  dragend: (e) => setVertex(i, j, [e.target.getLatLng().lat, e.target.getLatLng().lng]),
                }}
              />
            ))
          )}
        </MapContainer>
        {picking ? (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-foreground/85 px-3.5 py-1.5 text-[11px] text-background backdrop-blur">
            Click your house on the map to center the outline there
          </div>
        ) : placingTree ? (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-foreground/85 px-3.5 py-1.5 text-[11px] text-background backdrop-blur">
            Click the map to drop a tree (keeps placing) · drag to move · click a tree to resize or delete it
          </div>
        ) : editingLot ? (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-foreground/85 px-3.5 py-1.5 text-[11px] text-background backdrop-blur">
            Click to add property-line corners · drag corners to adjust · Undo removes the last · click Edit property line again to finish
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-foreground/85 px-3.5 py-1.5 text-[11px] text-background backdrop-blur">
            Trace lawns · outline the building · add trees · drag corners to fine-tune · {buildingCount} building{buildingCount === 1 ? '' : 's'} · {trees.length} tree{trees.length === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}