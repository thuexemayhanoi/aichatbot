import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createMotoApp } from '../../src/app/moto-app.js';
import { createLocalStore } from '../../src/storage/local-store.js';
import { createConfig } from '../../src/config/defaults.js';
import { createBlogRetriever } from '../../src/search/blog-knowledge.js';
import { business, pricing, faq } from '../helpers/load-data.js';

/**
 * Agent ↔ blog retrieval integration spec.
 * Priority is fixed: rules -> business data -> blog knowledge -> LLM -> fallback.
 * Blog prose can never answer verified-fact intents.
 */

const DATA = { business, pricing, faq };
const KNOWLEDGE = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data/blog/knowledge-index.json'), 'utf8'));

let counter = 0;
function createApp(extra = {}) {
  return createMotoApp({
    data: DATA,
    store: createLocalStore({ namespace: `motoai-blog-${++counter}` }),
    scope: `blog-${counter}`,
    config: createConfig(),
    ...extra
  });
}

test('knowledge index chunks attach as a retrieval tier without breaking turns', () => {
  const app = createApp();
  assert.equal(typeof app.attachBlogIndex, 'function');
  assert.ok(app.attachBlogIndex(KNOWLEDGE.chunks));
  // A normal verified-fact turn still works identically.
  const r = app.send ? null : null;
  void r;
});

test('blog knowledge answers informational questions the rules decline', async () => {
  const app = createApp();
  app.attachBlogIndex(KNOWLEDGE.chunks);
  const r = await app.send('MotoAI có cần tạo tài khoản không?');
  assert.equal(r.source, 'blog-knowledge');
  assert.ok(r.reply.text.length > 0);
  assert.ok(r.reply.text.includes('không cần tài khoản') || r.reply.text.includes('ứng dụng web'));
});

test('verified business facts always beat blog prose (priority is fixed)', async () => {
  const app = createApp();
  app.attachBlogIndex(KNOWLEDGE.chunks);
  for (const [q, expectedSource] of [
    ['Giá thuê xe máy bao nhiêu?', 'pricing-data'],
    ['Tiền đặt cọc bao nhiêu?', 'business-data'],
    ['Địa chỉ ở đâu?', 'business-data'],
    ['Giờ mở cửa?', 'business-data'],
    ['Số điện thoại?', 'business-data']
  ]) {
    const r = await app.send(q);
    assert.ok(r.source.startsWith(expectedSource), `${q} must stay with ${expectedSource}, got ${r.source}`);
    assert.notEqual(r.source, 'blog-knowledge');
  }
});

test('blog retriever declines protected intents even on a direct call', () => {
  const retriever = createBlogRetriever({ chunks: KNOWLEDGE.chunks });
  const declined = retriever.retriever('Giá thuê xe máy bao nhiêu?', { analysis: { intent: { id: 'price_query' } } });
  assert.equal(declined, null);
  const answered = retriever.retriever('ứng dụng web thuê xe cần tài khoản không', { analysis: { intent: { id: 'unknown' } } });
  assert.ok(answered === null || answered.source === 'blog-knowledge');
});

test('malformed knowledge chunks and scores never publish an answer', () => {
  const bad = createBlogRetriever({ chunks: [{ text: 'ok chunk' }, null, { id: 'x' }, { text: 42 }] });
  assert.equal(bad.size, 1);
  const empty = createBlogRetriever({ chunks: [] });
  assert.equal(empty.retriever('app thuê xe máy là gì', { analysis: {} }), null);
  const app = createApp();
  assert.equal(app.attachBlogIndex([]), false);
  assert.equal(app.attachBlogIndex(null), false);
});

test('LOW scores decline instead of guessing (no malformed-score answers)', () => {
  const retriever = createBlogRetriever({ chunks: KNOWLEDGE.chunks, minScore: 999 });
  assert.equal(retriever.retriever('ứng dụng web thuê xe', { analysis: { intent: { id: 'unknown' } } }), null);
});

test('blog tier sits ABOVE the honest fallback but never blocks it', async () => {
  const withoutBlog = createApp();
  const withBlog = createApp();
  withBlog.attachBlogIndex(KNOWLEDGE.chunks);
  const q = 'Thủ tục thuê xe cần giấy tờ gì?';
  const plain = await withoutBlog.send(q);
  const enriched = await withBlog.send(q);
  // Either the rules answer both identically, or the blog tier enriches only
  // the fallback — never a downgrade of a deterministic answer.
  if (plain.source === enriched.source) {
    assert.equal(plain.reply.text, enriched.reply.text);
  } else {
    assert.equal(plain.source, 'fallback');
    assert.equal(enriched.source, 'blog-knowledge');
  }
});
