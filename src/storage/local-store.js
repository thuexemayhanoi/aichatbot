import { CURRENT_SCHEMA_VERSION, wrapRecord, unwrapRecord } from './schema.js';

/**
 * Create a namespaced key-value store over localStorage with a permanent
 * in-memory fallback.
 *
 * Degradation rules:
 * - No localStorage at all (Safari private mode in old versions, SSR, or a
 *   throwing getter on globalThis) -> start degraded, memory only.
 * - Any backend throw at runtime -> degrade permanently to memory and retry
 *   the operation once so the current session keeps working.
 *
 * Keys are namespaced as `${namespace}:v${schemaVersion}:${key}` so multiple
 * widgets or schema versions can coexist without collisions.
 */
export function createLocalStore({
  namespace = 'motoai',
  schemaVersion = CURRENT_SCHEMA_VERSION,
  ttlMs = null,
  backend,
  now = () => Date.now()
} = {}) {
  let currentBackend = backend === undefined ? detectBackend() : backend;
  let degraded = currentBackend === null;
  if (degraded) currentBackend = createMemoryBackend();

  const fullKey = (key) => `${namespace}:v${schemaVersion}:${key}`;

  function degrade() {
    if (degraded) return;
    degraded = true;
    currentBackend = createMemoryBackend();
  }

  /** @returns stored data, or null when absent, stale, corrupted or foreign-schema. */
  function get(key) {
    for (let pass = 0; pass < 2; pass++) {
      let raw;
      try {
        raw = currentBackend.getItem(fullKey(key));
      } catch {
        if (pass === 0 && !degraded) {
          degrade();
          continue;
        }
        return null;
      }
      if (raw === null || raw === undefined) return null;
      try {
        return unwrapRecord(JSON.parse(raw), { schemaVersion, now: now() });
      } catch {
        return null; // Corrupted payload is treated as absent.
      }
    }
    return null;
  }

  function set(key, data, options = {}) {
    const record = wrapRecord(data, {
      schemaVersion,
      now: now(),
      ttlMs: options.ttlMs ?? ttlMs
    });
    for (let pass = 0; pass < 2; pass++) {
      try {
        currentBackend.setItem(fullKey(key), JSON.stringify(record));
        return true;
      } catch {
        if (pass === 0 && !degraded) {
          degrade();
          continue;
        }
        return false;
      }
    }
    return false;
  }

  function remove(key) {
    for (let pass = 0; pass < 2; pass++) {
      try {
        currentBackend.removeItem(fullKey(key));
        return true;
      } catch {
        if (pass === 0 && !degraded) {
          degrade();
          continue;
        }
        return false;
      }
    }
    return false;
  }

  function clear() {
    try {
      currentBackend.clear();
      return true;
    } catch {
      degrade();
      return false;
    }
  }

  return { get, set, remove, clear, isDegraded: () => degraded, namespace, schemaVersion };
}

/** localStorage-like backend backed by a Map (used for fallback and tests). */
export function createMemoryBackend() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    }
  };
}

/** Resolve the host localStorage without ever throwing. */
function detectBackend() {
  try {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function') {
      return ls;
    }
  } catch {
    // Accessing globalThis.localStorage can throw in some sandboxed contexts.
  }
  return null;
}
