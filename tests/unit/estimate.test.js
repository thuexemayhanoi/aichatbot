import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAnyRate, cheapestPackage, estimatePrice } from '../../src/utils/estimate.js';
import { pricing } from '../helpers/load-data.js';

const byId = (id) => pricing.vehicles.find((v) => v.id === id);

test('hasAnyRate detects usable tiers and rejects null tables', () => {
  assert.equal(hasAnyRate(byId('honda-vision').rates), true);
  assert.equal(hasAnyRate(byId('xe-50cc').rates), false);
  assert.equal(hasAnyRate(null), false);
  assert.equal(hasAnyRate({ day: { min: null, max: null } }), false);
});

test('cheapestPackage picks the week tier over seven day rates', () => {
  const pkg = cheapestPackage(7, byId('honda-vision').rates, 'min');
  assert.deepEqual({ months: pkg.months, weeks: pkg.weeks, days: pkg.days }, { months: 0, weeks: 1, days: 0 });
  assert.equal(pkg.cost, 800000);
});

test('cheapestPackage combines tiers for non-multiples', () => {
  // 10 days = 1 week + 3 days on Vision (800k + 3*200k).
  const pkg = cheapestPackage(10, byId('honda-vision').rates, 'min');
  assert.deepEqual({ months: pkg.months, weeks: pkg.weeks, days: pkg.days }, { months: 0, weeks: 1, days: 3 });
  assert.equal(pkg.cost, 1400000);
});

test('cheapestPackage falls back to day rates when week/month are null', () => {
  // Honda Wave only has a day rate.
  const pkg = cheapestPackage(7, byId('honda-wave').rates, 'min');
  assert.deepEqual({ months: pkg.months, weeks: pkg.weeks, days: pkg.days }, { months: 0, weeks: 0, days: 7 });
  assert.equal(pkg.cost, 1050000);
});

test('cheapestPackage optimizes min and max bounds independently', () => {
  // Vision 7 days: min via week tier (800k), max via week tier max (1M), both beat 7*200k.
  const minPkg = cheapestPackage(7, byId('honda-vision').rates, 'min');
  const maxPkg = cheapestPackage(7, byId('honda-vision').rates, 'max');
  assert.equal(minPkg.cost, 800000);
  assert.equal(maxPkg.cost, 1000000);
});

test('estimatePrice matches authoritative reference values', () => {
  assert.deepEqual(estimatePrice(byId('honda-vision'), 7), { min: 800000, max: 1000000, days: 7 });
  assert.deepEqual(estimatePrice(byId('honda-airblade'), 30), { min: 1400000, max: 1400000, days: 30 });
  assert.deepEqual(estimatePrice(byId('honda-click'), 30), { min: 1000000, max: 1200000, days: 30 });
  assert.deepEqual(estimatePrice(byId('honda-vision'), 60), { min: 3600000, max: 4000000, days: 60 });
});

test('estimatePrice returns null for unpriced vehicles, never 0', () => {
  assert.equal(estimatePrice(byId('xe-50cc'), 7), null);
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
