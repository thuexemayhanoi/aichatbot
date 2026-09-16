/**
 * Deposit rule: authoritative deposit range.
 * The answer text is the pinned business note from data/business/business.json;
 * this rule never paraphrases amounts on its own.
 */
export function createDepositRule({ business } = {}) {
  return {
    id: 'deposit-rule',
    canHandle(analysis) {
      return analysis?.intent?.id === 'deposit_query';
    },
    respond() {
      const deposit = business.policies.deposit;
      return { handled: true, answer: deposit.note, confidence: 1, source: 'business-data' };
    }
  };
}
