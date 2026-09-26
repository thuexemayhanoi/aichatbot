import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRental, compareVehiclesForDays, describePeriod } from '../../src/calc/rental-calculator.js';
import { formatDateVi } from '../../src/nlu/entities/dates.js';
import { pricing } from '../helpers/load-data.js';

const byId = (id) => pricing.vehicles.find((v) => v.id === id);

test('1 day equals the day rate with a transparent breakdown', () => {
  const r = calculateRental(byId('honda-vision'), 1);
  assert.equal(r.days, 1);
  assert.equal(r.min, 200000);
  assert.equal(r.max, 200000);
  assert.match(r.breakdown[0], /1 ngày × 200\.000đ\/ngày = 200\.000đ/);
});
test('7 days use the week tier', () => {
  const r = calculateRental(byId('honda-vision'), 7);
  assert.equal(r.min, 800000);
  assert.equal(r.max, 1000000);
  assert.match(r.breakdown[0], /1 tuần × 800\.000đ/);
});
test('12 days combine week + days transparently', () => {
  const r = calculateRental(byId('honda-vision'), 12);
  assert.equal(r.min, 800000 + 5 * 200000); // 1 week + 5 days
  assert.match(r.breakdown[0], /1 tuần × 800\.000đ\/tuần \+ 5 ngày × 200\.000đ\/ngày/);
});
test('30 days use the month tier', () => {
  const r = calculateRental(byId('honda-airblade'), 30);
  assert.equal(r.min, 1400000);
  assert.equal(r.max, 1400000);
});
test('unpriced vehicles yield null, never 0đ', () => {
  assert.equal(calculateRental(byId('xe-50cc'), 7), null);
  assert.equal(calculateRental(byId('electric-bike'), 30), null);
});
test('35-day comparison sorts cheapest-first and includes only priced models', () => {
  const rows = compareVehiclesForDays(pricing, 35);
  assert.ok(rows.length >= 3);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].min <= rows[i].min, 'sorted by min ascending');
  }
  assert.ok(!rows.some((r) => r.id === 'xe-50cc'));
  // Wave has day rates only: 35 x 150k = 5.250.000đ.
  const wave = rows.find((r) => r.id === 'honda-wave');
  assert.equal(wave.min, 35 * 150000);
});
test('comparison is deterministic', () => {
  assert.deepEqual(compareVehiclesForDays(pricing, 12), compareVehiclesForDays(pricing, 12));
});
test('describePeriod renders date ranges and plain durations', () => {
  assert.equal(describePeriod({ days: 7, dateRange: null }), '1 tuần');
  const label = describePeriod({
    days: 14,
    dateRange: { start: '2026-10-05', end: '2026-10-18' },
    formatDateVi
  });
  assert.equal(label, 'từ 05/10/2026 đến 18/10/2026 (14 ngày)');
});
