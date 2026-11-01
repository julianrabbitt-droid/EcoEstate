// A small in-memory cache that keeps the most recently used entries: a Map
// (which remembers insertion order) where reads move an entry to the end and
// the oldest entries are dropped once there are more than `max`.

export class LRU {
  constructor(max) {
    this.max = max;
    this.map = new Map();
  }

  get size() {
    return this.map.size;
  }

  has(key) {
    return this.map.has(key);
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return this;
  }

  delete(key) {
    return this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}
