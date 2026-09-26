/**
 * Conversation planner: decides WHICH deterministic capability answers a
 * turn, and whether the local LLM may be involved AT ALL.
 *
 * Principles:
 * - Business facts (prices, deposit, hours, contact, address, policy)
 *   always go through the rule engine — never the LLM.
 * - Recommendation/comparison results are deterministic; the LLM may only
 *   re-phrase them (grounded), never change the facts.
 * - Unknown/factual questions go to hybrid retrieval, then optionally the
 *   LLM with grounded docs.
 */
import { analyzeTurn } from '../nlu/analyze-turn.js';

const RULE_ONLY_INTENTS = new Set([
  'deposit_query', 'contact_query', 'delivery_query', 'return_query',
  'policy_query', 'location_query', 'hours_query', 'documents_query',
  'bike_type_query', 'greeting'
]);

const CALCULATOR_INTENTS = new Set(['price_query', 'duration_query', 'compare_query']);

/**
 * @param {object} input
 * @param {string} input.text
 * @param {object} input.context   - current slots.
 * @param {object} input.nlu       - { analysis } (already computed by engine).
 * @param {object} input.businessData - authoritative business data (unused
 *   for routing decisions today; kept for parity with the target contract).
 */
export function planTurn({ text, context = {}, nlu, businessData } = {}) {
  if (!nlu?.analysis) throw new TypeError('planTurn requires nlu.analysis');
  void text; void businessData;

  const turn = analyzeTurn(text, context, { analysis: nlu.analysis });
  const intentId = turn.intent?.id ?? 'unknown';

  const route = {
    useRuleEngine: true,
    useRetriever: false,
    useRecommendation: intentId === 'recommendation_query',
    useCalculator: CALCULATOR_INTENTS.has(intentId),
    useLocalLlm: false
  };

  if (RULE_ONLY_INTENTS.has(intentId)) {
    route.useLocalLlm = false; // deterministic facts only, never phrased by LLM
  } else if (intentId === 'recommendation_query') {
    route.useLocalLlm = true; // optional phrasing of the structured result
  } else if (intentId === 'unknown' || intentId === 'general_faq') {
    route.useRetriever = true;
    route.useLocalLlm = true; // grounded synthesis over retrieved docs
  }

  return {
    intent: turn.intent,
    resolvedEntities: turn.resolvedEntities,
    missingEntities: turn.missingEntities,
    route
  };
}
