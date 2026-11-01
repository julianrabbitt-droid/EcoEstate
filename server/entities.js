// Entity access layer. Schemas and row-level security rules are read from
// server/entities/*.jsonc (the same files Base44 used), so the permissions
// stay exactly as they were: who can read, create, update and delete records,
// and which fields are hidden from other users.
import fs from 'node:fs';
import path from 'node:path';
import { records } from './db.js';
import { applyUpdate, matches } from './query.js';

function parseJsonc(text) {
  const noComments = text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? '');
  return JSON.parse(noComments.replace(/,(\s*[}\]])/g, '$1'));
}

const dir = path.join(import.meta.dirname, 'entities');
export const schemas = Object.fromEntries(
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonc'))
    .map((f) => {
      const schema = parseJsonc(fs.readFileSync(path.join(dir, f), 'utf8'));
      return [schema.name, schema];
    })
);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function resolveTemplate(value, user) {
  if (typeof value !== 'string' || !value.includes('{{')) return { ok: true, value };
  if (!user) return { ok: false };
  return { ok: true, value: value.replace(/\{\{\s*user\.(\w+)\s*\}\}/g, (_, k) => user[k] ?? '') };
}

function evalRule(rule, record, user) {
  if (rule === undefined) return !!user;
  if (rule === true || (rule && typeof rule === 'object' && Object.keys(rule).length === 0)) return true;
  if (!rule || typeof rule !== 'object') return false;
  return Object.entries(rule).every(([key, cond]) => {
    if (key === '$or') return cond.some((r) => evalRule(r, record, user));
    if (key === '$and') return cond.every((r) => evalRule(r, record, user));
    if (key === 'user_condition') return !!user && Object.entries(cond).every(([k, v]) => user[k] === v);
    const resolved = resolveTemplate(cond, user);
    return resolved.ok && matches(record, { [key]: resolved.value });
  });
}

function defaultsFor(schema) {
  const out = {};
  for (const [k, prop] of Object.entries(schema?.properties || {})) if ('default' in prop) out[k] = prop.default;
  return out;
}

function hideFields(schema, record, user) {
  const out = { ...record };
  for (const [k, prop] of Object.entries(schema?.properties || {})) {
    if (prop.rls?.read && !evalRule(prop.rls.read, record, user)) delete out[k];
  }
  return out;
}

function checkRequired(schema, data) {
  for (const k of schema?.required || []) {
    if (data[k] === undefined || data[k] === null || data[k] === '') throw new HttpError(400, `${k} is required`);
  }
}

// Returns an entity API for one caller. `service: true` bypasses access rules,
// which is what backend functions get through base44.asServiceRole.
export function entityService(name, user, { service = false } = {}) {
  const schema = schemas[name];
  if (!schema) throw new HttpError(404, `Unknown entity ${name}`);
  const rls = schema.rls || {};
  const can = (op, record) => service || evalRule(rls[op], record, user);
  const view = (r) => (service ? r : hideFields(schema, r, user));

  const api = {
    filter(query = {}, { sort, limit, skip } = {}) {
      const visible = records.find(name, query, { sort }).filter((r) => can('read', r));
      const start = Number(skip) || 0;
      return visible.slice(start, limit ? start + Number(limit) : undefined).map(view);
    },
    get(id) {
      const r = records.get(name, id);
      if (!r || !can('read', r)) throw new HttpError(404, `${name} not found`);
      return view(r);
    },
    create(data = {}) {
      const draft = { ...defaultsFor(schema), ...data, created_by_id: user?.id, created_by: user?.email };
      if (!can('create', draft)) throw new HttpError(user ? 403 : 401, 'You do not have permission to create this record');
      checkRequired(schema, draft);
      return view(records.create(name, data, user, defaultsFor(schema)));
    },
    bulkCreate(rows = []) {
      return rows.map((row) => api.create(row));
    },
    update(id, data = {}) {
      const r = records.get(name, id);
      if (!r || !can('read', r)) throw new HttpError(404, `${name} not found`);
      if (!can('update', r)) throw new HttpError(403, 'You do not have permission to update this record');
      return view(records.update(name, id, data));
    },
    updateMany(query = {}, update = {}) {
      const targets = records.find(name, query).filter((r) => can('read', r) && can('update', r));
      for (const r of targets) records.update(name, r.id, applyUpdate(r, update));
      return { updated: targets.length };
    },
    delete(id) {
      const r = records.get(name, id);
      if (!r || !can('read', r)) throw new HttpError(404, `${name} not found`);
      if (!can('delete', r)) throw new HttpError(403, 'You do not have permission to delete this record');
      records.delete(name, id);
      return { success: true };
    },
    deleteMany(query = {}) {
      const targets = records.find(name, query).filter((r) => can('read', r) && can('delete', r));
      for (const r of targets) records.delete(name, r.id);
      return { deleted: targets.length };
    },
  };
  return api;
}
