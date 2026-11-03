import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { House, PenLine, Plus, RotateCcw, Sprout, Trash2, TreePine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { polygonAreaSqFt } from '@/lib/geo';

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const STYLES = {
  lawn: { color: '#8fae6b', stroke: '#eadfbf' },
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

// Where a clicked point joins an outline: on the edge nearest to it (between
// the two corners it falls between), so a corner added anywhere keeps the
// shape from crossing itself. Returns the index to insert at and how far the
// edge is (metres); outlines under three corners take it at the end.
function nearestEdge(points, [lat, lng]) {
  if (points.length < 3) return { index: points.length, distM: 0 };
  const k = Math.cos((lat * Math.PI) / 180) * 111320;
  const xy = ([a, b]) => [(b - lng) * k, (a - lat) * 110540];
  let best = { index: points.length, distM: Infinity };
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = xy(points[i]);
    const [bx, by] = xy(points[(i + 1) % points.length]);
    const [ex, ey] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, -(ax * ex + ay * ey) / (ex * ex + ey * ey || 1)));
    const d = Math.hypot(ax + t * ex, ay + t * ey);
    if (d < best.distM) best = { index: i + 1, distM: d };
  }
  return best;
}
const JOIN_NEAR_M = 4; // a click this close to an outline's edge adds a corner to it rather than starting a new one

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

