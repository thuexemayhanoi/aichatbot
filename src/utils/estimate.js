/**
 * Price estimation for rental packages.
 *
 * The estimator is a small brute-force search over combinations of
 * month/week/day tiers. It never invents rates: a tier with null bounds is
 * simply unavailable for packaging, and a vehicle without any usable tier
 * yields null (meaning "contact for price"), never 0 VND.
 */

const TIER_DAYS = { month: 30, week: 7, day: 1 };

/** True when at least one rate tier carries a usable bound. */
export function hasAnyRate(rates) {
  if (!rates) return false;
  return ['day', 'week', 'month'].some((tier) => tierBound(rates[tier], 'min') !== null || tierBound(rates[tier], 'max') !== null);
}

function tierBound(tier, bound) {
  const value = tier ? tier[bound] : null;
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
}

/**
 * Enumerate feasible {months, weeks, days} packages covering exactly `days`.
 * Bounds keep the search tiny (days <= 366 in practice).
 */
function feasiblePackages(days) {
  const packages = [];
  const maxMonths = Math.ceil(days / 30);
  for (let months = 0; months <= maxMonths; months++) {
    const maxWeeks = Math.ceil((days - months * 30) / 7);
    for (let weeks = 0; weeks <= maxWeeks; weeks++) {
      const rest = days - months * 30 - weeks * 7;
      if (rest < 0) continue;
      packages.push({ months, weeks, days: rest });
    }
  }
  return packages;
}

/**
 * Cheapest package for one bound ("min" or "max") of the rate table.
 * A package is feasible only when every tier it uses has a non-null bound
 * for the requested side. Returns { months, weeks, days, cost } or null.
 */
export function cheapestPackage(days, rates, bound = 'min') {
  const n = Number(days);
  if (!Number.isInteger(n) || n <= 0 || !rates) return null;
  let best = null;
  for (const pkg of feasiblePackages(n)) {
    let cost = 0;
    let feasible = true;
    for (const [tier, count] of [
      ['month', pkg.months],
      ['week', pkg.weeks],
      ['day', pkg.days]
    ]) {
      if (count === 0) continue;
      const unit = tierBound(rates[tier], bound);
      if (unit === null) {
        feasible = false;
        break;
      }
      cost += count * unit;
    }
    if (!feasible) continue;
    if (!best || cost < best.cost) best = { ...pkg, cost };
  }
  return best;
}

/**
 * Estimate the price of renting `vehicle` for `days`.
 * Lower and upper bounds are optimized independently (the cheapest package
 * for min rates is not assumed to be the cheapest for max rates).
 * @returns { min, max, days } or null when no rate tier is usable.
 */
export function estimatePrice(vehicle, days) {
  if (!vehicle || !vehicle.rates || !hasAnyRate(vehicle.rates)) return null;
  const n = Number(days);
  if (!Number.isInteger(n) || n <= 0) return null;
  const minPkg = cheapestPackage(n, vehicle.rates, 'min');
  const maxPkg = cheapestPackage(n, vehicle.rates, 'max');
  if (!minPkg && !maxPkg) return null;
  let min = minPkg ? minPkg.cost : null;
  let max = maxPkg ? maxPkg.cost : null;
  // A one-sided estimate must never contradict the other side.
  if (min === null) min = max;
  if (max === null || max < min) max = min;
  return { min, max, days: n };
}
