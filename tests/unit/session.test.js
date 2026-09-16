import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../../src/storage/local-store.js';
import { createSessionManager } from '../../src/context/session.js';
import { createIdGenerator } from '../../src/utils/id.js';

function makeStore(backend) {
  return createLocalStore({ namespace: 'sess-test', backend });
}

test('getOrCreate creates a session on first use', () => {
  const store = makeStore();
  const manager = createSessionManager({ store, scope: 'web' });
  const { session, created } = manager.getOrCreate();
  assert.equal(created, true);
  assert.match(session.id, /^[0-9a-f-]{36}$/);
  assert.equal(typeof session.createdAt, 'number');
});

test('double init over the same store and scope reuses the session id', () => {
  const store = makeStore();
  const first = createSessionManager({ store, scope: 'web' }).getOrCreate();
  const second = createSessionManager({ store, scope: 'web' }).getOrCreate();
  assert.equal(second.created, false);
  assert.equal(second.session.id, first.session.id);
});

test('different scopes get different sessions', () => {
  const store = makeStore();
  const a = createSessionManager({ store, scope: 'a' }).getOrCreate();
  const b = createSessionManager({ store, scope: 'b' }).getOrCreate();
  assert.notEqual(a.session.id, b.session.id);
});

test('expired session records yield a new session id', () => {
  let clock = 1000;
  const fakeNow = () => clock;
  const store = createLocalStore({ namespace: 'sess-test', now: fakeNow });
  const manager = createSessionManager({ store, scope: 'web', ttlMs: 5000, now: fakeNow });
  const first = manager.getOrCreate();

  clock = 8000; // past the TTL
  const second = createSessionManager({ store, scope: 'web', ttlMs: 5000, now: fakeNow }).getOrCreate();
  assert.equal(second.created, true);
  assert.notEqual(second.session.id, first.session.id);
});

test('touch slides the TTL so activity keeps a session alive', () => {
  let clock = 1000;
  const fakeNow = () => clock;
  const store = createLocalStore({ namespace: 'sess-test', now: fakeNow });
  const manager = createSessionManager({ store, scope: 'web', ttlMs: 5000, now: fakeNow });
  const { session } = manager.getOrCreate();

  clock = 4000;
  manager.touch(session); // activity refresh
  clock = 8000; // past the original expiry, but refreshed
  const revived = createSessionManager({ store, scope: 'web', ttlMs: 5000, now: fakeNow }).getOrCreate();
  assert.equal(revived.session.id, session.id);
  assert.equal(revived.created, false);
  assert.ok(revived.session.lastSeenAt >= 4000);
});

test('corrupted session records are discarded safely', () => {
  const store = makeStore();
  store.set('session:web', 'not-an-object');
  const { session, created } = createSessionManager({ store, scope: 'web' }).getOrCreate();
  assert.equal(created, true);
  assert.match(session.id, /^[0-9a-f-]{36}$/);
});

test('custom id generator is used for session ids', () => {
  const store = makeStore();
  const manager = createSessionManager({ store, scope: 'web', idGenerator: createIdGenerator(() => new Array(16).fill(1)) });
  const { session } = manager.getOrCreate();
  assert.equal(session.id, '01010101-0101-4101-8101-010101010101');
});

test('missing store throws a clear error', () => {
  assert.throws(() => createSessionManager({}), TypeError);
  assert.throws(() => createSessionManager({ store: { get: () => null } }), TypeError);
});
