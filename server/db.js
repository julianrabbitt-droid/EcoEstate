// Postgres storage (Supabase). Entity records are stored as JSON documents,
// mirroring how Base44 entities behave: every record gets id, created_date,
// updated_date, created_by and created_by_id. Tables are created by the
// Supabase migration (users, records, files, usage).
import crypto from 'node:crypto';
import postgres from 'postgres';
import { matches, sortRecords } from './query.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add the Supabase session pooler connection string to .env.');
}

export const sql = postgres(process.env.DATABASE_URL, {
  max: Number(process.env.DATABASE_POOL_SIZE || 10),
  idle_timeout: 30,
  onnotice: () => {},
});

export const newId = () => crypto.randomBytes(12).toString('hex');
export const now = () => new Date().toISOString();

function toRecord(row) {
  return {
    ...row.data,
    id: row.id,
    created_date: row.created_date,
    updated_date: row.updated_date,
    created_by: row.created_by,
    created_by_id: row.created_by_id,
  };
}

const SYSTEM_FIELDS = ['id', 'created_date', 'updated_date', 'created_by', 'created_by_id'];
function stripSystem(data) {
  const out = { ...data };
  for (const k of SYSTEM_FIELDS) delete out[k];
  return out;
}

// The plain-equality part of a query, pushed into SQL so Postgres narrows the
// rows (JSON containment on the data column, plus the system columns; a plain
// value also matches inside an array field, as in query.js). The full query,
// operators included, is still checked in JS afterwards.
function sqlNarrowing(query = {}) {
  const contains = {};
  const columns = {};
  for (const [k, v] of Object.entries(query || {})) {
    if (k.startsWith('$') || k.includes('.')) continue;
    if (v === null || (typeof v === 'object' && !Array.isArray(v))) continue;
    if (Array.isArray(v)) continue;
    if (k === 'id' || k === 'created_by_id' || k === 'created_by') columns[k] = v;
    else if (!SYSTEM_FIELDS.includes(k)) contains[k] = v;
  }
  return { contains, columns };
}

export const records = {
  async find(entity, query = {}, { sort, limit, skip } = {}) {
    const { contains, columns } = sqlNarrowing(query);
    const rows = await sql`
      SELECT * FROM records
       WHERE entity = ${entity}
         ${Object.entries(contains).reduce(
           (acc, [k, v]) => sql`${acc} AND (data @> ${sql.json({ [k]: v })} OR data @> ${sql.json({ [k]: [v] })})`,
           sql``
         )}
         ${columns.id !== undefined ? sql`AND id = ${String(columns.id)}` : sql``}
         ${columns.created_by_id !== undefined ? sql`AND created_by_id = ${String(columns.created_by_id)}` : sql``}
         ${columns.created_by !== undefined ? sql`AND created_by = ${String(columns.created_by)}` : sql``}`;
    const found = sortRecords(rows.map(toRecord).filter((r) => matches(r, query)), sort);
    const start = Number(skip) || 0;
    return found.slice(start, limit ? start + Number(limit) : undefined);
  },
  async get(entity, id) {
    const [row] = await sql`SELECT * FROM records WHERE entity = ${entity} AND id = ${String(id)}`;
    return row ? toRecord(row) : null;
  },
  async create(entity, data, user, defaults = {}) {
    const id = newId();
    const ts = now();
    const [row] = await sql`
      INSERT INTO records (entity, id, data, created_by, created_by_id, created_date, updated_date)
      VALUES (${entity}, ${id}, ${sql.json({ ...defaults, ...stripSystem(data) })}, ${user?.email ?? null}, ${user?.id ?? null}, ${ts}, ${ts})
      RETURNING *`;
    return toRecord(row);
  },
  async update(entity, id, data) {
    const current = await this.get(entity, id);
    if (!current) return null;
    const merged = { ...stripSystem(current), ...stripSystem(data) };
    const [row] = await sql`
      UPDATE records SET data = ${sql.json(merged)}, updated_date = ${now()}
       WHERE entity = ${entity} AND id = ${String(id)}
      RETURNING *`;
    return toRecord(row);
  },
  async delete(entity, id) {
    await sql`DELETE FROM records WHERE entity = ${entity} AND id = ${String(id)}`;
  },
};

// ---- App users (linked to Clerk accounts by clerk_id) ----
export function publicUser(row) {
  if (!row) return null;
  return {
    ...(row.data || {}),
    id: row.id,
    email: row.email,
    phone: row.phone ?? null,
    full_name: row.full_name,
    role: row.role,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

export const users = {
  async byId(id) {
    const [row] = await sql`SELECT * FROM users WHERE id = ${String(id)}`;
    return row ?? null;
  },
  async byClerkId(clerkId) {
    const [row] = await sql`SELECT * FROM users WHERE clerk_id = ${clerkId}`;
    return row ?? null;
  },
  async byEmail(email) {
    const [row] = await sql`SELECT * FROM users WHERE email = ${String(email).trim().toLowerCase()}`;
    return row ?? null;
  },
  async create({ clerkId, email = null, phone = null, fullName, role }) {
    const ts = now();
    const [row] = await sql`
      INSERT INTO users (id, clerk_id, email, phone, full_name, role, created_date, updated_date)
      VALUES (${newId()}, ${clerkId}, ${email ? String(email).trim().toLowerCase() : null}, ${phone}, ${fullName || null}, ${role}, ${ts}, ${ts})
      RETURNING *`;
    return row;
  },
  async update(id, fields) {
    const allowed = Object.fromEntries(
      Object.entries(fields).filter(([k, v]) => ['clerk_id', 'email', 'full_name', 'role', 'data'].includes(k) && v !== undefined)
    );
    if (allowed.data) allowed.data = sql.json(allowed.data);
    const [row] = await sql`UPDATE users SET ${sql(allowed)}, updated_date = ${now()} WHERE id = ${String(id)} RETURNING *`;
    return row;
  },
};
