import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendBikes } from '../../src/recommend/recommender.js';
import { pricing } from '../helpers/load-data.js';

const rec = (constraints) => recommendBikes(pricing, constraints);

test('structured output shape is stable', () => {
  const result = rec({});
  assert.deepEqual(Object.keys(result).sort(),
    ['confidenceSource', 'missingInfo', 'reasons', 'recommendedModels', 'tradeoffs'].sort());
  assert.equal(result.confidenceSource, 'pricing-data');
});

test('deterministic: same constraints, same ordering', () => {
  const a = rec({ transmission: 'scooter', durationDays: 3 });
  const b = rec({ transmission: 'scooter', durationDays: 3 });
  assert.deepEqual(a.recommendedModels.map((m) => m.id), b.recommendedModels.map((m) => m.id));
});

test('transmission filter: never recommends the wrong transmission', () => {
  const manual = rec({ transmission: 'manual' });
  assert.ok(manual.recommendedModels.length > 0);
  assert.ok(manual.recommendedModels.some((m) => m.id === 'honda-wave'));
  assert.ok(manual.recommendedModels.every((m) => m.category !== 'Xe tay ga'));
  const scooter = rec({ transmission: 'scooter' });
  assert.ok(scooter.recommendedModels.every((m) => m.category !== 'Xe số' && m.category !== 'Xe tay ga' ? true : m.category === 'Xe tay ga'));
  assert.ok(scooter.recommendedModels.some((m) => m.category === 'Xe tay ga'));
});

test('electric preference returns only electric categories', () => {
  const result = rec({ electric: true });
  assert.ok(result.recommendedModels.length > 0);
  assert.ok(result.recommendedModels.every((m) => String(m.category).includes('điện')));
});

test('reasons cite verified data, never invented specs', () => {
  const result = rec({ experience: 'new', usage: 'city' });
  const text = JSON.stringify(result);
  assert.ok(!/yen cao|seat height|chế nhiên liệu|fuel|km\/l/i.test(text));
  for (const model of result.recommendedModels) {
    assert.ok(model.reasons.length > 0);
    assert.ok(typeof model.name === 'string');
  }
});

test('a stated height is carried but never faked: fit is flagged as unpublished', () => {
  const result = rec({ heightCm: 155 });
  assert.ok(result.missingInfo.some((m) => m.includes('chiều cao yên xe')));
});

test('budget ceiling excludes vehicles that cannot possibly fit', () => {
  const cheap = rec({ transmission: 'scooter', durationDays: 1, budget: { amountVnd: 150000, direction: 'max' } });
  assert.ok(cheap.recommendedModels.every((m) => m.id !== 'honda-vision'));
  assert.ok(cheap.recommendedModels.some((m) => m.id === 'honda-click'));
});

test('every recommended model exists in the verified catalog', () => {
  const ids = new Set(pricing.vehicles.map((v) => v.id));
  for (const model of rec({ transmission: 'scooter', durationDays: 7 }).recommendedModels) {
    assert.ok(ids.has(model.id), `invented model ${model.id}`);
  }
});

test('luggage and destination gaps become clarifications, not guesses', () => {
  const result = rec({ luggage: true, destination: 'Tam Dao' });
  assert.ok(result.missingInfo.some((m) => m.includes('chở đồ')));
  assert.ok(result.missingInfo.some((m) => m.includes('thời gian thuê')));
});
