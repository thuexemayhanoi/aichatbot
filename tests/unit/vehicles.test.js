import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleMatcher } from '../../src/nlu/entities/vehicles.js';
import { tokenize } from '../../src/nlu/tokenizer.js';
import { pricing } from '../helpers/load-data.js';

const matcher = createVehicleMatcher(pricing);
const m = (text) => matcher.match(tokenize(text));

test('matches models by name and alias', () => {
  const r = m('Vision 3 ngày');
  assert.ok(r.some((v) => v.type === 'model' && v.id === 'honda-vision'));
  const r2 = m('Air Blade 1 tuần');
  assert.ok(r2.some((v) => v.type === 'model' && v.id === 'honda-airblade'));
});

test('matches categories separately from models', () => {
  const r = m('thuê xe ga');
  assert.ok(r.some((v) => v.type === 'category' && v.id === 'xe-tay-ga'));
});

test('matches xe 50cc as a category, not a number', () => {
  const r = m('thuê xe 50cc');
  assert.ok(r.some((v) => v.type === 'category' && v.id === 'xe-50cc'));
});

test('125cc does not match any vehicle', () => {
  assert.equal(m('xe 125cc').length, 0);
});

test('no vehicle match on a documents question', () => {
  assert.equal(m('thuê xe cần giấy tờ gì').length, 0);
});

test('electric categories match their aliases', () => {
  assert.ok(m('cho thuê xe điện').some((v) => v.id === 'electric-bike'));
  assert.ok(m('xe đạp điện').some((v) => v.id === 'electric-scooter'));
});
