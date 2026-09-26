import { createConfig as defaultConfigFactory, DEFAULTS } from '../config/defaults.js';
import { createEmitter as defaultEmitterFactory } from './events.js';
import { createSessionManager } from '../context/session.js';
import { createHistory } from '../context/history.js';
import { createSlots } from '../context/slots.js';
import { createAgenda } from '../context/agenda.js';
import { attempt } from '../utils/result.js';

const MAX_INPUT_LENGTH = 2000;

/**
 * Create the headless answer engine.
 *
 * Pipeline (per turn):
 *   analyze -> update slots -> resolve pending agenda -> deterministic rules
 *   -> optional retriever -> fallback -> respond (message + history + events)
 *
 * The engine is UI-free and Node-testable. The retriever is OPTIONAL and
 * null by default in Phase 2; when provided it is fully isolated: a
 * throwing or malformed retriever degrades to the fallback path.
 *
 * @param {object} options
 * @param {function} options.analyzer      - (text) => analysis (Phase 1 NLU).
 * @param {Array}    options.rules         - priority-ordered deterministic rules.
 * @param {object}   options.fallback      - terminal rule ({ id, respond }).
 * @param {object}   options.responder     - { render(text, {actions, meta}) }.
 * @param {object}   options.store         - namespaced key-value store.
 * @param {string}   [options.scope]       - storage scope (widget / embed id).
 * @param {object}   [options.config]      - runtime config (see config/defaults).
 * @param {object}   [options.emitter]     - event emitter (core/events).
 * @param {function} [options.retriever]   - optional (query, {analysis, slots}) => result|null.
 * @param {function} [options.now]         - clock injection for deterministic tests.
 * @param {function} [options.idGenerator] - session id injection for tests.
 * @param {function} [options.planner]     - optional (plan) => route; used for
 *   per-turn route tracing (event 'plan') and source/debug metadata only —
 *   the deterministic pipeline itself is unchanged.
 */
