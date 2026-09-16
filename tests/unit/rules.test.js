import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuleRegistry } from '../../src/rules/registry.js';
import { business, pricing, faq } from '../helpers/load-data.js';

const OPEN_AT_TEN = () => new Date('2026-09-16T03:00:00Z'); // 10:00 Asia/Ho_Chi_Minh
const CLOSED_AT_MIDNIGHT = () => new Date('2026-09-16T17:30:00Z'); // 00:30 Asia/Ho_Chi_Minh

function makeRegistry() {
  return createRuleRegistry({ business, pricing, faq });
}

/** Build a minimal analysis object by intent id (rules only read these fields). */
function analysis(intentId, { normalized = '', entities = {} } = {}) {
  return { intent: { id: intentId, score: 1 }, entities, normalized };
}

const EMPTY_SLOTS = { vehicle: null, durationDays: null, location: null };

test('registry exposes priority-ordered rules and a separate fallback', () => {
  const { rules, fallback } = makeRegistry();
  assert.ok(rules.length >= 10);
  assert.equal(fallback.id, 'fallback-rule');
  const ids = rules.map((r) => r.id);
  // Specific business facts must answer before catalog/price rules.
  assert.ok(ids.indexOf('deposit-rule') < ids.indexOf('pricing-rule'));
  assert.ok(ids.indexOf('contact-rule') < ids.indexOf('pricing-rule'));
  assert.ok(ids.indexOf('hours-rule') < ids.indexOf('bike-type-rule'));
  assert.ok(ids.indexOf('pricing-rule') < ids.indexOf('duration-rule'));
  assert.ok(!ids.includes('fallback-rule'));
});

test('registry validates its data inputs', () => {
  assert.throws(() => createRuleRegistry({}), TypeError);
  assert.throws(() => createRuleRegistry({ business: {}, pricing: {} }), TypeError);
});

test('hours-rule answers with pinned hours and live open status', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'hours-rule');
  const result = rule.respond(analysis('hours_query'), EMPTY_SLOTS, { now: OPEN_AT_TEN });
  assert.equal(result.handled, true);
  assert.ok(result.answer.includes('09:00 - 21:00'));
  assert.ok(result.answer.includes('đang mở cửa'));
  assert.ok(result.answer.includes('Không giao xe ngoài giờ hoạt động'));
  assert.equal(result.source, 'business-data');
});

test('hours-rule reports closed outside business hours (Hanoi time zone)', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'hours-rule');
  const result = rule.respond(analysis('hours_query'), EMPTY_SLOTS, { now: CLOSED_AT_MIDNIGHT });
  assert.ok(result.answer.includes('đang đóng cửa'));
});

test('deposit-rule returns the pinned deposit note', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'deposit-rule');
  const result = rule.respond(analysis('deposit_query'), EMPTY_SLOTS);
  assert.equal(result.answer, business.policies.deposit.note);
  assert.ok(result.answer.includes('2.000.000đ'));
  assert.ok(result.answer.includes('5.000.000đ'));
  assert.equal(result.confidence, 1);
});

test('contact-rule answers phone by default with call and zalo actions', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'contact-rule');
  const result = rule.respond(analysis('contact_query'), EMPTY_SLOTS);
  assert.ok(result.answer.includes('0942 467 674'));
  assert.deepEqual(result.actions, [
    { label: 'Gọi điện', href: business.contact.phone_uri },
    { label: 'Zalo', href: business.contact.zalo }
  ]);
});

test('contact-rule follows the detected channel', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'contact-rule');
  const zalo = rule.respond(analysis('contact_query', { entities: { contactChannels: [{ id: 'zalo' }] } }), EMPTY_SLOTS);
  assert.ok(zalo.answer.includes('Zalo'));
  const maps = rule.respond(analysis('contact_query', { entities: { contactChannels: [{ id: 'maps' }] } }), EMPTY_SLOTS);
  assert.ok(maps.answer.includes('Google Maps'));
  const email = rule.respond(analysis('contact_query', { entities: { contactChannels: [{ id: 'email' }] } }), EMPTY_SLOTS);
  assert.ok(email.answer.includes(business.contact.email));
});

