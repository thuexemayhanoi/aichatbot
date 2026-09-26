import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCapabilities } from '../../src/ai/capability.js';
import { createLocalLlm, FRIENDLY_MESSAGES } from '../../src/ai/local-llm.js';
import { buildPrompt, validateLlmOutput, guardFacts, withDisclosure } from '../../src/ai/grounding.js';
import { business, pricing, faq } from '../helpers/load-data.js';
import { createWebllmImportFn, REALISTIC_MODEL_LIST } from '../helpers/webllm-stub.js';

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
  const caps = detectCapabilities(env({ navigator: { gpu: { requestAdapter() {} }, deviceMemory: 1 } }));
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

test('local LLM model load failure falls back cleanly (no throw, friendly message)', async () => {
  const llm = createLocalLlm({
    env: env(),
    data: DATA,
    importFn: async () => { throw new Error('network down'); }
  });
  const ok = await llm.load();
  assert.equal(ok, false);
  assert.equal(llm.state.status, 'failed');
  assert.match(llm.state.error, /network down/); // technical detail in state only
  assert.equal(llm.state.userMessage, FRIENDLY_MESSAGES.failed);
  assert.match(llm.state.userMessage, /Trợ lý cơ bản vẫn hoạt động bình thường/);
});

test('local LLM reports progress then becomes ready with a DISCOVERED model', async () => {
  const progressCalls = [];
  const llm = createLocalLlm({
    env: env(),
    data: DATA,
    importFn: createWebllmImportFn()
  });
  // Model ids must come from the module's model_list, never assumed.
  const stub = await createWebllmImportFn()();
  assert.ok(stub.prebuiltAppConfig.model_list.length > 0);

  const ok = await llm.load({ onProgress: (frac, text) => progressCalls.push([frac, text]) });
  assert.equal(ok, true);
  assert.equal(llm.state.status, 'ready');
  assert.ok(REALISTIC_MODEL_LIST.some((m) => m.model_id === llm.modelId));
  assert.deepEqual(progressCalls[0], [0.4, 'shard 1/2']);
});

test('empty model_list in the WebLLM module -> graceful friendly fallback', async () => {
  const llm = createLocalLlm({
    env: env(),
    data: DATA,
    importFn: createWebllmImportFn({ modelList: [] })
  });
  const ok = await llm.load();
  assert.equal(ok, false);
  assert.equal(llm.state.status, 'failed');
  assert.equal(llm.state.userMessage, FRIENDLY_MESSAGES.noModel);
  assert.equal(llm.modelId, null);
  assert.equal(await llm.answer('hi'), null);
});

test('engine init failure (e.g. model record missing) -> friendly message, never raw internals', async () => {
  const llm = createLocalLlm({
    env: env(),
    data: DATA,
    importFn: createWebllmImportFn({ engineError: 'Cannot find model record in appConfig for X' })
  });
  const ok = await llm.load();
  assert.equal(ok, false);
  // Raw technical text stays in state.error (console/diagnostics only)...
  assert.match(llm.state.error, /Cannot find model record/);
  // ...while the UI-facing message is friendly Vietnamese without internals.
  assert.equal(llm.state.userMessage, FRIENDLY_MESSAGES.failed);
  assert.doesNotMatch(llm.state.userMessage, /appConfig|model record|record/i);
  assert.match(llm.state.userMessage, /Trợ lý cơ bản vẫn hoạt động bình thường/);
});

test('no silent model download: engine is only created inside explicit load()', async () => {
  let inits = 0;
  const importFn = createWebllmImportFn();
  const wrapped = async () => {
    const mod = await importFn();
    return {
      ...mod,
      CreateMLCEngine: async (...args) => { inits += 1; return mod.CreateMLCEngine(...args); }
    };
  };
  const llm = createLocalLlm({ env: env(), data: DATA, importFn: wrapped });
  assert.equal(inits, 0, 'construction must not initialize any model');
  assert.equal(await llm.answer('hi'), null, 'answering before load must decline');
  assert.equal(inits, 0);
  await llm.load();
  assert.equal(inits, 1, 'exactly one init after explicit load');
});

test('answer() grounds in retrieved facts and guards numbers', async () => {
  const docs = [{ question: 'Giá thuê Honda Wave?', answer: 'Giá thuê Honda Wave: 150.000đ/ngày.' }];
  const llm = createLocalLlm({
    env: env(),
    data: DATA,
    retrieve: () => docs,
    importFn: createWebllmImportFn({ reply: 'Honda Wave giá 150.000đ/ngày theo bảng giá.' })
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
    importFn: createWebllmImportFn({ reply: 'Honda Wave giá 99.000đ/ngày.' })
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
    importFn: createWebllmImportFn({ reply: 'NOINFO' })
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

test('unload returns to idle and clears model selection', async () => {
  const llm = createLocalLlm({ env: env(), data: DATA, importFn: createWebllmImportFn() });
  await llm.load();
  assert.equal(llm.state.status, 'ready');
  llm.unload();
  assert.equal(llm.state.status, 'idle');
  assert.equal(await llm.answer('hi'), null);
});
