import test from 'node:test';
import assert from 'node:assert/strict';
import { depositAmounts } from '../../tools/seo-score.mjs';

test('deposit amounts are read from the sentence after "cọc" (thousands dots are not sentence ends)', () => {
  assert.deepEqual(depositAmounts('Tiền cọc từ 2.000.000đ đến 5.000.000đ tùy loại xe. Giá 150.000đ/ngày.'), [2000000, 5000000]);
  assert.deepEqual(depositAmounts('Đặt cọc 3 triệu hoặc 2,5 triệu tùy xe'), [3000000, 2500000]);
  assert.deepEqual(depositAmounts('cọc 500k là đủ'), [500000]);
});

test('a deposit mention without an amount, or prices in another sentence, yields nothing', () => {
  assert.deepEqual(depositAmounts('Mức cọc được xác nhận khi đặt xe. Giá thuê 200.000đ/ngày.'), []);
  assert.deepEqual(depositAmounts('Không có chữ đặt tiền trước ở đây: 2.000.000đ'), []);
});
