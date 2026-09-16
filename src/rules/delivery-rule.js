/**
 * Delivery rule.
 * Known service area (from authoritative business data) -> "yes" answer.
 * Unrecognized or unlisted area -> honest unknown: list the known areas and
 * point to contact. Delivery fees and times are never invented.
 */
export function createDeliveryRule({ business } = {}) {
  return {
    id: 'delivery-rule',
    canHandle(analysis) {
      return analysis?.intent?.id === 'delivery_query';
    },
    respond(analysis, slots) {
      const delivery = business.policies.delivery;
      if (!delivery.available) {
        return {
          handled: true,
          answer: `${business.display_name} hiện không cung cấp dịch vụ giao xe.`,
          confidence: 1,
          source: 'business-data'
        };
      }

      const location = analysis?.entities?.locations?.[0]?.name ?? slots?.location ?? null;
      const knownArea = location && business.service_areas.includes(location);

      if (knownArea) {
        return {
          handled: true,
          answer: `Có, ${business.display_name} giao xe tại ${location} trong giờ hoạt động (${business.hours.display}). Thời gian và chi phí giao nhận cần được xác nhận trước khi đặt xe.`,
          confidence: 0.95,
          source: 'business-data'
        };
      }

      const areas = business.service_areas.join(', ');
      return {
        handled: true,
        answer: `Mình chưa có thông tin chắc chắn về khu vực giao xe này. Các khu vực giao xe chính: ${areas}. Bạn vui lòng liên hệ ${business.brand} (${business.contact.phone_display}) để xác nhận khu vực cụ thể.`,
        confidence: 0.4,
        source: 'unknown'
      };
    }
  };
}
