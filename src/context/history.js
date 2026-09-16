/**
 * Conversation history, persisted per session and bounded to maxEntries.
 * One turn contributes two entries (user message + assistant message).
 */
export function createHistory({ store, sessionId, maxEntries = 40, ttlMs = null } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
    throw new TypeError('createHistory requires a store with get/set');
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('createHistory requires a sessionId');
  }

  const key = `history:${sessionId}`;
  const limit = Math.max(1, Number(maxEntries) || 40);

  /** @returns a fresh array of { role, text } entries (oldest first). */
  function list() {
    const entries = store.get(key);
    if (!Array.isArray(entries)) return [];
    return entries.filter(isValidEntry);
  }

  function add(entry) {
    if (!isValidEntry(entry)) return list();
    const entries = list();
    entries.push({ role: entry.role, text: entry.text });
    while (entries.length > limit) entries.shift();
    store.set(key, entries, { ttlMs });
    return entries;
  }

  function clear() {
    store.remove(key);
  }

  return { list, add, clear, key };
}

function isValidEntry(entry) {
  return Boolean(
    entry &&
      typeof entry === 'object' &&
      (entry.role === 'user' || entry.role === 'assistant') &&
      typeof entry.text === 'string'
  );
}
