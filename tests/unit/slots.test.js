import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../../src/storage/local-store.js';
import { createSlots } from '../../src/context/slots.js';

function makeSlots() {
  const store = createLocalStore({ namespace: 'slot-test', backend: null });
  return { store, slots: createSlots({ store, sessionId: 's1' }) };
}

function analysis({ vehicles = [], durations = [], totalDays = null, locations = [] } = {}) {
  return { intent: { id: 'price_query' }, entities: { vehicles, durations, totalDays, locations } };
}

const VISION = { type: 'model', id: 'honda-vision', name: 'Honda Vision' };
const XE_SO = { type: 'category', id: 'xe-so', name: 'Xe số' };

test('slots start empty', () => {
  const { slots } = makeSlots();
  assert.deepEqual(slots.get(), { vehicle: null, durationDays: null, location: null });
});

test('updateFromAnalysis fills vehicle, duration and location', () => {
  const { slots } = makeSlots();
  const next = slots.updateFromAnalysis(
    analysis({ vehicles: [VISION], totalDays: 7, locations: [{ name: 'Tây Hồ' }] })
  );
  assert.deepEqual(next, { vehicle: VISION, durationDays: 7, location: 'Tây Hồ' });
  assert.deepEqual(slots.get(), next);
});

test('a turn without a vehicle never resets a known vehicle', () => {
  const { slots } = makeSlots();
  slots.updateFromAnalysis(analysis({ vehicles: [VISION] }));
  slots.updateFromAnalysis(analysis({ totalDays: 7 })); // "Thế 1 tuần?"
  const current = slots.get();
  assert.equal(current.vehicle.id, 'honda-vision');
  assert.equal(current.durationDays, 7);
});

test('a turn without a duration never resets a known duration', () => {
  const { slots } = makeSlots();
  slots.updateFromAnalysis(analysis({ totalDays: 30 }));
  slots.updateFromAnalysis(analysis({ vehicles: [XE_SO] }));
  const current = slots.get();
  assert.equal(current.durationDays, 30);
  assert.equal(current.vehicle.id, 'xe-so');
});

test('a model overrides a previously stored category, and vice versa', () => {
  const { slots } = makeSlots();
  slots.updateFromAnalysis(analysis({ vehicles: [XE_SO] }));
  slots.updateFromAnalysis(analysis({ vehicles: [VISION] }));
  assert.equal(slots.get().vehicle.id, 'honda-vision');
  slots.updateFromAnalysis(analysis({ vehicles: [XE_SO] }));
  assert.equal(slots.get().vehicle.id, 'xe-so');
});

test('model beats category within the same turn', () => {
  const { slots } = makeSlots();
  slots.updateFromAnalysis(analysis({ vehicles: [XE_SO, VISION] }));
  assert.equal(slots.get().vehicle.id, 'honda-vision');
});

test('displacement-only turns never set a duration (50cc is not 50 days)', () => {
  const { slots } = makeSlots();
  const next = slots.updateFromAnalysis(
    analysis({ vehicles: [{ type: 'category', id: 'xe-50cc', name: 'Xe 50cc' }], durations: [], totalDays: null })
  );
  assert.equal(next.durationDays, null);
});

test('invalid totalDays values are ignored', () => {
  const { slots } = makeSlots();
  slots.updateFromAnalysis(analysis({ totalDays: -5 }));
  assert.equal(slots.get().durationDays, null);
  slots.updateFromAnalysis(analysis({ totalDays: '7' }));
  assert.equal(slots.get().durationDays, null);
});

test('slots persist across instances sharing the store', () => {
  const store = createLocalStore({ namespace: 'slot-test', backend: null });
  createSlots({ store, sessionId: 's1' }).updateFromAnalysis(analysis({ vehicles: [VISION] }));
  const again = createSlots({ store, sessionId: 's1' });
  assert.equal(again.get().vehicle.id, 'honda-vision');
});

test('corrupted slot records are sanitized on read', () => {
  const store = createLocalStore({ namespace: 'slot-test', backend: null });
  store.set('slots:s1', { vehicle: 'vision', durationDays: 'week', location: 42, extra: true });
  const slots = createSlots({ store, sessionId: 's1' });
  assert.deepEqual(slots.get(), { vehicle: null, durationDays: null, location: null });
});

test('clear resets the slots', () => {
  const { slots } = makeSlots();
  slots.updateFromAnalysis(analysis({ vehicles: [VISION], totalDays: 7 }));
  slots.clear();
  assert.deepEqual(slots.get(), { vehicle: null, durationDays: null, location: null });
});

test('missing store or sessionId throws', () => {
  assert.throws(() => createSlots({}), TypeError);
});
