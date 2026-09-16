/**
 * Greeting rule: keeps "xin chào" away from the fallback path.
 */
export function createGreetingRule({ faq } = {}) {
  return {
    id: 'greeting-rule',
    canHandle(analysis) {
      return analysis?.intent?.id === 'greeting';
    },
    respond() {
      return {
        handled: true,
        answer: faq.assistant.greeting,
        confidence: 1,
        source: 'faq-data'
      };
    }
  };
}
