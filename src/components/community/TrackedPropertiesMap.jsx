import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, LocateFixed, MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';

const BASEMAP = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';
const NEARBY_MILES = 25;
const OTHER_STYLE = { color: '#4a6b3a', weight: 2, fillColor: '#7d8f6e', fillOpacity: 0.45 };
const OWN_STYLE = { color: '#c4673b', weight: 2, fillColor: '#f0a03c', fillOpacity: 0.5 };
// Community posts sit at their city's centre: a ringed marker, distinct from projects.
const POST_STYLE = { color: '#2f5d8a', weight: 3, fillColor: '#ffffff', fillOpacity: 0.9 };
// Locations are approximate (~1 km), so markers are drawn as areas, not pins.
const MARKER_RADIUS_PX = 14;

// Great-circle distance in miles between two [lat, lng] points.
function haversineMiles([lat1, lng1], [lat2, lng2]) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

// Accepts [lat, lng] or { lat, lng } and returns [lat, lng] (or null).
function toPoint(p) {
  if (Array.isArray(p) && p.length >= 2) return [Number(p[0]), Number(p[1])];
  if (p && typeof p === 'object' && 'lat' in p) return [Number(p.lat), Number(p.lng ?? p.lon)];
  return null;
}

const percentConverted = (p) =>
  p.lawnSqft > 0 ? Math.min(100, Math.round(((p.convertedSqft || 0) / p.lawnSqft) * 100)) : 0;

const distanceLabel = (miles) => (miles < 1 ? 'less than 1 mi away' : `about ${Math.round(miles)} mi away`);

function startedOn(d) {
  try {
    return d ? new Date(d).toLocaleDateString([], { month: 'short', year: 'numeric' }) : null;
  } catch {
    return null;
  }
}

// Leaflet measures its box once on mount; re-measure whenever the box changes.
function KeepSized() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 12 });
  }, [map, points]);
  return null;
}

function MessageButton({ project }) {
  const navigate = useNavigate();
  return (
    <Button
      size="sm"
      variant="outline"
      className="rounded-full"
      onClick={() =>
        navigate(
          `/social?tab=messages&to=${encodeURIComponent(project.created_by_id)}&name=${encodeURIComponent(project.ownerName || 'Member')}`
        )
      }
    >
      Message
    </Button>
  );
}

