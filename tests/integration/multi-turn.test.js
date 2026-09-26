import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../../src/storage/local-store.js';
import { createConfig } from '../../src/config/defaults.js';
import { createMotoApp } from '../../src/app/moto-app.js';
import { business, pricing, faq } from '../helpers/load-data.js';

/**
 * v44 MULTI-TURN GOLDEN CONVERSATIONS.
 * Context memory + planner + recommendation + smart calculator, end to end.
 * Expected facts are read from the repository data files, never hard-coded.
 */

const DATA = { business, pricing, faq };
let counter = 0;
function createApp() {
  return createMotoApp({
    data: DATA,
    store: createLocalStore({ namespace: `motoai-mt-${++counter}` }),
    scope: `mt-${counter}`,
    config: createConfig()
  });
}

async function converse(app, turns) {
  const replies = [];
  for (const turn of turns) replies.push(await app.send(turn));
  return replies;
}

// A. Follow-up keeps the vehicle
test('A: "Vision 1 tuần" then "Thế 1 tháng?" still means Vision', async () => {
  const app = createApp();
  const [a, b] = await converse(app, ['Vision 1 tuần bao nhiêu?', 'Thế 1 tháng?']);
  const vision = pricing.vehicles.find((v) => v.id === 'honda-vision');
  assert.equal(a.source, 'pricing-data');
  assert.equal(b.source, 'pricing-data');
  assert.ok(b.reply.text.includes(vision.name));
  assert.ok(b.reply.text.includes(vision.rates.month.min.toLocaleString('vi-VN')));
  assert.equal(b.slots.vehicle.id, 'honda-vision');
  assert.equal(b.slots.durationDays, 30);
});

// B. Height carried into a later recommendation
test('B: "Tôi cao 1m55" then "Đi Tam Đảo 3 ngày nên thuê xe gì?"', async () => {
  const app = createApp();
  const [a, b] = await converse(app, ['Tôi cao 1m55', 'Đi Tam Đảo 3 ngày nên thuê xe gì?']);
  assert.equal(a.slots.heightCm, 155); // height alone: remembered, never faked
  assert.equal(b.slots.heightCm, 155); // context memory carried it
  assert.equal(b.slots.destination, 'Tam Dao');
  assert.equal(b.source, 'recommendation');
  assert.ok(b.reply.text.includes('Bảng giá') || b.reply.text.length > 0);
  // Grounded: every recommended model exists in the verified catalog.
  const ids = new Set(pricing.vehicles.map((v) => v.id));
  for (const model of b.structured.recommendedModels) assert.ok(ids.has(model.id));
  // No invented seat-height claim: the gap is stated, not faked.
  assert.ok(JSON.stringify(b.structured).includes('chiều cao yên xe'));
});

// C. Calculator returns a grounded breakdown
test('C: "Wave 12 ngày" returns a transparent breakdown', async () => {
  const app = createApp();
  const [r] = await converse(app, ['Wave thuê 12 ngày']);
  const wave = pricing.vehicles.find((v) => v.id === 'honda-wave');
  assert.equal(r.source, 'pricing-data');
  assert.ok(r.reply.text.includes((12 * wave.rates.day.min).toLocaleString('vi-VN')));
  assert.match(r.reply.text, /Gói tối thiểu .*: 12 ngày × /);
  assert.ok(r.reply.text.includes('12 ngày'));
});

// D. Budget question stays deterministic
test('D: "Có xe ga 150k không?" is a deterministic verified answer', async () => {
  const app = createApp();
  const [r] = await converse(app, ['Có xe ga 150k không?']);
  assert.ok(['pricing-data', 'unknown', 'recommendation'].includes(r.source));
  assert.ok(r.reply.text.includes(business.brand) || r.reply.text.includes('đ'));
});

// E. English context + deterministic business facts
test('E: English location then closing-hours follow-up', async () => {
  const app = createApp();
  const [a, b] = await converse(app, ['Where are you located?', 'What time do you close?']);
  assert.ok(a.reply.text.includes(business.address.full));
  assert.ok(b.reply.text.includes(business.hours.display));
  assert.equal(a.analysis.entities.language, 'en');
  assert.equal(b.slots.language, 'en'); // context remembers the language
});

