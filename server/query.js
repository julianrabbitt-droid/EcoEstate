// Small MongoDB-style matcher used for entity filters and access rules.
// Supports field equality, $or / $and / $nor, and $eq $ne $in $nin $gt $gte
// $lt $lte $exists $regex. A "data.x" key refers to field x, as in Base44.

function fieldValue(record, key) {
  const k = key.startsWith('data.') ? key.slice(5) : key;
  return k.split('.').reduce((v, part) => (v == null ? undefined : v[part]), record);
}

function equals(a, b) {
  if (Array.isArray(a) && !Array.isArray(b)) return a.some((x) => equals(x, b));
  if (a === b) return true;
  if (a == null && b == null) return true;
  return typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b);
}

function matchCondition(value, cond) {
  if (cond === null || typeof cond !== 'object' || Array.isArray(cond) || !Object.keys(cond).some((k) => k.startsWith('$'))) {
    return equals(value, cond);
  }
  return Object.entries(cond).every(([op, arg]) => {
    switch (op) {
      case '$eq': return equals(value, arg);
      case '$ne': return !equals(value, arg);
      case '$in': return (arg || []).some((x) => equals(value, x));
      case '$nin': return !(arg || []).some((x) => equals(value, x));
      case '$gt': return value > arg;
      case '$gte': return value >= arg;
      case '$lt': return value < arg;
      case '$lte': return value <= arg;
      case '$exists': return (value !== undefined) === !!arg;
      case '$regex': return new RegExp(arg, cond.$options || '').test(String(value ?? ''));
      case '$options': return true;
      default: return false;
    }
  });
}

export function matches(record, query) {
  if (!query || typeof query !== 'object') return true;
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return (cond || []).some((q) => matches(record, q));
    if (key === '$and') return (cond || []).every((q) => matches(record, q));
    if (key === '$nor') return !(cond || []).some((q) => matches(record, q));
    return matchCondition(fieldValue(record, key), cond);
  });
}

// Applies a { $set, $unset, $inc } update (or a plain object as $set).
export function applyUpdate(record, update) {
  const ops = Object.keys(update || {}).some((k) => k.startsWith('$')) ? update : { $set: update };
  const out = {};
  for (const [k, v] of Object.entries(ops.$set || {})) out[k] = v;
  for (const [k, v] of Object.entries(ops.$inc || {})) out[k] = (Number(record[k]) || 0) + v;
  for (const k of Object.keys(ops.$unset || {})) out[k] = null;
  return out;
}

export function sortRecords(rows, sort) {
  if (!sort) return rows;
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === y) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : 1) * (desc ? -1 : 1);
  });
}
