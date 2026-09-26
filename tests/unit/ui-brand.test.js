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
  nextSuggestions,
  resolveChipHref
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

// --- 5d. ROOT URL = THE CHAT APPLICATION (explicit acceptance contract) ---
test('root app contract: body opens directly into the chat app in spec order', () => {
  const body = html.slice(html.indexOf('<body'));
  // 1. No landing structure may precede the app.
  const appTag = '<section class="motoai-app"';
  const appIdx = body.indexOf(appTag);
  assert.ok(appIdx >= 0, 'chat app exists');
  assert.ok(!/class="motoai-(hero|landing|intro|features|benefits|cta|banner|blog-preview|app-marketing)/.test(body), 'no landing structure in the root page');
  const beforeApp = body.slice(0, appIdx);
  assert.ok(!/<(section|header|footer|nav|div|article|aside|h1|h2|p)\b/.test(beforeApp), 'no element renders before the chat app — body opens directly into it');
  // 2. Spec order inside the app: header → messages → quick → composer.
  const order = ['motoai-header', 'id="motoai-messages"', 'id="motoai-quick"', 'id="motoai-composer"'];
  const idx = order.map(id => html.indexOf(id));
  assert.ok(idx.every(i => i >= 0), 'all contract sections present');
  for (let i = 1; i < idx.length; i++) assert.ok(idx[i] > idx[i - 1], `${order[i]} must come after ${order[i - 1]}`);
  // 3. Full-screen app layout: html/body 100%, app 100dvh flex column, chat area flexes.
  assert.match(css, /html, body\s*\{[^}]*height:\s*100%/s);
  assert.match(css, /\.motoai-app\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*height:\s*100dvh/s);
  assert.match(css, /\.motoai-messages\s*\{[^}]*flex:\s*1;[^}]*overflow-y:\s*auto/s);
  // 4. Quick bar stays ONE horizontal row.
  assert.match(css, /\.motoai-quick\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden/s);
  // 5. Only ONE h1 — the visible app header; no giant SEO H1.
  assert.equal((html.match(/<h1/g) || []).length, 1);
  // 6. Grouped drawer (v50): every hub route is reachable with short labels.
  const routes = {
    '🏍️ Xe máy': '/aichatbot/blog/thue-xe/',
    '⚡ Xe điện': '/aichatbot/blog/xe-dien/',
    '📱 Ứng dụng': '/aichatbot/blog/app/',
    '📄 Hướng dẫn': '/aichatbot/blog/huong-dan/',
    '🛡️ An toàn': '/aichatbot/blog/an-toan/',
    '📍 Địa phương': '/aichatbot/blog/dia-phuong/',
    '🔎 Tìm bài': '/aichatbot/blog/',
    '🔒 Bảo mật': '/aichatbot/privacy/',
    '📃 Điều khoản': '/aichatbot/terms/'
  };
  for (const [label, href] of Object.entries(routes)) {
    const li = html.match(new RegExp(`<li><a href="${href.replace(/\//g, '\\/')}"[^>]*>${label}</a></li>`));
    assert.ok(li, `menu entry "${label}" must link ${href}`);
  }
  // 7. Embed mode never gains blog/SEO UI.
  assert.match(css, /body\[data-motoai-embed="1"\] \.motoai-seo,\s*[\s\S]*?\.motoai-menu\s*\{\s*display:\s*none/s);
  // 8. SEO surface survives without a hero: title/meta/schema keep the owned intent.
  assert.match(html, /<title>[^<]*Ứng dụng thuê xe máy/i);
  assert.ok(html.includes('"@type": "WebApplication"'));
  assert.match(html, /rel="canonical"/);
  assert.ok(html.toLowerCase().includes('app thuê xe điện'));
  assert.ok(html.toLowerCase().includes('ứng dụng thuê xe máy điện'));
});

// --- 5. Header label ---
test('visible chat header title is "Hỗ trợ Agent" (MotoAI stays internal)', () => {
  // v47.1: chatbot-first homepage — the chat H1 is the page H1; there is no
  // landing hero above the app, and supporting SEO copy renders AFTER it.
  assert.match(html, /<h1 class="motoai-title">Hỗ trợ Agent<\/h1>/);
  assert.ok(!html.includes('motoai-hero'), 'no hero section above the chatbot');
  const appIdx = html.indexOf('id="motoai-app"');
  const seoIdx = html.indexOf('class="motoai-seo"');
  assert.ok(appIdx >= 0 && seoIdx > appIdx, 'SEO copy must come after the chatbot');
  assert.match(html, /app thuê xe máy/i);
  assert.match(html, /ứng dụng thuê xe máy điện/i);
});

// --- 5b. Chatbot opens full-screen like an app (ChatGPT-style) ---
test('chat app fills the viewport exactly — no hero, no scroll to reach the chat', () => {
  // The shell adds no padding of its own; the app itself is exactly 100dvh.
  // (Embed-mode rules like `body[data-motoai-embed="1"] .motoai-shell` are exempt.)
  const shellRule = css.match(/^\.motoai-shell\s*\{[^}]*\}/m)?.[0] ?? '';
  assert.ok(shellRule.includes('max-width: 720px'), 'shell keeps the centered column');
  assert.ok(!shellRule.includes('padding'), 'shell must not pad the app away from the edges');
  assert.match(css, /\.motoai-shell \.motoai-app\s*\{\s*height:\s*100dvh;\s*min-height:\s*100dvh;\s*\}/);
  // SEO copy sits below the 100dvh app — never inside the first viewport.
  assert.match(css, /\.motoai-seo\s*\{/);
});

// --- 5c. Menu drawer = navigation to the blog ecosystem + contact actions ---
test('☰ menu is a grouped accordion navigating the blog ecosystem + contact actions', () => {
  // Capture the whole drawer (nested <ul> groups), not just the first list.
  const drawerStart = html.indexOf('<nav class="motoai-drawer"');
  const drawer = html.slice(drawerStart, html.indexOf('</nav>', drawerStart));
  assert.ok(drawer, 'drawer present');
  // Every blog hub route is reachable from the menu.
  for (const hub of ['blog/', 'blog/app/', 'blog/thue-xe/', 'blog/xe-dien/', 'blog/huong-dan/', 'blog/an-toan/', 'blog/dia-phuong/']) {
    assert.ok(drawer.includes(`/aichatbot/${hub}`), `menu must link /aichatbot/${hub}`);
  }
  // ChatGPT-style condensed entry: Liên hệ asks the Agent (no hard-coded contacts).
  assert.match(drawer, /id="motoai-menu-contact">☎️ Liên hệ</);
  assert.match(mainJs, /menuContact/);
  assert.match(mainJs, /elements\.input\.value = 'Liên hệ';/);
  // Contact hrefs still resolve only from verified business.json.
  assert.match(mainJs, /fillMenuLinks/);
  for (const source of [drawer, css]) {
    assert.ok(!source.includes(business.contact.phone), 'menu must not hard-code the phone');
  }
});

// --- 6. Header subtitle / address ---
test('visible subtitle contains the verified business address', () => {
  const m = /<p class="motoai-subtitle"[^>]*>([^<]+)<\/p>/.exec(html);
  assert.ok(m, 'subtitle element present');
  assert.ok(m[1].includes(business.address.full), 'subtitle shows business.address.full');
  assert.equal(m[1], `Địa chỉ: ${business.address.full}, ${business.address.country}`); // v52 microcopy
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

// --- 1 + 2. Quick chips: ONE single horizontal scrollable row ---
test('primary chip bar holds the full 12-action set in the agreed default order', () => {
  assert.equal(DEFAULT_CHIPS.length, 12);
  const labels = DEFAULT_CHIPS.map((c) => c.label);
  assert.deepEqual(labels, [
    '⚡ Agent', '💰 Giá thuê', '🛵 Xe ga', '🏍️ Xe số', '📅 Theo tháng',
    '💵 Đặt cọc', '📄 Thủ tục', '💬 Zalo', '📞 Gọi', '📍 Địa chỉ',
    '☎️ Liên hệ', '🗺️ Bản đồ'
  ]);
  for (const chip of DEFAULT_CHIPS) {
    assert.ok(chip.id && chip.label, 'chip needs id and label');
    assert.ok(!/\d{3}\.\d{3}đ/.test(chip.label + (chip.query ?? '')), 'no prices hard-coded in the UI');
  }
});

test('every chip is exactly one of the three kinds (query, link, agent)', () => {
  for (const chip of DEFAULT_CHIPS) {
    if (chip.type === 'link') {
      assert.ok(chip.ref, 'link chip must carry a business-data ref');
      assert.ok(!('href' in chip) && !('url' in chip), 'link chips must not carry hard-coded hrefs');
    } else if (chip.type === 'agent') {
      assert.ok(!chip.query, 'agent chip does not send an engine query');
    } else {
      assert.ok(chip.query && typeof chip.query === 'string', 'query chip must carry an engine query');
    }
  }
});

test('link chips resolve hrefs only from verified business.json data', () => {
  const byId = Object.fromEntries(DEFAULT_CHIPS.map((c) => [c.id, c]));
  assert.equal(resolveChipHref(byId.zalo, business), business.contact.zalo);
  assert.equal(resolveChipHref(byId.call, business), business.contact.phone_uri);
  assert.equal(resolveChipHref(byId.map, business), business.contact.maps);
  // No verified data -> empty href, never a guessed contact URL.
  assert.equal(resolveChipHref(byId.zalo, {}), '');
  assert.equal(resolveChipHref(byId.zalo, null), '');
});

test('contact data is never duplicated into UI logic files', () => {
  const phone = business.contact.phone;
  for (const source of [mainJs, css]) {
    assert.ok(!source.includes(phone), 'UI files must not hard-code the business phone');
    assert.ok(!source.includes(business.contact.maps), 'UI files must not hard-code the maps URL');
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
  ].filter((chip) => chip.query); // only query chips go through the engine
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

test('index.html links the stylesheet (root app must never render unstyled)', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="assets\/css\/style\.css">/);
  // must appear after canonical/manifest, before runtime scripts
  const linkPos = html.indexOf('<link rel="stylesheet"');
  const canonicalPos = html.indexOf('rel="canonical"');
  const manifestPos = html.indexOf('rel="manifest"');
  const scriptPos = html.indexOf('<script');
  assert.ok(linkPos > -1, 'stylesheet link present');
  assert.ok(linkPos > canonicalPos && linkPos > manifestPos, 'stylesheet after canonical/manifest');
  assert.ok(scriptPos === -1 || linkPos < scriptPos, 'stylesheet before runtime scripts');
});

// --- 5e. Mobile app-lock (v47.4): full-screen chat, no body scroll, safe pristine state ---
test('mobile app-lock: body locked, app pinned, only messages scroll, embed unchanged', () => {
  // Body is locked in direct mode; overflow can never pan the document.
  assert.match(css, /html, body\s*\{[^}]*overflow:\s*hidden;[^}]*overscroll-behavior:\s*none;/s);
  // Embed mode keeps its own document flow (unchanged behavior).
  assert.match(css, /body\[data-motoai-embed="1"\]\s*\{\s*overflow:\s*auto;[^}]*\}/);
  // App pinned edge-to-edge: header can never drift under Safari chrome.
  assert.match(css, /\.motoai-shell \.motoai-app\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
  assert.match(css, /body\[data-motoai-embed="1"\] \.motoai-app\s*\{[^}]*position:\s*static;[^}]*inset:\s*auto;/s);
  // Header, chips row, composer form stable non-shrinking zones.
  assert.match(css, /\.motoai-header, \.motoai-quick, \.motoai-composer\s*\{\s*flex:\s*0 0 auto;\s*\}/);
  // Message scroll never chains to the body.
  assert.match(css, /\.motoai-messages\s*\{[^}]*overscroll-behavior-y:\s*contain;/s);
  // Pristine state: lone greeting centers upper-middle (no top-hugging dead space).
  assert.match(css, /\.motoai-messages > \.motoai-msg:only-child\s*\{[^}]*margin-top:\s*auto;[^}]*margin-bottom:\s*auto;/s);
  // Disclosure paragraph is GONE (v50): replaced by the bottom dock, no empty gap.
  assert.ok(!html.includes('motoai-disclosure'), 'no disclosure text in main UI');
  assert.ok(!html.includes('Trợ lý trả lời tự động dựa trên dữ liệu'), 'old disclosure copy removed');
  assert.match(css, /\.motoai-dock\s*\{/);
  // Composer sits directly above the safe area (app padding keeps env inset).
  assert.match(css, /\.motoai-app\s*\{[^}]*calc\(env\(safe-area-inset-bottom/s);
});

// --- 5f. Responsive device classes (v49): structural CSS contracts, not visual ---
// These assert the stylesheet's responsive rules per breakpoint. They are
// STRUCTURAL guarantees (selectors/values present), not pixel-rendered visuals.
test('responsive: mobile base stays app-locked, laptop/desktop center a capped column', () => {
  // Breakpoints exist and cover the device classes.
  assert.match(css, /@media \(min-width: 768px\)/, 'laptop/tablet breakpoint');
  assert.match(css, /@media \(min-width: 1200px\)/, 'desktop breakpoint');
  assert.match(css, /@media \(min-width: 1600px\)/, 'large-desktop breakpoint');
  // Laptop (768): centered 820px column, messages 80%, drawer 320px.
  const laptop = css.slice(css.indexOf('@media (min-width: 768px)'), css.indexOf('@media (min-width: 1200px)'));
  assert.match(laptop, /\.motoai-shell \.motoai-app\s*\{[^}]*max-width:\s*820px;/);
  assert.match(laptop, /\.motoai-msg\s*\{[^}]*max-width:\s*80%;/);
  assert.match(laptop, /\.motoai-drawer\s*\{[^}]*width:\s*320px;/);
  assert.match(laptop, /body\[data-motoai-embed="1"\] \.motoai-app\s*\{[^}]*max-width:\s*none;/, 'embed stays unconstrained');
  // Desktop (1200): 940px column, messages 74%, drawer 340px, premium composer.
  const desk = css.slice(css.indexOf('@media (min-width: 1200px)'), css.indexOf('@media (min-width: 1600px)'));
  assert.match(desk, /\.motoai-shell \.motoai-app\s*\{[^}]*max-width:\s*940px;/);
  assert.match(desk, /\.motoai-msg\s*\{[^}]*max-width:\s*74%;[^}]*font-size:\s*0\.95rem;/s);
  assert.match(desk, /\.motoai-drawer\s*\{[^}]*width:\s*340px;/);
  assert.match(desk, /\.motoai-input\s*\{[^}]*padding:\s*13px 18px;/);
  // Large desktop (1600): capped at 1000px — chat never spans the monitor.
  const xl = css.slice(css.indexOf('@media (min-width: 1600px)'));
  assert.match(xl, /\.motoai-shell \.motoai-app\s*\{[^}]*max-width:\s*1000px;/);
  assert.match(xl, /\.motoai-msg\s*\{[^}]*max-width:\s*72%;/);
  assert.match(xl, /\.motoai-drawer\s*\{[^}]*width:\s*360px;/);
});

test('responsive: safe-area insets survive at every breakpoint', () => {
  // Check EVERY media block at the given width (dock, app, etc. may each own one).
  for (const bp of ['768px', '1200px']) {
    const blocks = [...css.matchAll(new RegExp(`@media \\(min-width: ${bp}\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'g'))].map((m) => m[0]).join('\n');
    const joined = blocks + css.slice(css.indexOf(`@media (min-width: ${bp})`));
    assert.ok(joined.includes('env(safe-area-inset-top'), `${bp} keeps safe-area top inset`);
    assert.ok(joined.includes('env(safe-area-inset-bottom'), `${bp} keeps safe-area bottom inset`);
  }
});

// --- 5g. Bottom dock (v53): flat bottom navigation, NOT tag-like ---
test('bottom dock: exactly 4 items, flat nav look, verified actions, one row', () => {
  const dockStart = html.indexOf('class="motoai-dock"');
  const dock = html.slice(dockStart, html.indexOf('</nav>', dockStart));
  assert.ok(dock, 'dock present');
  assert.equal((dock.match(/class="motoai-dock-item"/g) || []).length, 4, 'dock has exactly 4 items');
  for (const label of ['Dịch vụ', 'Liên hệ', 'Giá thuê', 'Bản đồ']) {
    assert.ok(dock.includes(`>${label}<`), `dock must contain "${label}"`);
  }
  // Icon-above-label markup (app bottom-nav, not a chip row).
  assert.match(dock, /motoai-dock-icon/);
  // Dịch vụ routes to the existing service hub — no invented page.
  assert.match(dock, /href="\/aichatbot\/blog\/thue-xe\/"/);
  // Liên hệ: NO hard-coded contact URL — it opens the drawer contact group.
  assert.ok(!html.includes('share.google'), 'no hard-coded share.google URL anywhere');
  assert.match(dock, /id="motoai-dock-contact"/);
  assert.match(mainJs, /dockContact\?\.addEventListener\('click', \(\) => \{[\s\S]*?setDrawer\(true\);[\s\S]*?motoai-group-lh-btn[\s\S]*?groupBtn\.click\(\)/);
  // Giá thuê is an Agent action — no hard-coded price values in the dock.
  assert.match(dock, /id="motoai-dock-price"/);
  assert.ok(!/\d{3}[.,]?\d{3}\s*(đ|vnd|VND)/.test(dock), 'dock must not hard-code prices');
  assert.match(mainJs, /dockPrice\?\.addEventListener[\s\S]*?'Giá thuê xe bao nhiêu\?'/);
  // Bản đồ resolves from verified business.json (never hard-coded in markup).
  assert.match(dock, /id="motoai-dock-map" href="#"/);
  assert.match(mainJs, /setHref\(elements\.dockMap, resolveChipHref\(\{ ref: 'maps' \}, businessData\)\)/);
  // Dock sits below the composer in DOM order and is one row.
  assert.ok(html.indexOf('id="motoai-composer"') < dockStart, 'dock after composer');
  assert.match(css, /\.motoai-dock\s*\{[^}]*grid-template-columns:\s*repeat\(4, 1fr\);/s);
  assert.match(css, /\.motoai-dock-item\s*\{[^}]*min-height:\s*44px;/s);
  // Flat nav contract: transparent cells, no pill, no per-item border.
  const item = css.match(/\.motoai-dock-item\s*\{[\s\S]*?\}/)[0];
  assert.match(item, /background:\s*transparent/, 'dock cells are transparent');
  assert.match(item, /border:\s*none/, 'no per-item border');
  assert.match(item, /border-radius:\s*0/, 'no pill radius');
  assert.match(item, /color:\s*var\(--color-text-muted\)/, 'muted default text');
  // Hover ONLY under fine-pointer media query — never sticky on touch.
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)\s*\{[\s\S]*?\.motoai-dock-item:hover\s*\{[^}]*color:\s*var\(--color-primary\);/);
  assert.match(css, /\.motoai-dock-item:active\s*\{\s*color:\s*var\(--color-primary\);\s*\}/, 'tap feedback');
  assert.match(css, /-webkit-tap-highlight-color:\s*transparent/, 'no sticky grey flash on iOS');
  // No persistent selected state — dock items are actions, not tabs.
  assert.ok(!/\.motoai-dock-item\.motoai-active|aria-current/.test(css + dock), 'no sticky selected state');
  assert.match(css, /body\[data-motoai-embed="1"\] \.motoai-dock\s*\{\s*display:\s*none;/, 'embed hides the dock');
  // Dark/light contrast: dock never renders dark text on a purple surface.
  assert.ok(!/background:\s*var\(--color-primary\)/.test(item), 'dock cells are never purple');
});

// --- 5g2. Contact group (v53): WhatsApp from business.json, no hard-coded contacts ---
test('contact group: WhatsApp + Zalo + Gọi + Bản đồ all resolve from verified business.json', () => {
  const drawerStart = html.indexOf('<nav class="motoai-drawer"');
  const drawer = html.slice(drawerStart, html.indexOf('</nav>', drawerStart));
  assert.match(drawer, /id="motoai-menu-whatsapp"/, 'WhatsApp menu item exists');
  assert.match(mainJs, /setHref\(elements\.menuWhatsapp, resolveChipHref\(\{ ref: 'whatsapp' \}, businessData\)\)/);
  // resolveChipHref resolves the whatsapp ref exactly from business.json.
  assert.equal(resolveChipHref({ ref: 'whatsapp' }, business), business.contact.whatsapp);
  assert.equal(resolveChipHref({ ref: 'whatsapp' }, { contact: {} }), '', 'missing data -> empty href');
  // No hard-coded phone/Zalo/WhatsApp/Maps anywhere in the UI markup.
  for (const src of [html]) {
    assert.ok(!src.includes(business.contact.phone), 'no hard-coded phone');
    assert.ok(!src.includes(business.contact.zalo), 'no hard-coded Zalo URL');
    assert.ok(!src.includes(business.contact.whatsapp), 'no hard-coded WhatsApp URL');
    assert.ok(!src.includes(business.contact.maps), 'no hard-coded Maps URL');
  }
});

// --- 5g3. Quick tag bar is FIXED (v53) ---
test('quick bar: 12 primary tags fixed — never swapped by contextual chips', () => {
  // UI never imports nextSuggestions and never re-renders the bar per-turn.
  assert.ok(!mainJs.includes('nextSuggestions'), 'main.js must not use contextual suggestions');
  assert.match(mainJs, /import \{ DEFAULT_CHIPS, resolveChipHref \} from/);
  // Only the initial render and the reset render DEFAULT_CHIPS.
  assert.equal((mainJs.match(/renderChips\(DEFAULT_CHIPS\)/g) || []).length, 2, 'initial render + reset render only');
  // After an answer the bar is NOT re-rendered (no contextual swap call).
  assert.ok(!/renderChips\(nextSuggestions/.test(mainJs), 'submit must not swap the primary bar');
  // One row contract unchanged.
  assert.match(css, /\.motoai-quick\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden/s);
  // Scroll resets to the first chip on every render — no half-clipped chip.
  assert.match(mainJs, /elements\.quick\.scrollLeft = 0;/);
});

// --- 5h. Grouped menu accordion (v50) ---
test('grouped menu: parent/child accordion with ARIA + one-open + Escape', () => {
  const groups = [...html.matchAll(/<li class="motoai-group">/g)].length;
  assert.equal(groups, 4, 'exactly 4 parent groups: Dịch vụ, Cẩm nang, Liên hệ, Pháp lý');
  // Every group button is ARIA-backed and controls an items list.
  for (const btn of html.matchAll(/class="motoai-group-btn"[^>]*aria-expanded="false" aria-controls="([^"]+)"/g)) {
    assert.ok(html.includes(`id="${btn[1]}"`), `group items list ${btn[1]} exists`);
  }
  // Short customer labels only — old long labels are gone.
  for (const old of ['Blog / Cẩm nang', 'App &amp; Ứng dụng', 'Thuê xe máy</a>', 'Hướng dẫn / Thủ tục', 'An toàn / Pháp lý', 'Địa phương / Du lịch', 'Xóa hội thoại', 'Chính sách bảo mật</a>', 'Điều khoản sử dụng</a>']) {
    assert.ok(!html.includes(old), `long label "${old}" must be simplified`);
  }
  assert.ok(html.includes('🧹 Xóa chat'), 'reset label is "Xóa chat"');
  // One-open accordion + Escape/backdrop close are wired in JS.
  assert.match(mainJs, /closeGroups\(btn\)/, 'opening a group closes the others');
  assert.match(mainJs, /setAttribute\('aria-expanded'/);
  assert.match(mainJs, /closest\('\.motoai-group-btn'\)\) return;/, 'group toggle does not close the drawer');
  assert.match(mainJs, /event\.key === 'Escape'/, 'Escape still closes the drawer');
  // Children are visually indented.
  assert.match(css, /\.motoai-group-items\s*\{[^}]*padding:[^;]*var\(--space-4\);/s);
  assert.match(css, /\.motoai-group-items\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
});

// --- 5i. Privacy + Terms pages (v50) ---
test('privacy and terms routes exist, are real pages, and are in the sitemap', () => {
  const privacy = readFileSync(join(ROOT, 'privacy/index.html'), 'utf8');
  const terms = readFileSync(join(ROOT, 'terms/index.html'), 'utf8');
  assert.match(privacy, /<title>Chính sách bảo mật/);
  assert.match(terms, /<title>Điều khoản sử dụng/);
  assert.match(privacy, /rel="canonical" href="https:\/\/thuexemayhanoi\.github\.io\/aichatbot\/privacy\/"/);
  assert.match(terms, /rel="canonical" href="https:\/\/thuexemayhanoi\.github\.io\/aichatbot\/terms\/"/);
  // Truthful privacy: no absolute "zero data leaves device" claim; mentions external links.
  assert.ok(privacy.includes('localStorage'), 'privacy explains local storage');
  assert.ok(privacy.toLowerCase().includes('zalo') && privacy.toLowerCase().includes('maps'), 'privacy covers external links');
  assert.ok(privacy.includes('API key') === false || privacy.includes('không cần API key'), 'API-key claim consistent');
  const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes('/aichatbot/privacy/'), 'sitemap lists privacy');
  assert.ok(sitemap.includes('/aichatbot/terms/'), 'sitemap lists terms');
});

// --- 5j. Color contract (v50): light/white text on true purple primary surfaces ---
test('on-primary text is light in BOTH themes — no dark text on purple', () => {
  const onPrimary = [...css.matchAll(/--color-on-primary:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(onPrimary.length >= 2, 'on-primary defined in both themes');
  for (const value of onPrimary) {
    assert.match(value, /^#(fff|ffffff|f8fafc|f1f5f9)$/i, `on-primary must be light/white, got ${value}`);
  }
});

// --- 5k. Menu discoverability (v51): "☰ Menu" pill with finite attention cue ---
test('menu button: icon + visible "Menu" text, pill style, ARIA intact, finite pulse', () => {
  // 1. Icon + text label, not icon-only.
  const btn = /<button[^>]*class="motoai-menu"[^>]*>([\s\S]*?)<\/button>/.exec(html)?.[1] ?? '';
  assert.ok(btn.includes('☰'), 'hamburger icon kept');
  assert.match(btn, /<span class="motoai-menu-label">Menu<\/span>/, 'visible "Menu" text label');
  // 2. ARIA behavior unchanged.
  assert.match(html, /id="motoai-menu-btn"[^>]*aria-label="Mở menu"[^>]*aria-expanded="false"[^>]*aria-controls="motoai-drawer"/);
  // 3. Pill: purple primary with light text, border, 44px target.
  assert.match(css, /\.motoai-menu\s*\{[^}]*min-height:\s*44px;[^}]*border-radius:\s*var\(--radius-full\);[^}]*background:\s*var\(--color-primary\);[^}]*color:\s*var\(--color-on-primary\);/s);
  assert.match(css, /\.motoai-menu:hover\s*\{\s*background:\s*var\(--color-primary-hover\);/);
  assert.match(css, /\.motoai-menu:active[^{]*\{[^}]*transform:\s*scale\(0\.97\);/s, 'obvious tap state');
  // 4. Attention cue is FINITE: 3 iterations, no infinite.
  const anim = css.match(/\.motoai-menu\s*\{[^}]*animation:\s*([^;}]+);/s)?.[1] ?? '';
  assert.ok(anim.includes('motoai-menu-glow'), 'glow animation defined');
  assert.ok(/\b3\b/.test(anim), 'pulse runs a finite number of cycles (3)');
  assert.ok(!/infinite/.test(anim), 'menu pulse is never infinite (typing-dots indicator exempt)');
  // 5. Reduced motion disables the pulse entirely.
  const rm = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.motoai-menu\s*\{\s*animation:\s*none;\s*\}/, 'reduced-motion kills the pulse');
});
