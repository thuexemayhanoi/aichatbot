/**
 * Policy rule: covers policy_query and documents_query.
 * Insurance is the only verified policy topic; everything else
 * (documents, cancellation, ...) is an honest unknown, never invented.
 */
export function createPolicyRule({ business } = {}) {
  return {
    id: 'policy-rule',
    canHandle(analysis) {
      const intentId = analysis?.intent?.id;
      return intentId === 'policy_query' || intentId === 'documents_query';
    },
    respond(analysis) {
      // Insurance is detected on the normalized text so both
      // "bảo hiểm" and "bao hiem" (accentless) route to the pinned note.
      if (analysis?.normalized?.includes('bao hiem')) {
        return {
          handled: true,
          answer: business.policies.insurance.note,
          confidence: 1,
          source: 'business-data'
        };
      }
      return {
        handled: true,
        answer: `Mình chưa có thông tin chắc chắn về chính sách này. Bạn vui lòng liên hệ ${business.brand} (${business.contact.phone_display}) để xác nhận chi tiết.`,
        confidence: 0.4,
        source: 'unknown'
      };
    }
  };
}
