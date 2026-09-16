import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../../src/nlu/normalizer.js';

test('strips Vietnamese accents', () => {
  assert.equal(normalize('Thuê Xe Máy Hà Nội'), 'thue xe may ha noi');
});

test('maps đ to d in both cases', () => {
  assert.equal(normalize('Địa chỉ Đường'), 'dia chi duong');
});

test('accented and unaccented input compare equal', () => {
  assert.equal(normalize('Giấy tờ'), normalize('giay to'));
  assert.equal(normalize('Đặt cọc'), normalize('dat coc'));
});

test('collapses whitespace and trims', () => {
  assert.equal(normalize('  giá   thuê  '), 'gia thue');
});

test('non-string input returns empty string', () => {
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
  assert.equal(normalize(42), '');
});