// Opens framed on the property line (or the lawns), so the lot fills the
// map rather than sitting small in the middle of the block.
function FitProperty({ outline }) {
  const map = useMap();
  useEffect(() => {
    const pts = (outline || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length >= 3) map.fitBounds(pts, { padding: [36, 36], maxZoom: 21 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const [active, setActive] = useState(null);
  const [picking, setPicking] = useState(false);
  // One layer is edited at a time (lawns, buildings, trees or the property
  // line); the others stay on the map, faint, and ignore clicks.
  const [layer, setLayer] = useState('lawn');
  const placingTree = layer === 'tree';
  const editingLot = layer === 'lot';
  const lastAdded = useRef(null); // { kind: 'tree', id } — what Undo takes back when nothing is selected
  const [trees, setTrees] = useState(
    () => (initialTrees || []).filter((t) => Array.isArray(t?.latLng)).map((t, i) => ({ id: `tseed${i}`, latLng: t.latLng, radiusFt: Math.max(2, Number(t.radiusFt) || 6), heightFt: t.heightFt ?? null })),
  );
  const [activeTree, setActiveTree] = useState(null);
  const [showLot, setShowLot] = useState(true);
  const [lot, setLot] = useState(() => (lotOutline && lotOutline.length >= 3 ? lotOutline.map((p) => [...p]) : null));

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
  };

  // A click adds a corner to the outline being traced, on its nearest edge;
  // with none selected, to the outline whose edge it's on, else it starts one.
  const trace = (latlng) => {
    if (layer !== 'lawn' && layer !== 'building') return;
    let target = shapes.find((sh) => sh.id === active && sh.type === layer);
    if (!target) {
      const near = shapes
        .filter((sh) => sh.type === layer && sh.points.length >= 3)
        .map((sh) => ({ sh, ...nearestEdge(sh.points, latlng) }))
        .sort((a, b) => a.distM - b.distM)[0];
      if (near && near.distM <= JOIN_NEAR_M) target = near.sh;
    }
    if (!target) {
      const id = newId();
      setActive(id);
      lastAdded.current = { kind: 'corner', id, index: 0 };
      setShapes((prev) => [...prev, { id, type: layer, points: [latlng] }]);
      return;
    }
    const { index } = nearestEdge(target.points, latlng);
    setActive(target.id);
    lastAdded.current = { kind: 'corner', id: target.id, index };
    setShapes((prev) => prev.map((sh) => (sh.id === target.id ? { ...sh, points: [...sh.points.slice(0, index), latlng, ...sh.points.slice(index)] } : sh)));
  };

  const placeTree = (latlng) => {
    const id = newId();
    lastAdded.current = { kind: 'tree', id };
    setTrees((prev) => [...prev, { id, latLng: latlng, radiusFt: 6 }]);
    setActiveTree(id);
    setActive(null);
  };

  // A fresh outline in the layer being edited; clicks on the map add its corners.
  const newShape = () => {
    if (activeShape && activeShape.type === layer && activeShape.points.length === 0) return;
    const id = newId();
    setShapes((prev) => [...prev, { id, type: layer, points: [] }]);
    setActive(id);
    setActiveTree(null);
  };

  // The corner just added (wherever it went in the outline), else the last one.
  const withoutCorner = (points, id) => {
    const last = lastAdded.current;
    const at = last?.kind === 'corner' && last.id === id && last.index < points.length ? last.index : points.length - 1;
    if (last?.id === id) lastAdded.current = null;
    return points.filter((_, j) => j !== at);
  };

  const undo = () => {
    if (editingLot) {
      setLot((prev) => (!prev || prev.length <= 1 ? null : withoutCorner(prev, 'lot')));
      return;
    }
    // Nothing selected: undo the most recent change (the last tree placed, or
    // the last corner of the last shape traced).
    if (layer === 'tree') {
      const recentTree = lastAdded.current?.kind === 'tree' && trees.some((t) => t.id === lastAdded.current.id);
      if (!recentTree) return;
      const treeId = lastAdded.current.id;
      setTrees((prev) => prev.filter((t) => t.id !== treeId));
      setActiveTree(null);
      lastAdded.current = null;
      return;
    }
    const target = (activeShape?.type === layer ? activeShape : null) || [...shapes].reverse().find((sh) => sh.type === layer && sh.points.length);
    if (!target) return;
    const np = withoutCorner(target.points, target.id);
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

  const traceLot = (latlng) => {
    const pts = lot || [];
    const { index } = nearestEdge(pts, latlng);
    lastAdded.current = { kind: 'corner', id: 'lot', index };
    setLot([...pts.slice(0, index), latlng, ...pts.slice(index)]);
  };
  const setLotVertex = (vi, latlng) => setLot((prev) => (prev ? prev.map((p, j) => (j === vi ? latlng : p)) : prev));
  const pickLayer = (l) => {
    setLayer(l);
    setActive(null);
    setActiveTree(null);
    if (l === 'lot' && !lot && lotSizeSqft > 0) setLot(rectPoints(propCenter, lotSizeSqft));
  };

  const setTreeRadius = (r) => {
    if (!activeTree) return;
    setTrees((prev) => prev.map((t) => (t.id === activeTree ? { ...t, radiusFt: r } : t)));
  };

  const selectShape = (id) => { setActive(id); setActiveTree(null); };
  const selectTree = (id) => { setActiveTree(id); setActive(null); };

  return (
    <div>
      {/* Which layer to fix: one at a time, each with only its own buttons. */}
      <div className="border-b border-border/70 px-4 py-3">
        <div role="tablist" aria-label="What to fix" className="flex flex-wrap gap-1 rounded-2xl bg-secondary/70 p-1">
          {[
            { k: 'lawn', label: 'Lawns', Icon: Sprout, n: shapes.filter((sh) => sh.type === 'lawn').length },
            { k: 'building', label: 'Buildings', Icon: House, n: buildingCount },
            { k: 'tree', label: 'Trees', Icon: TreePine, n: trees.length },
            { k: 'lot', label: 'Property line', Icon: PenLine, n: null },
          ].map(({ k, label, Icon, n }) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={layer === k}
              onClick={() => pickLayer(k)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-[12.5px] transition ${layer === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
              {n !== null && <span className={`rounded-full px-1.5 text-[10.5px] tabular-nums ${layer === k ? 'bg-secondary' : 'bg-background/60'}`}>{n}</span>}
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {(layer === 'lawn' || layer === 'building') && (
            <Button size="sm" variant="outline" onClick={newShape} className="rounded-full" disabled={picking}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> {layer === 'lawn' ? 'New lawn' : 'New building'}
            </Button>
          )}
          {layer === 'tree' && selectedTree && (
            <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1">
              <span className="text-[12px] text-muted-foreground">Canopy</span>
              <input type="range" min={3} max={20} value={selectedTree.radiusFt} onChange={(e) => setTreeRadius(Number(e.target.value))} className="garden-slider w-24" aria-label="Canopy radius" />
              <span className="text-[11px] tabular-nums text-muted-foreground">{selectedTree.radiusFt} ft</span>
            </span>
          )}
          {layer === 'lot' && lotSizeSqft > 0 && (
            <Button size="sm" variant={showLot ? 'default' : 'outline'} onClick={() => setShowLot((v) => !v)} className="rounded-full">
              {showLot ? 'Hide estimate' : 'Show estimate'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={undo} className="rounded-full text-muted-foreground" disabled={picking || (layer === 'lot' ? !lot : layer === 'tree' ? !(lastAdded.current?.kind === 'tree') : !shapes.some((sh) => sh.type === layer && sh.points.length))}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> {layer === 'lot' || layer === 'lawn' || layer === 'building' ? 'Undo corner' : 'Undo'}
          </Button>
          <Button size="sm" variant="ghost" onClick={removeActive} className="rounded-full text-muted-foreground" disabled={picking || (layer === 'lot' ? !lot : layer === 'tree' ? !activeTree : !(activeShape && activeShape.type === layer))}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {layer === 'lot' ? 'Clear line' : layer === 'tree' ? 'Delete tree' : layer === 'lawn' ? 'Delete lawn' : 'Delete building'}
          </Button>
          <div className="ml-auto flex items-baseline gap-1.5 rounded-full bg-secondary px-3.5 py-1.5">
            <span className="font-display text-lg leading-none tracking-tight">
              {measuredSqft !== null ? Math.round(measuredSqft).toLocaleString() : lawnArea > 0 ? Math.round(lawnArea).toLocaleString() : '—'}
            </span>
            <span className="text-[12px] text-muted-foreground">lawn sq ft</span>
          </div>
        </div>
      </div>

      <div className={`relative h-[330px] w-full sm:h-[400px] cursor-crosshair`}>
        <MapContainer center={center} zoom={zoom} maxZoom={21} scrollWheelZoom className="h-full w-full" attributionControl>
          <TileLayer url={IMAGERY} attribution="Imagery © Esri, Maxar, Earthstar Geographics" maxNativeZoom={19} maxZoom={21} />
          <Recenter center={viewCenter} zoom={zoom} />
          <FitProperty outline={lotOutline && lotOutline.length >= 3 ? lotOutline : (initialShapes || []).flat()} />
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
            <>
              {/* White over a dark halo, so the property line reads on light and dark imagery alike. */}
              <Polygon positions={lotDisplay} interactive={false} pathOptions={{ color: '#14211a', weight: editingLot ? 5.5 : 5, opacity: 0.45, fillOpacity: 0 }} />
              <Polygon positions={lotDisplay} pathOptions={{ color: '#ffffff', weight: editingLot ? 3 : 2.5, dashArray: '7 5', fillColor: '#ffffff', fillOpacity: 0.04 }} />
            </>
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
              interactive={false}
              pathOptions={{ color: '#3f5d2e', weight: 1, opacity: layer === 'tree' ? 1 : 0.4, fillColor: '#5a7344', fillOpacity: t.id === activeTree ? 0.45 : layer === 'tree' ? 0.3 : 0.12 }}
            />
          ))}
          {layer === 'tree' && trees.map((t) => (
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
          {shapes.map((shape) => {
            const st = featureStyle(shape.type);
            const isActive = shape.id === active;
            const editing = shape.type === layer;
            return (
              <Polygon
                key={`${shape.id}-${editing}`}
                positions={shape.points}
                interactive={editing}
                pathOptions={{
                  color: st.stroke,
                  weight: isActive ? 3 : editing ? 2.5 : 1.5,
                  opacity: editing ? 1 : 0.45,
                  fillColor: st.color,
                  fillOpacity: isActive ? 0.55 : editing ? 0.45 : 0.15,
                }}
                eventHandlers={editing ? { click: () => selectShape(shape.id) } : {}}
              />
            );
          })}
          {shapes.map((shape, i) =>
            shape.type !== layer ? null : shape.points.map((pt, j) => (
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
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[500] max-w-[92%] -translate-x-1/2 rounded-full bg-foreground/85 px-3.5 py-1.5 text-center text-[11px] text-background backdrop-blur">
          {picking
            ? 'Click your house on the map to center the outline there'
            : {
                lawn: 'Click to add a lawn’s corners (each joins the nearest edge) · drag corners to adjust · New lawn starts another',
                building: 'Click to add a building’s corners (each joins the nearest edge) · drag corners to adjust · New building starts another',
                tree: 'Click the map to add a tree · drag to move · click one to resize or delete it',
                lot: 'Click to add property-line corners (each joins the nearest edge) · drag corners to adjust',
              }[layer]}
        </div>
      </div>
    </div>
  );
}