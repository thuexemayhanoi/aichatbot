import { formatVndRange } from '../utils/format.js';
import { resolveVehicle, resolvePricingEntries } from './shared.js';

/** Deposit rule: business.json note + per-vehicle pricing.json deposits
 *  (null = per model, never guessed); a separate amount, never the price. */
export function createDepositRule({ business, pricing } = {}) {
  return {
    id: 'deposit-rule',
    canHandle(analysis) {
      return analysis?.intent?.id === 'deposit_query';
    },
    respond(analysis, slots) {
      const note = business.policies.deposit.note;
      const entries = resolvePricingEntries(pricing, resolveVehicle(analysis, slots));
      if (entries.length === 0) return { handled: true, answer: note, confidence: 1, source: 'business-data' };
      const lines = entries.map((v) => `- ${v.name}: ${depositLabel(v)}`);
      return {
        handled: true,
        answer: `Tiền đặt cọc (khoản riêng, không tính vào giá thuê):\n${lines.join('\n')}\n${note}`,
        confidence: 1,
        source: 'pricing-data'
      };
    }
  };
}

/** "4.000.000đ - 5.000.000đ", or the model's confirm note when not published. */
export function depositLabel(vehicle) {
  return formatVndRange(vehicle?.deposit?.min ?? null, vehicle?.deposit?.max ?? null) ?? vehicle?.deposit_note ?? 'xác nhận khi đặt xe';
}
