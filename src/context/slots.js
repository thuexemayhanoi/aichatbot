/**
 * Conversation slots: the durable "current topic" of a session.
 *
 * Update rule (anti-reset guarantee): a new turn can only overwrite fields
 * it actually carries. A turn without a vehicle never clears a known
 * vehicle; a turn without a duration never clears a known duration.
 */
export function createSlots({ store, sessionId, ttlMs = null } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
    throw new TypeError('createSlots requires a store with get/set');
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('createSlots requires a sessionId');
  }

  const key = `slots:${sessionId}`;
  const EMPTY = Object.freeze({ vehicle: null, durationDays: null, location: null });

  /** @returns a sanitized copy of the current slots. */
  function get() {
    return { ...EMPTY, ...sanitize(store.get(key)) };
  }

  /**
   * Merge entities from a new analysis into the slots.
   * @returns the updated slots.
   */
  function updateFromAnalysis(analysis) {
    const current = get();
    const entities = analysis?.entities ?? {};

    const vehicle = pickVehicle(entities.vehicles);
    const durationDays = Number.isInteger(entities.totalDays) && entities.totalDays > 0 ? entities.totalDays : null;
    const location = entities.locations?.length ? entities.locations[0].name : null;

    const next = {
      vehicle: vehicle ?? current.vehicle,
      durationDays: durationDays ?? current.durationDays,
      location: location ?? current.location
    };
    store.set(key, next, { ttlMs });
    return { ...next };
  }

  function clear() {
    store.remove(key);
  }

  return { get, updateFromAnalysis, clear, key };
}

/** Prefer a concrete model over a category when both appear in one turn. */
function pickVehicle(vehicles) {
  if (!Array.isArray(vehicles) || vehicles.length === 0) return null;
  const model = vehicles.find((v) => v && v.type === 'model' && v.id);
  const any = vehicles.find((v) => v && v.id);
  return model ?? any ?? null;
}

function sanitize(record) {
  if (!record || typeof record !== 'object') return {};
  const clean = {};
  if (record.vehicle && typeof record.vehicle === 'object' && typeof record.vehicle.id === 'string') {
    clean.vehicle = {
      type: record.vehicle.type === 'model' ? 'model' : 'category',
      id: record.vehicle.id,
      name: typeof record.vehicle.name === 'string' ? record.vehicle.name : record.vehicle.id
    };
  }
  if (Number.isInteger(record.durationDays) && record.durationDays > 0) {
    clean.durationDays = record.durationDays;
  }
  if (typeof record.location === 'string' && record.location.length > 0) {
    clean.location = record.location;
  }
  return clean;
}
