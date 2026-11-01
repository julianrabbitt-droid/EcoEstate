import { base44 } from '@/api/base44Client';

// Projects persist to the Project entity for signed-in users (free for everyone),
// so they show up in My Properties across devices. Guests fall back to
// localStorage + an in-memory cache so the scan → design flow still works in a
// single session without an account.
const LS_KEY = 'understory.projects.v1';
const cache = new Map();

function lsList() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function lsWrite(all) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all.slice(0, 40)));
  } catch {
    // sandboxed preview iframe may block storage; the session cache still holds it
  }
}

function fromRecord(rec) {
  if (!rec || !rec.id) return null;
  let data = {};
  try {
    data = JSON.parse(rec.data || '{}') || {};
  } catch {
    data = {};
  }
  return { id: rec.id, createdAt: rec.created_date, updatedAt: rec.updated_date, ...data };
}

async function authed() {
  try {
    return await base44.auth.isAuthenticated();
  } catch {
    return false;
  }
}

// Moves any locally-saved scans (created while the user was a guest, or before
// the auth token had hydrated) into the Project entity, so they show up in My
// Properties alongside everything else. Returns once migration is done.
async function migrateLocalProjects() {
  const local = lsList();
  if (!local.length) return;
  const remaining = [];
  for (const p of local) {
    if (!p?.id) continue;
    try {
      const payload = { ...p, design: p.design || [] };
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = payload;
      const rec = await base44.entities.Project.create({ data: JSON.stringify(rest) });
      const moved = fromRecord(rec);
      if (moved) cache.set(moved.id, moved);
    } catch {
      // keep it local if the write failed — don't lose the scan
      remaining.push(p);
    }
  }
  lsWrite(remaining);
}

export async function listProjects() {
  if (await authed()) {
    try {
      await migrateLocalProjects();
      const { items } = await base44.entities.Project.filter({}, { sort: '-created_date', limit: 50 });
      const records = items.map(fromRecord).filter(Boolean);
      for (const r of records) cache.set(r.id, r);
      // Merge in any cache/localStorage records that didn't make it to the DB
      // (e.g. if the DB create failed silently), so they still show up here.
      const merged = new Map();
      for (const r of records) if (r?.id) merged.set(r.id, r);
      for (const p of cache.values()) if (p?.id && !merged.has(p.id)) merged.set(p.id, p);
      for (const p of lsList()) if (p?.id && !merged.has(p.id)) merged.set(p.id, p);
      return Array.from(merged.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (e) {
      console.error('Project DB list failed, using local:', e?.message || e);
      // fall through to cache / localStorage
    }
  }
  const merged = new Map();
  for (const p of lsList()) if (p?.id) merged.set(p.id, p);
  for (const p of cache.values()) if (p?.id) merged.set(p.id, p);
  return Array.from(merged.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function getProject(id) {
  if (cache.has(id)) return cache.get(id);
  if (await authed()) {
    try {
      const rec = await base44.entities.Project.get(id);
      const p = fromRecord(rec);
      if (p) cache.set(id, p);
      return p;
    } catch {
      // not found in DB; fall through
    }
  }
  return lsList().find((p) => p.id === id) || null;
}

// Read a project for a route, falling back to a project threaded through
// React Router's location.state (persisted in the history entry).
export async function readProject(id, locationState) {
  const cached = cache.get(id);
  if (cached) return cached;
  const passed = locationState?.project;
  if (passed && passed.id === id) {
    cache.set(id, passed);
    return passed;
  }
  return getProject(id);
}

export async function createProject(data) {
  const payload = { ...data, design: data.design || [], createdAt: new Date().toISOString() };
  if (await authed()) {
    try {
      const rec = await base44.entities.Project.create({ data: JSON.stringify(payload) });
      const project = fromRecord(rec);
      if (project) cache.set(project.id, project);
      return project;
    } catch (e) {
      console.error('Project DB create failed, saving locally:', e?.message || e);
      // fall through to local-only project
    }
  }
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const project = { id, ...payload };
  cache.set(id, project);
  const all = lsList();
  all.unshift(project);
  lsWrite(all);
  return project;
}

export async function updateProject(id, patch) {
  const existing = cache.get(id) || (await getProject(id));
  if (!existing) return null;
  const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  cache.set(id, next);
  if (await authed()) {
    try {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = next;
      const rec = await base44.entities.Project.update(id, { data: JSON.stringify(rest) });
      const project = fromRecord(rec);
      if (project) cache.set(project.id, project);
      return project;
    } catch {
      // fall through to local update
    }
  }
  const all = lsList();
  const idx = all.findIndex((p) => p.id === id);
  if (idx >= 0) all[idx] = next;
  else all.unshift(next);
  lsWrite(all);
  return next;
}

// Throws if the DB delete fails (a 404 just means it was a local-only scan).
// A TrackedProject linked to it is left alone: it keeps its own address and
// progress history, and its page can relink it to another scan.
export async function deleteProject(id) {
  if (await authed()) {
    try {
      await base44.entities.Project.delete(id);
    } catch (e) {
      if (e?.status !== 404) throw e;
    }
  }
  cache.delete(id);
  lsWrite(lsList().filter((p) => p.id !== id));
}