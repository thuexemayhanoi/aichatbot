import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_SCHEMA_VERSION, wrapRecord, unwrapRecord } from '../../src/storage/schema.js';

test('CURRENT_SCHEMA_VERSION is a positive integer', () => {
  assert.equal(Number.isInteger(CURRENT_SCHEMA_VERSION), true);
  assert.ok(CURRENT_SCHEMA_VERSION >= 1);
});

test('wrapRecord stores schema version, timestamps and data', () => {
  const record = wrapRecord({ a: 1 }, { now: 1000, ttlMs: 5000 });
  assert.equal(record.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(record.createdAt, 1000);
  assert.equal(record.updatedAt, 1000);
  assert.equal(record.expiresAt, 6000);
  assert.deepEqual(record.data, { a: 1 });
});

test('wrapRecord without ttl never expires', () => {
  const record = wrapRecord('x', { now: 1000 });
  assert.equal(record.expiresAt, null);
});

test('unwrapRecord returns data for a fresh, same-version record', () => {
  const record = wrapRecord({ hello: 'world' }, { now: 1000, ttlMs: 10000 });
  assert.deepEqual(unwrapRecord(record, { now: 5000 }), { hello: 'world' });
});

test('unwrapRecord drops expired records (stale state)', () => {
  const record = wrapRecord({ hello: 'world' }, { now: 1000, ttlMs: 10000 });
  assert.deepEqual(unwrapRecord(record, { now: 10999 }), { hello: 'world' }); // alive until the boundary
  assert.equal(unwrapRecord(record, { now: 11000 }), null); // expired at and after the boundary
});

test('unwrapRecord drops records from a different schema version', () => {
  const record = wrapRecord('x', { now: 1, schemaVersion: 99 });
  assert.equal(unwrapRecord(record, { now: 2 }), null);
});

test('unwrapRecord drops malformed records', () => {
  assert.equal(unwrapRecord(null, { now: 1 }), null);
  assert.equal(unwrapRecord('string', { now: 1 }), null);
  assert.equal(unwrapRecord({ schemaVersion: CURRENT_SCHEMA_VERSION }, { now: 1 }), null); // no data
});
