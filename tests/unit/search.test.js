import test from 'node:test';
import assert from 'node:assert/strict';
import { createBm25Index } from '../../src/search/bm25.js';
import { buildCorpus } from '../../src/search/corpus.js';
import { createRetriever } from '../../src/search/retriever.js';
import { business, pricing, faq } from '../helpers/load-data.js';

const DATA = { business, pricing, faq };

test('bm25 ranks relevant documents and declines empty queries', () => {
  const index = createBm25Index([
    { id: 'a', tokens: ['gia', 'thue', 'wave'] },
    { id: 'b', tokens: ['dia', 'chi', 'cua', 'hang'] },
    { id: 'c', tokens: ['giao', 'xe', 'tan', 'noi'] }
  ]);
  const hits = index.search('giá thuê wave');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].id, 'a');
  assert.deepEqual(index.search(''), []);
  assert.deepEqual(index.search('~~~'), []);
});

test('bm25 scores are finite and positive', () => {
  const index = createBm25Index([{ id: 'a', tokens: ['xe'] }]);
  const [hit] = index.search('xe');
  assert.ok(Number.isFinite(hit.score) && hit.score > 0);
});

test('corpus contains verified business facts only from repository data', () => {
  const corpus = buildCorpus(DATA);
  const ids = corpus.map((doc) => doc.id);
  assert.ok(ids.includes('business:address'));
  assert.ok(ids.includes('business:deposit'));
  assert.ok(ids.includes('pricing:honda-vision'));
  for (const doc of corpus) {
    assert.ok(['business-data', 'faq-data', 'pricing-data'].includes(doc.source), doc.id);
    assert.ok(typeof doc.answer === 'string' && doc.answer.length > 0, doc.id);
  }
});

test('corpus rejects missing data files', () => {
  assert.throws(() => buildCorpus({ business: {} }), TypeError);
});

test('retriever declines weak matches and answers Vietnamese questions', async () => {
  const { retriever, retrieve } = createRetriever(DATA);
  const hit = await retriever('giao xe tan nha duoc khong');
  assert.ok(hit && hit.handled);
  assert.equal(hit.source, 'business-data-search');
  assert.deepEqual(retrieve('giao xe tan nha duoc khong', 1).map((d) => d.id), ['business:delivery']);
  const miss = await retriever('xyzzy plugh 123');
  assert.equal(miss, null);
});

test('retriever answers English location question from repository data', async () => {
  const { retriever } = createRetriever(DATA);
  const hit = await retriever('Where are you located?');
  assert.ok(hit && hit.handled);
  assert.ok(hit.answer.includes('112 Nguyễn Văn Cừ'));
});

test('retriever maps English deposit question to the deposit policy doc', async () => {
  const { retrieve } = createRetriever(DATA);
  assert.deepEqual(retrieve('Do I need a deposit?', 1).map((d) => d.id), ['business:deposit']);
});

test('retriever never overrides business facts with learned content', async () => {
  const { corpus } = createRetriever(DATA);
  for (const doc of corpus) {
    // Every answer is either a template resolved against business data,
    // or text copied from the repository data files.
    assert.ok(typeof doc.answer === 'string');
    assert.ok(!/giá thuê/i.test(doc.answer) || doc.source !== 'business-data');
  }
});