export function createEngine({
  analyzer,
  rules,
  fallback,
  responder,
  store,
  scope = 'default',
  config,
  emitter,
  retriever = null,
  now = () => new Date(),
  idGenerator,
  planner = null
} = {}) {
  if (typeof analyzer !== 'function') throw new TypeError('createEngine requires an analyzer function');
  if (!Array.isArray(rules) || rules.length === 0) throw new TypeError('createEngine requires a non-empty rules array');
  if (!fallback || typeof fallback.respond !== 'function') throw new TypeError('createEngine requires a fallback rule');
  if (!responder || typeof responder.render !== 'function') throw new TypeError('createEngine requires a responder');
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
    throw new TypeError('createEngine requires a store with get/set');
  }
  if (retriever !== null && typeof retriever !== 'function') {
    throw new TypeError('retriever must be a function or null');
  }

  const runtimeConfig = config ?? defaultConfigFactory();
  const events = emitter ?? defaultEmitterFactory();
  const intentThreshold = runtimeConfig.nlu?.intentThreshold ?? DEFAULTS.nlu.intentThreshold;
  const ttlMs = hoursToMs(runtimeConfig.history?.ttlHours);

  // --- Context wiring (one session per store+scope; double init dedups) ---
  const sessionManager = createSessionManager({ store, scope, ttlMs, idGenerator, now });
  const { session, created } = sessionManager.getOrCreate();
  if (created) events.emit('session-created', { session });

  const history = createHistory({
    store,
    sessionId: session.id,
    maxEntries: runtimeConfig.history?.maxTurns ?? DEFAULTS.history.maxTurns,
    ttlMs
  });
  const slots = createSlots({ store, sessionId: session.id, ttlMs });
  const agenda = createAgenda({ store, sessionId: session.id, ttlMs });

  /**
   * Send one user turn through the pipeline.
   * @returns { reply, analysis, slots, confidence, source }
   */
  async function sendMessage(text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      return invalidInputReply();
    }
    const input = text.slice(0, MAX_INPUT_LENGTH);
    events.emit('turn', { text: input, sessionId: session.id });
    sessionManager.touch(session);

    // 1. Analyze (the injected clock keeps date-range parsing deterministic).
    const analysis = analyzer(input, now());

    // 2. Update slots (a turn only fills the fields it carries).
    const currentSlots = slots.updateFromAnalysis(analysis);

    // 2b. Optional planner trace (route decision; no behavior change here).
    if (typeof planner === 'function') {
      try {
        const plan = planner({ text: input, context: currentSlots, nlu: { analysis }, businessData: null });
        events.emit('plan', { intentId: plan?.intent?.id ?? null, route: plan?.route ?? null });
      } catch (error) {
        events.emit('plan', { intentId: null, route: null, error: error?.message ?? 'planner error' });
      }
    }

    // 3. Pending agenda: if the turn satisfied it, replay the pending intent.
    let effectiveAnalysis = analysis;
    const pending = agenda.getPending();
    if (pending && agenda.isSatisfied(pending, currentSlots)) {
      agenda.clear();
      effectiveAnalysis = {
        ...analysis,
        intent: { id: pending.intentId, score: 1, matchedPhrase: null, inferred: true, ranked: [] }
      };
    }

    // 4. Deterministic rules (multi-intent aware, registry priority order).
    const candidates = intentCandidates(effectiveAnalysis, intentThreshold);
    let outcome = null;
    scan: for (const rule of rules) {
      for (const candidate of candidates) {
        const view = candidate === effectiveAnalysis.intent ? effectiveAnalysis : { ...effectiveAnalysis, intent: candidate };
        if (!rule.canHandle(view, currentSlots)) continue;
        const result = rule.respond(view, currentSlots, { now });
        if (result && result.handled) {
          outcome = { ...result, ruleId: rule.id };
          break scan;
        }
      }
    }

    // 5. Optional retriever (isolated; null result = decline).
    if (!outcome && retriever) {
      const retrieval = await attempt(() => retriever(input, { analysis: effectiveAnalysis, slots: currentSlots }));
      const value = retrieval.ok ? retrieval.value : null;
      if (isValidRetrieval(value)) {
        outcome = { ...value, ruleId: null };
        events.emit('search-hit', { source: value.source ?? null, confidence: value.confidence ?? null });
      }
    }

    // 6. Fallback (honest unknown) + events.
    if (!outcome) {
      const result = fallback.respond(effectiveAnalysis, currentSlots, { now });
      outcome = { ...result, ruleId: fallback.id };
      events.emit('unknown-query', { text: input, intentId: effectiveAnalysis.intent?.id ?? null });
      events.emit('fallback', { ruleId: fallback.id });
    } else if (outcome.ruleId) {
      events.emit('rule-hit', { ruleId: outcome.ruleId, intentId: effectiveAnalysis.intent?.id ?? null });
    }

    // 7. Register a clarification agenda if the rule asked for one.
    if (outcome.clarify && Array.isArray(outcome.clarify.needs) && outcome.clarify.needs.length > 0) {
      agenda.setPending({
        intentId: outcome.clarify.intentId ?? effectiveAnalysis.intent?.id,
        needs: outcome.clarify.needs
      });
    }

    // 8. Respond, persist history.
    const reply = responder.render(outcome.answer, {
      actions: outcome.actions,
      meta: {
        confidence: outcome.confidence,
        source: outcome.source,
        intentId: effectiveAnalysis.intent?.id ?? null
      }
    });
    history.add({ role: 'user', text: input });
    history.add({ role: 'assistant', text: reply.text });

    return {
      reply,
      analysis: effectiveAnalysis,
      slots: slots.get(),
      structured: outcome.structured ?? null,
      confidence: reply.meta.confidence,
      source: reply.meta.source
    };
  }

  function invalidInputReply() {
    const reply = responder.render('Mình chưa nhận được câu hỏi. Bạn vui lòng nhập lại nhé.', {
      meta: { confidence: 0.3, source: 'validation' }
    });
    return { reply, analysis: null, slots: slots.get(), confidence: reply.meta.confidence, source: reply.meta.source };
  }

  /** Forget the remembered context (slots + pending agenda + history). */
  function resetContext() {
    slots.clear();
    agenda.clear();
    history.clear();
    events.emit('context-reset', { sessionId: session.id });
  }

  /**
   * A fresh action turn (v53): primary quick tags / dock actions are explicit
   * navigation, so topic-skewing slots (vehicle, duration, ...) are cleared
   * first and any pending clarification agenda is dropped. Free-text turns
   * keep the full conversational memory (sendMessage is unchanged).
   * @returns the same shape as sendMessage.
   */
  const FRESH_FIELDS = Object.freeze([
    'vehicle', 'durationDays', 'dateRange', 'transmission', 'electric',
    'luggage', 'usage', 'budget', 'destination'
  ]);
  async function sendFreshMessage(text, { resetFields = FRESH_FIELDS } = {}) {
    agenda.clear();
    slots.clearFields(resetFields);
    return sendMessage(text);
  }

  return {
    sendMessage,
    sendFreshMessage,
    session,
    history,
    slots,
    agenda,
    resetContext,
    emitter: events
  };
}

/**
 * Intents worth trying this turn.
 * When the top intent reached the threshold, every ranked intent that also
 * reached it is a candidate (deterministic multi-intent); otherwise only
 * the (possibly inferred) top intent is used.
 */
function intentCandidates(analysis, threshold) {
  const intent = analysis?.intent;
  if (!intent || typeof intent.id !== 'string') return [];
  if (intent.score >= threshold && Array.isArray(intent.ranked)) {
    const out = [];
    const seen = new Set();
    for (const ranked of intent.ranked) {
      if (ranked && typeof ranked.id === 'string' && ranked.score >= threshold && !seen.has(ranked.id)) {
        seen.add(ranked.id);
        out.push(ranked);
      }
    }
    if (!seen.has(intent.id)) out.unshift(intent);
    return out;
  }
  return [intent];
}

function isValidRetrieval(value) {
  return Boolean(value && value.handled === true && typeof value.answer === 'string' && value.answer.length > 0);
}

function hoursToMs(hours) {
  const n = Number(hours);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 3600 * 1000) : null;
}
