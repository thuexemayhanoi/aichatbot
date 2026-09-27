import test from 'node:test';
import assert from 'node:assert/strict';
import { extractContactChannels } from '../../src/nlu/entities/contact-channel.js';
import { tokenize } from '../../src/nlu/tokenizer.js';

const c = (text) => extractContactChannels(tokenize(text)).map((x) => x.id);

test('detects whatsapp', () => {
  assert.deepEqual(c('whatsapp của bạn'), ['whatsapp']);
});

test('zalo is no longer a supported channel', () => {
  assert.equal(c('zalo của bạn').length, 0);
});

test('detects phone channel', () => {
  assert.ok(c('số điện thoại là gì').includes('phone'));
  assert.ok(c('sdt').includes('phone'));
});

test('detects maps', () => {
  assert.ok(c('google maps').includes('maps'));
});

test('no channels in a plain question', () => {
  assert.equal(c('thuê xe 50cc').length, 0);
});
