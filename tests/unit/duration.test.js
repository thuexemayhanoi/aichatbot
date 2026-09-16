import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDurations } from '../../src/nlu/entities/duration.js';
import { tokenize } from '../../src/nlu/tokenizer.js';

const d = (text) => extractDurations(tokenize(text));

test('50cc is engine displacement, never a duration', () => {
  const r = d('thuê xe 50cc');
  assert.equal(r.durations.length, 0);
  assert.deepEqual(r.displacements.map((x) => x.cc), [50]);
  assert.equal(r.totalDays, null);
});

test('110cc, 125cc, 150cc are displacements', () => {
  for (const cc of [110, 125, 150]) {
    const r = d(`xe ${cc}cc`);
    assert.equal(r.durations.length, 0, `${cc}cc must not be a duration`);
    assert.deepEqual(r.displacements.map((x) => x.cc), [cc]);
  }
});

test('split form "110 cc" is also a displacement', () => {
  const r = d('xe 110 cc');
  assert.equal(r.durations.length, 0);
  assert.deepEqual(r.displacements.map((x) => x.cc), [110]);
});

test('number with a time unit is a duration', () => {
  const r = d('thuê 50 ngày');
  assert.equal(r.durations.length, 1);
  assert.equal(r.durations[0].value, 50);
  assert.equal(r.durations[0].unit, 'ngay');
  assert.equal(r.durations[0].days, 50);
  assert.equal(r.totalDays, 50);
});

test('composes mixed units', () => {
  const r = d('1 tuần 2 ngày');
  assert.equal(r.durations.length, 2);
  assert.equal(r.totalDays, 9);
});

test('months convert to days', () => {
  const r = d('thuê 2 tháng');
  assert.equal(r.totalDays, 60);
});

test('bare numbers are never durations', () => {
  assert.equal(d('thuê 3').durations.length, 0);
  assert.equal(d('cho tôi 5').durations.length, 0);
});

test('displacement next to a real duration keeps both apart', () => {
  const r = d('thuê xe 50cc 3 ngày');
  assert.deepEqual(r.displacements.map((x) => x.cc), [50]);
  assert.equal(r.totalDays, 3);
});
