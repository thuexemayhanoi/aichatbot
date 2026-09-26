import test from 'node:test';
import assert from 'node:assert/strict';
import { business, pricing, faq } from '../helpers/load-data.js';

test('business contact facts are present and verified', () => {
  assert.equal(business.contact.phone, '0942467674');
  assert.equal(business.contact.zalo, 'https://zalo.me/0942467674');
  assert.equal(business.contact.phone_uri, 'tel:+84942467674');
});

test('opening hours are 09:00 to 21:00', () => {
  assert.equal(business.hours.openHour, 9);
  assert.equal(business.hours.closeHour, 21);
  assert.ok(business.hours.openHour < business.hours.closeHour);
});

test('deposit is the approved 2-5 million VND range', () => {
  assert.equal(business.policies.deposit.min, 2000000);
  assert.equal(business.policies.deposit.max, 5000000);
  assert.ok(business.policies.deposit.min < business.policies.deposit.max);
});

test('insurance is explicitly not provided', () => {
  assert.equal(business.policies.insurance.provided, false);
});

test('unknown facts stay null, never invented', () => {
  assert.equal(business.policies.delivery.fees, null);
  assert.equal(business.policies.rescue, null);
  assert.equal(business.policies.promotions, null);
});

test('pricing vehicle ids are unique', () => {
  const ids = pricing.vehicles.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('all rates are positive numbers or null', () => {
  for (const v of pricing.vehicles) {
    for (const type of ['day', 'week', 'month']) {
      for (const side of ['min', 'max']) {
        const value = v.rates[type][side];
        assert.ok(
          value === null || (typeof value === 'number' && value > 0),
          `${v.id}.${type}.${side} must be a positive number or null`
        );
      }
    }
  }
});

test('unconfirmed prices stay null (no invented zeros)', () => {
  for (const id of ['xe-50cc', 'electric-bike', 'electric-scooter']) {
    const v = pricing.vehicles.find((x) => x.id === id);
    for (const type of ['day', 'week', 'month']) {
      assert.equal(v.rates[type].min, null, `${id}.${type}.min`);
      assert.equal(v.rates[type].max, null, `${id}.${type}.max`);
    }
  }
});

test('known regression pricing values are preserved', () => {
  const find = (id) => pricing.vehicles.find((v) => v.id === id);
  assert.deepEqual(find('honda-vision').rates.week, { min: 800000, max: 1000000 });
  assert.deepEqual(find('honda-airblade').rates.month, { min: 1400000, max: 1400000 });
  assert.deepEqual(find('honda-click').rates.month, { min: 1000000, max: 1200000 });
  assert.deepEqual(find('honda-wave').rates.day, { min: 150000, max: 150000 });
});

test('faq keeps Vietnamese-first UI texts', () => {
  assert.ok(faq.assistant.greeting.includes('Xin chào'));
  assert.ok(faq.assistant.placeholder.length > 0);
  assert.ok(faq.assistant.not_found.includes('liên hệ'));
});

test('quick questions cover the core topics', () => {
  const ids = faq.quick_questions.map((q) => q.id);
  for (const expected of ['pricing', 'deposit', 'insurance', 'hours', 'phone', 'xe-50cc']) {
    assert.ok(ids.includes(expected), `missing quick question: ${expected}`);
  }
});

test('greeting microcopy (v52): exact customer-facing text', () => {
  assert.equal(faq.assistant.greeting, 'Xin chào! Mình là trợ lý của Nguyễn Tú. Thuê xe nhanh: tìm Google “Thuê xe máy Nguyễn Tú” để xem bản đồ và chỉ đường 😎');
});
