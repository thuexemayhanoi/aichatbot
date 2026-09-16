import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parseNumber } from '../../src/nlu/tokenizer.js';

test('keeps digit-letter compounds whole', () => {
  assert.deepEqual(tokenize('thuê xe 50cc'), ['thue', 'xe', '50cc']);
  assert.deepEqual(tokenize('xe 125cc'), ['xe', '125cc']);
});

test('splits words and trims edge punctuation', () => {
  assert.deepEqual(tokenize('Giá thuê? Bao nhiêu.'), ['gia', 'thue', 'bao', 'nhieu']);
});

test('keeps Vietnamese thousands groups as one token', () => {
  assert.deepEqual(tokenize('1.500.000 đồng'), ['1.500.000', 'dong']);
});

test('tokenize normalizes input defensively', () => {
  assert.deepEqual(tokenize('Thuê Xe'), ['thue', 'xe']);
});

test('parseNumber accepts integers and thousands groups', () => {
  assert.equal(parseNumber('3'), 3);
  assert.equal(parseNumber('50'), 50);
  assert.equal(parseNumber('1.500.000'), 1500000);
});

test('parseNumber rejects non-plain-number tokens', () => {
  assert.equal(parseNumber('50cc'), null);
  assert.equal(parseNumber('1,5'), null);
  assert.equal(parseNumber('1.5'), null);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber(null), null);
});
