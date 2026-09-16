import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../src/core/engine.js';
import { createAnalyzer } from '../../src/nlu/analyzer.js';
import { createRuleRegistry } from '../../src/rules/registry.js';
import { createResponder } from '../../src/core/responder.js';
import { createEmitter } from '../../src/core/events.js';
import { createLocalStore } from '../../src/storage/local-store.js';
import { fakeLocalStorage, throwingLocalStorage } from '../helpers/storage-stubs.js';
import { business, pricing, faq } from '../helpers/load-data.js';

function makeAnalyzer() {
  return createAnalyzer({ business, pricing, faq });
}

function baseWiring(overrides = {}) {
  const analyzer = makeAnalyzer();
  const { rules, fallback } = createRuleRegistry({ business, pricing, faq });
  const responder = createResponder({ business });
  return { analyzer, rules, fallback, responder, ...overrides };
}

test('engine validates its required collaborators', () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const good = baseWiring();
  assert.throws(() => createEngine({ ...good, analyzer: null }), TypeError);
  assert.throws(() => createEngine({ ...good, rules: [] }), TypeError);
  assert.throws(() => createEngine({ ...good, fallback: null }), TypeError);
  assert.throws(() => createEngine({ ...good, responder: {} }), TypeError);
  assert.throws(() => createEngine({ ...good, store: null }), TypeError);
  assert.throws(() => createEngine({ ...good, retriever: 'not-a-function' }), TypeError);
});

test('sendMessage returns the agreed result contract', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const engine = createEngine({ ...baseWiring(), store, scope: 's1' });
  const result = await engine.sendMessage('đặt cọc bao nhiêu');
  assert.ok(result.reply && typeof result.reply.text === 'string');
  assert.equal(result.reply.role, 'assistant');
  assert.equal(result.reply.language, 'vi');
  assert.equal(typeof result.confidence, 'number');
  assert.equal(result.source, 'business-data');
  assert.ok(result.analysis && result.analysis.intent);
  assert.ok(result.slots);
});

test('invalid input gets a validation reply and never throws', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const engine = createEngine({ ...baseWiring(), store, scope: 's1' });
  for (const bad of ['', '   ', null, undefined, 42]) {
    const result = await engine.sendMessage(bad);
    assert.equal(result.source, 'validation');
    assert.ok(result.reply.text.length > 0);
  }
});

test('every turn is recorded in history (user + assistant)', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const engine = createEngine({ ...baseWiring(), store, scope: 's1' });
  await engine.sendMessage('xin chào');
  const entries = engine.history.list();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].role, 'user');
  assert.equal(entries[1].role, 'assistant');
});

test('double engine init over the same store reuses the session (dedup)', async () => {
  const store = createLocalStore({ namespace: 't', backend: fakeLocalStorage() });
  const first = createEngine({ ...baseWiring(), store, scope: 'web' });
  const second = createEngine({ ...baseWiring(), store, scope: 'web' });
  assert.equal(second.session.id, first.session.id);
  await first.sendMessage('giờ mở cửa');
  const entries = second.history.list();
  assert.equal(entries.length, 2); // shared history, not duplicated
});

test('different scopes create independent sessions', () => {
  const store = createLocalStore({ namespace: 't', backend: fakeLocalStorage() });
  const a = createEngine({ ...baseWiring(), store, scope: 'a' });
  const b = createEngine({ ...baseWiring(), store, scope: 'b' });
  assert.notEqual(a.session.id, b.session.id);
});

test('emits turn, session-created and rule-hit events', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const emitter = createEmitter();
  const seen = [];
  emitter.on('turn', (p) => seen.push(['turn', p.text]));
  emitter.on('session-created', (p) => seen.push(['session-created', p.session.id]));
  emitter.on('rule-hit', (p) => seen.push(['rule-hit', p.ruleId]));
  const engine = createEngine({ ...baseWiring(), store, scope: 's1', emitter });
  await engine.sendMessage('đặt cọc bao nhiêu');
  assert.deepEqual(seen.map((s) => s[0]), ['session-created', 'turn', 'rule-hit']);
  assert.equal(seen[2][1], 'deposit-rule');
});

