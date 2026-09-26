import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBestLocalModel, MODEL_CANDIDATES, paramsOf } from '../../src/ai/model-selection.js';
import { REALISTIC_MODEL_LIST } from '../helpers/webllm-stub.js';

const CAPS_OK = { canUseLocalLlm: true, webgpu: true, deviceMemoryGb: 8 };
const CAPS_NONE = { canUseLocalLlm: false, webgpu: false };

test('selected model always exists in the provided model list', () => {
  const selection = selectBestLocalModel({ modelList: REALISTIC_MODEL_LIST, capabilities: CAPS_OK });
  assert.ok(selection);
  assert.ok(REALISTIC_MODEL_LIST.some((m) => m.model_id === selection.modelId));
  assert.equal(selection.modelId, 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
});

test('empty or missing model list -> graceful null (Local AI stays disabled)', () => {
  assert.equal(selectBestLocalModel({ modelList: [], capabilities: CAPS_OK }), null);
  assert.equal(selectBestLocalModel({ modelList: null, capabilities: CAPS_OK }), null);
  assert.equal(selectBestLocalModel({ capabilities: CAPS_OK }), null);
  assert.equal(selectBestLocalModel({ capabilities: CAPS_OK }), null);
});

test('WebGPU unavailable -> selection declines gracefully', () => {
  assert.equal(selectBestLocalModel({ modelList: REALISTIC_MODEL_LIST, capabilities: CAPS_NONE }), null);
});

test('invalid hard-coded ids can never be selected (verified against model_list)', () => {
  // The exact v42 bug id: wrong suffix format. It must be ignored.
  const candidates = ['Qwen2.5-0.5B-Instruct-q4f16_1MLC', 'Definitely-Not-A-Model'];
  const selection = selectBestLocalModel({ modelList: REALISTIC_MODEL_LIST, capabilities: CAPS_OK, candidates });
  assert.equal(selection, null, 'unavailable candidates must not resolve to a broken id');
});

test('falls back to second preference when the first is absent', () => {
  const withoutQwen25 = REALISTIC_MODEL_LIST.filter((m) => !m.model_id.startsWith('Qwen2.5'));
  const selection = selectBestLocalModel({ modelList: withoutQwen25, capabilities: CAPS_OK });
  assert.ok(selection);
  assert.equal(selection.modelId, 'Qwen3-0.6B-q4f16_1-MLC');
});

test('no preferred candidate available -> deterministic scoring picks a safe small model', () => {
  const list = [
    { model_id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', vram_required_MB: 1128.82, low_resource_required: true },
    { model_id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', vram_required_MB: 6100 },
    { model_id: 'OLMo-2-0425-1B-Instruct-q4f32_1-MLC', vram_required_MB: 2200 }
  ];
  const selection = selectBestLocalModel({ modelList: list, capabilities: CAPS_OK });
  assert.equal(selection.modelId, 'Llama-3.2-1B-Instruct-q4f16_1-MLC');
});

test('models larger than the safe ceiling are never selected', () => {
  const list = [
    { model_id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', vram_required_MB: 6100 },
    { model_id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', vram_required_MB: 5700 }
  ];
  assert.equal(selectBestLocalModel({ modelList: list, capabilities: CAPS_OK }), null);
});

test('low device memory excludes models that do not fit', () => {
  const selection = selectBestLocalModel({ modelList: REALISTIC_MODEL_LIST, capabilities: CAPS_OK, deviceMemoryGb: 1 });
  assert.equal(selection, null, '1GB devices have no safe model');
  const ok = selectBestLocalModel({ modelList: REALISTIC_MODEL_LIST, capabilities: CAPS_OK, deviceMemoryGb: 4 });
  assert.equal(ok?.modelId, 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
});

test('preference list contains only small multilingual instruct candidates', () => {
  for (const id of MODEL_CANDIDATES) {
    assert.match(id, /Instruct|Qwen3/);
    const params = paramsOf(id);
    assert.ok(params === null || params <= 1.5, `${id} exceeds the safe size ceiling`);
  }
});

test('paramsOf extracts parameter counts deterministically', () => {
  assert.equal(paramsOf('Qwen2.5-0.5B-Instruct-q4f16_1-MLC'), 0.5);
  assert.equal(paramsOf('Llama-3.1-8B-Instruct-q4f16_1-MLC'), 8);
  assert.equal(paramsOf('tinyllama'), null);
});
