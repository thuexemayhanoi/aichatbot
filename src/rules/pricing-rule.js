import { describeDays, formatVndRange } from '../utils/format.js';
import {
  resolveVehicle,
  resolvePricingEntries,
  formatTierLines,
  dayRateLabel
} from './shared.js';
import { calculateRental, compareVehiclesForDays } from '../calc/rental-calculator.js';
import { formatDateVi } from '../nlu/entities/dates.js';

/**
 * Pricing rule: the deterministic price/estimate path.
 *
 * canHandle:
 * - price_query: always (it may still clarify or show an overview).
 * - duration_query: only when the CURRENT turn carries a duration.
 * - compare_query: when a duration is known but no single vehicle is.
 *
 * Resolution order for the vehicle: model entity > category entity > slot.
 * A missing vehicle with a concrete duration triggers a clarification.
 * Date ranges ("từ 5/10 đến 18/10") convert to inclusive day counts and the
 * answer shows the date labels + a transparent cheapest-package breakdown.
 * "Cái nào rẻ hơn" turns get a deterministic cross-model comparison.
 */
export function createPricingRule({ business, pricing } = {}) {
  return {
    id: 'pricing-rule',
    canHandle(analysis, slots) {
      const intentId = analysis?.intent?.id;
      if (intentId === 'price_query') return true;
      if (intentId === 'duration_query' && Number.isInteger(analysis?.entities?.totalDays)) return true;
      if (intentId === 'compare_query') {
        const days = analysis?.entities?.totalDays ?? slots?.durationDays ?? null;
        return Number.isInteger(days) && days > 0;
      }
      return false;
    },
    respond(analysis, slots) {
      const disclaimer = pricing.disclaimer;
      const intentId = analysis?.intent?.id;
      const vehicleRef = resolveVehicle(analysis, slots);
      const dateRange = analysis?.entities?.dateRange ?? null;
      const days = analysis?.entities?.totalDays ?? slots?.durationDays ?? null;

      if (intentId === 'compare_query' && !vehicleRef) {
        return {
          handled: true,
          answer: comparisonAnswer(days, disclaimer),
          confidence: 0.9,
          source: 'pricing-data',
          structured: { type: 'comparison', days, rows: compareVehiclesForDays(pricing, days) }
        };
      }

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
        const entries = resolvePricingEntries(pricing, vehicleRef);
        const estimates = entries
          .map((entry) => ({ entry, calc: calculateRental(entry, days) }))
          .filter((row) => row.calc);
        if (estimates.length > 0) {
          const first = estimates[0];
          const period = dateRange
            ? `từ ${formatDateVi(dateRange.start)} đến ${formatDateVi(dateRange.end)} (${days} ngày)`
            : describeDays(days);
          const min = Math.min(...estimates.map((e) => e.calc.min));
          const max = Math.max(...estimates.map((e) => e.calc.max));
          const lines = [`Giá thuê ${vehicleRef.name} ${period}: ${formatVndRange(min, max)}.`];
          if (estimates.length === 1) {
            for (const line of first.calc.breakdown) lines.push(`- ${line}`);
          } else {
            lines.push('Khoảng giá trải dài các dòng xe trong danh mục này.');
          }
          lines.push(disclaimer);
          return {
            handled: true,
            answer: lines.join('\n'),
            confidence: 0.9,
            source: 'pricing-data',
            structured: { type: 'calculator', vehicle: vehicleRef, days, dateRange, rows: estimates.map((e) => ({ id: e.entry.id, name: e.entry.name, min: e.calc.min, max: e.calc.max })) }
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

  /** Deterministic "cái nào rẻ hơn": priced models sorted cheapest first. */
  function comparisonAnswer(days, disclaimer) {
    const rows = compareVehiclesForDays(pricing, days);
    if (rows.length === 0) {
      return `Mình chưa có giá niêm yết cho ${describeDays(days)}. Vui lòng liên hệ ${business.brand} (${business.contact.phone_display}).`;
    }
    const lines = [`So sánh giá thuê ${describeDays(days)} (rẻ nhất đứng đầu):`];
    for (const row of rows) {
      lines.push(`- ${row.name}: ${formatVndRange(row.min, row.max)}`);
    }
    lines.push(disclaimer);
    return lines.join('\n');
  }

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
