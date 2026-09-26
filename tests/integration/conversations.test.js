import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestEngine } from '../helpers/engine-fixture.js';
import { createLocalStore } from '../../src/storage/local-store.js';
import { createEngine } from '../../src/core/engine.js';
import { createAnalyzer } from '../../src/nlu/analyzer.js';
import { createRuleRegistry } from '../../src/rules/registry.js';
import { createResponder } from '../../src/core/responder.js';
import { fakeLocalStorage, throwingLocalStorage } from '../helpers/storage-stubs.js';
import { business, pricing, faq } from '../helpers/load-data.js';

/**
 * Full multi-turn conversations through the real NLU, rules and responder.
 * Exact strings are pinned ONLY for authoritative business wording
 * (deposit, hours, insurance); everything else uses structural assertions.
 */

async function converse(turns, options = {}) {
  const { engine, store } = createTestEngine(options);
  const replies = [];
  for (const turn of turns) {
    const result = await engine.sendMessage(turn);
    replies.push(result);
  }
  return { replies, engine, store };
}

test('Vision follow-up: "Thế 1 tuần?" still refers to Vision', async () => {
  const { replies } = await converse(['Vision bao nhiêu?', 'Thế 1 tuần?']);
  assert.ok(replies[0].reply.text.includes('Honda Vision'));
  assert.ok(replies[1].reply.text.includes('800.000đ - 1.000.000đ'));
  assert.equal(replies[1].slots.vehicle.id, 'honda-vision');
  assert.equal(replies[1].slots.durationDays, 7);
  assert.equal(replies[1].source, 'pricing-data');
});

test('classic estimates stay deterministic', async () => {
  const { replies } = await converse(['Vision 3 ngày', 'Air Blade 1 tuần', 'thuê Honda Click 1 tháng']);
  assert.ok(replies[0].reply.text.includes('600.000đ'));
  assert.ok(replies[1].reply.text.includes('800.000đ'));
  assert.ok(replies[2].reply.text.includes('1.000.000đ - 1.200.000đ'));
});

test('category estimate spans the models of the category', async () => {
  const { replies } = await converse(['xe ga 1 tuần giá bao nhiêu']);
  assert.ok(replies[0].reply.text.includes('600.000đ - 1.000.000đ'));
});

test('clarify flow: duration without vehicle asks only for the vehicle', async () => {
  const { replies, engine } = await converse(['thuê 2 tháng', 'Vision']);
  const clarify = replies[0];
  assert.equal(clarify.source, 'agenda');
  assert.ok(clarify.reply.text.includes('xe nào'));
  assert.deepEqual(engine.agenda.getPending(), null); // satisfied and cleared
  assert.ok(replies[1].reply.text.includes('3.600.000đ - 4.000.000đ'));
});

test('a clarification does not over-ask: answering with a model completes it', async () => {
  const { replies, engine } = await converse(['thuê 1 tuần', 'Wave']);
  assert.ok(replies[1].reply.text.includes('Honda Wave'));
  assert.equal(engine.agenda.getPending(), null);
});

test('deposit answer is the pinned authoritative note', async () => {
  const { replies } = await converse(['đặt cọc bao nhiêu']);
  assert.equal(replies[0].reply.text, business.policies.deposit.note);
  assert.ok(replies[0].reply.text.includes('2.000.000đ'));
  assert.ok(replies[0].reply.text.includes('5.000.000đ'));
  assert.equal(replies[0].confidence, 1);
});

test('opening hours answer includes hours and live status', async () => {
  const { replies } = await converse(['hôm nay mấy giờ mở cửa']);
  assert.ok(replies[0].reply.text.includes('09:00 - 21:00'));
  assert.match(replies[0].reply.text, /mở cửa|đóng cửa/);
  assert.ok(replies[0].reply.text.includes('Không giao xe ngoài giờ hoạt động'));
});

test('insurance answer is the pinned authoritative note', async () => {
  const { replies } = await converse(['thuê xe có bảo hiểm không']);
  assert.equal(replies[0].reply.text, business.policies.insurance.note);
  assert.ok(replies[0].reply.text.includes('Không cung cấp bảo hiểm'));
  assert.equal(replies[0].confidence, 1);
});

test('documents question gets an honest unknown, no invented requirements', async () => {
  const { replies } = await converse(['thuê xe cần giấy tờ gì']);
  assert.ok(replies[0].reply.text.includes('chưa có thông tin chắc chắn'));
  assert.equal(replies[0].source, 'unknown');
  assert.ok(replies[0].confidence < 1);
});

