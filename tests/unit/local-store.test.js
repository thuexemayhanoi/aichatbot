import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore, createMemoryBackend } from '../../src/storage/local-store.js';
import { fakeLocalStorage, throwingLocalStorage, explodingLocalStorage } from '../helpers/storage-stubs.js';

test('set and get round-trip data through a working backend', () => {
  const store = createLocalStore({ namespace: 't', backend: fakeLocalStorage() });
  assert.equal(store.set('k', { a: 1 }), true);
  assert.deepEqual(store.get('k'), { a: 1 });
});

test('get returns null for absent keys', () => {
  const store = createLocalStore({ backend: fakeLocalStorage() });
  assert.equal(store.get('missing'), null);
});

test('keys are namespaced and schema-versioned', () => {
  const backend = fakeLocalStorage();
  const store = createLocalStore({ namespace: 'widget', schemaVersion: 2, backend });
  store.set('k', 'v');
  const keys = [...backend._dump().keys()];
  assert.deepEqual(keys, ['widget:v2:k']);
});

test('namespaces do not collide', () => {
  const backend = fakeLocalStorage();
  const a = createLocalStore({ namespace: 'a', backend });
  const b = createLocalStore({ namespace: 'b', backend });
  a.set('k', 'from-a');
  b.set('k', 'from-b');
  assert.equal(a.get('k'), 'from-a');
  assert.equal(b.get('k'), 'from-b');
});

test('different schema versions read independently', () => {
  const backend = fakeLocalStorage();
  const v1 = createLocalStore({ namespace: 'n', schemaVersion: 1, backend });
  const v2 = createLocalStore({ namespace: 'n', schemaVersion: 2, backend });
  v1.set('k', 'old');
  assert.equal(v2.get('k'), null); // foreign version is invisible
});

test('remove deletes a key', () => {
  const store = createLocalStore({ backend: fakeLocalStorage() });
  store.set('k', 1);
  store.remove('k');
  assert.equal(store.get('k'), null);
});

test('clear wipes the backend', () => {
  const store = createLocalStore({ backend: fakeLocalStorage() });
  store.set('a', 1);
  store.set('b', 2);
  store.clear();
  assert.equal(store.get('a'), null);
  assert.equal(store.get('b'), null);
});

test('ttl expiry discards stale data', () => {
  let clock = 1000;
  const store = createLocalStore({ backend: fakeLocalStorage(), now: () => clock, ttlMs: 5000 });
  store.set('k', 'fresh');
  clock = 4000;
  assert.equal(store.get('k'), 'fresh');
  clock = 7000;
  assert.equal(store.get('k'), null);
});

test('corrupted payloads are treated as absent', () => {
  const backend = fakeLocalStorage();
  const store = createLocalStore({ namespace: 't', backend });
  backend.setItem('t:v1:bad', '{not json');
  assert.equal(store.get('bad'), null);
});

test('missing backend degrades to memory and keeps working', () => {
  const store = createLocalStore({ backend: null });
  assert.equal(store.isDegraded(), true);
  assert.equal(store.set('k', 'v'), true);
  assert.equal(store.get('k'), 'v');
});

test('undefined backend uses host detection (none in Node) and still works', () => {
  const store = createLocalStore({ namespace: 'detect-test' });
  assert.equal(store.isDegraded(), true);
  store.set('k', 123);
  assert.equal(store.get('k'), 123);
});

test('throwing setItem degrades permanently to memory', () => {
  const store = createLocalStore({ backend: throwingLocalStorage() });
  assert.equal(store.isDegraded(), false);
  assert.equal(store.set('k', 'salvaged'), true); // retried into memory
  assert.equal(store.isDegraded(), true);
  assert.equal(store.get('k'), 'salvaged');
});

test('exploding backend degrades on first read and never throws', () => {
  const store = createLocalStore({ backend: explodingLocalStorage() });
  assert.equal(store.get('anything'), null);
  assert.equal(store.set('k', 'v'), true);
  assert.equal(store.get('k'), 'v');
  assert.equal(store.remove('k'), true);
  assert.equal(store.clear(), true);
  assert.equal(store.isDegraded(), true);
});

test('degradation is permanent: a later working write still goes to memory', () => {
  let broken = true;
  const flaky = {
    getItem: (k) => (broken ? (() => { throw new Error('boom'); })() : `{"x":1}`),
    setItem: () => {
      if (broken) throw new Error('boom');
    },
    removeItem: () => {},
    clear: () => {}
  };
  const store = createLocalStore({ backend: flaky });
  store.get('k'); // triggers degradation
  broken = false; // backend recovers, but the store must not switch back
  store.set('k', 'memory-value');
  assert.equal(store.get('k'), 'memory-value');
  assert.equal(store.isDegraded(), true);
});

test('createMemoryBackend behaves like a tiny localStorage', () => {
  const backend = createMemoryBackend();
  backend.setItem('a', '1');
  assert.equal(backend.getItem('a'), '1');
  assert.equal(backend.getItem('missing'), null);
  backend.removeItem('a');
  assert.equal(backend.getItem('a'), null);
  backend.clear();
});
