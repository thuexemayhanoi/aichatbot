/**
 * Return rule: honest unknown.
 * Return process and times are not part of the verified business data, so
 * this rule never invents them; it points to contact with low confidence.
 */
export function createReturnRule({ business } = {}) {
  return {
    id: 'return-rule',
    canHandle(analysis) {
      return analysis?.intent?.id === 'return_query';
    },
    respond() {
      return {
        handled: true,
        answer: `Mình chưa có thông tin chắc chắn về quy trình và thời gian trả xe. Bạn vui lòng liên hệ ${business.brand} (${business.contact.phone_display}) để xác nhận trước khi đặt xe.`,
        confidence: 0.4,
        source: 'unknown'
      };
    }
  };
}
