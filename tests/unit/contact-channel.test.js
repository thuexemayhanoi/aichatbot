import test from 'node:test';
import assert from 'node:assert/strict';
import { extractContactChannels } from '../../src/nlu/entities/contact-channel.js';
import { tokenize } from '../../src/nlu/tokenizer.js';

const c = (text) => extractContactChannels(tokenize(text)).map((x) => x.id);

test('detects zalo and whatsapp', () => {
  assert.deepEqual(c('zalo của bạn'), ['zalo']);
  assert.deepEqual(c('whatsapp'), ['whatsapp']);
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
