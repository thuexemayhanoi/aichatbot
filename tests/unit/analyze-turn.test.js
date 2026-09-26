import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzer } from '../../src/nlu/analyzer.js';
import { analyzeTurn } from '../../src/nlu/analyze-turn.js';
import { planTurn } from '../../src/core/planner.js';
import { business, pricing, faq } from '../helpers/load-data.js';

const analyze = createAnalyzer({ business, pricing, faq });
const turn = (text, context = {}) => analyzeTurn(text, context, { analysis: analyze(text) });
const plan = (text, context = {}) =>
  planTurn({ text, context, nlu: { analysis: analyze(text) }, businessData: { business, pricing, faq } });

test('analyzeTurn reports the resolved intent and entities', () => {
  const t = turn('Vision 1 tuần bao nhiêu');
  assert.equal(t.intent.id, 'price_query');
  assert.equal(t.resolvedEntities.vehicle.id, 'honda-vision');
  assert.equal(t.resolvedEntities.durationDays, 7);
  assert.deepEqual(t.missingEntities, []);
  assert.equal(t.language, 'vi');
});

test('context fills missing entities for follow-ups (turn wins)', () => {
  const context = { vehicle: { id: 'honda-vision' }, durationDays: 7 };
  const t = turn('Thế 1 tháng?', context);
  assert.equal(t.resolvedEntities.vehicle.id, 'honda-vision'); // carried
  assert.equal(t.resolvedEntities.durationDays, 30);           // turn overrides
  assert.deepEqual(t.missingEntities, []);
});

test('missing entities surface for the intent', () => {
  const t = turn('thuê 2 tháng'); // duration without vehicle
  assert.ok(t.missingEntities.includes('vehicle'));
});

test('rider context carries into resolved entities', () => {
  const context = { heightCm: 155, usage: 'long' };
  const t = turn('nên thuê xe gì', context);
  assert.equal(t.resolvedEntities.heightCm, 155);
  assert.equal(t.resolvedEntities.usage, 'long');
});

test('planner: price questions never use the LLM', () => {
  const p = plan('Vision 1 tuần bao nhiêu');
  assert.equal(p.route.useRuleEngine, true);
  assert.equal(p.route.useCalculator, true);
  assert.equal(p.route.useLocalLlm, false);
});

test('planner: deposit/hours/contact are rule-only', () => {
  for (const text of ['đặt cọc bao nhiêu', 'giờ mở cửa', 'số điện thoại']) {
    const p = plan(text);
    assert.equal(p.route.useRuleEngine, true);
    assert.equal(p.route.useLocalLlm, false, text);
  }
});

test('planner: recommendation routes to the engine + optional LLM phrasing', () => {
  const p = plan('đi trong phố 3 ngày nên thuê xe gì');
  assert.equal(p.route.useRecommendation, true);
  assert.equal(p.route.useLocalLlm, true);
});

test('planner: unknown questions go through retrieval', () => {
  const p = plan('con mèo của bạn tên gì');
  assert.equal(p.route.useRetriever, true);
});

test('planner: comparison needs a duration', () => {
  const p = plan('cái nào rẻ hơn');
  assert.ok(p.missingEntities.includes('duration'));
  const withCtx = plan('cái nào rẻ hơn', { durationDays: 35 });
  assert.deepEqual(withCtx.missingEntities, []);
});
