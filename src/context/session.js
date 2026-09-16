import { nextId as defaultIdGenerator } from '../utils/id.js';

/**
 * Session manager: one durable session per (store, scope).
 *
 * Dedup guarantee: creating the manager twice over the same store and scope
 * (double engine init, or two widgets sharing storage) resolves to the same
 * session id as long as the record is alive. Expired or foreign-schema
 * records are discarded and a fresh session is created.
 */
export function createSessionManager({
  store,
  scope = 'default',
  ttlMs = null,
  idGenerator = defaultIdGenerator,
  now = () => Date.now()
} = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
    throw new TypeError('createSessionManager requires a store with get/set');
  }

  const key = `session:${scope}`;

  /**
   * @returns { session, created } where session is { id, createdAt, lastSeenAt }.
   */
  function getOrCreate() {
    const existing = sanitize(store.get(key));
    if (existing) {
      const session = touch(existing);
      return { session, created: false };
    }
    const timestamp = now();
    const session = Object.freeze({
      id: idGenerator(),
      createdAt: timestamp,
      lastSeenAt: timestamp
    });
    store.set(key, session, { ttlMs });
    return { session, created: true };
  }

  /** Slide the TTL forward on activity (double-init also refreshes). */
  function touch(session) {
    const refreshed = Object.freeze({ ...session, lastSeenAt: now() });
    store.set(key, refreshed, { ttlMs });
    return refreshed;
  }

  return { getOrCreate, touch, key };
}

function sanitize(record) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || record.id.length === 0) return null;
  return record;
}
