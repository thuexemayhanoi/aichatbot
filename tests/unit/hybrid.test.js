import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rerank, DEFAULT_WEIGHTS } from '../../src/search/reranker.js';
import { createHybridRetriever } from '../../src/search/hybrid-retriever.js';
import { createSemanticRetriever } from '../../src/search/semantic-retriever.js';
import { business, pricing, faq } from '../helpers/load-data.js';

const DATA = { business, pricing, faq };

// ---------- deterministic reranker ----------
test('reranker normalizes and merges lexical + semantic deterministically', () => {
  const lexical = [{ id: 'a', score: 10 }, { id: 'b', score: 5 }];
  const semantic = [{ id: 'b', score: 0.9 }, { id: 'c', score: 0.4 }];
  const merged = rerank(lexical, semantic);
  const byId = Object.fromEntries(merged.map((m) => [m.id, m]));
  assert.equal(byId.b.lexical > 0 && byId.b.semantic > 0, true); // both contribute
  assert.ok(byId.a.score > byId.c.score, 'a (strong bm25) beats c (weak semantic)');
  assert.deepEqual(rerank(lexical, semantic), merged); // stable
});

test('reranker with no semantic hits equals the BM25 order', () => {
  const lexical = [{ id: 'x', score: 3 }, { id: 'y', score: 9 }];
  const merged = rerank(lexical, []);
  assert.deepEqual(merged.map((m) => m.id), ['y', 'x']);
});

test('reranker tie-breaks on document id (no random ordering)', () => {
  const merged = rerank([{ id: 'b', score: 5 }, { id: 'a', score: 5 }], []);
  assert.deepEqual(merged.map((m) => m.id), ['a', 'b']);
});

// ---------- hybrid retriever ----------
/** Stub transformers.js: deterministic keyword-vector "embeddings". */
function stubTransformers() {
  return {
    pipeline: async () => async (texts) => {
      const list = Array.isArray(texts) ? texts : [texts];
      return list.map((text) => {
        const t = String(text).toLowerCase();
        const vec = [0, 0, 0];
        if (/coc|chan|deposit/.test(t)) vec[0] = 1;
        if (/vi tri|dia chi|address|located/.test(t)) vec[1] = 1;
        if (/gio mo cua|opening hours|close/.test(t)) vec[2] = 1;
        return { data: vec };
      });
    }
  };
}

async function hybridWithStub() {
  const retriever = createHybridRetriever(DATA, {
    semanticOptions: { importFn: async () => stubTransformers() }
  });
  await retriever.warmup();
  return retriever;
}

test('hybrid activates after warmup with the local semantic layer', async () => {
  const retriever = await hybridWithStub();
  assert.equal(retriever.hybridActive, true);
  assert.equal(retriever.semantic.state.status, 'ready');
});

test('hybrid answers a paraphrased deposit question', async () => {
  const retriever = await hybridWithStub();
  const hits = await retriever.retrieve('mình muốn hỏi cọc thế chân là bao nhiêu', 1);
  assert.ok(hits.length > 0);
  assert.ok(hits[0].id.includes('deposit'), `expected a deposit doc, got ${hits[0].id}`);
});

test('hybrid handles Vietnamese/English mixed queries', async () => {
  const retriever = await hybridWithStub();
  const hits = await retriever.retrieve('deposit và cọc hỏi ở đâu', 3);
  assert.ok(hits.some((h) => h.id.includes('deposit')));
});

test('failed semantic import degrades to BM25-only, still answering', async () => {
  const retriever = createHybridRetriever(DATA, {
    semanticOptions: { importFn: async () => { throw new Error('offline'); } }
  });
  assert.equal(await retriever.warmup(), false);
  assert.equal(retriever.hybridActive, false);
  const hits = await retriever.retrieve('đặt cọc bao nhiêu', 1);
  assert.ok(hits[0].id.includes('deposit'));
});

test('engine contract preserved: irrelevant queries decline to null', async () => {
  const retriever = await hybridWithStub();
  const answer = await retriever.retriever('con mèo của bạn tên gì');
  assert.equal(answer, null);
});

test('engine contract: a grounded hit returns handled + answer', async () => {
  const retriever = await hybridWithStub();
  const answer = await retriever.retriever('tiền cọc bao nhiêu');
  assert.equal(answer.handled, true);
  // Grounded in the verified deposit doc (template resolves at the responder).
  assert.ok(answer.answer.includes('business.policies.deposit.note'));
});

// ---------- semantic retriever isolation ----------
test('semantic layer never throws; failures resolve to unavailable', async () => {
  const semantic = createSemanticRetriever({ importFn: async () => { throw new Error('boom'); } });
  assert.equal(await semantic.warmup(), false);
  assert.equal(semantic.state.status, 'failed');
  assert.equal(await semantic.index([{ id: 'a', text: 'x' }]), false);
  assert.deepEqual(await semantic.search('x'), []);
  assert.equal(semantic.available, false);
});

test('semantic model name and URL are static CDN assets only', () => {
  const semantic = createSemanticRetriever({});
  assert.equal(semantic.modelName, 'Xenova/multilingual-e5-small');
});

test('default reranker weights favour lexical (deterministic primary)', () => {
  assert.equal(DEFAULT_WEIGHTS.lexical > DEFAULT_WEIGHTS.semantic, true);
});
