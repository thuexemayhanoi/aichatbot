/**
 * Storage backend fakes shared by storage and engine tests.
 */

/** A fully working localStorage-like object backed by a Map. */
export function fakeLocalStorage() {
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
    },
    _dump: () => map
  };
}

/** A backend whose setItem always throws (quota exceeded / private mode). */
export function throwingLocalStorage() {
  const base = fakeLocalStorage();
  return {
    ...base,
    setItem: () => {
      throw new Error('QuotaExceededError');
    }
  };
}

/** A backend that throws on the very first getItem access. */
export function explodingLocalStorage() {
  return {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
    clear: () => {
      throw new Error('SecurityError');
    }
  };
}
