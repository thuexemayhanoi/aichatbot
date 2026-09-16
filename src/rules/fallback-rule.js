/**
 * Fallback rule: honest "I don't know" answer.
 * The engine only invokes it after every deterministic rule AND the optional
 * retriever declined, so an always-true canHandle never blocks search.
 */
export function createFallbackRule({ faq } = {}) {
  return {
    id: 'fallback-rule',
    canHandle() {
      return true;
    },
    respond() {
      return {
        handled: true,
        answer: faq.assistant.not_found,
        confidence: 0.2,
        source: 'fallback'
      };
    }
  };
}
