import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzer } from '../src/nlu/analyzer.js';
import { business, pricing, faq } from './helpers/load-data.js';

const analyze = createAnalyzer({ business, pricing, faq });

test('"thuê xe 50cc": vehicle category match, never a duration', () => {
  const r = analyze('thuê xe 50cc');
  assert.equal(r.entities.durations.length, 0, '"50cc" must never become a duration');
  assert.equal(r.entities.totalDays, null);
  assert.ok(r.entities.vehicles.some((v) => v.id === 'xe-50cc'));
  assert.equal(r.intent.id, 'price_query');
});

test('"Vision 3 ngày": model plus 3-day duration', () => {
  const r = analyze('Vision 3 ngày');
  assert.ok(r.entities.vehicles.some((v) => v.id === 'honda-vision'));
  assert.equal(r.entities.totalDays, 3);
  assert.equal(r.entities.durations.length, 1);
  assert.equal(r.intent.id, 'price_query');
});

test('"thuê xe cần giấy tờ gì": documents intent', () => {
  const r = analyze('thuê xe cần giấy tờ gì');
  assert.equal(r.intent.id, 'documents_query');
  assert.equal(r.entities.durations.length, 0);
});

test('"đặt cọc bao nhiêu": deposit intent', () => {
  const r = analyze('đặt cọc bao nhiêu');
  assert.equal(r.intent.id, 'deposit_query');
});

test('"giao xe Tây Hồ được không": delivery intent plus known area', () => {
  const r = analyze('giao xe Tây Hồ được không');
  assert.equal(r.intent.id, 'delivery_query');
  assert.ok(r.entities.locations.some((l) => l.name === 'Tây Hồ'));
  assert.equal(r.entities.durations.length, 0);
});

test('"Air Blade 1 tuần": model plus 7-day duration', () => {
  const r = analyze('Air Blade 1 tuần');
  assert.ok(r.entities.vehicles.some((v) => v.id === 'honda-airblade'));
  assert.equal(r.entities.totalDays, 7);
});

test('"xe 125cc": displacement only, bike-type intent, no duration', () => {
  const r = analyze('xe 125cc');
  assert.deepEqual(r.entities.displacements.map((d) => d.cc), [125]);
  assert.equal(r.entities.durations.length, 0);
  assert.equal(r.intent.id, 'bike_type_query');
});

test('"thuê 2 tháng": 60-day duration', () => {
  const r = analyze('thuê 2 tháng');
  assert.equal(r.entities.totalDays, 60);
  assert.equal(r.intent.id, 'duration_query');
});

test('engine displacements never become durations', () => {
  const queries = [
    '50cc', '110cc', '125cc', '150cc',
    'xe 50cc', 'xe 110cc', 'xe 125cc', 'xe 150cc',
    'thuê xe 110cc', 'Honda Wave 110cc', '110 cc'
  ];
  for (const query of queries) {
    const r = analyze(query);
    assert.equal(r.entities.durations.length, 0, `"${query}" must not produce a duration`);
    assert.equal(r.entities.totalDays, null, `"${query}" must not produce totalDays`);
  }
});
