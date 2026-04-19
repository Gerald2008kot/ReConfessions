// js/cache.js
// Cache en memoria con TTL para reducir queries repetidas a Supabase

const _store = new Map();

/**
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs  — tiempo de vida en ms (default 60 s)
 */
export function cacheSet(key, value, ttlMs = 60_000) {
  _store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * @returns {any|null} — null si no existe o expiró
 */
export function cacheGet(key) {
  const entry = _store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _store.delete(key); return null; }
  return entry.value;
}

export function cacheDel(key) { _store.delete(key); }

export function cacheClear() { _store.clear(); }

/**
 * Helper: si existe en caché lo devuelve, si no ejecuta fn(), lo cachea y lo retorna.
 * @param {string} key
 * @param {() => Promise<any>} fn
 * @param {number} ttlMs
 */
export async function cacheOr(key, fn, ttlMs = 60_000) {
  const hit = cacheGet(key);
  if (hit !== null) return hit;
  const value = await fn();
  if (value !== null && value !== undefined) cacheSet(key, value, ttlMs);
  return value;
}
