import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotoApp } from '../../src/app/moto-app.js';
import { createLocalStore } from '../../src/storage/local-store.js';
import { createConfig } from '../../src/config/defaults.js';
import { business, pricing, faq } from '../helpers/load-data.js';
import { createWebllmImportFn } from '../helpers/webllm-stub.js';

const DATA = { business, pricing, faq };

let counter = 0;

/** Deterministic idle: the browser defers to requestIdleCallback — tests
 *  flush it immediately so warm-up gating is observable without timers. */
function makeEnv(navigatorOverrides = {}) {
  return {
    navigator: {
      gpu: { requestAdapter() {} },
      deviceMemory: 8,
      hardwareConcurrency: 8,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126',
      platform: 'Linux x86_64',
      maxTouchPoints: 0,
      ...navigatorOverrides
    },
    caches: { open() {} },
    requestIdleCallback: (fn) => { fn(); return 1; }
  };
}

const IPAD_NAV = {
  deviceMemory: undefined, // Safari never exposes it
  hardwareConcurrency: 6,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15',
  platform: 'MacIntel',
  maxTouchPoints: 5
};

function createApp(env, { importFn, semanticImportFn } = {}) {
  return createMotoApp({
    data: DATA,
    store: createLocalStore({ namespace: `motoai-gating-${++counter}` }),
    scope: `gating-${counter}`,
    config: createConfig(),
    env,
    ...(importFn ? { importFn } : {}),
    ...(semanticImportFn ? { semanticImportFn } : {})
  });
}

function semanticSpy() {
  const calls = [];
  const importFn = async (url) => {
    calls.push(url);
    return { pipeline: async () => ({}) };
  };
  return { importFn, get calls() { return calls; } };
}

// ---------- 6. lowResource devices never warm the semantic model ----------

test('v65: lowResource (iPad) => semantic layer disabled, BM25-only, model never imported', async () => {
  const spy = semanticSpy();
  const app = createApp(makeEnv(IPAD_NAV), { semanticImportFn: spy.importFn });
  assert.equal(app.capabilities.lowResource, true);
  assert.equal(app.search.semanticEnabled, false);
  await app.send('Wave 1 ngày bao nhiêu?');
  assert.equal(spy.calls.length, 0, 'Transformers.js must never load on a weak device');
  assert.equal(app.search.semantic.state.status, 'idle');
});

// ---------- 7. Semantic never competes with a live local LLM ----------

test('v65: semantic is NOT warmed while the local LLM is READY (one AI workload max)', async () => {
  const spy = semanticSpy();
  const app = createApp(makeEnv(), { importFn: createWebllmImportFn(), semanticImportFn: spy.importFn });
  assert.equal(await app.localLlm.load(), true);
  assert.equal(app.localLlm.state.status, 'ready');
  await app.send('Bạn có giao xe tận nơi không?');
  assert.equal(spy.calls.length, 0, 'no semantic warm-up next to a ready engine');
  assert.equal(app.search.semantic.state.status, 'idle');
});

test('v65: semantic is NOT warmed while the local LLM is LOADING', async () => {
  const spy = semanticSpy();
  // An import that never settles keeps the engine in `loading`.
  const hangingImportFn = () => new Promise(() => {});
  const app = createApp(makeEnv(), { importFn: hangingImportFn, semanticImportFn: spy.importFn });
  const loading = app.localLlm.load(); // not awaited: stays in-flight
  assert.equal(app.localLlm.state.status, 'loading');
  await app.send('Cho mình hỏi giá thuê xe máy?');
  assert.equal(spy.calls.length, 0, 'warm-up must wait, not share RAM with a loading engine');
  assert.equal(app.search.semantic.state.status, 'idle');
  void loading; // the hanging promise resolves never; nothing waits on it
});

test('v65: strong desktop + no LLM activity => semantic warm-up IS scheduled (idle)', async () => {
  const spy = semanticSpy();
  const app = createApp(makeEnv(), { semanticImportFn: spy.importFn });
  await app.send('Bạn có giao xe tận nơi không?');
  assert.equal(spy.calls.length, 1, 'idle warm-up still happens on capable devices');
});

// ---------- 9. Deterministic assistant fully works with AI layers off ----------

test('v65: with Local AI + semantic disabled, deterministic answers still carry verified prices', async () => {
  const spy = semanticSpy();
  const app = createApp(makeEnv(IPAD_NAV), { semanticImportFn: spy.importFn });
  const { reply, source } = await app.send('Wave 1 ngày bao nhiêu?');
  const wave = pricing.vehicles.find((v) => v.id === 'honda-wave');
  assert.equal(source, 'pricing-data');
  assert.ok(reply.text.includes(wave.rates.day.min.toLocaleString('vi-VN')), 'verified price present');
  assert.ok(typeof reply.text === 'string' && reply.text.length > 0, 'never a blank answer');
});

test('v65: with AI layers disabled, contact facts still answer from business data', async () => {
  const spy = semanticSpy();
  const app = createApp(makeEnv(IPAD_NAV), { semanticImportFn: spy.importFn });
  const { reply, source } = await app.send('Địa chỉ ở đâu?');
  assert.match(source, /^business-data|^business-rules|^rules/);
  assert.ok(reply.text.includes(business.address.full), 'verified address present');
});
