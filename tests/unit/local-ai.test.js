import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCapabilities } from '../../src/ai/capability.js';
import { createLocalLlm, DEFAULT_MODEL } from '../../src/ai/local-llm.js';
import { buildPrompt, validateLlmOutput, guardFacts, withDisclosure } from '../../src/ai/grounding.js';
import { business, pricing, faq } from '../helpers/load-data.js';

const DATA = { business, pricing, faq };

function env(overrides = {}) {
  return {
    navigator: {
      gpu: { requestAdapter() {} },
      deviceMemory: 8,
      hardwareConcurrency: 8,
      ...overrides.navigator
    },
    caches: { open() {} },
    ...overrides
  };
}

test('capability detection: WebGPU + memory + storage => local LLM allowed', () => {
  const caps = detectCapabilities(env());
  assert.equal(caps.webgpu, true);
  assert.equal(caps.canUseLocalLlm, true);
  assert.equal(caps.storage, true);
});

test('capability detection: no WebGPU => not allowed, reason recorded', () => {
  const caps = detectCapabilities(env({ navigator: { gpu: undefined, deviceMemory: 8 } }));
  assert.equal(caps.webgpu, false);
  assert.equal(caps.canUseLocalLlm, false);
  assert.match(caps.webgpuReason, /WebGPU/);
});

test('capability detection: low device memory declines LLM', () => {
  const caps = detectCapabilities(env({ navigator: { gpu: {}, deviceMemory: 1 } }));
  assert.equal(caps.canUseLocalLlm, false);
  assert.ok(caps.reasons.some((r) => r.includes('deviceMemory')));
});

test('capability detection: missing deviceMemory is not a hard block (null)', () => {
  const caps = detectCapabilities(env({ navigator: { gpu: { requestAdapter() {} }, deviceMemory: undefined } }));
  assert.equal(caps.deviceMemoryGb, null);
  assert.equal(caps.canUseLocalLlm, true);
});

test('local LLM never auto-loads and declines when WebGPU is missing', async () => {
  const llm = createLocalLlm({ env: { navigator: {} }, data: DATA });
  assert.equal(llm.state.status, 'idle');
  const ok = await llm.load();
  assert.equal(ok, false);
  assert.equal(llm.state.status, 'unsupported');
  assert.equal(await llm.answer('anything'), null);
});

test('local LLM model load failure falls back cleanly (no throw)', async () => {
  const llm = createLocalLlm({
    env: env(),
    data: DATA,
    importFn: async () => { throw new Error('network down'); }
  });
  const ok = await llm.load();
  assert.equal(ok, false);
  assert.equal(llm.state.status, 'failed');
  assert.match(llm.state.error, /network down/);
});

test('local LLM reports progress then becomes ready', async () => {
  const progressCalls = [];
  const llm = createLocalLlm({
    env: env(),
    data: DATA,
    importFn: async () => ({
      CreateMLCEngine: async (model, { initProgressCallback }) => {
        initProgressCallback({ progress: 0.4, text: 'shard 1/2' });
        initProgressCallback({ progress: 1, text: 'done' });
        return { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'ok' } }] }) } } };
      }
    })
  });
  const ok = await llm.load({ onProgress: (frac, text) => progressCalls.push([frac, text]) });
  assert.equal(ok, true);
  assert.equal(llm.state.status, 'ready');
  assert.deepEqual(progressCalls[0], [0.4, 'shard 1/2']);
});

test('answer() grounds in retrieved facts and guards numbers', async () => {
  const docs = [{ question: 'Giá thuê Honda Wave?', answer: 'Giá thuê Honda Wave: 150.000đ/ngày.' }];
  const llm = createLocalLlm({
    env: env(),
    data: DATA,
    retrieve: () => docs,
    importFn: async () => ({
      CreateMLCEngine: async () => ({
        chat: {
          completions: {
            create: async () => ({ choices: [{ message: { content: 'Honda Wave giá 150.000đ/ngày theo bảng giá.' } }] })
          }
        }
      })
    })
  });
  await llm.load();
  const result = await llm.answer('Wave giá bao nhiêu?');
  assert.ok(result);
  assert.equal(result.source, 'local-llm');
  assert.match(result.text, /150\.000đ/);
  assert.match(result.text, /AI tại chỗ/);
});

test('answer() rejects invented prices (fact guard)', async () => {
  const docs = [{ question: 'Giá thuê Honda Wave?', answer: 'Giá thuê Honda Wave: 150.000đ/ngày.' }];
  const llm = createLocalLlm({
    env: env(),
    data: DATA,
    retrieve: () => docs,
    importFn: async () => ({
      CreateMLCEngine: async () => ({
        chat: { completions: { create: async () => ({ choices: [{ message: { content: 'Honda Wave giá 99.000đ/ngày.' } }] }) } }
      })
    })
  });
  await llm.load();
  const result = await llm.answer('Wave giá bao nhiêu?');
  assert.equal(result, null, 'invented price must be rejected');
});

test('answer() declines when the model says NOINFO', async () => {
  const llm = createLocalLlm({
    env: env(),
    data: DATA,
    retrieve: () => [],
    importFn: async () => ({
      CreateMLCEngine: async () => ({
        chat: { completions: { create: async () => ({ choices: [{ message: { content: 'NOINFO' } }] }) } }
      })
    })
  });
  await llm.load();
  assert.equal(await llm.answer('random question'), null);
});

test('buildPrompt only passes repository-owned facts', () => {
  const { system, user } = buildPrompt({
    question: 'Where are you located?',
    docs: [{ question: 'Địa chỉ?', answer: '112 Nguyễn Văn Cừ' }],
    business
  });
  assert.match(system, /Do not invent/);
  assert.match(user, /112 Nguyễn Văn Cừ/);
  assert.match(user, /USER QUESTION: Where are you located\?/);
  assert.throws(() => buildPrompt({ question: '' }), TypeError);
});

test('validateLlmOutput rejects empty, oversized, echo and script output', () => {
  assert.equal(validateLlmOutput('  '), null);
  assert.equal(validateLlmOutput(null), null);
  assert.equal(validateLlmOutput('NOINFO'), null);
  assert.equal(validateLlmOutput('x'.repeat(1000)), null);
  assert.equal(validateLlmOutput('<script>alert(1)</script>'), null);
  assert.ok(validateLlmOutput('Bạn có thể gọi 0942 467 674 để xác nhận.'));
});

test('guardFacts only allows numbers present in verified context', () => {
  const docs = [{ answer: 'Giá 150.000đ/ngày. Đặt cọc 2.000.000đ.' }];
  assert.ok(guardFacts('Giá 150.000đ, cọc 2.000.000đ.', docs));
  assert.equal(guardFacts('Giá 120.000đ.', docs), false);
  assert.equal(guardFacts('Số 7 ngày.', docs), false);
});

test('withDisclosure appends the disclosure line once', () => {
  const text = withDisclosure('Hello', 'AI tại chỗ');
  assert.equal(text, 'Hello\n\n— AI tại chỗ');
  assert.equal(withDisclosure('Hello', ''), 'Hello');
});

test('default model is a small multilingual instruct model', () => {
  assert.match(DEFAULT_MODEL, /0\.5B/);
  assert.match(DEFAULT_MODEL, /Instruct/);
});
