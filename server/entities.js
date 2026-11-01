// Entity access layer. Schemas and row-level security rules are read from
// server/entities/*.jsonc (the same files Base44 used), so the permissions
// stay exactly as they were: who can read, create, update and delete records,
// and which fields are hidden from other users.
import fs from 'node:fs';
import path from 'node:path';
import { records } from './db.js';
import { applyUpdate, matches, sortRecords } from './query.js';

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

// Fields some callers can't see (a field-level read rule). Filtering or sorting
// on them must only use what the caller can see, or results would leak them.
function hiddenFieldNames(schema) {
  return Object.entries(schema?.properties || {})
    .filter(([, prop]) => prop.rls?.read)
    .map(([k]) => k);
}

function mentionsField(query, names) {
  if (!names.length || !query || typeof query !== 'object') return false;
  return Object.entries(query).some(([k, v]) => {
    const field = (k.startsWith('data.') ? k.slice(5) : k).split('.')[0];
    if (names.includes(field)) return true;
    return Array.isArray(v) ? v.some((q) => mentionsField(q, names)) : false;
  });
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

// Pro members: an active Pro purchase or a free student unlock (both
// written only by the server), or an admin.
const MEMBER_PRODUCTS = new Set(['premium', '3d_view']);
// A test-mode Stripe purchase (made against the shared database during local
// development) only counts while the server itself uses a test key.
export function purchaseCounts(p) {
  return p?.livemode !== false || !String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_');
}

export async function isPremiumMember(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const paid = await records.find('Base44Purchase', { appUserId: user.id, status: 'paid' });
  return paid.some((p) => MEMBER_PRODUCTS.has(p.productId) && purchaseCounts(p));
}

// Returns an entity API for one caller. `service: true` bypasses access rules,
// which is what backend functions get through base44.asServiceRole.
export function entityService(name, user, { service = false } = {}) {
  const schema = schemas[name];
  if (!schema) throw new HttpError(404, `Unknown entity ${name}`);
  const rls = schema.rls || {};
  const can = (op, record) => service || evalRule(rls[op], record, user);
  const view = (r) => (service ? r : hideFields(schema, r, user));
  let premiumChecked = false;
  const requirePremium = async () => {
    if (!schema.premium || service || premiumChecked) return;
    if (!(await isPremiumMember(user))) throw new HttpError(402, 'Community and project tracking are part of EcoEstate Pro.');
    premiumChecked = true;
  };

  const requireListAccess = async () => {
    if (schema.premiumList && !service && !(await isPremiumMember(user))) {
      throw new HttpError(402, 'Saving and browsing your properties is part of EcoEstate Pro.');
    }
  };
  // "updatableFields" limits what non-admins may change (e.g. a message's
  // recipient may only mark it read, not rewrite or re-address it).
  const limitUpdate = (data) => {
    if (service || user?.role === 'admin' || !schema.updatableFields) return data;
    return Object.fromEntries(Object.entries(data || {}).filter(([k]) => schema.updatableFields.includes(k)));
  };

  const api = {
    async filter(query = {}, { sort, limit, skip } = {}) {
      await requirePremium();
      await requireListAccess();
      const hidden = service ? [] : hiddenFieldNames(schema);
      const sortKey = String(sort || '').replace(/^-/, '');
      if (mentionsField(query, hidden) || hidden.includes(sortKey)) {
        // Match and sort on what this caller can see, not on hidden values.
        const visible = (await records.find(name, {})).filter((r) => can('read', r)).map(view).filter((r) => matches(r, query));
        const sorted = sortRecords(visible, sort);
        const start = Number(skip) || 0;
        return sorted.slice(start, limit ? start + Number(limit) : undefined);
      }
      const visible = (await records.find(name, query, { sort })).filter((r) => can('read', r));
      const start = Number(skip) || 0;
      return visible.slice(start, limit ? start + Number(limit) : undefined).map(view);
    },
    async get(id) {
      await requirePremium();
      const r = await records.get(name, id);
      if (!r || !can('read', r)) throw new HttpError(404, `${name} not found`);
      return view(r);
    },
    async create(data = {}) {
      await requirePremium();
      const draft = { ...defaultsFor(schema), ...data, created_by_id: user?.id, created_by: user?.email };
      if (!can('create', draft)) throw new HttpError(user ? 403 : 401, 'You do not have permission to create this record');
      checkRequired(schema, draft);
      return view(await records.create(name, data, user, defaultsFor(schema)));
    },
    async bulkCreate(rows = []) {
      const out = [];
      for (const row of rows) out.push(await api.create(row));
      return out;
    },
    async update(id, data = {}) {
      await requirePremium();
      const r = await records.get(name, id);
      if (!r || !can('read', r)) throw new HttpError(404, `${name} not found`);
      if (!can('update', r)) throw new HttpError(403, 'You do not have permission to update this record');
      return view(await records.update(name, id, limitUpdate(data)));
    },
    async updateMany(query = {}, update = {}) {
      await requirePremium();
      await requireListAccess();
      const targets = (await records.find(name, query)).filter((r) => can('read', r) && can('update', r) && matches(view(r), query));
      for (const r of targets) await records.update(name, r.id, limitUpdate(applyUpdate(r, update)));
      return { updated: targets.length };
    },
    async delete(id) {
      await requirePremium();
      const r = await records.get(name, id);
      if (!r || !can('read', r)) throw new HttpError(404, `${name} not found`);
      if (!can('delete', r)) throw new HttpError(403, 'You do not have permission to delete this record');
      await records.delete(name, id);
      return { success: true };
    },
    async deleteMany(query = {}) {
      await requirePremium();
      await requireListAccess();
      const targets = (await records.find(name, query)).filter((r) => can('read', r) && can('delete', r) && matches(view(r), query));
      for (const r of targets) await records.delete(name, r.id);
      return { deleted: targets.length };
    },
  };
  return api;
}