test('unconfirmed price means contact, never 0đ', async () => {
  const { replies } = await converse(['thuê xe 50cc', 'xe đạp điện giá bao nhiêu']);
  for (const reply of replies) {
    assert.ok(reply.reply.text.includes('liên hệ'));
    assert.ok(!reply.reply.text.includes('0đ'));
    assert.ok(!reply.reply.text.includes('0 VND'));
    assert.ok(reply.confidence < 1);
  }
});

test('unknown delivery area is an honest unknown listing known areas', async () => {
  const { replies } = await converse(['giao xe Hà Đông được không']);
  assert.ok(replies[0].reply.text.includes('chưa có thông tin chắc chắn'));
  assert.ok(replies[0].reply.text.includes('Long Biên'));
  assert.ok(replies[0].reply.text.includes('xác nhận'));
  assert.equal(replies[0].source, 'unknown');
});

test('known delivery area is confirmed with business hours', async () => {
  const { replies } = await converse(['giao xe Tây Hồ được không']);
  assert.ok(replies[0].reply.text.includes('Tây Hồ'));
  assert.ok(replies[0].reply.text.includes('09:00 - 21:00'));
  assert.equal(replies[0].source, 'business-data');
});

test('contact questions include the phone number with actions', async () => {
  const { replies } = await converse(['số điện thoại là bao nhiêu']);
  assert.ok(replies[0].reply.text.includes('0942 467 674'));
  assert.ok(replies[0].reply.actions.some((a) => a.href.startsWith('tel:')));
  assert.ok(replies[0].reply.actions.some((a) => a.href.includes('zalo.me')));
});

test('multi-intent turn resolves by rule priority (contact before pricing)', async () => {
  const { replies } = await converse(['số điện thoại và giá thuê Wave']);
  assert.ok(replies[0].reply.text.includes('0942 467 674'));
  assert.equal(replies[0].source, 'business-data');
});

test('greeting never hits the fallback', async () => {
  const { replies } = await converse(['xin chào']);
  assert.equal(replies[0].reply.text, faq.assistant.greeting);
  assert.equal(replies[0].source, 'faq-data');
});

test('bike type listing comes from the pricing data', async () => {
  const { replies } = await converse(['cho mình hỏi có những loại xe nào']);
  const text = replies[0].reply.text;
  assert.ok(text.includes('Xe số'));
  assert.ok(text.includes('Xe tay ga'));
  assert.ok(text.includes('Honda Vision'));
  assert.equal(replies[0].source, 'pricing-data');
});

test('location remembered across turns for delivery', async () => {
  const { replies } = await converse(['mình ở Tây Hồ', 'giao xe được không']);
  // First turn registers the location; the delivery turn uses the slot.
  assert.equal(replies[1].slots.location, 'Tây Hồ');
  assert.ok(replies[1].reply.text.includes('Tây Hồ'));
  assert.equal(replies[1].source, 'business-data');
});

test('general duration question answers without asking for missing slots', async () => {
  const { replies, engine } = await converse(['thuê theo tuần có không']);
  assert.ok(replies[0].reply.text.includes('tuần'));
  assert.equal(engine.agenda.getPending(), null); // no over-asking
});

test('unknown query falls back honestly', async () => {
  const { replies } = await converse(['trời hôm nay đẹp quá']);
  assert.equal(replies[0].source, 'fallback');
  assert.equal(replies[0].reply.text, faq.assistant.not_found);
  assert.ok(replies[0].confidence < 0.5);
});

test('history persists across engine instances sharing a store', async () => {
  const store = createLocalStore({ namespace: 'motoai-int', backend: fakeLocalStorage() });
  const first = createTestEngine({ store, scope: 'persist' });
  await first.engine.sendMessage('xin chào');
  const second = createTestEngine({ store, scope: 'persist' });
  const entries = second.engine.history.list();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].role, 'user');
});

test('slots persist across engine instances sharing a store', async () => {
  const store = createLocalStore({ namespace: 'motoai-int', backend: fakeLocalStorage() });
  const first = createTestEngine({ store, scope: 'persist' });
  await first.engine.sendMessage('Vision bao nhiêu');
  const second = createTestEngine({ store, scope: 'persist' });
  const result = await second.engine.sendMessage('Thế 1 tuần');
  assert.ok(result.reply.text.includes('800.000đ - 1.000.000đ'));
});

