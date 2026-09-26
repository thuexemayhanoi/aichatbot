/**
 * analyzeTurn: explicit NLU planning stage on top of the raw analyzer.
 *
 * Merges per-turn entities with remembered context (anti-reset: the turn
 * always wins) and reports what is missing for the resolved intent, so
 * rules and the planner can ask exactly ONE useful clarification.
 *
 * Output: { intent, entities, resolvedEntities, missingEntities,
 *           confidence, normalizedQuery, language }
 */

/** Entities an intent minimally needs (checked against resolved context). */
const INTENT_REQUIREMENTS = {
  price_query: ['vehicle'],
  duration_query: ['vehicle'],
  recommendation_query: [],
  compare_query: ['duration']
};

/** Which resolved entity key satisfies a requirement. */
const REQUIREMENT_KEYS = {
  vehicle: (r) => r.vehicle ?? null,
  duration: (r) => (Number.isInteger(r.durationDays) && r.durationDays > 0 ? r.durationDays : null)
};

/**
 * @param {object} nlu          - { analysis } from the analyzer.
 * @param {object} context      - current slots (context memory).
 * @param {object} [options]
 */
export function analyzeTurn(text, context = {}, options = {}) {
  const analysis = options.analysis ?? null;
  if (!analysis) throw new TypeError('analyzeTurn requires a precomputed analysis (pass options.analysis)');
  const intentId = analysis.intent?.id ?? 'unknown';

  // Resolved entities: the turn's own entities override remembered context.
  const rider = analysis.entities?.rider ?? {};
  const resolved = {
    vehicle: analysis.entities?.vehicles?.length ? analysis.entities.vehicles[0] : (context.vehicle ?? null),
    durationDays: Number.isInteger(analysis.entities?.totalDays) ? analysis.entities.totalDays : (context.durationDays ?? null),
    dateRange: analysis.entities?.dateRange ?? context.dateRange ?? null,
    location: analysis.entities?.locations?.length ? analysis.entities.locations[0].name : (context.location ?? null),
    transmission: rider.transmission ?? context.transmission ?? null,
    electric: rider.electric ?? context.electric ?? null,
    usage: rider.usage ?? context.usage ?? null,
    destination: rider.destination ?? context.destination ?? null,
    heightCm: rider.heightCm ?? context.heightCm ?? null,
    experience: rider.experience ?? context.experience ?? null,
    budget: rider.budget ?? context.budget ?? null,
    luggage: rider.luggage ?? context.luggage ?? null,
    language: analysis.entities?.language ?? context.language ?? null
  };

  const missing = [];
  for (const need of INTENT_REQUIREMENTS[intentId] ?? []) {
    const satisfied = REQUIREMENT_KEYS[need]?.(resolved) ?? null;
    if (!satisfied) missing.push(need);
  }

  return {
    intent: analysis.intent,
    entities: analysis.entities,
    resolvedEntities: resolved,
    missingEntities: missing,
    confidence: analysis.intent?.score ?? 0,
    normalizedQuery: analysis.normalized,
    language: resolved.language
  };
}
