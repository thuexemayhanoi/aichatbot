import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResponder } from '../../src/core/responder.js';
import { business } from '../helpers/load-data.js';

function makeResponder(options = {}) {
  return createResponder({ business, ...options });
}

test('render produces the standard assistant message shape', () => {
  const message = makeResponder().render('Xin chào', { meta: { confidence: 1, source: 'faq-data' } });
  assert.equal(message.role, 'assistant');
  assert.equal(message.text, 'Xin chào');
  assert.equal(message.language, 'vi');
  assert.deepEqual(message.actions, []);
  assert.equal(message.meta.confidence, 1);
  assert.equal(message.meta.source, 'faq-data');
});

test('render resolves business templates', () => {
  const message = makeResponder().render('Địa chỉ: {{ business.address.full }}');
  assert.equal(message.text, `Địa chỉ: ${business.address.full}`);
});

test('render resolves nested contact fields', () => {
  const message = makeResponder().render('Gọi {{ business.contact.phone_display }}');
  assert.equal(message.text, 'Gọi 0942 467 674');
});

test('missing template paths resolve to empty string', () => {
  const message = makeResponder().render('A {{ business.does.not.exist }} B');
  assert.equal(message.text, 'A  B');
});

test('render keeps tel/https/mailto actions and drops everything else', () => {
  const message = makeResponder().render('Liên hệ', {
    actions: [
      { label: 'Gọi điện', href: business.contact.phone_uri },
      { label: 'Zalo', href: business.contact.zalo },
      { label: 'Maps', href: business.contact.maps },
      { label: 'Evil', href: 'javascript:alert(1)' },
      { label: 'Data', href: 'data:text/html,x' },
      { label: 'No protocol', href: 'www.example.com' }
    ],
    meta: { confidence: 1, source: 'business-data' }
  });
  assert.deepEqual(
    message.actions.map((a) => a.href),
    [business.contact.phone_uri, business.contact.zalo, business.contact.maps]
  );
});

test('render caps actions at three', () => {
  const message = makeResponder().render('ok', {
    actions: [
      { label: '1', href: 'tel:1' },
      { label: '2', href: 'tel:2' },
      { label: '3', href: 'tel:3' },
      { label: '4', href: 'tel:4' }
    ]
  });
  assert.equal(message.actions.length, 3);
});

test('actions without labels are dropped', () => {
  const message = makeResponder().render('ok', {
    actions: [{ href: 'tel:1' }, { label: 'ok', href: 'tel:2' }]
  });
  assert.deepEqual(message.actions, [{ label: 'ok', href: 'tel:2' }]);
});

test('confidence is clamped to 0..1 and defaults to 0', () => {
  const responder = makeResponder();
  assert.equal(responder.render('x', { meta: { confidence: 2 } }).meta.confidence, 1);
  assert.equal(responder.render('x', { meta: { confidence: -1 } }).meta.confidence, 0);
  assert.equal(responder.render('x', {}).meta.confidence, 0);
  assert.equal(responder.render('x', { meta: { confidence: 'high' } }).meta.confidence, 0);
});

test('language is configurable for future multilingual routing', () => {
  const message = makeResponder({ language: 'en' }).render('Hello');
  assert.equal(message.language, 'en');
});

test('render trims surrounding whitespace', () => {
  const message = makeResponder().render('  Xin chào  \n');
  assert.equal(message.text, 'Xin chào');
});

test('missing business object throws', () => {
  assert.throws(() => createResponder({}), TypeError);
  assert.throws(() => createResponder({ business: null }), TypeError);
});
