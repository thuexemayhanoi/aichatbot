import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../../src/storage/local-store.js';
import { createHistory } from '../../src/context/history.js';

function makeHistory({ maxEntries = 40 } = {}) {
  const store = createLocalStore({ namespace: 'hist-test', backend: null });
  return { store, history: createHistory({ store, sessionId: 's1', maxEntries }) };
}

test('history starts empty', () => {
  const { history } = makeHistory();
  assert.deepEqual(history.list(), []);
});

test('add appends entries in order', () => {
  const { history } = makeHistory();
  history.add({ role: 'user', text: 'xin chao' });
  history.add({ role: 'assistant', text: 'chao ban' });
  assert.deepEqual(history.list(), [
    { role: 'user', text: 'xin chao' },
    { role: 'assistant', text: 'chao ban' }
  ]);
});

test('history is bounded to maxEntries (oldest dropped)', () => {
  const { history } = makeHistory({ maxEntries: 4 });
  for (let i = 1; i <= 6; i++) history.add({ role: 'user', text: `m${i}` });
  const entries = history.list();
  assert.equal(entries.length, 4);
  assert.equal(entries[0].text, 'm3');
  assert.equal(entries[3].text, 'm6');
});

test('history persists across instances sharing the store', () => {
  const store = createLocalStore({ namespace: 'hist-test', backend: null });
  const h1 = createHistory({ store, sessionId: 's1' });
  h1.add({ role: 'user', text: 'hello' });
  const h2 = createHistory({ store, sessionId: 's1' });
  assert.deepEqual(h2.list(), [{ role: 'user', text: 'hello' }]);
});

test('different sessions keep separate histories', () => {
  const store = createLocalStore({ namespace: 'hist-test', backend: null });
  createHistory({ store, sessionId: 'a' }).add({ role: 'user', text: 'for-a' });
  createHistory({ store, sessionId: 'b' }).add({ role: 'user', text: 'for-b' });
  const a = createHistory({ store, sessionId: 'a' }).list();
  assert.equal(a.length, 1);
  assert.equal(a[0].text, 'for-a');
});

test('invalid entries are rejected and ignored on read', () => {
  const { history } = makeHistory();
  history.add({ role: 'system', text: 'nope' });
  history.add({ role: 'user' });
  history.add(null);
  assert.deepEqual(history.list(), []);

  const store = createLocalStore({ namespace: 'hist-test2', backend: null });
  store.set(`history:s1`, [{ role: 'user', text: 'ok' }, { junk: true }, 'garbage']);
  const dirty = createHistory({ store, sessionId: 's1' });
  assert.deepEqual(dirty.list(), [{ role: 'user', text: 'ok' }]);
});

test('clear removes the history', () => {
  const { history } = makeHistory();
  history.add({ role: 'user', text: 'x' });
  history.clear();
  assert.deepEqual(history.list(), []);
});

test('missing store or sessionId throws', () => {
  assert.throws(() => createHistory({}), TypeError);
  const store = createLocalStore({ namespace: 'hist-test', backend: null });
  assert.throws(() => createHistory({ store, sessionId: '' }), TypeError);
});
