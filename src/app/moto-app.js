import { createAnalyzer } from '../nlu/analyzer.js';
import { createRuleRegistry } from '../rules/registry.js';
import { createResponder } from '../core/responder.js';
import { createEngine } from '../core/engine.js';
import { createLocalStore } from '../storage/local-store.js';
import { createConfig } from '../config/defaults.js';
import { createHybridRetriever } from '../search/hybrid-retriever.js';
import { createLocalLlm } from '../ai/local-llm.js';
import { guardAnswer } from '../ai/fact-guard.js';
import { planTurn } from '../core/planner.js';

/**
 * Production wiring shared by direct mode and embed-iframe mode.
 * ONE core, two distribution shells — never two engines.
 *
 * Answer priority (per-turn, deterministic order):
 *   1. business rules (context-aware: NLU + context memory feed them)
 *   2. hybrid retrieval (BM25 always; local semantic embeddings when the
 *      lazy warm-up succeeded — never on initial page load)
 *   3. local LLM (opt-in; fallback answers OR grounded phrasing of
 *      deterministic structured results, always Fact-Guarded)
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
  const runtimeConfig = config ?? createConfig();
  const search = createHybridRetriever(data, {
    semantic: runtimeConfig.features?.semanticSearch !== false,
    ...(importFn ? { semanticOptions: {} } : {})
  });
  const analyzer = createAnalyzer(data);
  const { rules, fallback } = createRuleRegistry(data);
  const responder = createResponder({ business: data.business, language: runtimeConfig.language ?? 'vi' });
  const engine = createEngine({
    analyzer,
    rules,
    fallback,
    responder,
    store,
    scope,
    config: runtimeConfig,
    retriever: search.retriever,
    planner: (input) => planTurn(input),
    ...(now ? { now } : {})
  });

  const localLlm = createLocalLlm({
    ...(llmModel ? { model: llmModel } : {}),
    ...(importFn ? { importFn } : {}),
    env,
    data,
    retrieve: async (query, limit) => search.retrieve(query, limit)
  });

  let semanticWarmed = false;
  /** Lazy semantic warm-up: called after the first user turn, never on load. */
  function warmSemantic() {
    if (semanticWarmed) return;
    semanticWarmed = true;
    void search.warmup(); // fire-and-forget; BM25 covers everything meanwhile
  }

  /**
   * One chat turn. The deterministic engine always runs first; the local
   * LLM is consulted ONLY when (a) the engine returned the honest fallback
   * (grounded synthesis) or (b) a structured deterministic result would
   * benefit from natural phrasing. Both paths are Fact-Guarded; a failed
   * guard keeps the deterministic template answer.
   */
  async function send(text) {
    const result = await engine.sendMessage(text);
    warmSemantic();

    // Planner gate: the local LLM may only touch turns whose route allows it
    // (recommendation phrasing / grounded retrieval). Price, deposit, hours,
    // contact and every other business fact NEVER go through the LLM.
    const plan = planTurn({ text, context: result.slots, nlu: { analysis: result.analysis }, businessData: data });

    if (result.source !== 'fallback' && result.structured && plan.route.useLocalLlm && localLlm.state.status === 'ready') {
      const phrased = await localLlm.phrase({
        question: text,
        facts: result.reply.text,
        guard: (candidate) => guardAnswer(candidate, {
          docs: [],
          verifiedTexts: [result.reply.text],
          business: data.business
        })
      });
      if (phrased) {
        return {
          ...result,
          reply: { ...result.reply, text: phrased.text, meta: { ...result.reply.meta, source: 'local-llm-phrased' } },
          source: 'local-llm-phrased',
          deterministicAnswer: result.reply.text
        };
      }
      return result;
    }
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

  /** Forget the local conversation context (slots, agenda, history). */
  function resetContext() {
    engine.resetContext();
  }

  return { engine, search, localLlm, send, resetContext, data };
}
