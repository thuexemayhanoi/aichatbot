/**
 * Deterministic bike recommendation engine.
 *
 * Reasons are derived ONLY from verified data: pricing.json categories,
 * descriptions, rate tiers, popularity/order and business.json service
 * areas. Seat height, fuel economy and other specs are NOT published in
 * the verified data, so they are never invented — when the user states a
 * height, the engine says the fit must be confirmed with the shop.
 *
 * Output shape (structured, template-renderable):
 * { recommendedModels, reasons, tradeoffs, missingInfo, confidenceSource }
 */
import { estimatePrice } from '../utils/estimate.js';
import { formatVndRange } from '../utils/format.js';

const MAX_RECOMMENDATIONS = 3;

/**
 * @param {object} pricing - authoritative pricing data.
 * @param {object} constraints - {transmission, electric, usage, durationDays,
 *   budget, experience, luggage, destination, heightCm}
 */
export function recommendBikes(pricing, constraints = {}) {
  const vehicles = [...(pricing?.vehicles ?? [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const scored = [];

  for (const vehicle of vehicles) {
    const { score, reasons, tradeoffs, excluded } = scoreVehicle(vehicle, constraints);
    if (excluded) continue;
    scored.push({ vehicle, score, reasons, tradeoffs });
  }

  scored.sort((a, b) => (b.score - a.score) ||
    ((a.vehicle.order ?? 99) - (b.vehicle.order ?? 99)) ||
    (a.vehicle.id < b.vehicle.id ? -1 : 1));

  const recommendedModels = scored.slice(0, MAX_RECOMMENDATIONS).map((entry) => ({
    id: entry.vehicle.id,
    name: entry.vehicle.name,
    category: entry.vehicle.category,
    reasons: entry.reasons,
    tradeoffs: entry.tradeoffs,
    estimate: entry.estimate ?? null
  }));

  return {
    recommendedModels,
    reasons: recommendedModels.map((m) => `${m.name}: ${m.reasons.join('; ')}`),
    tradeoffs: scored.length > MAX_RECOMMENDATIONS
      ? ['Các dòng khác trong bảng giá vẫn có thể phù hợp tùy nhu cầu thực tế.']
      : [],
    missingInfo: missingInfo(constraints, pricing),
    confidenceSource: 'pricing-data'
  };
}

function scoreVehicle(vehicle, constraints) {
  const score = 0;
  const reasons = [];
  const tradeoffs = [];

  // Hard filters first (wrong transmission / fuel type = excluded).
  if (constraints.transmission === 'scooter' && vehicle.category === 'Xe số') return { excluded: true };
  if (constraints.transmission === 'manual' && vehicle.category === 'Xe tay ga') return { excluded: true };
  if (constraints.electric && !String(vehicle.category).includes('điện')) return { excluded: true };
  if (!constraints.electric && String(vehicle.category).includes('điện') && !constraints.transmission) {
    // Electric is a niche: only mention it when the user did not hint at petrol.
    if (constraints.usage === 'long') return { excluded: true };
  }

  let s = score;
  if (constraints.transmission === 'scooter' && vehicle.category === 'Xe tay ga') { s += 2; reasons.push('xe ga theo yêu cầu'); }
  if (constraints.transmission === 'manual' && vehicle.category === 'Xe số') { s += 2; reasons.push('xe số theo yêu cầu'); }
  if (constraints.electric) { s += 2; reasons.push('xe điện theo yêu cầu'); }

  const description = normalizeText(vehicle.description);
  if (constraints.experience === 'new' && /de dieu khien|nhe/.test(description)) {
    s += 2;
    reasons.push('mô tả niêm yết: dễ điều khiển/nhẹ, hợp với người mới lái');
  }
  if (constraints.usage === 'city' && /noi thanh|ngan|gan|nhe/.test(description)) {
    s += 1;
    reasons.push('mô tả niêm yết hợp đi nội thành / quãng ngắn');
  }
  if (constraints.usage === 'long') {
    const monthly = estimatePrice(vehicle, 30);
    if (monthly) { s += 2; reasons.push('có giá theo tuần/tháng niêm yết cho chuyến dài'); }
    else tradeoffs.push('chưa có giá dài hạn niêm yết, cần liên hệ báo giá');
  }

  const days = constraints.durationDays;
  let estimate = null;
  if (Number.isInteger(days) && days > 0) {
    estimate = estimatePrice(vehicle, days);
    if (estimate) {
      s += 1;
      reasons.push(`có giá niêm yết cho ${days} ngày (${formatVndRange(estimate.min, estimate.max)})`);
    } else {
      tradeoffs.push('chưa có giá niêm yết, cần liên hệ báo giá');
    }
  }

  if (constraints.budget && Number.isFinite(constraints.budget.amountVnd)) {
    const ceiling = constraints.budget.direction === 'max' ? constraints.budget.amountVnd : Infinity;
    const floor = constraints.budget.direction === 'min' ? constraints.budget.amountVnd : 0;
    if (estimate) {
      if (estimate.max <= ceiling && estimate.min >= floor) {
        s += 3;
        reasons.push(`nằm trong ngân sách ${formatVndRange(floor === 0 ? null : floor, ceiling === Infinity ? null : ceiling)}`);
      } else if (estimate.min > ceiling) {
        return { excluded: true };
      }
    } else if (floor === 0) {
      tradeoffs.push('giá chưa niêm yết nên chưa đối chiếu được ngân sách');
    }
  }

  if (vehicle.popular) { s += 1; reasons.push('dòng phổ biến của cửa hàng'); }
  if (reasons.length === 0) reasons.push('có mặt trong bảng giá chính thức');

  return { score: s, reasons, tradeoffs, excluded: false, estimate };
}

function missingInfo(constraints, pricing) {
  const missing = [];
  if (constraints.heightCm && !hasSeatHeightData(pricing)) {
    missing.push('chiều cao yên xe chưa được công bố — mức phù hợp cần xác nhận qua điện thoại');
  }
  if (constraints.luggage) {
    missing.push('thông tin về chở đồ/hộp xe chưa được công bố — cần xác nhận khi đặt xe');
  }
  if (constraints.destination && !constraints.durationDays) {
    missing.push('chưa rõ thời gian thuê');
  }
  return missing;
}

function hasSeatHeightData(pricing) {
  return (pricing?.vehicles ?? []).some((v) => v.seat_height_cm != null || v.seatHeightCm != null);
}

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}
