/**
 * Smart rental calculator — deterministic, driven 100% by pricing.json.
 *
 * Handles: day counts (from durations or date ranges), transparent
 * cheapest-package breakdowns (month/week/day tiers, no invented
 * discounts), and cross-model comparison for "cái nào rẻ hơn" turns.
 * Every number in the output traces back to a verified rate tier.
 */
import { cheapestPackage, estimatePrice } from '../utils/estimate.js';
import { formatVnd, describeDays } from '../utils/format.js';

const TIER_LABELS = { month: 'tháng', week: 'tuần', day: 'ngày' };

/**
 * Full estimate for one vehicle + duration, WITH breakdowns.
 * @param {object} vehicle - a pricing.json vehicle entry.
 * @param {number} days    - rental length in days (inclusive).
 * @returns null when no rate tier is usable, else
 *   { days, min, max, breakdown: [{text}], cheapestText }
 */
export function calculateRental(vehicle, days) {
  const estimate = estimatePrice(vehicle, days);
  if (!estimate) return null;

  const minPkg = cheapestPackage(days, vehicle.rates, 'min');
  const maxPkg = cheapestPackage(days, vehicle.rates, 'max');

  return {
    days,
    min: estimate.min,
    max: estimate.max,
    breakdown: [describePackage(minPkg, 'tối thiểu'), describePackage(maxPkg, 'tối đa')].filter(Boolean),
    package: minPkg
  };
}

/** "- Gói tối thiểu (theo giá tuần): 2 tuần × 800.000đ = 1.600.000đ" */
function describePackage(pkg, side) {
  if (!pkg) return null;
  const parts = [];
  for (const tier of ['month', 'week', 'day']) {
    const count = pkg[tier === 'month' ? 'months' : tier === 'week' ? 'weeks' : 'days'];
    if (count > 0) parts.push(`${count} ${TIER_LABELS[tier]} × ${formatVnd(pkg.units[tier])}/${TIER_LABELS[tier]}`);
  }
  if (parts.length === 0) return null;
  return `Gói ${side} (không phát sinh phụ phí): ${parts.join(' + ')} = ${formatVnd(pkg.cost)}`;
}

/**
 * Compare every priced vehicle for `days`, cheapest first.
 * @returns Array<{id, name, min, max}> sorted by min asc, then order.
 */
export function compareVehiclesForDays(pricing, days) {
  const rows = [];
  for (const vehicle of pricing?.vehicles ?? []) {
    const estimate = estimatePrice(vehicle, days);
    if (!estimate) continue;
    rows.push({ id: vehicle.id, name: vehicle.name, min: estimate.min, max: estimate.max, order: vehicle.order ?? 99 });
  }
  return rows.sort((a, b) => (a.min - b.min) || (a.order - b.order) || (a.id < b.id ? -1 : 1));
}

/** Label for the answer line: "14 ngày" / "từ 05/10/2026 đến 18/10/2026 (14 ngày)". */
export function describePeriod({ days, dateRange, formatDateVi }) {
  if (dateRange && Number.isInteger(days)) {
    return `từ ${formatDateVi(dateRange.start)} đến ${formatDateVi(dateRange.end)} (${days} ngày)`;
  }
  return describeDays(days);
}
