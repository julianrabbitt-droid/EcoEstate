import { base44 } from '@/api/base44Client';

// Community installs (server/functions/communityInstall): a host's planting
// day, and the people signed up to help.

export async function installAction(action, payload = {}) {
  const { data } = await base44.functions.invoke('communityInstall', { action, ...payload });
  return data;
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Open and full installs from today on, soonest first.
export async function upcomingInstalls() {
  const list = await base44.entities.CommunityInstall.filter({ status: { $in: ['open', 'full'] } }, { sort: 'date', limit: 200 });
  const today = todayLocal();
  return list.filter((i) => i.date >= today);
}

export const getInstall = (id) => base44.entities.CommunityInstall.get(id);
export const hostedInstalls = (userId) => base44.entities.CommunityInstall.filter({ created_by_id: userId }, { sort: '-date', limit: 50 });
export const mySignups = (userId) => base44.entities.InstallSignup.filter({ created_by_id: userId }, { sort: '-installDate', limit: 200 });
export const helpersOf = (installId) => base44.entities.InstallSignup.filter({ installId }, { sort: 'created_date', limit: 200 });

export const spotsLeft = (i) => Math.max(0, (i?.spots || 0) - (i?.joined || 0));

export function installWhen(i, { long = false } = {}) {
  if (!i?.date) return '';
  const day = new Date(`${i.date}T12:00:00`).toLocaleDateString('en-US', long ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });
  if (!i.startTime) return day;
  const [h, m] = i.startTime.split(':').map(Number);
  const time = new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

// Jobs a planting day usually has, offered when hosting one.
export const INSTALL_TASKS = ['Removing turf', 'Sheet mulching', 'Spreading mulch', 'Laying drip line', 'Planting', 'Watering in', 'Hauling and cleanup'];

// Miles between two [lat, lon] points (great circle).
export function milesBetween(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const rad = Math.PI / 180;
  const [dLat, dLon] = [(b[0] - a[0]) * rad, (b[1] - a[1]) * rad];
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Installs sorted nearest first from a [lat, lon] point (each with `miles`),
// soonest first when there's no point or no location for an install.
export function byDistance(installs, from) {
  return (installs || [])
    .map((i) => ({ ...i, miles: from && i.mapPoint ? milesBetween(from, i.mapPoint) : null }))
    .sort((x, y) => (x.miles ?? Infinity) - (y.miles ?? Infinity) || String(x.date).localeCompare(String(y.date)));
}

// What a planting day does for the planet: the lawn it converts saves about
// this many gallons a year (turf at 46 gal/sq ft, natives at 13.5).
export const gallonsSavedPerYear = (lawnSqft) => Math.round((Number(lawnSqft) || 0) * 32.5);

// Volunteer milestones, by confirmed hours.
export const VOLUNTEER_MILESTONES = [
  { hours: 4, name: 'First planting', note: 'Your first confirmed planting day' },
  { hours: 10, name: 'Seedling', note: '10 hours: a regular in the garden' },
  { hours: 25, name: 'Sapling', note: '25 hours: enough to lead a crew' },
  { hours: 50, name: 'Valley oak', note: '50 hours: a pillar of local habitat' },
  { hours: 100, name: 'Coast redwood', note: '100 hours: a year of service' },
];
