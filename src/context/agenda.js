/**
 * Agenda: a pending clarification the engine is waiting on.
 *
 * The engine asks ONLY for the slots a rule declared missing
 * (needs: ['vehicle'] | ['duration'] | ['location']). Once every needed
 * slot is filled, the pending intent is replayed and the agenda clears.
 */
export function createAgenda({ store, sessionId, ttlMs = null } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
    throw new TypeError('createAgenda requires a store with get/set');
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('createAgenda requires a sessionId');
  }

  const key = `agenda:${sessionId}`;
  const VALID_NEEDS = new Set(['vehicle', 'duration', 'location']);

  /** @returns { intentId, needs } or null when nothing is pending. */
  function getPending() {
    return sanitize(store.get(key));
  }

  function setPending({ intentId, needs }) {
    if (typeof intentId !== 'string' || intentId.length === 0) return null;
    const cleanNeeds = Array.isArray(needs) ? needs.filter((n) => VALID_NEEDS.has(n)) : [];
    if (cleanNeeds.length === 0) return null;
    const pending = { intentId, needs: cleanNeeds };
    store.set(key, pending, { ttlMs });
    return pending;
  }

  function clear() {
    store.remove(key);
  }

  /** True when every needed slot is present in the given slots object. */
  function isSatisfied(pending, slots) {
    if (!pending || !Array.isArray(pending.needs)) return false;
    return pending.needs.every((need) => {
      if (need === 'vehicle') return Boolean(slots && slots.vehicle);
      if (need === 'duration') return Boolean(slots && Number.isInteger(slots.durationDays) && slots.durationDays > 0);
      if (need === 'location') return Boolean(slots && slots.location);
      return false;
    });
  }

  return { getPending, setPending, clear, isSatisfied, key };
}

function sanitize(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.intentId !== 'string' || record.intentId.length === 0) return null;
  if (!Array.isArray(record.needs) || record.needs.length === 0) return null;
  return { intentId: record.intentId, needs: record.needs };
}
