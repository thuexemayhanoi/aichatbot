/**
 * MotoAI runtime defaults.
 * Single source of truth for tunable options.
 * Business facts live in data/business/, never here.
 */

export const DEFAULTS = Object.freeze({
  language: 'vi',
  replyDelayMs: 300,
  features: Object.freeze({
    // Optional semantic layer: off by default so weak phones get the fast lexical path.
    semanticSearch: false,
    hybridSearch: false,
    persistHistory: true,
    telemetry: false
  }),
  history: Object.freeze({
    maxTurns: 20,
    ttlHours: 24
  }),
  storage: Object.freeze({
    namespace: 'motoai',
    schemaVersion: 1
  }),
  nlu: Object.freeze({
    intentThreshold: 0.5
  })
});

/**
 * Create a runtime config by overriding defaults.
 * Nested groups are merged one level deep; the frozen defaults are never mutated.
 */
export function createConfig(overrides = {}) {
  const merged = { ...DEFAULTS, ...overrides };
  for (const key of ['features', 'history', 'storage', 'nlu']) {
    merged[key] = { ...DEFAULTS[key], ...(overrides[key] ?? {}) };
  }
  return merged;
}
