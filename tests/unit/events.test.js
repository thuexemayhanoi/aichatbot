import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmitter } from '../../src/core/events.js';

test('on subscribes and emit delivers payloads', () => {
  const emitter = createEmitter();
  const seen = [];
  emitter.on('rule-hit', (p) => seen.push(p));
  const delivered = emitter.emit('rule-hit', { ruleId: 'pricing-rule' });
  assert.equal(delivered, true);
  assert.deepEqual(seen, [{ ruleId: 'pricing-rule' }]);
});

test('emit returns false when nobody listens', () => {
  const emitter = createEmitter();
  assert.equal(emitter.emit('nothing', {}), false);
});

test('off removes a subscription', () => {
  const emitter = createEmitter();
  const seen = [];
  const listener = (p) => seen.push(p);
  emitter.on('x', listener);
  emitter.off('x', listener);
  assert.equal(emitter.emit('x', 1), false);
  assert.deepEqual(seen, []);
});

test('on returns an unsubscribe function', () => {
  const emitter = createEmitter();
  const unsubscribe = emitter.on('x', () => {});
  unsubscribe();
  assert.equal(emitter.emit('x', 1), false);
});

test('a throwing listener never breaks emit', () => {
  const emitter = createEmitter();
  const seen = [];
  emitter.on('boom', () => {
    throw new Error('listener bug');
  });
  emitter.on('boom', (p) => seen.push(p));
  const delivered = emitter.emit('boom', { ok: true });
  assert.equal(delivered, true);
  assert.deepEqual(seen, [{ ok: true }]);
});

test('multiple listeners on different events stay isolated', () => {
  const emitter = createEmitter();
  const a = [];
  const b = [];
  emitter.on('a', () => a.push(1));
  emitter.on('b', () => b.push(1));
  emitter.emit('a', null);
  assert.deepEqual(a, [1]);
  assert.deepEqual(b, []);
});

test('invalid subscriptions are ignored', () => {
  const emitter = createEmitter();
  assert.doesNotThrow(() => emitter.on(null, () => {}));
  assert.doesNotThrow(() => emitter.on('x', 'not-a-function'));
  assert.equal(emitter.emit('x', 1), false);
});
