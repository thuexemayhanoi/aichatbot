import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdGenerator, nextId } from '../../src/utils/id.js';

test('nextId produces RFC 4122 v4 shaped ids', () => {
  const id = nextId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('nextId ids are unique in practice', () => {
  const seen = new Set(Array.from({ length: 1000 }, () => nextId()));
  assert.equal(seen.size, 1000);
});

test('createIdGenerator accepts a deterministic source', () => {
  const bytes = [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];
  const next = createIdGenerator(() => bytes);
  assert.equal(next(), '12345678-9abc-4ef0-9122-334455667788');
  assert.equal(next(), next());
});

test('createIdGenerator tolerates a source returning plain arrays', () => {
  const next = createIdGenerator((n) => new Array(n).fill(255));
  assert.equal(next(), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});