test('stale session state is discarded and recreated (TTL)', async () => {
  let clock = 1000;
  const store = createLocalStore({ namespace: 'motoai-int', backend: fakeLocalStorage(), now: () => clock });
  const config = { history: { maxTurns: 20, ttlHours: 1 }, nlu: { intentThreshold: 0.5 } };
  const first = createTestEngine({ store, scope: 'ttl', config });
  await first.engine.sendMessage('Vision bao nhiêu');

  clock += 2 * 60 * 60 * 1000; // two hours later: everything expired
  const second = createTestEngine({ store, scope: 'ttl', config });
  assert.notEqual(second.engine.session.id, first.engine.session.id);
  assert.deepEqual(second.engine.history.list(), []);
  // v44: the context-memory shape includes rider/trip fields; TTL discards all.
  const fresh = second.engine.slots.get();
  for (const [key, value] of Object.entries(fresh)) assert.equal(value, null, `slot ${key} must be reset`);
});

test('duplicate session initialization keeps one session and one history', async () => {
  const store = createLocalStore({ namespace: 'motoai-int', backend: fakeLocalStorage() });
  const a = createTestEngine({ store, scope: 'dup' });
  const b = createTestEngine({ store, scope: 'dup' });
  assert.equal(b.engine.session.id, a.engine.session.id);
  await a.engine.sendMessage('đặt cọc bao nhiêu');
  await b.engine.sendMessage('giờ mở cửa');
  assert.equal(b.engine.history.list().length, 4); // two turns, one shared history
});

test('engine keeps answering when localStorage breaks (memory fallback)', async () => {
  const store = createLocalStore({ namespace: 'motoai-int', backend: throwingLocalStorage() });
  const { engine } = createTestEngine({ store, scope: 'broken' });
  assert.equal(store.isDegraded(), true);
  const deposit = await engine.sendMessage('đặt cọc bao nhiêu');
  assert.equal(deposit.source, 'business-data');
  const price = await engine.sendMessage('Vision 3 ngày'); // context still works in memory
  assert.ok(price.reply.text.includes('600.000đ'));
});

test('events fire across a full conversation', async () => {
  const { engine } = await converse(['xin chào', 'đặt cọc bao nhiêu', 'trời đẹp quá']);
  // The fixture engine shares its emitter; re-run with listeners instead.
  const fresh = createTestEngine({ scope: 'events' });
  const seen = [];
  fresh.engine.emitter.on('rule-hit', (p) => seen.push(['rule-hit', p.ruleId]));
  fresh.engine.emitter.on('fallback', () => seen.push(['fallback']));
  fresh.engine.emitter.on('unknown-query', () => seen.push(['unknown-query']));
  await fresh.engine.sendMessage('đặt cọc bao nhiêu');
  await fresh.engine.sendMessage('trời đẹp quá');
  assert.deepEqual(seen, [
    ['rule-hit', 'deposit-rule'],
    ['unknown-query'],
    ['fallback']
  ]);
  void engine;
});

test('delivery clarification flow via agenda (needs location)', async () => {
  // Direct agenda exercise: a custom rule that clarifies location.
  const store = createLocalStore({ namespace: 'motoai-int', backend: null });
  const analyzer = createAnalyzer({ business, pricing, faq });
  const { rules, fallback } = createRuleRegistry({ business, pricing, faq });
  const responder = createResponder({ business });
  const clarifyingRule = {
    id: 'test-clarify-rule',
    canHandle(analysis) {
      return analysis?.intent?.id === 'return_query';
    },
    respond() {
      return {
        handled: true,
        answer: 'Bạn ở khu vực nào để mình kiểm tra?',
        clarify: { intentId: 'delivery_query', needs: ['location'] },
        confidence: 0.6,
        source: 'agenda'
      };
    }
  };
  const engine = createEngine({
    analyzer,
    rules: [clarifyingRule, ...rules],
    fallback,
    responder,
    store,
    scope: 'agenda-flow'
  });
  const first = await engine.sendMessage('trả xe thế nào');
  assert.equal(first.source, 'agenda');
  assert.deepEqual(engine.agenda.getPending(), { intentId: 'delivery_query', needs: ['location'] });

  const second = await engine.sendMessage('mình ở Tây Hồ');
  // Agenda satisfied: the pending delivery intent replays with the location.
  assert.equal(engine.agenda.getPending(), null);
  assert.ok(second.reply.text.includes('Tây Hồ'));
  assert.equal(second.source, 'business-data');
});
