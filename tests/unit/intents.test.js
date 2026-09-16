import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntentMatcher, INTENT_DEFINITIONS } from '../../src/nlu/intents.js';
import { tokenize } from '../../src/nlu/tokenizer.js';

const matcher = createIntentMatcher();
const t = (text) => tokenize(text);

test('classifies deposit queries', () => {
  const r = matcher.match(t('đặt cọc bao nhiêu'));
  assert.equal(r.id, 'deposit_query');
  assert.equal(r.inferred, false);
});

test('classifies documents queries', () => {
  assert.equal(matcher.match(t('thuê xe cần giấy tờ gì')).id, 'documents_query');
});

test('classifies delivery queries', () => {
  assert.equal(matcher.match(t('giao xe Tây Hồ được không')).id, 'delivery_query');
});

test('classifies greeting', () => {
  assert.equal(matcher.match(t('xin chào')).id, 'greeting');
});

test('falls through to unknown when nothing matches', () => {
  const r = matcher.match(t('trời hôm nay đẹp'));
  assert.equal(r.id, 'unknown');
  assert.equal(r.inferred, false);
});

test('infers price_query when a vehicle is present', () => {
  const r = matcher.match(t('vision'), { vehicles: [{ id: 'honda-vision' }] });
  assert.equal(r.id, 'price_query');
  assert.equal(r.inferred, true);
});

test('infers duration_query when only a duration is present', () => {
  const r = matcher.match(t('thuê 2 tháng'), { durations: [{ days: 60 }] });
  assert.equal(r.id, 'duration_query');
  assert.equal(r.inferred, true);
});

test('new intents can be added without touching the core', () => {
  const custom = createIntentMatcher([
    ...INTENT_DEFINITIONS,
    { id: 'custom_query', phrases: ['vinfast'] }
  ]);
  assert.equal(custom.match(t('cho tôi xem vinfast')).id, 'custom_query');
});

test('accented and unaccented queries classify identically', () => {
  assert.equal(matcher.match(t('giấy tờ cần gì')).id, matcher.match(t('giay to can gi')).id);
});
