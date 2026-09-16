import { describeDays, formatVndRange } from '../utils/format.js';
import {
  resolveVehicle,
  resolvePricingEntries,
  estimateForVehicleRef,
  formatTierLines,
  dayRateLabel
} from './shared.js';

/**
 * Pricing rule: the deterministic price/estimate path.
 *
 * canHandle:
 * - price_query: always (it may still clarify or show an overview).
 * - duration_query: only when the CURRENT turn carries a duration
 *   ("Vision 3 ngày", "thuê 2 tháng") so the estimate can use it.
 *
 * Resolution order for the vehicle: model entity > category entity > slot.
 * A missing vehicle with a concrete duration triggers a clarification
 * (agenda) asking ONLY for the vehicle. Everything else is answered from
 * the authoritative pricing table; unpriced entries mean "contact",
 * never 0 VND.
 */
export function createPricingRule({ business, pricing } = {}) {
  return {
    id: 'pricing-rule',
    canHandle(analysis) {
      const intentId = analysis?.intent?.id;
      if (intentId === 'price_query') return true;
      if (intentId === 'duration_query' && Number.isInteger(analysis?.entities?.totalDays)) return true;
      return false;
    },
    respond(analysis, slots) {
      const disclaimer = pricing.disclaimer;
      const vehicleRef = resolveVehicle(analysis, slots);
      const days = analysis?.entities?.totalDays ?? slots?.durationDays ?? null;

      if (!vehicleRef) {
        if (Number.isInteger(days) && days > 0) {
          // Concrete duration but no vehicle: ask ONLY for the vehicle.
          return {
            handled: true,
            answer: `Bạn đang muốn xem giá thuê xe nào cho ${describeDays(days)}? ${exampleQuestion()}`,
            clarify: { intentId: 'price_query', needs: ['vehicle'] },
            confidence: 0.6,
            source: 'agenda'
          };
        }
        return {
          handled: true,
          answer: priceOverview(),
          confidence: 0.9,
          source: 'pricing-data'
        };
      }

      if (Number.isInteger(days) && days > 0) {
        const estimate = estimateForVehicleRef(pricing, vehicleRef, days);
        if (estimate) {
          return {
            handled: true,
            answer: `Giá thuê ${vehicleRef.name} ${describeDays(days)}: ${formatVndRange(estimate.min, estimate.max)}. ${disclaimer}`,
            confidence: 0.9,
            source: 'pricing-data'
          };
        }
        return {
          handled: true,
          answer: `${vehicleRef.name} hiện chưa có giá niêm yết. Vui lòng liên hệ ${business.brand} (${business.contact.phone_display}) để kiểm tra giá hiện tại.`,
          confidence: 0.5,
          source: 'pricing-data'
        };
      }

      // Vehicle known, no duration: show its real tiers.
      const entries = resolvePricingEntries(pricing, vehicleRef);
      if (entries.length === 1) {
        const tiers = formatTierLines(entries[0]);
        if (tiers.length > 0) {
          return {
            handled: true,
            answer: `Giá thuê ${vehicleRef.name}:\n${tiers.join('\n')}\n${disclaimer}`,
            confidence: 0.9,
            source: 'pricing-data'
          };
        }
      } else if (entries.length > 1) {
        const lines = entries.map((entry) => {
          const label = dayRateLabel(entry);
          return label ? `- ${entry.name}: ${label}` : `- ${entry.name}: liên hệ để biết giá`;
        });
        return {
          handled: true,
          answer: `${vehicleRef.name} gồm các dòng xe sau:\n${lines.join('\n')}\nBạn muốn xem giá dòng xe nào?`,
          confidence: 0.9,
          source: 'pricing-data'
        };
      }

      return {
        handled: true,
        answer: `${vehicleRef.name} hiện chưa có giá niêm yết. Vui lòng liên hệ ${business.brand} (${business.contact.phone_display}) để kiểm tra giá hiện tại.`,
        confidence: 0.5,
        source: 'pricing-data'
      };
    }
  };

  /** Overview for a price question without any vehicle, derived from data. */
  function priceOverview() {
    const vehicles = [...(pricing.vehicles ?? [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    const priced = vehicles.filter((v) => dayRateLabel(v));
    const unpriced = vehicles.filter((v) => !dayRateLabel(v));
    const lines = ['Bảng giá tham khảo (theo ngày):'];
    for (const vehicle of priced) {
      lines.push(`- ${vehicle.name}: ${dayRateLabel(vehicle)}`);
    }
    if (unpriced.length > 0) {
      lines.push(`- ${unpriced.map((v) => v.name).join(', ')}: vui lòng liên hệ ${business.brand} để biết giá.`);
    }
    lines.push(`Bạn muốn xem giá chi tiết của xe nào (ví dụ: Vision 1 tuần, Air Blade 1 tháng)?`);
    return lines.join('\n');
  }

  /** Examples built from the catalog so the clarify question stays data-driven. */
  function exampleQuestion() {
    const categories = [...new Set((pricing.vehicles ?? []).map((v) => v.category))];
    const examples = (pricing.vehicles ?? [])
      .filter((v) => v.popular)
      .slice(0, 3)
      .map((v) => v.name);
    const exampleText = examples.length ? ` (ví dụ: ${examples.join(', ')})` : '';
    return `Các loại xe: ${categories.join(', ')}${exampleText}.`;
  }
}