// Map and "nearby" list of other members' shared lawn conversions.
export default function TrackedPropertiesMap({ posts = [] }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [geoHome, setGeoHome] = useState(null);
  const [geoError, setGeoError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [shared, own] = await Promise.all([
          base44.entities.TrackedProject.filter({ shareOnMap: true }, { limit: 500 }),
          user?.id ? base44.entities.TrackedProject.filter({ created_by_id: user.id }, { limit: 50 }) : [],
        ]);
        if (cancelled) return;
        setProjects(shared.items ?? shared);
        setMine(own.items ?? own);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Shared projects with a usable approximate location.
  const located = useMemo(
    () => projects.map((p) => ({ ...p, point: toPoint(p.mapPoint) })).filter((p) => p.point),
    [projects]
  );

  // "Home" is the viewer's own project location, else the browser location if they opted in.
  const home = useMemo(() => {
    for (const p of mine) {
      const point = toPoint(p.center) || toPoint(p.mapPoint);
      if (point) return point;
    }
    return geoHome;
  }, [mine, geoHome]);

  const nearby = useMemo(() => {
    if (!home) return [];
    return located
      .filter((p) => p.created_by_id !== user?.id)
      .map((p) => ({ ...p, miles: haversineMiles(home, p.point) }))
      .filter((p) => p.miles <= NEARBY_MILES)
      .sort((a, b) => a.miles - b.miles);
  }, [located, home, user?.id]);

  // Posts with a city, grouped so one marker per city lists all of its posts.
  const postPlaces = useMemo(() => {
    const groups = new Map();
    for (const post of posts) {
      const point = toPoint(post.mapPoint);
      if (!point) continue;
      const key = point.join(',');
      if (!groups.has(key)) groups.set(key, { key, point, city: post.city, posts: [] });
      groups.get(key).posts.push(post);
    }
    return [...groups.values()];
  }, [posts]);

  const fitPoints = useMemo(() => [...located.map((p) => p.point), ...postPlaces.map((g) => g.point)], [located, postPlaces]);

  const useMyLocation = () => {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError('Location is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeoHome([pos.coords.latitude, pos.coords.longitude]),
      () => setGeoError('Location permission was denied.')
    );
  };

  if (loading) {
    return (
      <div className="surface flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="surface p-5 text-[12.5px] text-muted-foreground">Couldn't load the map right now.</p>;
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-xs">Tracked properties</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Real lawn conversions shared by members. Locations are approximate (about 1 km).
          </p>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Share your project on the map from{' '}
          <Link to="/my-projects" className="font-medium text-foreground underline underline-offset-2">
            My projects
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="surface relative h-[360px] overflow-hidden">
          {located.length === 0 && postPlaces.length === 0 && (
            <p className="absolute inset-x-0 top-3 z-[500] mx-auto w-fit rounded-full bg-background/90 px-3 py-1 text-[11.5px] text-muted-foreground shadow">
              No properties or posts on the map yet
            </p>
          )}
          <MapContainer center={home || [39.5, -98.35]} zoom={home ? 10 : 4} className="h-full w-full" style={{ background: "#e9e9e6" }} scrollWheelZoom>
            <TileLayer url={BASEMAP} attribution={ATTRIBUTION} maxNativeZoom={16} maxZoom={19} />
            <KeepSized />
            <FitBounds points={fitPoints} />
            {located.map((p) => {
              const own = p.created_by_id === user?.id;
              const started = startedOn(p.startDate);
              return (
                <CircleMarker key={p.id} center={p.point} radius={MARKER_RADIUS_PX} pathOptions={own ? OWN_STYLE : OTHER_STYLE}>
                  <Popup>
                    <div className="space-y-1 text-[12.5px]">
                      <p className="font-medium">{own ? `${p.name || 'Your project'} (yours)` : p.mapLabel || 'Member project'}</p>
                      <p className="text-muted-foreground">{p.ownerName || 'Member'}</p>
                      <p>{percentConverted(p)}% converted{started && ` · started ${started}`}</p>
                      {!own && <MessageButton project={p} />}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
            {postPlaces.map((g) => (
              <CircleMarker key={`post-${g.key}`} center={g.point} radius={9} pathOptions={POST_STYLE}>
                <Popup>
                  <div className="space-y-1.5 text-[12.5px]">
                    <p className="font-medium">{g.city}</p>
                    <ul className="space-y-1">
                      {g.posts.slice(0, 5).map((post) => (
                        <li key={post.id}>
                          <a href={`#post-${post.id}`} className="underline underline-offset-2">{post.title}</a>
                        </li>
                      ))}
                    </ul>
                    {g.posts.length > 5 && <p className="text-muted-foreground">+{g.posts.length - 5} more in the feed</p>}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <aside className="surface max-h-[360px] overflow-auto">
          <p className="label-xs border-b border-border/60 px-4 py-3">Nearby (within {NEARBY_MILES} mi)</p>
          {!home ? (
            <div className="space-y-2 p-4 text-[12.5px] text-muted-foreground">
              <p>Track a project to see neighbors, or use your browser's location.</p>
              <Button size="sm" variant="outline" className="rounded-full" onClick={useMyLocation}>
                <LocateFixed className="mr-1.5 h-3.5 w-3.5" /> Use my location
              </Button>
              {geoError && <p className="text-destructive">{geoError}</p>}
            </div>
          ) : nearby.length === 0 ? (
            <p className="p-4 text-[12.5px] text-muted-foreground">No shared properties near you yet.</p>
          ) : (
            <ul>
              {nearby.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium">
                      {p.created_by_id === user?.id ? p.name || 'Your project' : p.mapLabel || 'Member project'}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {distanceLabel(p.miles)} · {percentConverted(p)}% converted
                    </p>
                  </div>
                  <MessageButton project={p} />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}
