import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ok, err, isOk, isErr, attempt } from '../../src/utils/result.js';

test('ok wraps a value', () => {
  const r = ok(42);
  assert.equal(isOk(r), true);
  assert.equal(r.value, 42);
});

test('err wraps errors and normalizes non-errors', () => {
  const fromError = err(new Error('boom'));
  const fromString = err('boom');
  assert.equal(isErr(fromError), true);
  assert.equal(fromError.error.message, 'boom');
  assert.ok(fromString.error instanceof Error);
  assert.equal(fromString.error.message, 'boom');
});

test('isOk and isErr reject junk input', () => {
  assert.equal(isOk(null), false);
  assert.equal(isErr(null), false);
  assert.equal(isOk({}), false);
});

test('attempt captures thrown errors from sync and async functions', async () => {
  const good = await attempt(() => 7);
  assert.deepEqual(good, { ok: true, value: 7 });

  const badSync = await attempt(() => {
    throw new Error('nope');
  });
  assert.equal(isErr(badSync), true);

  const badAsync = await attempt(async () => {
    throw new Error('async nope');
  });
  assert.equal(badAsync.error.message, 'async nope');

  const goodAsync = await attempt(async () => 'value');
  assert.deepEqual(goodAsync, { ok: true, value: 'value' });
});
