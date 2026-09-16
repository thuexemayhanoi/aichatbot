import { formatTierLines, resolvePricingEntries } from './shared.js';

/**
 * Duration rule: general "how long can I rent" questions
 * (no duration in the current turn — those go to the pricing rule).
 * When a vehicle is already known, its real rate tiers are shown;
 * otherwise the answer stays generic, derived from pricing.rental_types.
 */
export function createDurationRule({ business, pricing } = {}) {
  return {
    id: 'duration-rule',
    canHandle(analysis) {
      if (analysis?.intent?.id !== 'duration_query') return false;
      // A concrete duration in the turn belongs to the pricing rule.
      return !Number.isInteger(analysis?.entities?.totalDays);
    },
    respond(analysis, slots) {
      const vehicleRef = slots?.vehicle ?? null;

      if (vehicleRef) {
        const entries = resolvePricingEntries(pricing, vehicleRef);
        const model = entries[0];
        const tiers = model ? formatTierLines(model) : [];
        if (tiers.length > 0) {
          return {
            handled: true,
            answer: `Bạn có thể thuê ${vehicleRef.name} theo các kỳ sau:\n${tiers.join('\n')}\nGiá thực tế cần được xác nhận với ${business.brand} trước khi đặt xe.`,
            confidence: 0.9,
            source: 'pricing-data'
          };
        }
        return {
          handled: true,
          answer: `Thời gian thuê ${vehicleRef.name} linh hoạt theo ngày, tuần hoặc tháng. Giá thuê vui lòng liên hệ ${business.brand} (${business.contact.phone_display}) để kiểm tra.`,
          confidence: 0.6,
          source: 'pricing-data'
        };
      }

      const rentalTypes = (pricing.rental_types ?? []).map((t) => t.name.toLowerCase()).join(', ');
      return {
        handled: true,
        answer: `Bạn có thể thuê xe ${rentalTypes} tùy nhu cầu. Giá cụ thể tùy loại xe và thời gian thuê. Bạn muốn thuê loại xe nào?`,
        confidence: 0.9,
        source: 'pricing-data'
      };
    }
  };
}
