import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { business, pricing, faq } from '../helpers/load-data.js';
import { createLocalStore } from '../../src/storage/local-store.js';
import { createConfig } from '../../src/config/defaults.js';
import { createMotoApp } from '../../src/app/moto-app.js';
import {
  DEFAULT_CHIPS,
  nextSuggestions
} from '../../src/app/suggestions.js';

/**
 * v45 FOCUSED UI/UX POLISH — customer-facing brand spec.
 * Header, address consistency, Agent label, readiness status, quick chips.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const mainJs = readFileSync(join(ROOT, 'assets/js/main.js'), 'utf8');
const css = readFileSync(join(ROOT, 'assets/css/style.css'), 'utf8');
const embedJs = readFileSync(join(ROOT, 'embed.js'), 'utf8');

// --- 5. Header label ---
test('visible header title is "Hỗ trợ Agent" (MotoAI stays internal)', () => {
  assert.match(html, /<h1 class="motoai-title">Hỗ trợ Agent<\/h1>/);
});

// --- 6. Header subtitle / address ---
test('visible subtitle contains the verified business address', () => {
  const m = /<p class="motoai-subtitle"[^>]*>([^<]+)<\/p>/.exec(html);
  assert.ok(m, 'subtitle element present');
  assert.ok(m[1].includes(business.address.full), 'subtitle shows business.address.full');
  assert.equal(m[1], `Thuê xe máy ${business.brand} — ${business.address.full}`);
});

test('subtitle and status wrap instead of clipping on small screens', () => {
  assert.match(css, /\.motoai-subtitle\s*\{[^}]*white-space:\s*normal/);
  assert.match(css, /\.motoai-status\s*\{[^}]*white-space:\s*normal/);
});

// --- 7. Location answer consistency ---
test('verified address is the single source of truth everywhere', () => {
  assert.equal(business.address.full, '112 Nguyễn Văn Cừ, Long Biên, Hà Nội');
  assert.equal(business.address.street, '112 Nguyễn Văn Cừ');
  assert.equal(business.address.district, 'Long Biên');
  assert.ok(html.includes(business.address.full), 'header subtitle shows the same address');
  // No stale full-address variant anywhere in customer UI files.
  assert.ok(!html.includes('Bồ Đề, Long Biên'));
  assert.ok(!mainJs.includes('Bồ Đề, Long Biên'));
});

const DATA = { business, pricing, faq };
let counter = 0;
function createApp() {
  return createMotoApp({
    data: DATA,
    store: createLocalStore({ namespace: `motoai-brand-${++counter}` }),
    scope: `brand-${counter}`,
    config: createConfig()
  });
}

test('location queries return exactly the verified address', async () => {
  for (const q of ['Địa chỉ ở đâu?', 'Cho tôi địa chỉ', 'Where are you located?']) {
    const app = createApp();
    const r = await app.send(q);
    assert.ok(
      r.reply.text.includes(business.address.full),
      `query "${q}" must contain ${business.address.full}`
    );
    assert.match(r.source, /^business-data/, 'answer must come from verified business data');
  }
});

// --- 3. Agent label, 4. no model id, 8. short statuses ---
test('normal UI uses "Agent", never the old "AI tại chỗ" label', () => {
  for (const [name, source] of [['index.html', html], ['main.js', mainJs]]) {
    assert.ok(!source.includes('AI tại chỗ'), `${name} must not show "AI tại chỗ"`);
  }
  assert.match(html, /⚡ Agent/);
  assert.match(html, /Agent \(tùy chọn, nâng cao\)/);
});

test('embed default title is customer-facing "Hỗ trợ Agent"', () => {
  assert.match(embedJs, /title: 'Hỗ trợ Agent'/);
  assert.ok(!/"MotoAI"/.test(embedJs), 'launcher default must not say MotoAI');
});

test('successful Agent load never exposes the model id in UI text', () => {
  assert.ok(!mainJs.includes('modelId'), 'main.js must not read modelId into any UI string');
  assert.ok(!mainJs.includes('Qwen'), 'no model family names in normal UI');
  assert.match(mainJs, /Agent sẵn sàng/);
});

test('the long technical ready message is removed; status auto-hides', () => {
  assert.ok(!mainJs.includes('đã sẵn sàng ('), 'long ready line with model id must be gone');
  assert.ok(!mainJs.includes('Chạy 100% trên máy bạn'));
  assert.ok(!mainJs.includes('Đang chuẩn bị AI tại chỗ'));
  assert.match(mainJs, /Đang chuẩn bị Agent/);
  // Ready line is transient: auto-hidden after a short delay.
  assert.match(mainJs, /setTimeout/);
  assert.match(mainJs, /'Agent chưa dùng được trên thiết bị này\./);
});

// --- 1 + 2. Quick chips ---
test('primary chip bar defaults to exactly 4 compact chips', () => {
  assert.equal(DEFAULT_CHIPS.length, 4);
  const labels = DEFAULT_CHIPS.map((c) => c.label);
  assert.deepEqual(labels, ['💰 Giá thuê', '🛵 Xe ga', '🏍️ Xe số', '📅 Theo tháng']);
  for (const chip of DEFAULT_CHIPS) {
    assert.ok(chip.query && typeof chip.query === 'string', 'chip must carry an engine query');
    assert.ok(!/\d{3}\.\d{3}đ/.test(chip.label + chip.query), 'no prices hard-coded in the UI');
  }
});

test('old crowded chip set is not the default anymore', () => {
  const queries = DEFAULT_CHIPS.map((c) => c.query).join(' ');
  for (const old of ['Bảng giá', 'Tính giá', 'Giờ mở cửa', 'Số điện thoại']) {
    assert.ok(!queries.includes(old), `old chip "${old}" must not be in the primary bar`);
  }
});

test('dynamic suggestions are deterministic from intent/context (never LLM)', () => {
  const price = nextSuggestions({ intentId: 'price_query', slots: {} });
  assert.deepEqual(price.map((c) => c.label), ['1 ngày', '1 tuần', '1 tháng', 'Đặt xe']);

  const vehicle = nextSuggestions({ intentId: 'bike_type_query', slots: {} });
  assert.deepEqual(vehicle.map((c) => c.label), ['Vision', 'Air Blade', 'Theo tuần', 'Theo tháng']);

  const withVehicle = nextSuggestions({ intentId: 'recommendation_query', slots: { vehicle: { id: 'honda-vision' } } });
  assert.equal(withVehicle[0].label, '1 ngày');

  const contact = nextSuggestions({ intentId: 'location_query', slots: {} });
  assert.deepEqual(contact.map((c) => c.label), ['Chỉ đường', 'Gọi điện', 'Zalo', 'Giờ mở cửa']);

  assert.equal(nextSuggestions({ intentId: null, slots: {} }), DEFAULT_CHIPS);
  assert.equal(nextSuggestions({}), DEFAULT_CHIPS);
});

test('every chip query is answered by the deterministic engine (no fallback)', async () => {
  const all = [
    ...DEFAULT_CHIPS,
    ...nextSuggestions({ intentId: 'price_query', slots: {} }),
    ...nextSuggestions({ intentId: 'bike_type_query', slots: {} }),
    ...nextSuggestions({ intentId: 'location_query', slots: {} })
  ];
  const seen = new Set();
  for (const chip of all) {
    if (seen.has(chip.query)) continue;
    seen.add(chip.query);
    const app = createApp();
    const r = await app.send(chip.query);
    assert.ok(r.reply.text.length > 0, `chip "${chip.label}" must produce an answer`);
    assert.notEqual(r.source, 'local-llm', 'chips must never rely on the LLM');
  }
});
