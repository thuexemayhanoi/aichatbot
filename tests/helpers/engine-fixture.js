import { createAnalyzer } from '../../src/nlu/analyzer.js';
import { createRuleRegistry } from '../../src/rules/registry.js';
import { createResponder } from '../../src/core/responder.js';
import { createEngine } from '../../src/core/engine.js';
import { createLocalStore } from '../../src/storage/local-store.js';
import { createConfig } from '../../src/config/defaults.js';
import { business, pricing, faq } from './load-data.js';

let counter = 0;

/**
 * Wire a fully working engine over an isolated in-memory store.
 * Defaults match production wiring; every parameter is overridable.
 */
export function createTestEngine({
  scope,
  store,
  retriever = null,
  now,
  config,
  backend = null
} = {}) {
  const resolvedStore = store ?? createLocalStore({ namespace: `motoai-test`, backend });
  const resolvedScope = scope ?? `test-${++counter}`;
  const analyzer = createAnalyzer({ business, pricing, faq });
  const { rules, fallback } = createRuleRegistry({ business, pricing, faq });
  const responder = createResponder({ business });
  const engine = createEngine({
    analyzer,
    rules,
    fallback,
    responder,
    store: resolvedStore,
    scope: resolvedScope,
    config: config ?? createConfig(),
    retriever,
    ...(now ? { now } : {})
  });
  return { engine, store: resolvedStore, analyzer, rules, fallback, responder };
}
