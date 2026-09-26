/**
 * Fresh-action contract (v53): primary quick tags / dock actions are EXPLICIT
 * navigation. They must never inherit a stale vehicle/duration from an
 * earlier turn, while free-text chat keeps the full conversational memory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { business, pricing, faq } from '../helpers/load-data.js';
import { createLocalStore } from '../../src/storage/local-store.js';
import { createConfig } from '../../src/config/defaults.js';
import { createMotoApp } from '../../src/app/moto-app.js';

const DATA = { business, pricing, faq };
let counter = 0;
function createApp() {
  return createMotoApp({
    data: DATA,
    store: createLocalStore({ namespace: `motoai-fresh-${++counter}` }),
    scope: `fresh-${counter}`,
    config: createConfig()
  });
}

test('sendFresh exists and free-text send is unchanged', async () => {
  const app = createApp();
  assert.equal(typeof app.sendFresh, 'function');
  assert.equal(typeof app.send, 'function');
  const r = await app.send('Xe ga');
  assert.ok(r.reply.text.length > 0);
});

// Case 1: Xe ga -> Giá thuê must give the GENERAL price answer, not scooter-locked.
test('Xe ga -> fresh "Giá thuê xe bao nhiêu?" returns the general price answer', async () => {
  const app = createApp();
  await app.send('Xe ga');

  // Contrast: free-text follow-up DOES use conversational memory (vehicle kept).
  const withMemory = await app.send('Giá thuê xe bao nhiêu?');
  assert.equal(withMemory.slots.vehicle?.id, 'xe-tay-ga', 'free-text keeps context memory');

  // Fresh: the primary action runs with the stale vehicle cleared.
  const app2 = createApp();
  await app2.send('Xe ga');
  const fresh = await app2.sendFresh('Giá thuê xe bao nhiêu?');
  assert.equal(fresh.slots.vehicle, null, 'fresh action clears the stale vehicle');
  assert.notEqual(fresh.reply.text, withMemory.reply.text,
    'fresh action must not repeat the scooter-locked answer');
  assert.ok(!/xe tay ga/i.test(fresh.reply.text), 'fresh price answer must not mention "xe tay ga"');
  assert.ok(fresh.reply.text.length > 0);
});

// Case 2: Xe ga -> fresh "Thuê theo tháng" runs the monthly logic without stale context.
test('Xe ga -> fresh "Thuê theo tháng" is not skewed by the stale vehicle', async () => {
  const app = createApp();
  await app.send('Xe ga');
  const fresh = await app.sendFresh('Thuê theo tháng');
  assert.equal(fresh.slots.vehicle, null, 'no stale vehicle slot');
  assert.ok(/tháng/i.test(fresh.reply.text), 'answers about monthly rental');
});

// Case 3: Xe số -> fresh "Đặt cọc bao nhiêu?" returns the general deposit policy.
test('Xe số -> fresh "Đặt cọc bao nhiêu?" returns the general deposit policy', async () => {
  const app = createApp();
  await app.send('Xe số');
  const fresh = await app.sendFresh('Đặt cọc bao nhiêu?');
  assert.equal(fresh.slots.vehicle, null, 'no stale vehicle slot');
  assert.ok(/cọc/i.test(fresh.reply.text), 'answers the deposit policy');
  assert.ok(!/xe số/i.test(fresh.reply.text), 'deposit answer must not be vehicle-locked');
});

// Case 4: a fresh action after ANY vehicle turn never inherits the wrong intent.
test('fresh actions never inherit a stale vehicle from any previous turn', async () => {
  for (const vehicleTurn of ['Xe ga', 'Xe số', 'Honda Vision']) {
    for (const action of ['Giá thuê xe bao nhiêu?', 'Thuê theo tháng', 'Đặt cọc bao nhiêu?', 'Thuê xe cần giấy tờ gì?']) {
      const app = createApp();
      await app.send(vehicleTurn);
      const fresh = await app.sendFresh(action);
      assert.equal(fresh.slots.vehicle, null, `"${action}" after "${vehicleTurn}" must run vehicle-free`);
      assert.ok(fresh.reply.text.length > 0);
    }
  }
});

test('sendFresh also drops a pending clarification agenda', async () => {
  const app = createApp();
  // A duration without a vehicle triggers a clarification agenda (needs vehicle).
  await app.send('Thuê 3 ngày');
  assert.ok(app.engine.agenda.getPending(), 'agenda pending after clarifying turn');
  const fresh = await app.sendFresh('Giá thuê xe bao nhiêu?');
  assert.equal(fresh.slots.vehicle, null);
  assert.equal(fresh.slots.durationDays, null, 'fresh action clears stale duration too');
});

test('free-text conversational memory is preserved (regression guard)', async () => {
  const app = createApp();
  await app.send('Xe ga');
  const followUp = await app.send('Cái nào rẻ hơn?');
  assert.ok(followUp.reply.text.length > 0);
  assert.equal(followUp.slots.vehicle?.id, 'xe-tay-ga', 'typed follow-up still uses memory');
});

test('clearFields only resets the listed fields (slots unit)', async () => {
  const app = createApp();
  await app.send('Thuê Honda Vision 5 ngày ở Hà Nội');
  const before = await app.send('Xe ga'); // overwrites vehicle, keeps duration
  assert.equal(before.slots.durationDays, 5, 'duration survives a vehicle-only turn');
  const fresh = await app.sendFresh('Giá thuê xe bao nhiêu?');
  assert.equal(fresh.slots.vehicle, null, 'vehicle cleared');
  assert.equal(fresh.slots.durationDays, null, 'duration cleared by fresh action');
  assert.equal(fresh.slots.language, before.slots.language, 'language untouched');
});
