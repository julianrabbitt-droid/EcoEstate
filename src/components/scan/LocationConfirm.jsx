import { useEffect, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#c4673b;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function ClickToMove({ onMove }) {
  useMapEvents({ click: (e) => onMove([e.latlng.lat, e.latlng.lng]) });
  return null;
}

function Recenter({ point }) {
  const map = useMap();
  useEffect(() => {
    map.panTo(point, { animate: true });
  }, [map, point]);
  return null;
}

/**
 * Step between typing an address and scanning: the satellite view of where
 * the address landed, so the person can say it's their property, or move
 * the pin onto it first (address lookups sometimes land on the street or the
 * neighbour). onConfirm([lat, lng]) starts the scan there.
 */
export default function LocationConfirm({ label, point, estimated = false, onConfirm, onCancel }) {
  const [pin, setPin] = useState(point);
  const [fixing, setFixing] = useState(false);
  const moved = pin[0] !== point[0] || pin[1] !== point[1];

  return (
    <div>
      <div className="px-5 pb-4 pt-5">
        <p className="font-display text-[1.35rem] tracking-tight">Is this your property?</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {label ? <span className="text-foreground">{label}. </span> : null}
          {fixing
            ? 'Tap your house on the map, or drag the pin onto it.'
            : estimated
              ? 'This pin is an estimate along the street, so it may be on a neighbour. Check it sits on your house before we scan.'
              : 'Check the pin sits on your house before we scan the lawn around it.'}
        </p>
      </div>
      <div className="relative h-[340px] w-full sm:h-[400px]">
        <MapContainer center={pin} zoom={19} maxZoom={21} className="h-full w-full" zoomControl scrollWheelZoom>
          <TileLayer url={IMAGERY} attribution="Imagery © Esri, Maxar, Earthstar Geographics" maxNativeZoom={19} maxZoom={21} />
          <Marker
            position={pin}
            icon={pinIcon}
            draggable
            eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); setPin([ll.lat, ll.lng]); setFixing(true); } }}
          />
          {fixing && <ClickToMove onMove={setPin} />}
          <Recenter point={pin} />
        </MapContainer>
      </div>
      <div className="flex flex-wrap gap-2 px-5 py-4">
        <Button className="rounded-full" onClick={() => onConfirm(pin)}>
          {moved ? 'Scan this spot' : 'Yes, scan my property'}
        </Button>
        {!fixing && (
          <Button variant="outline" className="rounded-full" onClick={() => setFixing(true)}>
            <MapPin className="mr-1.5 h-4 w-4" />
            No, move the pin
          </Button>
        )}
        {moved && (
          <Button variant="ghost" className="rounded-full" onClick={() => setPin(point)}>
            Reset pin
          </Button>
        )}
        <Button variant="ghost" className="ml-auto rounded-full text-muted-foreground" onClick={onCancel}>
          Different address
        </Button>
      </div>
    </div>
  );
}
