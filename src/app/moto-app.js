import { createAnalyzer } from '../nlu/analyzer.js';
import { createRuleRegistry } from '../rules/registry.js';
import { createResponder } from '../core/responder.js';
import { createEngine } from '../core/engine.js';
import { createLocalStore } from '../storage/local-store.js';
import { createConfig } from '../config/defaults.js';
import { createRetriever as createSearchLayer } from '../search/retriever.js';
import { createLocalLlm } from '../ai/local-llm.js';

/**
 * Production wiring shared by direct mode and embed-iframe mode.
 * ONE core, two distribution shells — never two engines.
 *
 * Answer priority (per-turn, deterministic order):
 *   1. business rules
 *   2. business-data retrieval (BM25 over repository-owned facts)
 *   3. local LLM (only for still-unanswered turns, opt-in, fact-guarded)
 *   4. honest fallback
 */
export function createMotoApp({
  data,                 // { business, pricing, faq }
  store,                // storage/local-store instance
  scope = 'widget',
  config,
  env = globalThis,
  importFn,             // injected WebLLM import (tests)
  now,
  llmModel
} = {}) {
  const search = createSearchLayer(data);
  const analyzer = createAnalyzer(data);
  const { rules, fallback } = createRuleRegistry(data);
  const responder = createResponder({ business: data.business, language: config?.language ?? 'vi' });
  const engine = createEngine({
    analyzer,
    rules,
    fallback,
    responder,
    store,
    scope,
    config: config ?? createConfig(),
    retriever: search.retriever,
    ...(now ? { now } : {})
  });

  const localLlm = createLocalLlm({
    ...(llmModel ? { model: llmModel } : {}),
    ...(importFn ? { importFn } : {}),
    env,
    data,
    retrieve: search.retrieve
  });

  /**
   * One chat turn. The deterministic engine always runs first; the local
   * LLM is consulted ONLY when the engine returned the honest fallback.
   */
  async function send(text) {
    const result = await engine.sendMessage(text);
    if (result.source !== 'fallback') return result;
    if (localLlm.state.status !== 'ready') return result;
    const ai = await localLlm.answer(text);
    if (!ai) return result;
    return {
      ...result,
      reply: { ...result.reply, text: ai.text, meta: { ...result.reply.meta, source: 'local-llm', confidence: 0.5 } },
      confidence: 0.5,
      source: 'local-llm'
    };
  }

  return { engine, search, localLlm, send, data };
}
