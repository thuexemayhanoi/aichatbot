import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../../src/storage/local-store.js';
import { createAgenda } from '../../src/context/agenda.js';

function makeAgenda() {
  const store = createLocalStore({ namespace: 'ag-test', backend: null });
  return { store, agenda: createAgenda({ store, sessionId: 's1' }) };
}

test('agenda starts empty', () => {
  const { agenda } = makeAgenda();
  assert.equal(agenda.getPending(), null);
});

test('setPending stores intentId and needs', () => {
  const { agenda } = makeAgenda();
  const pending = agenda.setPending({ intentId: 'price_query', needs: ['vehicle'] });
  assert.deepEqual(pending, { intentId: 'price_query', needs: ['vehicle'] });
  assert.deepEqual(agenda.getPending(), { intentId: 'price_query', needs: ['vehicle'] });
});

test('setPending rejects invalid payloads', () => {
  const { agenda } = makeAgenda();
  assert.equal(agenda.setPending({ intentId: '', needs: ['vehicle'] }), null);
  assert.equal(agenda.setPending({ needs: ['vehicle'] }), null);
  assert.equal(agenda.setPending({ intentId: 'price_query', needs: [] }), null);
  assert.equal(agenda.setPending({ intentId: 'price_query', needs: ['nonsense'] }), null);
  assert.equal(agenda.getPending(), null);
});

test('isSatisfied checks exactly the declared needs', () => {
  const { agenda } = makeAgenda();
  const pending = { intentId: 'price_query', needs: ['vehicle'] };
  assert.equal(agenda.isSatisfied(pending, { vehicle: null, durationDays: 7 }), false);
  assert.equal(agenda.isSatisfied(pending, { vehicle: { id: 'v' }, durationDays: null }), true);
});

test('isSatisfied handles multiple needs', () => {
  const { agenda } = makeAgenda();
  const pending = { intentId: 'price_query', needs: ['vehicle', 'duration'] };
  const partial = { vehicle: { id: 'v' }, durationDays: null };
  const full = { vehicle: { id: 'v' }, durationDays: 7 };
  assert.equal(agenda.isSatisfied(pending, partial), false);
  assert.equal(agenda.isSatisfied(pending, full), true);
});

test('location need is satisfied by a known location', () => {
  const { agenda } = makeAgenda();
  const pending = { intentId: 'delivery_query', needs: ['location'] };
  assert.equal(agenda.isSatisfied(pending, { location: null }), false);
  assert.equal(agenda.isSatisfied(pending, { location: 'Tây Hồ' }), true);
});

test('clear removes the pending agenda', () => {
  const { agenda } = makeAgenda();
  agenda.setPending({ intentId: 'price_query', needs: ['vehicle'] });
  agenda.clear();
  assert.equal(agenda.getPending(), null);
});

test('agenda persists across instances sharing the store', () => {
  const store = createLocalStore({ namespace: 'ag-test', backend: null });
  createAgenda({ store, sessionId: 's1' }).setPending({ intentId: 'price_query', needs: ['vehicle'] });
  const again = createAgenda({ store, sessionId: 's1' });
  assert.deepEqual(again.getPending(), { intentId: 'price_query', needs: ['vehicle'] });
});

test('corrupted agenda records are discarded', () => {
  const store = createLocalStore({ namespace: 'ag-test', backend: null });
  store.set('agenda:s1', { intentId: 42, needs: null });
  const agenda = createAgenda({ store, sessionId: 's1' });
  assert.equal(agenda.getPending(), null);
});

test('missing store or sessionId throws', () => {
  assert.throws(() => createAgenda({}), TypeError);
});
