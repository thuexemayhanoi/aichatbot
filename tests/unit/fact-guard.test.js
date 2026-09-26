import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardAnswer } from '../../src/ai/fact-guard.js';
import { guardFacts } from '../../src/ai/grounding.js';
import { business } from '../helpers/load-data.js';

const DOCS = [{ answer: 'Giá thuê Honda Vision theo ngày: 200.000đ' }];

test('accepts a rewording that keeps only verified numbers', () => {
  const ok = guardAnswer('Vision một ngày là 200.000đ nhé bạn.', { docs: DOCS, business });
  assert.equal(ok, true);
});

test('rejects an invented price', () => {
  assert.equal(guardAnswer('Vision một ngày chỉ 150.000đ.', { docs: DOCS, business }), false);
});

test('rejects invented phone numbers but accepts the business number', () => {
  assert.equal(guardAnswer('Gọi 0901234567 nhé.', { docs: [], business }), false);
  assert.equal(
    guardAnswer(`Liên hệ ${business.contact.phone_display} nhé.`, { docs: [], business }),
    true
  );
});

test('rejects invented opening hours but accepts the published ones', () => {
  assert.equal(guardAnswer('Mình mở 10:00 đến 22:00.', { docs: [], business }), false);
  assert.equal(guardAnswer('Mình mở 09:00 - 21:00.', { docs: [], business }), true);
});

test('rejects day counts absent from the verified bundle', () => {
  assert.equal(guardAnswer('Thuê 12 ngày giá 2.400.000đ.', { docs: DOCS, business }), false);
  const withFacts = guardAnswer('Thuê 12 ngày giá 2.400.000đ.', {
    docs: [],
    verifiedTexts: ['12 ngày = 2.400.000đ'],
    business
  });
  assert.equal(withFacts, true);
});

test('rejects empty and script payloads (legacy guard still applies)', () => {
  assert.equal(guardAnswer('', { docs: [], business }), false);
  assert.equal(guardAnswer('<script>alert(1)</script>', { docs: [], business }), false);
});

test('legacy guardFacts still guards the fallback-LLM path unchanged', () => {
  assert.equal(guardFacts('Giá 200.000đ', DOCS), true);
  assert.equal(guardFacts('Giá 999.000đ', DOCS), false);
});
