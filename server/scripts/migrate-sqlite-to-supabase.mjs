// One-time copy of the local SQLite database (data/ecoestate.db) and uploaded
// files (data/uploads) into Supabase Postgres and the "uploads" Storage bucket.
// Safe to re-run: rows that already exist are skipped.
//   node --disable-warning=ExperimentalWarning server/scripts/migrate-sqlite-to-supabase.mjs
// Users keep their ids (every record refers to them); they're linked to their
// Clerk account by email the first time they sign in with Clerk.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@supabase/supabase-js';
import { sql } from '../db.js';

const DATA_DIR = path.resolve(import.meta.dirname, '../..', process.env.DATA_DIR || 'data');
const lite = new DatabaseSync(path.join(DATA_DIR, 'ecoestate.db'), { readOnly: true });
const bucket = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}).storage.from('uploads');

const parse = (text) => {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
};

let n = 0;
for (const u of lite.prepare('SELECT * FROM users').all()) {
  const r = await sql`
    INSERT INTO users (id, email, full_name, role, data, created_date, updated_date)
    VALUES (${u.id}, ${u.email}, ${u.full_name}, ${u.role}, ${sql.json(parse(u.data))}, ${u.created_date}, ${u.updated_date})
    ON CONFLICT DO NOTHING`;
  n += r.count;
}
console.log(`users: ${n} copied`);

n = 0;
const rows = lite.prepare('SELECT * FROM records').all();
for (const r of rows) {
  const res = await sql`
    INSERT INTO records (entity, id, data, created_by, created_by_id, created_date, updated_date)
    VALUES (${r.entity}, ${r.id}, ${sql.json(parse(r.data))}, ${r.created_by}, ${r.created_by_id}, ${r.created_date}, ${r.updated_date})
    ON CONFLICT DO NOTHING`;
  n += res.count;
}
console.log(`records: ${n} of ${rows.length} copied`);

n = 0;
let missing = 0;
for (const f of lite.prepare('SELECT * FROM files').all()) {
  const file = path.join(DATA_DIR, 'uploads', f.id);
  if (!fs.existsSync(file)) {
    missing++;
    continue;
  }
  const { error } = await bucket.upload(f.id, fs.readFileSync(file), { contentType: f.mime, upsert: true });
  if (error) {
    console.warn(`file ${f.id}: ${error.message}`);
    continue;
  }
  const res = await sql`
    INSERT INTO files (id, name, mime, size, is_public, created_by_id, created_date)
    VALUES (${f.id}, ${f.name}, ${f.mime}, ${f.size}, ${!!f.is_public}, ${f.created_by_id}, ${f.created_date})
    ON CONFLICT DO NOTHING`;
  n += res.count;
}
console.log(`files: ${n} copied${missing ? `, ${missing} missing on disk` : ''}`);

const usage = lite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'usage'").get()
  ? lite.prepare('SELECT * FROM usage').all()
  : [];
const [{ count }] = await sql`SELECT count(*)::int AS count FROM usage`;
if (!count && usage.length) {
  for (const u of usage) {
    await sql`INSERT INTO usage (ts, session_id, user_id, service, units, cost_usd, detail)
              VALUES (${u.ts}, ${u.session_id}, ${u.user_id}, ${u.service}, ${u.units}, ${u.cost_usd}, ${u.detail})`;
  }
}
console.log(`usage: ${count ? 'already copied' : `${usage.length} rows copied`}`);
await sql.end();
