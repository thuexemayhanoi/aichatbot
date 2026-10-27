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
import { menuButton } from '../../tools/app-shell.mjs';
import { renderDrawer } from '../../tools/menu-drawer.mjs';
import { navigation } from '../../tools/taxonomy.mjs';

/**
 * v45 FOCUSED UI/UX POLISH — customer-facing brand spec.
 * Header, address consistency, Agent label, readiness status, quick chips.
 * v79: ONE ☰ Danh mục button + ONE left sidebar replace the bottom tab bar.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(ROOT, 'agent/index.html'), 'utf8');
const mainJs = readFileSync(join(ROOT, 'assets/js/main.js'), 'utf8');
const drawerJs = readFileSync(join(ROOT, 'assets/js/drawer.js'), 'utf8');
const css = readFileSync(join(ROOT, 'assets/css/style.css'), 'utf8');
const embedJs = readFileSync(join(ROOT, 'embed.js'), 'utf8');

/** The whole sidebar <nav> (nested <ul> groups included), closing tag inclusive. */
const drawerOf = (source) => {
  const start = source.indexOf('<nav class="motoai-drawer"');
  return start < 0 ? '' : source.slice(start, source.indexOf('</nav>', start) + '</nav>'.length);
};
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** An inline SVG glyph of the shared icon set, as rendered in the sidebar. */
const GLYPH = (name) => `<svg class="motoai-nav-icon i-${name}"[^>]*>(?:<(?:path|circle|rect)[^>]*/>)+</svg>`;

