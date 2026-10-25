import test from 'node:test';
import assert from 'node:assert/strict';
import { business, pricing, faq } from '../helpers/load-data.js';

test('NAP includes the verified Bồ Đề locality', () => {
  assert.equal(business.address.street, '112 Nguyễn Văn Cừ');
  assert.equal(business.address.ward, 'Bồ Đề');
  assert.equal(business.address.district, 'Long Biên');
  assert.equal(business.address.full, '112 Nguyễn Văn Cừ, Bồ Đề, Long Biên, Hà Nội');
});

test('business contact facts are present and verified', () => {
  assert.equal(business.contact.phone, '0942467674');
  assert.equal(business.contact.whatsapp, 'https://wa.me/84942467674');
  assert.equal(business.contact.phone_uri, 'tel:+84942467674');
  assert.equal(business.contact.zalo, undefined); // v57: Zalo removed from the public surface
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
  // Owner table: electric vehicles are "Liên hệ" for every unit, the 50cc scooter for week/month.
  const unpriced = { 'electric-bike': ['day', 'week', 'month'], 'electric-scooter': ['day', 'week', 'month'], 'xe-50cc': ['week', 'month'] };
  for (const [id, types] of Object.entries(unpriced)) {
    const v = pricing.vehicles.find((x) => x.id === id);
    for (const type of types) {
      assert.equal(v.rates[type].min, null, `${id}.${type}.min`);
      assert.equal(v.rates[type].max, null, `${id}.${type}.max`);
    }
  }
});

test('known pricing values match the owner table (full table: tests/unit/pricing-owner-table.test.js)', () => {
  const find = (id) => pricing.vehicles.find((v) => v.id === id);
  assert.deepEqual(find('honda-vision').rates.week, { min: 1000000, max: 1000000 });
  assert.deepEqual(find('honda-airblade').rates.month, { min: 1500000, max: 1500000 });
  assert.deepEqual(find('honda-click').rates.month, { min: 900000, max: 1200000 });
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
