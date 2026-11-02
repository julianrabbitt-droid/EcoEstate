import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SIZE_KEY = 'ecoestate_minimap_size';
const MIN = { w: 120, h: 90 };
const MAX = { w: 560, h: 440 };

function savedSize() {
  try {
    const s = JSON.parse(window.localStorage.getItem(SIZE_KEY) || 'null');
    if (s && s.w >= MIN.w && s.h >= MIN.h) return { w: Math.min(s.w, MAX.w), h: Math.min(s.h, MAX.h) };
  } catch {
    /* storage unavailable */
  }
  return { w: 140, h: 110 };
}

// Leaflet only measures its box on load, so tell it when the box is resized.
function KeepSized({ size }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
  }, [map, size.w, size.h]);
  return null;
}

// A small, non-interactive satellite map of the property shown in the top-right
// corner during the first-person walk-through. A person marker follows the
// 3D camera position (converted from the scene's local feet space back to
// lat/lng) and rotates to face the walking heading.
export default function WalkMiniMap({ project, getPersonGeo }) {
  const bounds = useMemo(() => {
    const pts = [];
    const pushPoly = (poly) => {
      if (!Array.isArray(poly)) return;
      poly.forEach((p) => { if (Array.isArray(p) && p.length >= 2) pts.push([p[0], p[1]]); });
    };
    const b = project?.boundary;
    if (Array.isArray(b)) {
      if (b.length && Array.isArray(b[0]) && b[0].length && Array.isArray(b[0][0])) b.forEach(pushPoly);
      else pushPoly(b);
    }
    if (Array.isArray(project?.lotOutline)) pushPoly(project.lotOutline);
    return pts;
  }, [project]);

  const lawns = useMemo(() => {
    const b = project?.boundary;
    if (!Array.isArray(b)) return [];
    return b.length && Array.isArray(b[0]) && b[0].length && Array.isArray(b[0][0]) ? b : [b];
  }, [project]);

  const lot = useMemo(() => (Array.isArray(project?.lotOutline) ? project.lotOutline : null), [project]);

  // Resizable from the bottom-left corner (the map is pinned top-right):
  // dragging left widens it, dragging down makes it taller.
  const [size, setSize] = useState(savedSize);
  const drag = useRef(null);
  const onResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation(); // don't orbit or walk the 3D view
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ...size };
  };
  const onResizeMove = (e) => {
    if (!drag.current) return;
    e.stopPropagation();
    const d = drag.current;
    setSize({
      w: Math.max(MIN.w, Math.min(MAX.w, d.w + (d.x - e.clientX))),
      h: Math.max(MIN.h, Math.min(MAX.h, d.h + (e.clientY - d.y))),
    });
  };
  const onResizeEnd = (e) => {
    if (!drag.current) return;
    e.stopPropagation();
    drag.current = null;
    try {
      window.localStorage.setItem(SIZE_KEY, JSON.stringify(size));
    } catch {
      /* storage unavailable */
    }
  };
  const center = useMemo(() => {
    if (bounds.length) {
      const lat = bounds.reduce((s, p) => s + p[0], 0) / bounds.length;
      const lng = bounds.reduce((s, p) => s + p[1], 0) / bounds.length;
      return [lat, lng];
    }
    return project?.center || [37.4358, -122.1558];
  }, [bounds, project]);

  return (
    <div
      className="pointer-events-auto absolute right-3 top-3 z-[5] overflow-hidden rounded-md border border-background/60 bg-background/70 shadow-md backdrop-blur"
      style={{ width: size.w, height: size.h }}
    >
      <div className="flex items-center justify-between bg-background/70 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-muted-foreground">
        <span>Your location · © Esri</span>
        <span className="text-accent">●</span>
      </div>
      <div className="h-[calc(100%-16px)] w-full">
        <MapContainer
          center={center}
          zoom={19}
          className="h-full w-full"
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          boxZoom={false}
          keyboard={false}
          tap={false}
          touchZoom={false}
        >
          <TileLayer url={IMAGERY} maxZoom={22} maxNativeZoom={20} />
          <KeepSized size={size} />
          <FitBounds points={bounds} key={`${size.w}x${size.h}`} />
          {lawns.map((poly, i) => (
            <Polygon
              key={`lawn-${i}`}
              positions={poly}
              pathOptions={{ color: '#c4673b', weight: 1.5, opacity: 0.9, fillOpacity: 0.08 }}
            />
          ))}
          {lot && (
            <Polygon
              positions={lot}
              pathOptions={{ color: '#ffffff', weight: 1.5, opacity: 0.85, fillOpacity: 0, dashArray: '3 3' }}
            />
          )}
          <PersonTracker getPersonGeo={getPersonGeo} center={center} />
        </MapContainer>
      </div>
      <div
        role="separator"
        aria-label="Drag to resize the map"
        title="Drag to resize"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        className="absolute bottom-0 left-0 z-[1000] h-4 w-4 cursor-nesw-resize touch-none"
        style={{ background: 'linear-gradient(45deg, rgba(255,255,255,0.95) 0 22%, transparent 22% 34%, rgba(255,255,255,0.95) 34% 44%, transparent 44%)' }}
      />
    </div>
  );
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) {
      const b = L.latLngBounds(points.map((p) => [p[0], p[1]]));
      map.fitBounds(b, { padding: [6, 6], animate: false });
      map.setMaxBounds(b.pad(0.6));
    }
  }, [map, points]);
  return null;
}

function personIcon() {
  return L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html:
      '<div style="width:22px;height:22px;border-radius:9999px;background:#fff;border:2px solid #c4673b;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center">' +
      '<div class="walk-arrow" style="width:0;height:0;border-left:5px solid transparent;' +
      'border-right:5px solid transparent;border-bottom:8px solid #c4673b;transform:rotate(0deg)"></div>' +
      '</div>',
  });
}

function PersonTracker({ getPersonGeo, center }) {
  const map = useMap();
  const markerRef = useRef(null);

  useEffect(() => {
    let raf;
    let last = 0;
    const tick = () => {
      const now = performance.now();
      if (now - last > 50) {
        last = now;
        const p = getPersonGeo && getPersonGeo();
        if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
          if (!markerRef.current) {
            markerRef.current = L.marker([p.lat, p.lng], { icon: personIcon(), interactive: false, zIndexOffset: 1000 }).addTo(map);
          } else {
            markerRef.current.setLatLng([p.lat, p.lng]);
            const el = markerRef.current.getElement();
            const arrow = el && el.querySelector('.walk-arrow');
            if (arrow) arrow.style.transform = `rotate(${p.headingDeg || 0}deg)`;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    // Seed the marker at the property center so it appears immediately.
    if (!markerRef.current) {
      markerRef.current = L.marker(center, { icon: personIcon(), interactive: false, zIndexOffset: 1000 }).addTo(map);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
    };
  }, [map, getPersonGeo, center]);

  return null;
}