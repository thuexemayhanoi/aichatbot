import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRiderProfile, parseHeight } from '../../src/nlu/entities/rider.js';
import { normalize } from '../../src/nlu/normalizer.js';
import { detectLanguage } from '../../src/nlu/language.js';

const profile = (text) => extractRiderProfile(normalize(text));

test('parses heights: 1m55 / 1.55m / 155cm', () => {
  assert.equal(profile('Tôi cao 1m55').heightCm, 155);
  assert.equal(profile('mình cao 1.55m').heightCm, 155);
  assert.equal(profile('cao 155cm').heightCm, 155);
  assert.equal(parseHeight(normalize('1 m 55')), 155);
});

test('implausible heights are rejected', () => {
  assert.equal(profile('xe 50cc').heightCm, undefined);
  assert.equal(profile('1m99').heightCm, 199);
  assert.equal(profile('2m50').heightCm, undefined);
  assert.equal(profile('1m5').heightCm, undefined); // 1m05 not written
});

test('experience: mới lái vs đi lâu', () => {
  assert.equal(profile('tôi mới lái').experience, 'new');
  assert.equal(profile('em chưa lái được').experience, 'new');
  assert.equal(profile('mình chạy nhiều năm rồi').experience, 'experienced');
});

test('transmission: xe số vs xe ga', () => {
  assert.equal(profile('cho mình xe số').transmission, 'manual');
  assert.equal(profile('thích xe ga').transmission, 'scooter');
  assert.equal(profile('xe máy thường').transmission, undefined);
});

test('budget: 150k, 200 nghìn, dưới 2 triệu', () => {
  assert.deepEqual(profile('xe ga 150k'), { transmission: 'scooter', budget: { amountVnd: 150000, direction: 'max' } });
  assert.equal(profile('dưới 200 nghìn').budget.amountVnd, 200000);
  assert.equal(profile('tối đa 2 triệu').budget.direction, 'max');
  assert.equal(profile('1.5 triệu').budget.amountVnd, 1500000);
});

test('usage and destination', () => {
  assert.equal(profile('đi trong phố 3 ngày').usage, 'city');
  assert.equal(profile('chạy đường núi').usage, 'long');
  assert.equal(profile('đi Tam Đảo 3 ngày').destination, 'Tam Dao');
});

test('electric and luggage cues', () => {
  assert.equal(profile('muốn xe điện').electric, true);
  assert.equal(profile('chở vali nhiều').luggage, true);
});

test('compound rider sentence parses every field', () => {
  const p = profile('Tôi cao 1m55, mới lái, đi trong phố 3 ngày, xe ga');
  assert.equal(p.heightCm, 155);
  assert.equal(p.experience, 'new');
  assert.equal(p.usage, 'city');
  assert.equal(p.transmission, 'scooter');
});

test('50cc never becomes a height, duration or budget', () => {
  const p = profile('xe 50cc');
  assert.equal(p.heightCm, undefined);
  assert.equal(p.budget, undefined);
});

test('language detection: vi markers, english questions, fallback', () => {
  assert.equal(detectLanguage('thuê xe bao nhiêu'), 'vi');
  assert.equal(detectLanguage('Where are you located?'), 'en');
  assert.equal(detectLanguage('What time do you close?'), 'en');
  assert.equal(detectLanguage('hello', 'en'), 'en');
  assert.equal(detectLanguage('hello', 'vi'), 'vi');
});
