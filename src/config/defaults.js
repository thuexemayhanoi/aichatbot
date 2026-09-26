/**
 * MotoAI runtime defaults.
 * Single source of truth for tunable options.
 * Business facts live in data/business/, never here.
 */

export const DEFAULTS = Object.freeze({
  language: 'vi',
  replyDelayMs: 300,
  features: Object.freeze({
    // Optional LOCAL semantic layer (Transformers.js, in-browser, lazy):
    // enabled but never loaded on page load — warm-up starts after the
    // first user turn and failure degrades silently to BM25-only.
    semanticSearch: true,
    hybridSearch: true,
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
