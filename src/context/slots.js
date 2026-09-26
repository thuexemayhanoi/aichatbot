/**
 * Conversation slots (context memory): the durable "current topic" of a session.
 *
 * Update rule (anti-reset guarantee): a new turn can only overwrite fields
 * it actually carries. A turn without a vehicle never clears a known
 * vehicle; a turn without a duration never clears a known duration. An
 * EXPLICIT new entity always overrides a stale value from an earlier turn.
 *
 * Tracked context: language, vehicle, duration (days + optional date range),
 * location, rider height, experience, transmission, electric, luggage,
 * usage, budget, destination, previous intent. Everything stays LOCAL
 * (store = localStorage-backed, namespaced); nothing is ever uploaded.
 */
export function createSlots({ store, sessionId, ttlMs = null } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
    throw new TypeError('createSlots requires a store with get/set');
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('createSlots requires a sessionId');
  }

  const key = `slots:${sessionId}`;
  const EMPTY = Object.freeze({
    vehicle: null, durationDays: null, location: null,
    language: null, dateRange: null, heightCm: null, experience: null,
    transmission: null, electric: null, luggage: null, usage: null,
    budget: null, destination: null, prevIntent: null
  });

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
    const rider = entities.rider ?? {};

    const vehicle = pickVehicle(entities.vehicles);
    const durationDays = Number.isInteger(entities.totalDays) && entities.totalDays > 0 ? entities.totalDays : null;
    const location = entities.locations?.length ? entities.locations[0].name : null;

    const next = {
      vehicle: vehicle ?? current.vehicle,
      durationDays: durationDays ?? current.durationDays,
      location: location ?? current.location,
      language: entities.language ?? current.language,
      dateRange: entities.dateRange ?? current.dateRange,
      heightCm: positiveInt(rider.heightCm) ?? current.heightCm,
      experience: rider.experience ?? current.experience,
      transmission: rider.transmission ?? current.transmission,
      electric: typeof rider.electric === 'boolean' ? rider.electric : current.electric,
      luggage: typeof rider.luggage === 'boolean' ? rider.luggage : current.luggage,
      usage: rider.usage ?? current.usage,
      budget: rider.budget ?? current.budget,
      destination: rider.destination ?? current.destination,
      prevIntent: analysis?.intent?.id && analysis.intent.id !== 'unknown' ? analysis.intent.id : current.prevIntent
    };
    store.set(key, next, { ttlMs });
    return { ...next };
  }

  function clear() {
    store.remove(key);
  }

  /**
   * Selectively reset named fields (v53 primary quick actions).
   * Only listed fields become null; everything else in the conversation
   * memory is untouched — used so a quick-tag action never inherits a
   * stale vehicle/duration from a previous turn.
   * @returns the updated slots.
   */
  function clearFields(fields) {
    if (!Array.isArray(fields) || fields.length === 0) return get();
    const current = get();
    const next = { ...current };
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(next, field)) next[field] = null;
    }
    store.set(key, next, { ttlMs });
    return get();
  }

  return { get, updateFromAnalysis, clear, clearFields, key };
}

/** Prefer a concrete model over a category when both appear in one turn. */
function pickVehicle(vehicles) {
  if (!Array.isArray(vehicles) || vehicles.length === 0) return null;
  const model = vehicles.find((v) => v && v.type === 'model' && v.id);
  const any = vehicles.find((v) => v && v.id);
  return model ?? any ?? null;
}

function positiveInt(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
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
  if (record.language === 'vi' || record.language === 'en') clean.language = record.language;
  if (record.dateRange && typeof record.dateRange === 'object' &&
      typeof record.dateRange.start === 'string' && Number.isInteger(record.dateRange.days) && record.dateRange.days > 0) {
    clean.dateRange = {
      start: record.dateRange.start,
      end: record.dateRange.end ?? record.dateRange.start,
      days: record.dateRange.days
    };
  }
  if (Number.isInteger(record.heightCm) && record.heightCm >= 100 && record.heightCm <= 220) {
    clean.heightCm = record.heightCm;
  }
  if (record.experience === 'new' || record.experience === 'experienced') {
    clean.experience = record.experience;
  }
  if (record.transmission === 'manual' || record.transmission === 'scooter') {
    clean.transmission = record.transmission;
  }
  if (typeof record.electric === 'boolean') clean.electric = record.electric;
  if (typeof record.luggage === 'boolean') clean.luggage = record.luggage;
  if (record.usage === 'city' || record.usage === 'long') clean.usage = record.usage;
  if (record.budget && typeof record.budget === 'object' &&
      Number.isFinite(record.budget.amountVnd) && record.budget.amountVnd > 0 &&
      (record.budget.direction === 'min' || record.budget.direction === 'max')) {
    clean.budget = { amountVnd: Math.round(record.budget.amountVnd), direction: record.budget.direction };
  }
  if (typeof record.destination === 'string' && record.destination.length > 0) {
    clean.destination = record.destination;
  }
  if (typeof record.prevIntent === 'string' && record.prevIntent.length > 0) {
    clean.prevIntent = record.prevIntent;
  }
  return clean;
}