// --- 5d. /agent/ = THE CHAT APPLICATION (explicit acceptance contract; v76 moved it off /) ---
test('Agent app contract: /agent/ body opens directly into the chat app in spec order', () => {
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
  // 3. Full-screen app layout: the app itself is a 100dvh flex column.
  //    v60: NO global html/body height:100% — the root document stays normal
  //    (content pages scroll); the chat viewport comes from .motoai-app only.
  assert.ok(!/html,\s*body\s*\{[^}]*height:\s*100%/.test(css), 'no global html/body 100% height');
  assert.match(css, /\.motoai-app\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*height:\s*100dvh/s);
  assert.match(css, /\.motoai-messages\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto/s);
  // 4. Quick bar stays ONE horizontal row.
  assert.match(css, /\.motoai-quick\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden/s);
  // 5. Only ONE h1 — the visible app header; no giant SEO H1.
  assert.equal((html.match(/<h1/g) || []).length, 1);
  // 6. The sidebar (v79): every hub route is reachable with short 1-2 word
  //    labels, each in its own <span>; hubs and the Tìm Bài link carry an
  //    inline SVG glyph of the shared set (emoji icons stay config data —
  //    drawerCore() — and are NEVER sidebar text). All six canonical
  //    categories sit inside the Cẩm nang group; contact actions sit inside
  //    the Dịch Vụ group.
  const routes = {
    'Công Cụ': ['/blog/cong-cu-huong-dan/', 'tool'],
    'Ứng Dụng': ['/blog/app/'],
    'Hướng Dẫn': ['/blog/huong-dan/'],
    'Phương Tiện': ['/blog/thue-xe-phuong-tien/', 'scooter'],
    'Thuê Xe': ['/blog/thue-xe/'],
    'Xe Điện': ['/blog/xe-dien/'],
    'Khám Phá': ['/blog/kham-pha-an-toan/', 'compass'],
    'An Toàn': ['/blog/an-toan/'],
    'Địa Phương': ['/blog/dia-phuong/'],
    'Tìm Bài': ['/blog/', 'search'],
    'Bảo Mật': ['/privacy/'],
    'Điều Khoản': ['/terms/']
  };
  const drawer = drawerOf(html);
  assert.ok(drawer, 'sidebar present');
  for (const [label, [href, glyph]] of Object.entries(routes)) {
    const entry = new RegExp(`<a[^>]*href="${rx(href)}"[^>]*>${glyph ? GLYPH(glyph) : ''}<span>${rx(label)}</span></a>`).exec(drawer);
    assert.ok(entry, `menu entry "${label}" must link ${href}${glyph ? ` with the ${glyph} glyph` : ''}`);
  }
  const rows = drawer.replace(/<li class="motoai-drawer-util">[\s\S]*?<\/li>/g, '');
  assert.ok(!/\p{Extended_Pictographic}/u.test(rows), 'sidebar rows use SVG glyphs — no emoji text (only the utility rows keep theirs)');
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
  const drawer = drawerOf(html);
  assert.ok(drawer, 'drawer present');
  // Every blog hub route is reachable from the menu.
  for (const hub of ['blog/', 'blog/app/', 'blog/thue-xe/', 'blog/xe-dien/', 'blog/huong-dan/', 'blog/an-toan/', 'blog/dia-phuong/']) {
    assert.ok(drawer.includes(`/${hub}`), `menu must link /${hub}`);
  }
  // ChatGPT-style condensed entry: Liên hệ asks the Agent (no hard-coded contacts).
  // v79: the label sits in its own <span>, no emoji prefix.
  assert.match(drawer, /<li><button type="button" id="motoai-menu-contact"><span>Liên Hệ<\/span><\/button><\/li>/);
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
  assert.equal(business.address.full, '112 Nguyễn Văn Cừ, Bồ Đề, Long Biên, Hà Nội');
  assert.equal(business.address.ward, 'Bồ Đề');
  assert.equal(business.address.street, '112 Nguyễn Văn Cừ');
  assert.equal(business.address.district, 'Long Biên');
  assert.ok(html.includes(business.address.full), 'header subtitle shows the same address');
  // Preserve verified Bồ Đề locality in the static HTML and business data.
  assert.ok(html.includes('Bồ Đề, Long Biên'));
  assert.ok(!html.includes('112 Nguyễn Văn Cừ, Long Biên, Hà Nội'));
  assert.ok(!mainJs.includes('112 Nguyễn Văn Cừ, Long Biên, Hà Nội'));
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
  // v79: the sidebar's Agent row is the in-app Agent toggle, named "Hỏi Agent"
  // exactly like the header CTA and the footer (one label in navigation.json).
  assert.equal(navigation.agent.label, 'Hỏi Agent');
  assert.match(html, new RegExp(`<li><button type="button" id="motoai-menu-agent">${GLYPH('chat')}<span>Hỏi Agent</span></button></li>`));
  assert.ok(!html.includes('Agent Hỗ Trợ'), 'the old "⚡ Agent Hỗ Trợ" row is gone');
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
test('primary chip bar holds the full 11-action set in the agreed default order', () => {
  assert.equal(DEFAULT_CHIPS.length, 11); // v57: Zalo removed
  const labels = DEFAULT_CHIPS.map((c) => c.label);
  assert.deepEqual(labels, [
    '⚡ Agent', '💰 Giá thuê', '🛵 Xe ga', '🏍️ Xe số', '📅 Theo tháng',
    '💵 Đặt cọc', '📄 Thủ tục', '📞 Gọi', '📍 Địa chỉ',
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
  assert.equal(resolveChipHref(byId.call, business), business.contact.phone_uri);
  assert.equal(resolveChipHref(byId.map, business), business.contact.maps);
  assert.equal(resolveChipHref({ ref: 'whatsapp' }, business), business.contact.whatsapp);
  // No verified data -> empty href, never a guessed contact URL.
  assert.equal(resolveChipHref(byId.call, {}), '');
  assert.equal(resolveChipHref({ ref: 'whatsapp' }, null), '');
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
  assert.deepEqual(contact.map((c) => c.label), ['Chỉ đường', 'Gọi điện', 'Giờ mở cửa']);

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

test('agent/index.html links the stylesheet by absolute path (the Agent app must never render unstyled)', () => {
  const html = readFileSync(join(ROOT, 'agent/index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\/assets\/css\/style\.css\?v=[\w.-]+">/);
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
test('mobile app-lock: CHAT HOMEPAGE ONLY body lock, app pinned, messages scroll, embed unchanged', () => {
  // v60: the lock is scoped to body.chat-home — content pages keep normal
  // document scrolling. No global html/body overflow lock exists anymore.
  assert.ok(!/html,\s*body\s*\{[^}]*overflow:\s*hidden/.test(css), 'no global html,body overflow lock');
  assert.match(css, /body\.chat-home\s*\{[^}]*overflow:\s*hidden;[^}]*overscroll-behavior:\s*none;/s);
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
  // Disclosure paragraph is GONE (v50) and so is the v78 bottom tab bar (v79):
  // the ONE sidebar (a fixed left panel) is the only menu system, no empty gap.
  assert.ok(!html.includes('motoai-disclosure'), 'no disclosure text in main UI');
  assert.ok(!html.includes('Trợ lý trả lời tự động dựa trên dữ liệu'), 'old disclosure copy removed');
  assert.ok(!/\.app-tabbar|\.app-tab\b|motoai-dock/.test(css), 'no tab bar / dock CSS');
  assert.match(css, /\.motoai-drawer\s*\{[^}]*position:\s*fixed;/s, 'the sidebar overlays the pinned app');
  // v79 scroll safety: the sidebar's page lock is SCOPED — drawer.js applies
  // html.drawer-lock (+ the saved offset) only while the overlay is open,
  // always releases it and restores the scroll position on close, and skips
  // it on body.chat-home, whose always-on lock above stays the only one.
  assert.match(drawerJs, /const lock = \(on\) => \{\s*if \(body\.classList\.contains\('chat-home'\)\) return;/, 'never locks the chat app twice');
  assert.match(drawerJs, /scrollY = globalThis\.scrollY \|\| 0;\s*body\.style\.top = `-\$\{scrollY\}px`;\s*root\.classList\.add\('drawer-lock'\);/, 'lock = class + saved offset, on open only');
  assert.match(drawerJs, /root\.classList\.remove\('drawer-lock'\);\s*body\.style\.top = '';\s*globalThis\.scrollTo\(0, scrollY\);/, 'close releases the lock and restores the scroll position');
  assert.match(drawerJs, /body\.classList\.toggle\('drawer-open', state\);\s*inertRest\(state\);\s*lock\(state\);/, 'the lock (and the inert page) follow the overlay state exactly');
  assert.ok(!/drawer-lock/.test(css), 'style.css never locks the document — the scoped rule lives with the content-page shell');
  const blogCss = readFileSync(join(ROOT, 'assets/css/src/blog.css'), 'utf8');
  assert.match(blogCss, /^html\.drawer-lock body\.content-page \{ position: fixed; left: 0; right: 0; width: 100%; \}$/m);
  assert.equal((blogCss.match(/position:\s*fixed/g) || []).length, 1, 'the scoped lock is the ONLY fixed-body rule of the content shell');
  assert.match(blogCss, /^body\.content-page \{[^}]*overflow-y: visible;\s*position: static;/m, 'content pages scroll as a document');
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
  // The chat column breakpoints live in the v49 section (the shared desktop
  // menu and the sidebar own earlier 768px / 1200px queries of their own).
  const chat = css.slice(css.indexOf('/* ---------- v49: responsive device classes'));
  assert.ok(chat.length > 0 && chat.length < css.length, 'v49 responsive section present');
  // Laptop (768): centered 820px column, messages 80%.
  const laptop = chat.slice(chat.indexOf('@media (min-width: 768px)'), chat.indexOf('@media (min-width: 1200px)'));
  assert.match(laptop, /\.motoai-shell \.motoai-app\s*\{[^}]*max-width:\s*820px;/);
  assert.match(laptop, /\.motoai-msg\s*\{[^}]*max-width:\s*80%;/);
  assert.match(laptop, /body\[data-motoai-embed="1"\] \.motoai-app\s*\{[^}]*max-width:\s*none;/, 'embed stays unconstrained');
  // Desktop (1200): 940px column, messages 74%, premium composer.
  const desk = chat.slice(chat.indexOf('@media (min-width: 1200px)'), chat.indexOf('@media (min-width: 1600px)'));
  assert.match(desk, /\.motoai-shell \.motoai-app\s*\{[^}]*max-width:\s*940px;/);
  assert.match(desk, /\.motoai-msg\s*\{[^}]*max-width:\s*74%;[^}]*font-size:\s*1rem;/s);
  assert.match(desk, /\.motoai-input\s*\{[^}]*padding:\s*13px 18px;/);
  // Large desktop (1600): capped at 1000px — chat never spans the monitor.
  const xl = chat.slice(chat.indexOf('@media (min-width: 1600px)'));
  assert.match(xl, /\.motoai-shell \.motoai-app\s*\{[^}]*max-width:\s*1000px;/);
  assert.match(xl, /\.motoai-msg\s*\{[^}]*max-width:\s*72%;/);
  // v79: the sidebar is a LEFT off-canvas sheet — 85vw up to 340px on phones,
  // 320–380px on tablets (ONE override, at 768px). The chat column
  // breakpoints never resize it, and the Agent app keeps the overlay at every
  // width (the in-flow column exists only for body.content-page, blog.css).
  assert.match(css, /\.motoai-drawer\s*\{[^}]*left:\s*0;[^}]*width:\s*min\(85vw, 340px\);/s);
  assert.match(css, /@media \(min-width: 768px\)\s*\{\s*\.motoai-drawer\s*\{\s*width:\s*clamp\(320px, 42vw, 380px\);\s*\}\s*\}/);
  assert.equal((css.match(/(?<![\w-])\.motoai-drawer\s*\{/g) || []).length, 2, 'base panel + the one tablet width override');
  for (const block of [laptop, desk, xl]) assert.ok(!/\.motoai-drawer\s*\{/.test(block), 'no per-breakpoint drawer width in the chat column rules');
  assert.ok(!/body\.chat-home[^{]*\.motoai-drawer\s*\{/.test(css), 'the Agent app never turns the panel into a column');
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

// --- 5g. Sidebar (v79): the ONE shared left panel replaces the v78 tab bar and the v53 dock ---
test('sidebar: the shared left panel behind ☰ Danh mục, flat app look, no second menu', () => {
  assert.ok(!html.includes('motoai-dock'), 'the hand-written dock is gone (one menu system)');
  assert.ok(!/app-tabbar|class="app-tab"|data-drawer-open|is-typing/.test(html), 'the bottom tab bar is gone (one menu system)');
  const backdropTag = '<div class="motoai-drawer-backdrop" id="motoai-drawer-backdrop"></div>';
  const backdropStart = html.indexOf(backdropTag);
  assert.ok(backdropStart > 0, 'backdrop present');
  const drawer = drawerOf(html);
  assert.ok(drawer, 'sidebar present');
  assert.equal(flat(html.slice(backdropStart, html.indexOf('</nav>', backdropStart) + '</nav>'.length)), flat(renderDrawer({ mode: 'chat' })), 'same component as every website page (its chat variant)');
  // Panel: no `hidden` attribute (CSS owns the open state); relabel templates on
  // the <nav>; head = brand link home + ✕ with the close/collapse labels.
  assert.ok(drawer.startsWith('<nav class="motoai-drawer" id="motoai-drawer" aria-label="Danh mục" data-expand="Mở rộng {name}" data-collapse="Thu gọn {name}">'), 'nav opening tag');
  assert.ok(!/<nav class="motoai-drawer"[^>]*\shidden[\s>]/.test(drawer), 'never a hidden attribute');
  assert.match(drawer, /<div class="motoai-drawer-head">\s*<a class="motoai-drawer-brand" href="\/" aria-label="MotoAI — trang chủ"><svg class="brand-mark"[^>]*>[\s\S]*?<\/svg><strong>MotoAI<\/strong><\/a>\s*<button type="button" class="motoai-drawer-close" id="motoai-drawer-close" aria-label="Đóng danh mục" data-close="Đóng danh mục" data-collapse="Thu gọn danh mục"><svg class="motoai-icon i-close"[^>]*><path[^>]*\/><\/svg><\/button>\s*<\/div>/);
  // Top-level order: Trang Chủ, Hỏi Agent (the in-app toggle), the four groups
  // cm › pages › pl › dv, the theme row, then the chat-only divider + Xóa chat.
  const list = drawer.slice(drawer.indexOf('<ul class="motoai-drawer-list">'));
  const order = [
    '<li><a href="/"><svg class="motoai-nav-icon i-home"',
    '<li><button type="button" id="motoai-menu-agent"><svg class="motoai-nav-icon i-chat"',
    '<li class="motoai-group" data-group="cm">',
    '<li class="motoai-group" data-group="pages">',
    '<li class="motoai-group" data-group="pl">',
    '<li class="motoai-group" data-group="dv">',
    '<li class="motoai-drawer-util"><button type="button" class="blog-theme-toggle motoai-drawer-theme" aria-label="Chủ đề: tự động">🌗 Chủ đề: Auto</button></li>',
    '<li class="motoai-drawer-divider" role="separator"></li>',
    '<li class="motoai-drawer-util"><button type="button" id="motoai-reset">🧹 Xóa chat</button></li>'
  ];
  const idx = order.map((s) => list.indexOf(s));
  for (let i = 0; i < order.length; i++) assert.ok(idx[i] >= 0, `row present: ${order[i]}`);
  for (let i = 1; i < idx.length; i++) assert.ok(idx[i] > idx[i - 1], `${order[i]} after ${order[i - 1]}`);
  assert.equal((drawer.match(/<li class="motoai-group" /g) || []).length, 4, 'four groups');
  assert.equal((drawer.match(/aria-current/g) || []).length, 0, 'the Agent app marks no page (its Agent row is the in-app toggle, not a link)');
  // ☰ opens the panel; Cẩm nang starts open, Pháp Lý / Dịch Vụ start closed.
  assert.match(html, /<button type="button" class="motoai-menu" id="motoai-menu-btn" title="Mở danh mục" aria-label="Mở danh mục" aria-expanded="false" aria-controls="motoai-drawer" data-open="Mở danh mục" data-close="Đóng danh mục">/, '☰ Danh mục opens the sidebar');
  assert.match(drawer, /id="motoai-group-cm-btn" aria-expanded="true" aria-controls="motoai-group-cm" aria-label="Thu gọn Cẩm nang" data-name="Cẩm nang"><\/button><\/div>\s*<ul class="motoai-group-items" id="motoai-group-cm">/, 'Cẩm nang open by default');
  for (const [g, name] of [['pl', 'Pháp Lý'], ['dv', 'Dịch Vụ']]) {
    assert.match(drawer, new RegExp(`id="motoai-group-${g}-btn" aria-expanded="false" aria-controls="motoai-group-${g}" aria-label="Mở rộng ${name}" data-name="${name}"></button></div>\\s*<ul class="motoai-group-items" id="motoai-group-${g}" hidden>`), `${name} collapsed by default`);
  }
  assert.ok(!/\d{3}[.,]?\d{3}\s*(đ|vnd|VND)/.test(drawer), 'sidebar never hard-codes prices');
  // Backdrop then panel, after the app shell (an overlay over the pinned chat,
  // never inside the app column).
  assert.ok(html.indexOf('</main>') < backdropStart && backdropStart < html.indexOf('<nav class="motoai-drawer"'), 'after </main>: backdrop, then the panel');
  assert.ok(html.indexOf('id="motoai-composer"') < backdropStart, 'below the composer');
  // CSS: a LEFT off-canvas sheet above the app; closed = off screen AND out of
  // the tab order / a11y tree; open = the .is-open class only (no keyframes).
  const panel = css.match(/\.motoai-drawer\s*\{[^}]*\}/s)[0];
  for (const rule of [/position:\s*fixed;/, /left:\s*0;/, /z-index:\s*41;/, /width:\s*min\(85vw, 340px\);/, /overflow-y:\s*auto;/, /overscroll-behavior:\s*contain;/, /transform:\s*translateX\(-100%\);/, /visibility:\s*hidden;/]) {
    assert.match(panel, rule);
  }
  assert.match(css, /\.motoai-drawer\.is-open\s*\{\s*transform:\s*none;\s*visibility:\s*visible;/);
  assert.match(css, /\.motoai-drawer-backdrop\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*z-index:\s*40;[^}]*visibility:\s*hidden;/s);
  assert.match(css, /\.motoai-drawer-backdrop\.is-open\s*\{\s*opacity:\s*1;\s*visibility:\s*visible;/);
  assert.ok(!/@keyframes drawer-in/.test(css), 'no slide-in keyframes (transition only)');
  // Flat rows: 46px targets, transparent cells, no sticky grey flash on iOS,
  // never a filled accent cell; 44px expand/collapse controls.
  const item = css.match(/\.motoai-drawer-list a,\s*\.motoai-drawer-list button\s*\{[\s\S]*?\}/)[0];
  assert.match(item, /min-height:\s*46px/, 'touch target');
  assert.match(item, /background:\s*transparent/, 'flat cells');
  assert.match(item, /-webkit-tap-highlight-color:\s*transparent/, 'no sticky grey flash on iOS');
  assert.ok(!/background:\s*var\(--color-primary\)/.test(item), 'never a filled accent cell');
  assert.match(css, /\.motoai-drawer-list \.motoai-toggle\s*\{[^}]*width:\s*44px;\s*min-width:\s*44px;\s*min-height:\s*44px;/s, 'expand/collapse targets');
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)\s*\{[^@]*\.motoai-drawer-list a:hover,\s*\.motoai-drawer-list button:hover\s*\{\s*background:\s*var\(--paper-2\);/, 'hover only on real pointers');
  // aria-current is styled only on the two navigation components (desktop menu, sidebar).
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g).flatMap((s) => s.split(',')).map((s) => s.trim());
  for (const s of selectors.filter((sel) => sel.includes('aria-current'))) {
    assert.ok(s.startsWith('.site-nav') || s.startsWith('.motoai-drawer-list'), `aria-current only on navigation components: ${s}`);
  }
  assert.ok(!/\.motoai-active/.test(css), 'no selected-state class');
  assert.match(css, /body\[data-motoai-embed="1"\] \.motoai-drawer,\s*body\[data-motoai-embed="1"\] \.motoai-drawer-backdrop,\s*body\[data-motoai-embed="1"\] \.motoai-menu\s*\{\s*display:\s*none;/, 'embed hides the panel, its backdrop and ☰');
  assert.ok(!/body\.chat-home[^{]*\.motoai-drawer\s*\{[^}]*position:\s*sticky/s.test(css), 'the Agent app never turns the panel into an in-flow column');
});

// --- 5g2. Contact group (v53): WhatsApp from business.json, no hard-coded contacts ---
test('contact group: WhatsApp + Gọi + Bản đồ all resolve from verified business.json', () => {
  const drawer = drawerOf(html);
  assert.match(drawer, /id="motoai-menu-whatsapp"/, 'WhatsApp menu item exists');
  assert.match(mainJs, /setHref\(elements\.menuWhatsapp, resolveChipHref\(\{ ref: 'whatsapp' \}, businessData\)\)/);
  // resolveChipHref resolves the whatsapp ref exactly from business.json.
  assert.equal(resolveChipHref({ ref: 'whatsapp' }, business), business.contact.whatsapp);
  assert.equal(resolveChipHref({ ref: 'whatsapp' }, { contact: {} }), '', 'missing data -> empty href');
  // No hard-coded phone/Zalo/WhatsApp/Maps anywhere in the UI markup.
  for (const src of [html]) {
    assert.ok(!src.includes(business.contact.phone), 'no hard-coded phone');
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

// --- 5h. Grouped menu accordion (v50 → v79: nested, independent toggles) ---
test('grouped menu: parent/child accordion with ARIA + independent toggles + Escape', () => {
  const groups = [...html.matchAll(/<li class="motoai-group" data-group="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(groups, ['cm', 'pages', 'pl', 'dv'], 'v79: exactly 4 groups in order: Cẩm nang, Trang Web, Pháp Lý, Dịch Vụ');
  // Every expand/collapse control is ARIA-backed, controls an existing list
  // (hidden ⇔ collapsed) and names its action + target for relabelling.
  const toggles = [...html.matchAll(/<button type="button" class="motoai-toggle( motoai-group-btn)?" id="([^"]+)-btn" aria-expanded="(true|false)" aria-controls="([^"]+)" aria-label="([^"]+)" data-name="([^"]+)"><\/button>/g)];
  const topicLists = (html.match(/<ul class="motoai-topic-items"/g) || []).length;
  assert.ok(topicLists >= 1, 'at least one category carries subtopics');
  assert.equal(toggles.length, 4 + 3 + topicLists, 'one control per group, per hub and per category with topics');
  assert.equal(toggles.filter((t) => t[1]).length, 4, 'exactly one .motoai-group-btn per group');
  for (const [, , id, expanded, controls, label, name] of toggles) {
    assert.equal(controls, id, `${id}: aria-controls matches the control id`);
    assert.ok(html.includes(`id="${controls}"${expanded === 'true' ? '>' : ' hidden>'}`), `${controls}: list exists and is hidden exactly when collapsed`);
    assert.equal(label, `${expanded === 'true' ? 'Thu gọn' : 'Mở rộng'} ${name}`, `${id}: label names the action`);
  }
  // Short customer labels only — old long labels are gone.
  for (const old of ['Blog / Cẩm nang', 'App &amp; Ứng dụng', 'Thuê xe máy</a>', 'Hướng dẫn / Thủ tục', 'An toàn / Pháp lý', 'Địa phương / Du lịch', 'Xóa hội thoại', 'Chính sách bảo mật</a>', 'Điều khoản sử dụng</a>']) {
    assert.ok(!html.includes(old), `long label "${old}" must be simplified`);
  }
  assert.ok(html.includes('🧹 Xóa chat'), 'reset label is "Xóa chat"');
  // Compact group heads: an SVG glyph + the label in a <span>; Cẩm nang is a
  // link to the blog home, the other groups a plain title (no emoji text).
  const heads = {
    cm: ['<a class="motoai-group-link" href="/blog/">', 'book', 'Cẩm nang', 'a'],
    pages: ['<span class="motoai-group-title">', 'grid', 'Trang Web', 'span'],
    pl: ['<span class="motoai-group-title">', 'lock', 'Pháp Lý', 'span'],
    dv: ['<span class="motoai-group-title">', 'phone', 'Dịch Vụ', 'span']
  };
  for (const [id, [open, glyph, label, tag]] of Object.entries(heads)) {
    const re = new RegExp(`<li class="motoai-group" data-group="${id}">\\s*<div class="motoai-row motoai-group-head">${rx(open)}${GLYPH(glyph)}<span>${rx(label)}</span></${tag}><button type="button" class="motoai-toggle motoai-group-btn" id="motoai-group-${id}-btn"`);
    assert.match(html, re, 'compact group present: ' + label);
  }
  // Independent accordions (v79: a toggle owns ONLY its own list — opening a
  // hub never collapses the others) + Escape/backdrop close: the shared
  // drawer controller (assets/js/drawer.js), imported by the Agent app.
  assert.match(mainJs, /import \{ createDrawer \} from '\.\/drawer\.js\?v=79';/, 'the Agent app uses the shared controller');
  assert.match(drawerJs, /for \(const btn of drawer\.querySelectorAll\('\.motoai-toggle'\)\)/, 'every control is wired');
  assert.ok(!/closeGroups/.test(drawerJs), 'no one-open auto-collapse');
  assert.match(drawerJs, /btn\.setAttribute\('aria-expanded', expanded \? 'true' : 'false'\);/);
  assert.match(drawerJs, /if \(list\) list\.hidden = !expanded;/, 'the hidden attribute follows aria-expanded');
  assert.match(drawerJs, /drawer\.dataset\[expanded \? 'collapse' : 'expand'\]/, 'labels rebuilt from the nav templates');
  assert.match(drawerJs, /tpl\.replace\('\{name\}', btn\.dataset\.name\)/);
  assert.match(drawerJs, /closest\('\.motoai-toggle, \.motoai-drawer-theme'\)\) return; \/\/ stays open/, 'a toggle (or the theme row) never closes the drawer');
  assert.match(drawerJs, /event\.key === 'Escape'/, 'Escape still closes the drawer');
  // Children are visually indented per level; hidden lists take no space.
  assert.match(css, /\.motoai-drawer-list \.motoai-group-items\s*\{[^}]*padding-left:\s*6px;/s);
  assert.match(css, /\.motoai-drawer-list \.motoai-hub-items\s*\{\s*padding:\s*0 0 4px 26px;/);
  assert.match(css, /\.motoai-drawer-list \.motoai-topic-items\s*\{[^}]*margin:\s*0 0 4px 12px;[^}]*padding-left:\s*8px;[^}]*border-left:/s);
  assert.match(css, /\.motoai-drawer \[hidden\]\s*\{\s*display:\s*none !important;\s*\}/);
});

// --- 5i. Privacy + Terms pages (v50) ---
test('privacy and terms routes exist, are real pages, and are in the sitemap', () => {
  const privacy = readFileSync(join(ROOT, 'privacy/index.html'), 'utf8');
  const terms = readFileSync(join(ROOT, 'terms/index.html'), 'utf8');
  assert.match(privacy, /<title>Chính sách bảo mật/);
  assert.match(terms, /<title>Điều khoản sử dụng/);
  assert.match(privacy, /rel="canonical" href="https:\/\/chatbot\.thuexemaynguyentu\.com\/privacy\/"/);
  assert.match(terms, /rel="canonical" href="https:\/\/chatbot\.thuexemaynguyentu\.com\/terms\/"/);
  // Truthful privacy: no absolute "zero data leaves device" claim; mentions external links.
  assert.ok(privacy.includes('localStorage'), 'privacy explains local storage');
  assert.ok(privacy.toLowerCase().includes('whatsapp') && privacy.toLowerCase().includes('maps'), 'privacy covers external links');
  assert.ok(privacy.includes('API key') === false || privacy.includes('không cần API key'), 'API-key claim consistent');
  const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes('/privacy/'), 'sitemap lists privacy');
  assert.ok(sitemap.includes('/terms/'), 'sitemap lists terms');
});

// --- 5j. Color contract (v74): text on filled primary surfaces is readable in BOTH themes ---
test('on-primary text keeps WCAG AA contrast on the primary fill in both themes', () => {
  const blocks = [css.match(/:root\s*\{[^}]*\}/)[0], css.match(/html\[data-motoai-theme="dark"\]\s*\{[^}]*\}/)[0]];
  const lum = (hex) => {
    const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const light = blocks[0];
  const resolve = (block, token) => {
    let value = (block.match(new RegExp(`${token}:\\s*([^;]+);`)) ?? light.match(new RegExp(`${token}:\\s*([^;]+);`)))[1].trim();
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    return ref ? resolve(block, ref[1]) : value;
  };
  for (const block of blocks) {
    const fill = resolve(block, '--color-primary');
    const text = resolve(block, '--color-on-primary');
    const [a, b] = [lum(fill), lum(text)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    assert.ok(ratio >= 4.5, `on-primary ${text} on ${fill}: contrast ${ratio.toFixed(2)} < 4.5`);
  }
});

// --- 5k. Menu discoverability (v51 → v79): "☰ Danh mục" pill, the FIRST control of every header ---
test('menu button: icon + visible "Danh mục" text, first in both headers, pill style, ARIA intact, finite pulse', () => {
  // 1. Icon + text label, not icon-only — identical markup to every content
  //    page: the ONE menuButton() of tools/app-shell.mjs, rendered once.
  const btnRe = /<button[^>]*class="motoai-menu"[^>]*>([\s\S]*?)<\/button>/;
  const btn = btnRe.exec(html)?.[1] ?? '';
  assert.match(btn, /<span class="menu-lines" aria-hidden="true"><\/span>/, 'two-line menu glyph (content-site header)');
  assert.match(btn, /<span class="motoai-menu-label">Danh mục<\/span>/, 'visible "Danh mục" text label');
  const blogHtml = readFileSync(join(ROOT, 'blog/index.html'), 'utf8');
  assert.equal(btn, btnRe.exec(blogHtml)?.[1], 'Agent app Menu button = content-site Menu button');
  assert.equal(btnRe.exec(html)[0], menuButton(), 'rendered by menuButton()');
  assert.equal(btnRe.exec(blogHtml)[0], menuButton(), 'content pages render the same menuButton()');
  assert.equal((html.match(/id="motoai-menu-btn"/g) || []).length, 1, 'exactly ONE ☰ in the Agent app');
  assert.equal((blogHtml.match(/id="motoai-menu-btn"/g) || []).length, 1, 'exactly ONE ☰ on a content page');
  // 2. ARIA + relabel data (config/blog-ui.json labels): open/close wording, the panel it controls.
  assert.match(html, /id="motoai-menu-btn" title="Mở danh mục" aria-label="Mở danh mục" aria-expanded="false" aria-controls="motoai-drawer" data-open="Mở danh mục" data-close="Đóng danh mục">/);
  assert.ok(!html.includes('aria-label="Mở menu"') && !html.includes('>Menu</span>'), 'the old "Menu" wording is gone');
  // 3. Placement (v79 owner spec): a clearly visible ☰ Danh mục FIRST on the
  //    header of every device — first child of header.motoai-header (Agent
  //    app) and of .site-header-inner (content pages); .site-actions keeps
  //    search + theme + Hỏi Agent only (no second copy on the right).
  assert.match(html, /<header class="motoai-header">\s*<button type="button" class="motoai-menu" id="motoai-menu-btn"/, 'Agent header: ☰ first');
  assert.match(blogHtml, /<div class="site-header-inner">\s*<button type="button" class="motoai-menu" id="motoai-menu-btn"[^>]*>[\s\S]*?<\/button>\s*<a class="site-brand"/, 'content header: ☰ first, then the brand');
  const actions = blogHtml.slice(blogHtml.indexOf('<div class="site-actions">'), blogHtml.indexOf('<span class="motoai-status"'));
  assert.ok(actions.length > 0 && !actions.includes('motoai-menu'), 'no second ☰ inside .site-actions');
  assert.match(actions, /<a class="site-search-link"[\s\S]*<button type="button" class="blog-theme-toggle"[\s\S]*<a class="site-agent-cta" href="\/agent\/"/, 'actions = search, theme, Hỏi Agent');
  // Never hidden by the Agent header rules (only the embed widget hides it);
  // it owns the "menu" header grid area on every breakpoint.
  assert.ok(!/\.motoai-header \.motoai-menu\s*\{[^}]*display:\s*none/s.test(css), 'visible in the Agent header on every device');
  assert.match(css, /\.motoai-menu\s*\{[^}]*grid-area:\s*menu;/s);
  assert.match(css, /\.motoai-header\s*\{[^}]*grid-template-areas:\s*"menu mark title actions" "sub sub sub sub" "status status status status";/s);
  assert.match(css, /@media \(min-width: 768px\)\s*\{[^@]*\.motoai-header\s*\{[^}]*grid-template-areas:\s*"menu mark title status actions" "menu mark sub status actions";/s);
  // 4. Pill: V2 ink fill with paper text (contrast in both themes), 44px target.
  assert.match(css, /\.motoai-menu\s*\{[^}]*min-height:\s*44px;[^}]*border-radius:\s*var\(--radius-full\);[^}]*background:\s*var\(--ink\);[^}]*color:\s*var\(--paper\);/s);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)\s*\{[^@]*\.motoai-menu:hover\s*\{\s*background:\s*var\(--signal\);\s*color:\s*var\(--on-signal\);/, 'pointer-only hover, never sticky after a tap');
  assert.match(css, /\.motoai-menu:active[^{]*\{[^}]*transform:\s*scale\(0\.97\);/s, 'obvious tap state');
  // 5. Attention cue is FINITE: 3 iterations, no infinite.
  const anim = css.match(/\.motoai-menu\s*\{[^}]*animation:\s*([^;}]+);/s)?.[1] ?? '';
  assert.ok(anim.includes('motoai-menu-glow'), 'glow animation defined');
  assert.ok(/\b3\b/.test(anim), 'pulse runs a finite number of cycles (3)');
  assert.ok(!/infinite/.test(anim), 'menu pulse is never infinite (typing-dots indicator exempt)');
  // 6. Reduced motion disables the pulse entirely.
  const rm = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.motoai-menu\s*\{\s*animation:\s*none;\s*\}/, 'reduced-motion kills the pulse');
});
