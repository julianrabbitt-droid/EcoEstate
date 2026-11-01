// SQLite storage (Node's built-in driver). Entity records are stored as JSON
// documents, mirroring how Base44 entities behave: every record gets id,
// created_date, updated_date, created_by and created_by_id.
import crypto from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR } from './config.js';
import { matches, sortRecords } from './query.js';

export const db = new DatabaseSync(path.join(DATA_DIR, 'ecoestate.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    password_hash TEXT,
    google_id TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    otp_hash TEXT,
    otp_expires INTEGER,
    otp_attempts INTEGER NOT NULL DEFAULT 0,
    reset_hash TEXT,
    reset_expires INTEGER,
    data TEXT NOT NULL DEFAULT '{}',
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS records (
    entity TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_by TEXT,
    created_by_id TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL,
    PRIMARY KEY (entity, id)
  );
  CREATE INDEX IF NOT EXISTS records_entity ON records(entity, created_date);
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT,
    mime TEXT,
    size INTEGER,
    is_public INTEGER NOT NULL DEFAULT 0,
    created_by_id TEXT,
    created_date TEXT NOT NULL
  );
`);

export const newId = () => crypto.randomBytes(12).toString('hex');
export const now = () => new Date().toISOString();

function toRecord(row) {
  return {
    ...JSON.parse(row.data),
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

export const records = {
  all(entity) {
    return db.prepare('SELECT * FROM records WHERE entity = ?').all(entity).map(toRecord);
  },
  get(entity, id) {
    const row = db.prepare('SELECT * FROM records WHERE entity = ? AND id = ?').get(entity, id);
    return row ? toRecord(row) : null;
  },
  find(entity, query = {}, { sort, limit, skip } = {}) {
    const rows = sortRecords(this.all(entity).filter((r) => matches(r, query)), sort);
    const start = Number(skip) || 0;
    return rows.slice(start, limit ? start + Number(limit) : undefined);
  },
  create(entity, data, user, defaults = {}) {
    const id = newId();
    const ts = now();
    db.prepare(
      'INSERT INTO records (entity, id, data, created_by, created_by_id, created_date, updated_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(entity, id, JSON.stringify({ ...defaults, ...stripSystem(data) }), user?.email ?? null, user?.id ?? null, ts, ts);
    return this.get(entity, id);
  },
  update(entity, id, data) {
    const current = this.get(entity, id);
    if (!current) return null;
    const merged = { ...stripSystem(current), ...stripSystem(data) };
    db.prepare('UPDATE records SET data = ?, updated_date = ? WHERE entity = ? AND id = ?').run(
      JSON.stringify(merged),
      now(),
      entity,
      id
    );
    return this.get(entity, id);
  },
  delete(entity, id) {
    db.prepare('DELETE FROM records WHERE entity = ? AND id = ?').run(entity, id);
  },
};
