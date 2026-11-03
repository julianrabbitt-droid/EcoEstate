import { createClientFromRequest } from '../../sdk.js';
import { sendEmail } from '../../email.js';
import { APP_URL } from '../../config.js';

// Community installs: a homeowner hosts a planting day for their lawn
// conversion and people sign up to help, for the experience, the environment
// and volunteer hours the host confirms afterwards. Everything that changes an
// install's sign-ups goes through here, so the counts stay right and nobody
// sees an address or email they shouldn't:
//   start   { projectId, title, date, startTime, hours, spots, ... } host: create, or update their open one
//   join    { installId, name, message, role, groupSize, consent }    sign up to help
//   leave   { installId }                                             cancel your sign-up
//   contact { installId, message, signupId? }                         host -> helpers (all, or one); anyone -> host
//   hours   { installId, entries: [{ signupId, attended, hours }], done } host confirms who came and for how long
//   cancel  { installId }                                             host calls the day off
// Emails go through Resend; a reply reaches the person who wrote (reply-to),
// never support. Email addresses are shared only by writing or signing up.

const MAX = { title: 120, text: 2000, short: 300, name: 80, tasks: 12 };
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const today = () => new Date(Date.now() - 12 * 3600e3).toISOString().slice(0, 10); // a little slack for US time zones
const firstName = (user) => String(user?.full_name || '').trim().split(/\s+/)[0] || 'A neighbor';
const link = (id) => `${APP_URL}/installs/${id}`;
const when = (i) => `${new Date(`${i.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}${i.startTime ? ` at ${i.startTime}` : ''}`;

// Sends limited per person per hour, so the relay can't be used to spam.
const SENDS_PER_HOUR = 10;
const sent = new Map();
function allowSend(userId) {
  const now = Date.now();
  const recent = (sent.get(userId) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= SENDS_PER_HOUR) return false;
  recent.push(now);
  sent.set(userId, recent);
  return true;
}

const fail = (status, error) => Response.json({ error }, { status });
const mail = (args) => sendEmail(args).catch((err) => console.warn('[installs] email not sent:', err.message));

// The city or neighborhood after the street ("920, Moreno Avenue, Palo Alto, ..." -> "Palo Alto").
function placeOf(address) {
  const parts = String(address || '').split(',').map((p) => p.trim()).filter(Boolean);
  const numbered = /^\d+[a-z]?$/i.test(parts[0] || '') && parts[1];
  return parts.slice(numbered ? 2 : 1).find((p) => !/county$/i.test(p) && !/^\d/.test(p)) || 'Nearby';
}

function details(body) {
  const date = clip(body.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today()) return { error: 'Pick a day from today on.' };
  if (date > new Date(Date.now() + 366 * 86400e3).toISOString().slice(0, 10)) return { error: 'Pick a day within the next year.' };
  const startTime = clip(body.startTime, 5);
  if (startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return { error: 'Use a start time like 09:00.' };
  const hours = Math.round(Number(body.hours) * 2) / 2;
  if (!(hours >= 1 && hours <= 12)) return { error: 'A planting day is 1 to 12 hours.' };
  const spots = Math.round(Number(body.spots));
  if (!(spots >= 1 && spots <= 100)) return { error: 'Ask for 1 to 100 helpers.' };
  const title = clip(body.title, MAX.title) || 'Native garden planting day';
  const tasks = (Array.isArray(body.tasks) ? body.tasks : []).map((t) => clip(t, 60)).filter(Boolean).slice(0, MAX.tasks);
  return {
    data: {
      title,
      description: clip(body.description, MAX.text),
      date,
      startTime,
      hours,
      spots,
      whatToBring: clip(body.whatToBring, MAX.short),
      tasks,
      kidsWelcome: Boolean(body.kidsWelcome),
    },
  };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return fail(401, 'Sign in first.');
    const body = await req.json().catch(() => ({}));
    const db = base44.asServiceRole.entities;
    const action = String(body.action || '');

    if (action === 'start') {
      if (body.hostConfirmed !== true) return fail(400, 'Confirm you can host helpers at this property.');
      const projectId = clip(body.projectId, 64);
      // Read as the user, so only their own properties can host.
      const project = projectId ? await base44.entities.Project.get(projectId).catch(() => null) : null;
      if (!project) return fail(404, 'That property wasn’t found in your account.');
      const { data, error } = details(body);
      if (error) return fail(400, error);
      const scan = JSON.parse(project.data || '{}');
      const center = Array.isArray(scan.center) && scan.center.length === 2 ? scan.center.map(Number) : null;
      const plants = (Array.isArray(body.plants) ? body.plants : []).slice(0, 30).map((p) => ({ name: clip(p?.name, 60), count: Math.max(0, Math.round(Number(p?.count) || 0)) })).filter((p) => p.name);
      const snapshot = {
        city: placeOf(scan.address),
        mapPoint: center ? center.map((v) => Math.round(v * 100) / 100) : null, // ~1 km
        hostName: firstName(user),
        lawnSqft: Math.max(0, Math.round(Number(body.lawnSqft) || 0)),
        plantCount: plants.reduce((a, p) => a + p.count, 0),
        plants,
      };
      const { items } = await db.CommunityInstall.filter({ projectId, created_by_id: user.id }, { limit: 20 });
      const current = (items || []).find((i) => i.status === 'open' || i.status === 'full');
      if (current) {
        const moved = current.date !== data.date || current.startTime !== data.startTime;
        const status = (current.joined || 0) >= data.spots ? 'full' : 'open';
        const updated = await db.CommunityInstall.update(current.id, { ...data, ...snapshot, status });
        if (moved) {
          const { items: helpers } = await db.InstallSignup.filter({ installId: current.id }, { limit: 200 });
          for (const h of (helpers || []).filter((x) => x.status === 'signed_up' && x.email)) {
            await db.InstallSignup.update(h.id, { installDate: data.date });
            mail({
              to: h.email,
              replyTo: user.email,
              subject: `New time: ${updated.title}`,
              text: `${updated.hostName} moved the planting day you signed up for.\n\nNow: ${when(updated)} in ${updated.city}, about ${updated.hours} hours.\n\nDetails: ${link(updated.id)}\nReply to this email to reach ${updated.hostName}.`,
            });
          }
        }
        return Response.json(updated);
      }
      const created = await db.CommunityInstall.create({ projectId, address: scan.address || '', ...data, ...snapshot, joined: 0, status: 'open' });
      return Response.json(created);
    }

    const installId = clip(body.installId, 64);
    const install = installId ? await db.CommunityInstall.get(installId).catch(() => null) : null;
    if (!install) return fail(404, 'That community install wasn’t found.');
    const isHost = install.created_by_id === user.id;
    const hostEmail = install.created_by;

    if (action === 'join') {
      if (isHost) return fail(400, 'You’re hosting this one.');
      if (install.status !== 'open' || install.date < today()) return fail(409, install.status === 'full' ? 'Every spot is taken.' : 'This install isn’t taking helpers.');
      if (body.consent !== true) return fail(400, 'Confirm you’re 18 or older, or have a parent’s or guardian’s permission.');
      const name = clip(body.name, MAX.name) || user.full_name || 'Helper';
      const groupSize = Math.max(1, Math.min(10, Math.round(Number(body.groupSize) || 1)));
      const role = ['volunteer', 'student', 'group'].includes(body.role) ? body.role : 'volunteer';
      const { items: mine } = await db.InstallSignup.filter({ installId, created_by_id: user.id }, { limit: 5 });
      const already = (mine || []).find((s) => s.status !== 'cancelled');
      if (already) return Response.json({ signup: already, install });
      const fresh = await db.CommunityInstall.get(installId); // the latest count
      const joined = (fresh.joined || 0) + groupSize;
      if (joined > fresh.spots) return fail(409, fresh.spots - (fresh.joined || 0) > 0 ? `Only ${fresh.spots - (fresh.joined || 0)} spot${fresh.spots - (fresh.joined || 0) === 1 ? '' : 's'} left.` : 'Every spot is taken.');
      const signup = await db.InstallSignup.create({
        installId,
        hostId: install.created_by_id,
        name,
        email: user.email,
        message: clip(body.message, MAX.text),
        role,
        groupSize,
        status: 'signed_up',
        hoursLogged: 0,
        installTitle: install.title,
        installDate: install.date,
        city: install.city,
        hostName: install.hostName,
      });
      const updated = await db.CommunityInstall.update(installId, { joined, status: joined >= fresh.spots ? 'full' : 'open' });
      mail({
        to: hostEmail,
        replyTo: user.email,
        subject: `${name} signed up to help: ${install.title}`,
        text: `${name}${groupSize > 1 ? ` (and ${groupSize - 1} more)` : ''} signed up for your planting day on ${when(install)}.${signup.message ? `\n\nTheir note: ${signup.message}` : ''}\n\n${joined} of ${fresh.spots} spots are filled. Send helpers your address and anything else they need from ${link(installId)}, or reply to this email to reach ${name}.`,
      });
      mail({
        to: user.email,
        replyTo: hostEmail,
        subject: `You’re helping at ${install.title}`,
        text: `You signed up to help ${install.hostName} turn a lawn into native garden in ${install.city}: ${when(install)}, about ${install.hours} hours.${install.whatToBring ? `\nBring: ${install.whatToBring}` : ''}\n\n${install.hostName} will send you the address. Reply to this email to reach them.\n\nAfterwards they confirm your hours, which show in your volunteer record: ${APP_URL}/installs\nCan't make it? Cancel at ${link(installId)} so someone else can come.`,
      });
      return Response.json({ signup, install: updated });
    }

    if (action === 'leave') {
      const { items: mine } = await db.InstallSignup.filter({ installId, created_by_id: user.id }, { limit: 5 });
      const signup = (mine || []).find((s) => s.status === 'signed_up');
      if (!signup) return fail(404, 'You’re not signed up for this one.');
      await db.InstallSignup.update(signup.id, { status: 'cancelled' });
      const fresh = await db.CommunityInstall.get(installId);
      const joined = Math.max(0, (fresh.joined || 0) - (signup.groupSize || 1));
      const updated = await db.CommunityInstall.update(installId, { joined, status: fresh.status === 'full' ? 'open' : fresh.status });
      mail({ to: hostEmail, replyTo: user.email, subject: `${signup.name} can’t make it: ${install.title}`, text: `${signup.name} cancelled for ${when(install)}. ${joined} of ${install.spots} spots are now filled.\n\n${link(installId)}` });
      return Response.json({ install: updated });
    }

    if (action === 'contact') {
      const message = clip(body.message, MAX.text);
      if (message.length < 3) return fail(400, 'Write a few words first.');
      if (!allowSend(user.id)) return fail(429, 'That’s a lot of messages for one hour. Try again later.');
      if (isHost) {
        const { items: helpers } = await db.InstallSignup.filter({ installId }, { limit: 200 });
        const to = (helpers || []).filter((h) => h.status !== 'cancelled' && h.email && (!body.signupId || h.id === body.signupId));
        if (!to.length) return fail(400, 'Nobody has signed up yet.');
        for (const h of to) {
          await mail({ to: h.email, replyTo: user.email, subject: `From ${install.hostName}: ${install.title}`, text: `${message}\n\n${install.hostName}, host of ${install.title} (${when(install)}). Reply to this email to answer them.\n${link(installId)}` });
        }
        return Response.json({ ok: true, sent: to.length });
      }
      const from = firstName(user);
      await mail({ to: hostEmail, replyTo: user.email, subject: `${from} has a question about ${install.title}`, text: `${message}\n\nFrom ${user.full_name || from}. Reply to this email to answer them.\n${link(installId)}` });
      return Response.json({ ok: true, sent: 1 });
    }

    if (action === 'hours') {
      if (!isHost) return fail(403, 'Only the host confirms hours.');
      if (install.date > today()) return fail(400, 'Confirm hours on or after the day.');
      const entries = Array.isArray(body.entries) ? body.entries.slice(0, 200) : [];
      const { items: helpers } = await db.InstallSignup.filter({ installId }, { limit: 200 });
      const byId = new Map((helpers || []).map((h) => [h.id, h]));
      const at = new Date().toISOString();
      let confirmed = 0;
      for (const e of entries) {
        const h = byId.get(e?.signupId);
        if (!h || h.status === 'cancelled') continue;
        const attended = e.attended !== false;
        const hours = attended ? Math.max(0, Math.min(16, Math.round(Number(e.hours) * 4) / 4)) : 0;
        await db.InstallSignup.update(h.id, { status: attended ? 'attended' : 'no_show', hoursLogged: hours, hoursConfirmedAt: at });
        confirmed++;
        if (attended && hours > 0 && h.email && h.hoursLogged !== hours) {
          mail({ to: h.email, replyTo: user.email, subject: `${hours} volunteer hours confirmed`, text: `${install.hostName} confirmed ${hours} hours of volunteering at ${install.title} on ${when(install)} in ${install.city}. Thank you for helping!\n\nYour volunteer record: ${APP_URL}/installs` });
        }
      }
      const updated = body.done ? await db.CommunityInstall.update(installId, { status: 'done' }) : install;
      return Response.json({ ok: true, confirmed, install: updated });
    }

    if (action === 'cancel') {
      if (!isHost) return fail(403, 'Only the host can cancel.');
      const updated = await db.CommunityInstall.update(installId, { status: 'cancelled' });
      const { items: helpers } = await db.InstallSignup.filter({ installId }, { limit: 200 });
      for (const h of (helpers || []).filter((x) => x.status === 'signed_up' && x.email)) {
        mail({ to: h.email, replyTo: user.email, subject: `Called off: ${install.title}`, text: `${install.hostName} called off the planting day on ${when(install)}. Sorry! Other installs near you: ${APP_URL}/installs` });
      }
      return Response.json(updated);
    }

    return fail(400, 'Unknown action.');
  } catch (error) {
    console.error('communityInstall: error', error);
    return fail(500, 'Something went wrong with that community install.');
  }
}
