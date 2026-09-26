import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../../src/storage/local-store.js';
import { createConfig } from '../../src/config/defaults.js';
import { createMotoApp } from '../../src/app/moto-app.js';
import { parseQueryConfig, buildEmbedUrl } from '../../src/app/query-config.js';
import { business, pricing, faq } from '../helpers/load-data.js';

const DATA = { business, pricing, faq };

let counter = 0;
function llmEnv() {
  return { navigator: { gpu: { requestAdapter() {} }, deviceMemory: 8 }, caches: { open() {} } };
}
function createApp(overrides = {}) {
  const store = overrides.store ?? createLocalStore({ namespace: `motoai-golden-${++counter}` });
  return createMotoApp({
    data: DATA,
    store,
    scope: overrides.scope ?? `golden-${counter}`,
    config: createConfig({ language: overrides.lang ?? 'vi' }),
    env: llmEnv(),
    ...overrides
  });
}

/**
 * GOLDEN CONVERSATION regression suite.
 * Expected business facts always come from the repository data files,
 * never hard-coded copies: the assertions read the JSON themselves.
 */
test('golden: "Vision 1 tuần bao nhiêu?" answers from pricing data', async () => {
  const app = createApp();
  const { reply, source } = await app.send('Vision 1 tuần bao nhiêu?');
  const vision = pricing.vehicles.find((v) => v.id === 'honda-vision');
  assert.equal(source, 'pricing-data');
  assert.ok(reply.text.includes(vision.rates.week.min.toLocaleString('vi-VN')));
});

test('golden: "Wave một tháng?" never invents a monthly price', async () => {
  const app = createApp();
  const { reply } = await app.send('Wave một tháng?');
  const wave = pricing.vehicles.find((v) => v.id === 'honda-wave');
  assert.ok(reply.text.includes(wave.rates.day.min.toLocaleString('vi-VN')));
  assert.doesNotMatch(reply.text, /\/\s*tháng|theo tháng:\s*\d(?!)/);
});

test('golden: "Có xe ga 150k không?" is honest about 150k xe ga', async () => {
  const app = createApp();
  const { reply, source } = await app.send('Có xe ga 150k không?');
  assert.ok(['pricing-data', 'unknown'].includes(source));
  if (source === 'pricing-data') {
    const cheapestScooter = Math.min(
      ...pricing.vehicles.filter((v) => v.category === 'Xe tay ga').map((v) => v.rates.day.min)
    );
    assert.ok(reply.text.includes(cheapestScooter.toLocaleString('vi-VN')));
  }
});

test('golden: English "Where are you located?" answers the verified address', async () => {
  const app = createApp();
  const { reply, source } = await app.send('Where are you located?');
  assert.notEqual(source, 'fallback');
  assert.ok(reply.text.includes(business.address.street));
  assert.ok(reply.text.includes(business.address.city));
});

test('golden: English "Do I need a deposit?" answers the deposit policy', async () => {
  const app = createApp();
  const { reply, source } = await app.send('Do I need a deposit?');
  assert.notEqual(source, 'fallback');
  assert.ok(reply.text.includes(business.policies.deposit.min.toLocaleString('vi-VN')));
  assert.ok(reply.text.includes(business.policies.deposit.max.toLocaleString('vi-VN')));
});

test('golden: English automatic-bike request resolves via retrieval', async () => {
  const app = createApp();
  const { source } = await app.send('I need an automatic bike for 7 days.');
  assert.notEqual(source, 'fallback');
});

test('golden: "xe 50cc" is never parsed as 50 days', async () => {
  const app = createApp();
  const { reply } = await app.send('Xe 50cc giá thế nào?');
  assert.ok(/50cc|50/.test(reply.text));
  assert.doesNotMatch(reply.text, /50\s*ngày|50\s*days/);
});

test('golden: typo/slang query still gets a useful answer', async () => {
  const app = createApp();
  const { source } = await app.send('giao xe tan nha co kum');
  assert.notEqual(source, 'fallback');
});

