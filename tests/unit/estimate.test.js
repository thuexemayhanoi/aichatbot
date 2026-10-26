import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAnyRate, cheapestPackage, estimatePrice } from '../../src/utils/estimate.js';
import { pricing } from '../helpers/load-data.js';

const byId = (id) => pricing.vehicles.find((v) => v.id === id);

test('hasAnyRate detects usable tiers and rejects null tables', () => {
  assert.equal(hasAnyRate(byId('honda-vision').rates), true);
  assert.equal(hasAnyRate(byId('xe-50cc').rates), true, 'a day rate alone is usable');
  assert.equal(hasAnyRate(byId('electric-bike').rates), false);
  assert.equal(hasAnyRate(null), false);
  assert.equal(hasAnyRate({ day: { min: null, max: null } }), false);
});

test('cheapestPackage picks the week tier over seven day rates', () => {
  const pkg = cheapestPackage(7, byId('honda-vision').rates, 'min');
  assert.deepEqual({ months: pkg.months, weeks: pkg.weeks, days: pkg.days }, { months: 0, weeks: 1, days: 0 });
  assert.equal(pkg.cost, 1000000);
});

test('cheapestPackage combines tiers for non-multiples', () => {
  // 10 days = 1 week + 3 days on Vision (1.000.000 + 3*200.000).
  const pkg = cheapestPackage(10, byId('honda-vision').rates, 'min');
  assert.deepEqual({ months: pkg.months, weeks: pkg.weeks, days: pkg.days }, { months: 0, weeks: 1, days: 3 });
  assert.equal(pkg.cost, 1600000);
});

test('a missing weekly/monthly rate is never derived by multiplying the day rate', () => {
  // Xe tay ga 50cc publishes only a day rate: up to 6 days are priced, 7+ days are "Liên hệ".
  const six = cheapestPackage(6, byId('xe-50cc').rates, 'min');
  assert.deepEqual({ months: six.months, weeks: six.weeks, days: six.days, cost: six.cost }, { months: 0, weeks: 0, days: 6, cost: 1200000 });
  assert.equal(cheapestPackage(7, byId('xe-50cc').rates, 'min'), null);
  assert.equal(cheapestPackage(30, byId('xe-50cc').rates, 'min'), null);
  // Nor is a month priced as weeks when the monthly rate is missing.
  const weeksOnly = { day: { min: 100, max: 100 }, week: { min: 500, max: 500 }, month: { min: null, max: null } };
  assert.equal(cheapestPackage(28, weeksOnly, 'min').cost, 2000);
  assert.equal(cheapestPackage(35, weeksOnly, 'min'), null);
});

test('cheapestPackage optimizes min and max bounds independently', () => {
  // Vision 30 days: month tier min 1.800.000 / max 2.000.000, both beat 4 weeks + 2 days.
  const minPkg = cheapestPackage(30, byId('honda-vision').rates, 'min');
  const maxPkg = cheapestPackage(30, byId('honda-vision').rates, 'max');
  assert.equal(minPkg.cost, 1800000);
  assert.equal(maxPkg.cost, 2000000);
});

test('estimatePrice matches authoritative reference values', () => {
  assert.deepEqual(estimatePrice(byId('honda-vision'), 7), { min: 1000000, max: 1000000, days: 7 });
  assert.deepEqual(estimatePrice(byId('honda-wave'), 7), { min: 700000, max: 700000, days: 7 });
  assert.deepEqual(estimatePrice(byId('honda-airblade'), 30), { min: 1500000, max: 1500000, days: 30 });
  assert.deepEqual(estimatePrice(byId('honda-click'), 30), { min: 900000, max: 1200000, days: 30 });
  assert.deepEqual(estimatePrice(byId('honda-vision'), 60), { min: 3600000, max: 4000000, days: 60 });
});

test('estimatePrice returns null for unpriced vehicles, never 0', () => {
  assert.equal(estimatePrice(byId('xe-50cc'), 7), null, 'no published weekly rate');
  assert.equal(estimatePrice(byId('electric-bike'), 1), null);
  assert.equal(estimatePrice(null, 7), null);
});

test('estimatePrice rejects invalid durations and rate tables', () => {
  assert.equal(estimatePrice(byId('honda-vision'), 0), null);
  assert.equal(estimatePrice(byId('honda-vision'), -5), null);
  assert.equal(estimatePrice(byId('honda-vision'), null), null);
  assert.equal(estimatePrice({ rates: null }, 3), null);
});

test('estimatePrice clamps a one-sided bound so max never undercuts min', () => {
  const vehicle = {
    rates: {
      day: { min: 100000, max: null },
      week: { min: null, max: null },
      month: { min: null, max: null }
    }
  };
  const estimate = estimatePrice(vehicle, 2);
  assert.deepEqual(estimate, { min: 200000, max: 200000, days: 2 });
});