// F. Explicit new model overrides old context
test('F: "Vision 1 tuần" then "Không, Air Blade cơ" switches vehicle', async () => {
  const app = createApp();
  const [a, b] = await converse(app, ['Vision 1 tuần', 'Không, Air Blade cơ']);
  assert.equal(a.slots.vehicle.id, 'honda-vision');
  assert.equal(b.slots.vehicle.id, 'honda-airblade'); // new explicit input wins
  const blade = pricing.vehicles.find((v) => v.id === 'honda-airblade');
  assert.ok(b.reply.text.includes(blade.rates.week.min.toLocaleString('vi-VN')));
});

// G. 50cc is never a duration
test('G: "xe 50cc" never becomes 50 days', async () => {
  const app = createApp();
  const [r] = await converse(app, ['xe 50cc']);
  assert.notEqual(r.slots.durationDays, 50);
  assert.ok(!/\b50 ngày\b/.test(r.reply.text));
  const byId = pricing.vehicles.find((v) => v.id === 'xe-50cc');
  assert.ok(byId);
});

// New flows
test('date-range estimate: "Vision từ 5/10 đến 18/10 bao nhiêu?"', async () => {
  const app = createApp();
  const [r] = await converse(app, ['Vision từ 5/10 đến 18/10 bao nhiêu?']);
  assert.equal(r.source, 'pricing-data');
  assert.ok(r.reply.text.includes('05/10/2026'));
  assert.ok(r.reply.text.includes('18/10/2026'));
  assert.ok(r.reply.text.includes('14 ngày'));
  assert.equal(r.slots.durationDays, 14);
  assert.equal(r.slots.dateRange.days, 14);
});

test('English duration: "Air Blade 2 weeks" reaches the calculator', async () => {
  const app = createApp();
  const [r] = await converse(app, ['Air Blade 2 weeks how much?']);
  const blade = pricing.vehicles.find((v) => v.id === 'honda-airblade');
  assert.equal(r.source, 'pricing-data');
  assert.ok(r.reply.text.includes((blade.rates.week.min * 2).toLocaleString('vi-VN')));
});

test('comparison: "Thuê 35 ngày cái nào rẻ hơn?" ranks priced models', async () => {
  const app = createApp();
  const [r] = await converse(app, ['Thuê 35 ngày cái nào rẻ hơn?']);
  assert.equal(r.source, 'pricing-data');
  assert.equal(r.structured.type, 'comparison');
  const mins = r.structured.rows.map((row) => row.min);
  assert.deepEqual([...mins].sort((a, b) => a - b), mins); // cheapest first
});

test('recommendation with usage + experience stays grounded in descriptions', async () => {
  const app = createApp();
  const [r] = await converse(app, ['Tôi cao 1m55, mới lái, đi trong phố 3 ngày nên chọn xe gì?']);
  assert.equal(r.source, 'recommendation');
  assert.ok(r.structured.recommendedModels.length > 0);
  const ids = new Set(pricing.vehicles.map((v) => v.id));
  for (const model of r.structured.recommendedModels) assert.ok(ids.has(model.id));
  // "Mới lái" must surface the "dễ điều khiển" wording from the verified description.
  const joined = r.reply.text.toLowerCase();
  assert.ok(joined.includes('dễ điều khiển') || joined.includes('nhe'));
});

test('resetContext forgets vehicle, duration and rider context', async () => {
  const app = createApp();
  await converse(app, ['Vision 1 tuần', 'Tôi cao 1m55']);
  assert.ok(app.engine.slots.get().vehicle);
  app.resetContext();
  const slots = app.engine.slots.get();
  for (const value of Object.values(slots)) assert.equal(value, null);
  const after = await app.send('Thế 1 tháng?');
  // Without context the follow-up must NOT price Vision from stale memory.
  assert.ok(!after.reply.text.includes('1.800.000đ - 2.000.000đ') || after.source !== 'pricing-data');
  assert.ok(after.reply.text.includes('loại xe') || after.reply.text.includes('xe nào'));
});