test('emits unknown-query and fallback when nothing can answer', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const emitter = createEmitter();
  const events = [];
  emitter.on('unknown-query', (p) => events.push(['unknown-query', p.intentId]));
  emitter.on('fallback', () => events.push(['fallback']));
  const engine = createEngine({ ...baseWiring(), store, scope: 's1', emitter });
  const result = await engine.sendMessage('trời hôm nay đẹp quá');
  assert.equal(result.source, 'fallback');
  assert.equal(events.length, 2);
  assert.equal(events[0][0], 'unknown-query');
});

test('a throwing listener never breaks a turn', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const emitter = createEmitter();
  emitter.on('turn', () => {
    throw new Error('listener bug');
  });
  const engine = createEngine({ ...baseWiring(), store, scope: 's1', emitter });
  const result = await engine.sendMessage('giờ mở cửa');
  assert.equal(result.source, 'business-data');
});

test('retriever is optional: null keeps the deterministic path', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const engine = createEngine({ ...baseWiring(), store, scope: 's1', retriever: null });
  const result = await engine.sendMessage('thời tiết hôm nay thế nào');
  assert.equal(result.source, 'fallback');
});

test('a working retriever answers when no rule matches and emits search-hit', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const emitter = createEmitter();
  const hits = [];
  emitter.on('search-hit', (p) => hits.push(p));
  const retriever = async () => ({
    handled: true,
    answer: 'Câu trả lời từ kiến thức website.',
    confidence: 0.7,
    source: 'search'
  });
  const engine = createEngine({ ...baseWiring(), store, scope: 's1', emitter, retriever });
  const result = await engine.sendMessage('bất kỳ câu gì'); // unknown intent: no rule can handle
  assert.equal(result.source, 'search');
  assert.equal(result.confidence, 0.7);
  assert.deepEqual(hits, [{ source: 'search', confidence: 0.7 }]);
});

test('a crashing retriever degrades to the fallback, never throws', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const retriever = async () => {
    throw new Error('retriever crash');
  };
  const engine = createEngine({ ...baseWiring(), store, scope: 's1', retriever });
  const result = await engine.sendMessage('thời tiết hôm nay thế nào');
  assert.equal(result.source, 'fallback');
});

test('a malformed retriever result is ignored', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const retriever = async () => ({ handled: false });
  const engine = createEngine({ ...baseWiring(), store, scope: 's1', retriever });
  const result = await engine.sendMessage('thời tiết hôm nay thế nào');
  assert.equal(result.source, 'fallback');
});

test('rules take priority over the retriever', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const retriever = async () => ({ handled: true, answer: 'từ search', confidence: 0.9, source: 'search' });
  const engine = createEngine({ ...baseWiring(), store, scope: 's1', retriever });
  const result = await engine.sendMessage('đặt cọc bao nhiêu');
  assert.equal(result.source, 'business-data'); // deposit rule wins
});

test('engine works when localStorage throws (Safari private mode)', async () => {
  const store = createLocalStore({ namespace: 't', backend: throwingLocalStorage() });
  const engine = createEngine({ ...baseWiring(), store, scope: 's1' });
  // The first write (session creation) already trips the degradation; the
  // engine must still boot and answer from the in-memory fallback.
  assert.equal(store.isDegraded(), true);
  const result = await engine.sendMessage('đặt cọc bao nhiêu');
  assert.equal(result.source, 'business-data');
  const followUp = await engine.sendMessage('giờ mở cửa'); // still works, memory only
  assert.equal(followUp.source, 'business-data');
});

test('multi-intent turns resolve by registry priority (contact beats pricing)', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const engine = createEngine({ ...baseWiring(), store, scope: 's1' });
  const result = await engine.sendMessage('số điện thoại và giá thuê Wave');
  assert.ok(result.reply.text.includes('0942 467 674'));
});

test('input longer than the cap is truncated, not rejected', async () => {
  const store = createLocalStore({ namespace: 't', backend: null });
  const engine = createEngine({ ...baseWiring(), store, scope: 's1' });
  const long = 'đặt cọc bao nhiêu ' + 'x'.repeat(3000);
  const result = await engine.sendMessage(long);
  assert.equal(result.source, 'business-data');
});