test('delivery-rule confirms a known service area', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'delivery-rule');
  const result = rule.respond(
    analysis('delivery_query', { entities: { locations: [{ name: 'Tây Hồ' }] } }),
    EMPTY_SLOTS
  );
  assert.ok(result.answer.includes('Tây Hồ'));
  assert.ok(result.answer.includes('09:00 - 21:00'));
  assert.equal(result.source, 'business-data');
});

test('delivery-rule honestly reports unknown areas and lists known ones', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'delivery-rule');
  const result = rule.respond(analysis('delivery_query'), EMPTY_SLOTS); // e.g. "giao xe Hà Đông được không"
  assert.ok(result.answer.includes('chưa có thông tin chắc chắn'));
  assert.ok(result.answer.includes('Long Biên'));
  assert.ok(result.answer.includes('xác nhận'));
  assert.equal(result.source, 'unknown');
  assert.ok(result.confidence < 1);
});

test('return-rule is an honest unknown, never invented', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'return-rule');
  const result = rule.respond(analysis('return_query'), EMPTY_SLOTS);
  assert.ok(result.answer.includes('chưa có thông tin chắc chắn'));
  assert.ok(result.answer.includes('0942 467 674'));
  assert.equal(result.source, 'unknown');
});

test('policy-rule answers insurance with the pinned note', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'policy-rule');
  const result = rule.respond(analysis('policy_query', { normalized: 'thue xe co bao hiem khong' }), EMPTY_SLOTS);
  assert.equal(result.answer, business.policies.insurance.note);
  assert.equal(result.confidence, 1);
});

test('policy-rule treats documents and other policies as honest unknowns', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'policy-rule');
  for (const [intentId, normalized] of [
    ['documents_query', 'thue xe can giay to gi'],
    ['policy_query', 'chinh sach huy xe the nao']
  ]) {
    const result = rule.respond(analysis(intentId, { normalized }), EMPTY_SLOTS);
    assert.equal(result.handled, true);
    assert.ok(result.answer.includes('chưa có thông tin chắc chắn'));
    assert.equal(result.source, 'unknown');
  }
});

test('location-rule answers with the authoritative address', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'location-rule');
  const result = rule.respond(analysis('location_query'), EMPTY_SLOTS);
  assert.ok(result.answer.includes(business.address.full));
  assert.deepEqual(result.actions, [{ label: 'Xem bản đồ', href: business.contact.maps }]);
});

test('bike-type-rule lists categories from the pricing data', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'bike-type-rule');
  const result = rule.respond(analysis('bike_type_query'), EMPTY_SLOTS);
  assert.ok(result.answer.includes('Xe số'));
  assert.ok(result.answer.includes('Honda Vision'));
  assert.ok(result.answer.includes('Xe tay ga'));
  assert.equal(result.source, 'pricing-data');
});

test('bike-type-rule answers a known displacement and honestly rejects unknown ones', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'bike-type-rule');
  const known = rule.respond(
    analysis('bike_type_query', { entities: { displacements: [{ cc: 50, raw: '50cc' }] } }),
    EMPTY_SLOTS
  );
  assert.ok(known.answer.includes('Xe 50cc'));
  const unknown = rule.respond(
    analysis('bike_type_query', { entities: { displacements: [{ cc: 125, raw: '125cc' }] } }),
    EMPTY_SLOTS
  );
  assert.ok(unknown.answer.includes('125cc'));
  assert.ok(unknown.answer.includes('chưa có thông tin'));
  assert.equal(unknown.source, 'unknown');
});

test('greeting-rule uses the faq greeting', () => {
  const { rules } = makeRegistry();
  const rule = rules.find((r) => r.id === 'greeting-rule');
  const result = rule.respond(analysis('greeting'), EMPTY_SLOTS);
  assert.equal(result.answer, faq.assistant.greeting);
});

test('fallback-rule always handles with the honest not-found text', () => {
  const { fallback } = makeRegistry();
  assert.equal(fallback.canHandle(analysis('unknown'), EMPTY_SLOTS), true);
  const result = fallback.respond(analysis('unknown'), EMPTY_SLOTS);
  assert.equal(result.answer, faq.assistant.not_found);
  assert.equal(result.source, 'fallback');
  assert.ok(result.confidence < 0.5);
});
