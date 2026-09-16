import { normalize } from '../nlu/normalizer.js';
import { resolvePricingEntries, dayRateLabel } from './shared.js';

/**
 * Bike type rule: what kinds of bikes exist.
 * Lists categories and models straight from the pricing data; unpriced
 * categories are listed without any invented price. A displacement query
 * ("xe 125cc") only answers when the catalog actually has that class.
 */
export function createBikeTypeRule({ business, pricing } = {}) {
  return {
    id: 'bike-type-rule',
    canHandle(analysis) {
      return analysis?.intent?.id === 'bike_type_query';
    },
    respond(analysis) {
      const displacement = analysis?.entities?.displacements?.[0]?.cc ?? null;

      if (displacement !== null) {
        const match = (pricing.vehicles ?? []).find(
          (v) => normalize(v.name).includes(`${displacement}cc`) || normalize(v.category).includes(`${displacement}cc`)
        );
        if (!match) {
          return {
            handled: true,
            answer: `Mình chưa có thông tin về xe ${displacement}cc trong danh mục hiện tại. ${catalogOverview()}`,
            confidence: 0.4,
            source: 'unknown'
          };
        }
        const price = dayRateLabel(match);
        const priceText = price ? ` Giá thuê ${price}.` : ` Giá thuê vui lòng liên hệ ${business.brand} để kiểm tra.`;
        return {
          handled: true,
          answer: `${match.name}: ${match.description}.${priceText}`,
          confidence: 1,
          source: 'pricing-data'
        };
      }

      return {
        handled: true,
        answer: catalogOverview(),
        confidence: 1,
        source: 'pricing-data'
      };
    }
  };

  /** Category/model listing derived only from pricing data. */
  function catalogOverview() {
    const byCategory = new Map();
    for (const vehicle of [...(pricing.vehicles ?? [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))) {
      if (!byCategory.has(vehicle.category)) byCategory.set(vehicle.category, []);
      byCategory.get(vehicle.category).push(vehicle);
    }
    const lines = [`Các loại xe hiện có tại ${business.display_name}:`];
    for (const [category, models] of byCategory) {
      const priced = models.filter((m) => dayRateLabel(m));
      // A single model named after its category reads fine without repetition.
      const modelNames =
        models.length === 1 && normalize(models[0].name) === normalize(category) ? '' : `: ${models.map((m) => m.name).join(', ')}`;
      if (priced.length === models.length && priced.length > 0) {
        const fromPrice = Math.min(...priced.map((m) => m.rates.day.min));
        lines.push(`- ${category}${modelNames} (từ ${formatPrice(fromPrice)}/ngày)`);
      } else {
        lines.push(`- ${category}${modelNames}`);
      }
    }
    lines.push(`Bạn quan tâm loại xe nào?`);
    return lines.join('\n');
  }

  function formatPrice(value) {
    return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
  }
}
