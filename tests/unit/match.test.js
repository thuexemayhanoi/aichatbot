import test from 'node:test';
import assert from 'node:assert/strict';
import { containsSequence, tokenCoverage, phraseScore, phraseToTokens, bestPhraseMatch } from '../../src/nlu/match.js';

test('containsSequence finds contiguous runs only', () => {
  assert.equal(containsSequence(['a', 'b', 'c'], ['b', 'c']), true);
  assert.equal(containsSequence(['a', 'b', 'c'], ['a', 'c']), false);
  assert.equal(containsSequence(['a'], ['a', 'b']), false);
  assert.equal(containsSequence(['a', 'b'], []), false);
});

test('tokenCoverage counts scattered tokens', () => {
  assert.equal(tokenCoverage(['a', 'x', 'b'], ['a', 'b']), 1);
  assert.equal(tokenCoverage(['a'], ['a', 'b']), 0.5);
  assert.equal(tokenCoverage(['x'], ['a']), 0);
});

test('phraseScore prefers contiguous over scattered', () => {
  assert.equal(phraseScore(['a', 'b'], ['a', 'b']), 1);
  assert.equal(phraseScore(['b', 'x', 'a'], ['a', 'b']), 0.6);
});

test('phraseToTokens normalizes accents', () => {
  assert.deepEqual(phraseToTokens('Xe Tay Ga'), ['xe', 'tay', 'ga']);
  assert.deepEqual(phraseToTokens('Thuê 50cc'), ['thue', '50cc']);
});

test('bestPhraseMatch picks the longest contiguous alias', () => {
  const hit = bestPhraseMatch(['honda', 'wave'], ['Wave', 'Honda Wave']);
  assert.ok(hit);
  assert.equal(hit.phrase, 'Honda Wave');
  assert.equal(bestPhraseMatch(['khong', 'co'], ['Wave']), null);
});
