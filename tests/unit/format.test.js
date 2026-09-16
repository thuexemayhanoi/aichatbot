import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupDigits, formatVnd, formatVndRange, describeDays, hourInTimeZone, formatClock } from '../../src/utils/format.js';

test('groupDigits groups with Vietnamese dots', () => {
  assert.equal(groupDigits(150000), '150.000');
  assert.equal(groupDigits(1000000), '1.000.000');
  assert.equal(groupDigits(999), '999');
  assert.equal(groupDigits(1000), '1.000');
  assert.equal(groupDigits(0), '0');
  assert.equal(groupDigits(-25000), '-25.000');
});

test('groupDigits rejects non-finite input', () => {
  assert.equal(groupDigits('abc'), '');
  assert.equal(groupDigits(NaN), '');
  assert.equal(groupDigits(null), '');
});

test('formatVnd appends the dong symbol', () => {
  assert.equal(formatVnd(150000), '150.000đ');
  assert.equal(formatVnd(0), '0đ');
  assert.equal(formatVnd(5000000), '5.000.000đ');
});

test('formatVnd is null-safe for null and invalid values', () => {
  assert.equal(formatVnd(null), null);
  assert.equal(formatVnd(undefined), null);
  assert.equal(formatVnd('x'), null);
});

test('formatVndRange formats fixed, open and ranged values', () => {
  assert.equal(formatVndRange(150000, 150000), '150.000đ');
  assert.equal(formatVndRange(800000, 1000000), '800.000đ - 1.000.000đ');
  assert.equal(formatVndRange(150000, null), 'từ 150.000đ');
  assert.equal(formatVndRange(null, 150000), 'tối đa 150.000đ');
});

test('formatVndRange never returns "0đ" for missing data', () => {
  assert.equal(formatVndRange(null, null), null);
  assert.equal(formatVndRange(undefined, undefined), null);
});

test('describeDays prefers months, then weeks, then days', () => {
  assert.equal(describeDays(30), '1 tháng');
  assert.equal(describeDays(60), '2 tháng');
  assert.equal(describeDays(7), '1 tuần');
  assert.equal(describeDays(14), '2 tuần');
  assert.equal(describeDays(5), '5 ngày');
  assert.equal(describeDays(10), '10 ngày');
});

test('describeDays rejects invalid durations', () => {
  assert.equal(describeDays(0), null);
  assert.equal(describeDays(-3), null);
  assert.equal(describeDays(null), null);
});

test('hourInTimeZone converts UTC instants to Hanoi wall clock', () => {
  // 03:00Z is 10:00 in Asia/Ho_Chi_Minh (UTC+7).
  assert.deepEqual(hourInTimeZone(new Date('2026-09-16T03:00:00Z'), 'Asia/Ho_Chi_Minh'), { hour: 10, minute: 0 });
  // 17:30Z is 00:30 the next day; h23 cycle means midnight is hour 0.
  assert.deepEqual(hourInTimeZone(new Date('2026-09-16T17:30:00Z'), 'Asia/Ho_Chi_Minh'), { hour: 0, minute: 30 });
});

test('formatClock zero-pads both parts', () => {
  assert.equal(formatClock(9, 5), '09:05');
  assert.equal(formatClock(21, 0), '21:00');
  assert.equal(formatClock('x', 1), null);
});
