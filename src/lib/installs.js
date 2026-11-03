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
