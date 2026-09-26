import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDateRange, formatDateVi } from '../../src/nlu/entities/dates.js';
import { normalize } from '../../src/nlu/normalizer.js';

const NOW = new Date('2026-09-26T00:00:00Z');
const range = (text) => extractDateRange(normalize(text), NOW);

test('"từ 5/10 đến 18/10" is a 14-day inclusive range', () => {
  const r = range('Vision từ 5/10 đến 18/10 bao nhiêu?');
  assert.equal(r.days, 14);
  assert.equal(r.start, '2026-10-05');
  assert.equal(r.end, '2026-10-18');
});

test('hyphen and English connectors parse identically', () => {
  assert.equal(range('5/10-18/10').days, 14);
  assert.equal(range('rent from 5/10 to 18/10').days, 14);
  assert.equal(range('5/10 → 8/10').days, 4);
});

test('same-day range is 1 day, not 0', () => {
  assert.equal(range('5/10 den 5/10').days, 1);
});

test('leap-year 29/2 parses in a leap year and fails otherwise', () => {
  assert.equal(range('29/2/2028 den 1/3/2028').days, 2);
  assert.equal(range('29/2/2027 den 1/3/2027'), null);
});

test('invalid dates are rejected, never guessed', () => {
  assert.equal(range('31/2 den 5/3'), null);   // no 31 February
  assert.equal(range('5/13 den 6/13'), null);  // no month 13
  assert.equal(range('32/10 den 5/11'), null);
});

test('reversed ranges are invalid', () => {
  assert.equal(range('18/10 den 5/10'), null);
});

test('two-digit years expand to 2000s', () => {
  const r = range('5/10/26 den 6/10/26');
  assert.equal(r.start, '2026-10-05');
  assert.equal(r.days, 2);
});

test('ranges longer than a year are rejected', () => {
  assert.equal(range('1/1/2026 den 1/1/2028'), null);
});

test('formatDateVi renders the Vietnamese reading order', () => {
  assert.equal(formatDateVi('2026-10-05'), '05/10/2026');
});
