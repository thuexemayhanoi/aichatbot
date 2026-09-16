import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzer } from '../../src/nlu/analyzer.js';
import { business, pricing, faq } from '../helpers/load-data.js';

const analyze = createAnalyzer({ business, pricing, faq });

test('exposes normalized text and tokens', () => {
  const r = analyze('Thuê Xe');
  assert.equal(r.normalized, 'thue xe');
  assert.deepEqual(r.tokens, ['thue', 'xe']);
});

test('full analysis of a price question', () => {
  const r = analyze('Vision 3 ngày giá bao nhiêu');
  assert.equal(r.intent.id, 'price_query');
  assert.ok(r.entities.vehicles.some((v) => v.id === 'honda-vision'));
  assert.equal(r.entities.totalDays, 3);
});

test('gibberish falls through to unknown', () => {
  const r = analyze('hgfdsa qwerty');
  assert.equal(r.intent.id, 'unknown');
});

test('accented and unaccented questions analyze identically', () => {
  const a = analyze('đặt cọc bao nhiêu');
  const b = analyze('dat coc bao nhieu');
  assert.equal(a.intent.id, b.intent.id);
  assert.equal(a.intent.id, 'deposit_query');
});
