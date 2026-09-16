/**
 * Shared helpers for rule modules.
 * Rules receive already-loaded authoritative data; these functions only
 * read it, never mutate it, and never invent values.
 */
import { normalize } from '../nlu/normalizer.js';
import { formatVnd, formatVndRange } from '../utils/format.js';
import { estimatePrice } from '../utils/estimate.js';

/**
 * Resolve which vehicle a turn is about.
 * Priority: model entity > category entity > remembered slot.
 * @returns {type, id, name} or null.
 */
export function resolveVehicle(analysis, slots) {
  const vehicles = analysis?.entities?.vehicles;
  if (Array.isArray(vehicles) && vehicles.length > 0) {
    const model = vehicles.find((v) => v && v.type === 'model' && v.id);
    const any = vehicles.find((v) => v && v.id);
    return model ?? any ?? null;
  }
  return slots?.vehicle ?? null;
}

/** Find a pricing entry by vehicle id. */
export function findVehicleById(pricing, id) {
  return (pricing?.vehicles ?? []).find((v) => v.id === id) ?? null;
}

/** All pricing entries belonging to a category reference ({type:'category', name}). */
export function vehiclesInCategory(pricing, categoryRef) {
  const wanted = normalize(categoryRef?.name ?? '');
  if (!wanted) return [];
  return (pricing?.vehicles ?? []).filter((v) => normalize(v.category) === wanted);
}

/**
 * The concrete pricing entries a vehicle reference points at.
 * A model resolves to itself; a category resolves to its members.
 */
export function resolvePricingEntries(pricing, vehicleRef) {
  if (!vehicleRef) return [];
  if (vehicleRef.type === 'model') {
    const entry = findVehicleById(pricing, vehicleRef.id);
    return entry ? [entry] : [];
  }
  return vehiclesInCategory(pricing, vehicleRef);
}

/**
 * Estimate a price for a vehicle reference.
 * A model is estimated directly; a category spans the min of its models'
 * minima to the max of its maxima (only models with usable rates count).
 * @returns { min, max } or null when nothing is priced.
 */
export function estimateForVehicleRef(pricing, vehicleRef, days) {
  const entries = resolvePricingEntries(pricing, vehicleRef);
  if (entries.length === 0) return null;
  const estimates = entries.map((entry) => estimatePrice(entry, days)).filter(Boolean);
  if (estimates.length === 0) return null;
  const min = Math.min(...estimates.map((e) => e.min));
  const max = Math.max(...estimates.map((e) => e.max));
  return { min, max };
}

/**
 * Rate-tier lines for one vehicle, e.g. "- Theo ngày: 150.000đ".
 * Tiers with null rates are omitted: no invented weekly/monthly prices.
 */
export function formatTierLines(vehicle) {
  const lines = [];
  const tiers = [
    ['day', 'Theo ngày'],
    ['week', 'Theo tuần'],
    ['month', 'Theo tháng']
  ];
  for (const [tier, label] of tiers) {
    const range = vehicle?.rates?.[tier];
    if (!range || (range.min === null && range.max === null)) continue;
    const formatted = formatVndRange(range.min, range.max);
    if (formatted) lines.push(`- ${label}: ${formatted}`);
  }
  return lines;
}

/** Day-rate label for a vehicle, e.g. "150.000đ/ngày", or null. */
export function dayRateLabel(vehicle) {
  const min = vehicle?.rates?.day?.min;
  const formatted = formatVnd(min);
  return formatted ? `${formatted}/ngày` : null;
}
