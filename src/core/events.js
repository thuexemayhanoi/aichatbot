/**
 * Minimal synchronous event emitter.
 *
 * Design constraints:
 * - A listener must NEVER break the engine: emit() catches and swallows
 *   listener errors (debugging hooks, future telemetry).
 * - Tiny and dependency-free so it also runs inside Web Workers.
 *
 * Emitted events (Phase 2):
 *   'turn'           { text, sessionId }          before analysis
 *   'session-created'{ session }                  when a fresh session starts
 *   'rule-hit'       { ruleId, intentId }         a deterministic rule answered
 *   'search-hit'     { source, confidence }       optional retriever answered
 *   'fallback'       { ruleId: 'fallback' }       fallback answered
 *   'unknown-query'  { text, intentId }           nothing could answer
 *
 * Future hooks (v42/v43) reuse the same emitter, so new modules can observe
 * the pipeline without modifying it.
 */
export function createEmitter() {
  const listeners = new Map();

  function on(event, listener) {
    if (typeof event !== 'string' || typeof listener !== 'function') return () => {};
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(listener);
    return () => off(event, listener);
  }

  function off(event, listener) {
    const set = listeners.get(event);
    if (set) set.delete(listener);
  }

  /** @returns true when at least one listener ran. */
  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set || set.size === 0) return false;
    let delivered = 0;
    for (const listener of [...set]) {
      try {
        listener(payload);
        delivered++;
      } catch {
        // Listener errors are intentionally swallowed: observability must
        // never take down a user-facing turn.
      }
    }
    return delivered > 0;
  }

  return { on, off, emit };
}