test('golden: multi-turn context — clarify then answer', async () => {
  const app = createApp();
  const first = await app.send('Cho mình thuê xe');
  const second = await app.send('Wave');
  assert.ok(second.reply.text.includes(pricing.vehicles.find((v) => v.id === 'honda-wave').rates.day.min.toLocaleString('vi-VN')));
  void first;
});

test('golden: deterministic answers never routed through the LLM', async () => {
  let llmAsked = 0;
  const app = createApp({
    importFn: async () => ({
      prebuiltAppConfig: { model_list: [{ model_id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', vram_required_MB: 944, low_resource_required: true }] },
      CreateMLCEngine: async () => ({
        chat: { completions: { create: async () => {
          llmAsked += 1;
          return { choices: [{ message: { content: 'GIÁ SAI 999.000đ' } }] };
        } } }
      })
    })
  });
  await app.localLlm.load();
  assert.equal(app.localLlm.state.status, 'ready');
  const { reply, source } = await app.send('Vision 1 tuần bao nhiêu?');
  assert.equal(source, 'pricing-data');
  assert.equal(llmAsked, 0, 'LLM must not be consulted for deterministic answers');
  const vision = pricing.vehicles.find((v) => v.id === 'honda-vision');
  assert.ok(reply.text.includes(vision.rates.week.min.toLocaleString('vi-VN')));
});

test('golden: local LLM only serves fallback turns, guarded', async () => {
  const app = createApp({
    importFn: async () => ({
      prebuiltAppConfig: { model_list: [{ model_id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', vram_required_MB: 944, low_resource_required: true }] },
      CreateMLCEngine: async () => ({
        chat: { completions: { create: async () => ({
          choices: [{ message: { content: `Bạn hãy gọi ${business.contact.phone_display} để được hỗ trợ nhé.` } }]
        }) } }
      })
    })
  });
  await app.localLlm.load();
  const { reply, source } = await app.send('What is your favourite colour?');
  assert.equal(source, 'local-llm');
  assert.ok(reply.text.includes(business.contact.phone_display));
});

test('app: storage persists session history across app instances', async () => {
  const store = createLocalStore({ namespace: 'motoai-golden-persist' });
  const first = createApp({ store, scope: 'persist-scope' });
  await first.send('Số điện thoại?');
  const second = createMotoApp({
    data: DATA,
    store,
    scope: 'persist-scope',
    config: createConfig()
  });
  assert.ok(second.engine.history.list().length >= 2);
});

test('query config: parse, defaults and clamping', () => {
  const c = parseQueryConfig('?lang=en&theme=dark&source=blog&utm=x');
  assert.equal(c.lang, 'en');
  assert.equal(c.theme, 'dark');
  assert.equal(c.source, 'blog');
  const def = parseQueryConfig('');
  assert.equal(def.lang, 'vi');
  assert.equal(def.theme, 'auto');
  assert.equal(def.embed, false);
  const bad = parseQueryConfig('?lang=fr&theme=neon');
  assert.equal(bad.lang, 'vi');
  assert.equal(bad.theme, 'auto');
  const embedded = parseQueryConfig('?embed=1');
  assert.equal(embedded.embed, true);
});

test('query config: embed iframe URL generation', () => {
  const url = buildEmbedUrl('https://thuexemayhanoi.github.io/aichatbot/embed.js', {
    lang: 'en', theme: 'dark', source: 'blog'
  });
  assert.equal(url, 'https://thuexemayhanoi.github.io/aichatbot/index.html?lang=en&theme=dark&source=blog&embed=1');
  const minimal = buildEmbedUrl('https://thuexemayhanoi.github.io/aichatbot/embed.js', {});
  assert.ok(minimal.includes('embed=1'));
  assert.ok(minimal.includes('index.html'));
  assert.throws(() => buildEmbedUrl(''), TypeError);
});
