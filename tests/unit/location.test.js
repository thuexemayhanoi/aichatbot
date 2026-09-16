import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationMatcher } from '../../src/nlu/entities/location.js';
import { tokenize } from '../../src/nlu/tokenizer.js';
import { business } from '../helpers/load-data.js';

const matcher = createLocationMatcher(business);
const m = (text) => matcher.match(tokenize(text));

test('matches service areas', () => {
  assert.ok(m('giao xe Tây Hồ được không').some((l) => l.name === 'Tây Hồ'));
  assert.ok(m('cho thuê xe ở Long Biên').some((l) => l.name === 'Long Biên'));
  assert.ok(m('giao đến Nội thành Hà Nội').some((l) => l.name === 'Nội thành Hà Nội'));
});

test('unlisted areas return no match instead of a guess', () => {
  assert.equal(m('giao xe Hà Đông được không').length, 0);
});
