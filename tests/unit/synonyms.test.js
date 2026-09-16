import test from 'node:test';
import assert from 'node:assert/strict';
import { createSynonymMap, expandSynonyms } from '../../src/nlu/synonyms.js';

const map = createSynonymMap([
  ['giá', 'giá thuê', 'chi phí', 'bao nhiêu tiền'],
  ['xe ga', 'xe tay ga'],
  ['đặt cọc', 'tiền cọc', 'cọc']
]);

test('expands a variant phrase to its canonical form', () => {
  assert.deepEqual(expandSynonyms(['bao', 'nhieu', 'tien'], map), ['gia']);
  assert.deepEqual(expandSynonyms(['chi', 'phi'], map), ['gia']);
});

test('expands multi-word variants', () => {
  assert.deepEqual(expandSynonyms(['xe', 'tay', 'ga'], map), ['xe', 'ga']);
  assert.deepEqual(expandSynonyms(['tien', 'coc'], map), ['dat', 'coc']);
});

test('leaves unknown tokens untouched', () => {
  assert.deepEqual(expandSynonyms(['khong', 'biet'], map), ['khong', 'biet']);
});

test('empty map returns a copy of the input', () => {
  const empty = createSynonymMap([]);
  const tokens = ['a', 'b'];
  const out = expandSynonyms(tokens, empty);
  assert.deepEqual(out, tokens);
  assert.notEqual(out, tokens);
});

test('does not touch numbers or units', () => {
  assert.deepEqual(expandSynonyms(['50cc', '3', 'ngay'], map), ['50cc', '3', 'ngay']);
});
