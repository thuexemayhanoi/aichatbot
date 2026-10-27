import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MATRIX_ROWS } from '../../tools/matrix-size.mjs';

/**
 * Blog App UX Foundation (v54) spec:
 * - theme.js: Light / Dark / Auto with persistence + no-flash inline script
 * - business-status.js: verified open/closed in the business timezone
 * - shell contract: compact header, category bar, back-to-Agent, contact refs
 * - NO hard-coded contact values in blog runtime UI (business.json is truth)
 * - NO mass article generation (content matrix rows stay PLANNED)
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const HUBS = ['app', 'thue-xe', 'xe-dien', 'huong-dan', 'an-toan', 'dia-phuong'];

// ---------- Theme (Light / Dark / Auto) ----------

test('resolveTheme: explicit choices win; auto follows system preference', async () => {
  const { resolveTheme } = await import(join(ROOT, 'assets/js/theme.js'));
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
  assert.equal(resolveTheme('garbage', false), 'light'); // unknown -> auto -> light
});

test('readPreference: invalid or missing values fall back to auto', async () => {
  const { readPreference } = await import(join(ROOT, 'assets/js/theme.js'));
  const storage = {
    store: { 'motoai-theme': 'dark' },
    getItem(k) { return this.store[k] ?? null; }
  };
  assert.equal(readPreference(storage), 'dark');
  assert.equal(readPreference({ getItem: () => 'neon-pink' }), 'auto');
  assert.equal(readPreference({ getItem: () => null }), 'auto');
  assert.equal(readPreference(null), 'auto'); // storage unavailable
});

test('applyTheme: sets/removes the shared data-motoai-theme attribute', async () => {
  const { applyTheme } = await import(join(ROOT, 'assets/js/theme.js'));
  const attrs = new Map();
  const doc = { documentElement: {
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k)
  } };
  applyTheme('dark', doc, false);
  assert.equal(attrs.get('data-motoai-theme'), 'dark');
  applyTheme('light', doc, true);
  assert.equal(attrs.get('data-motoai-theme'), undefined);
  applyTheme('auto', doc, true);
  assert.equal(attrs.get('data-motoai-theme'), 'dark');
});

// ---------- Business open/closed status (verified hours, business timezone) ----------

const HOURS = JSON.parse(read('data/business/business.json')).hours;

test('business hours are verified data with the Vietnam timezone', () => {
  assert.equal(HOURS.timeZone, 'Asia/Ho_Chi_Minh');
  assert.match(HOURS.open, /^\d{2}:\d{2}$/);
  assert.match(HOURS.close, /^\d{2}:\d{2}$/);
});

test('computeStatus: ICT boundaries (no DST, UTC+7)', async () => {
  const { computeStatus } = await import(join(ROOT, 'assets/js/business-status.js'));
  // 02:00Z == 09:00 ICT -> exactly at open
  assert.equal(computeStatus({ now: new Date('2026-09-26T02:00:00Z'), hours: HOURS }).open, true);
  // 01:59Z == 08:59 ICT -> before opening
  assert.equal(computeStatus({ now: new Date('2026-09-26T01:59:00Z'), hours: HOURS }).open, false);
  // 13:59Z == 20:59 ICT -> still open
  assert.equal(computeStatus({ now: new Date('2026-09-26T13:59:00Z'), hours: HOURS }).open, true);
  // 14:00Z == 21:00 ICT -> exactly at close -> closed
  assert.equal(computeStatus({ now: new Date('2026-09-26T14:00:00Z'), hours: HOURS }).open, false);
});

test('computeStatus: midnight-wrap window (close <= open) and invalid data', async () => {
  const { computeStatus } = await import(join(ROOT, 'assets/js/business-status.js'));
  const wrap = { open: '21:00', close: '02:00', display: '21:00–02:00', timeZone: 'Asia/Ho_Chi_Minh' };
  // 16:00Z == 23:00 ICT -> inside the wrap window
  assert.equal(computeStatus({ now: new Date('2026-09-26T16:00:00Z'), hours: wrap }).open, true);
  // 20:00Z == 03:00 ICT -> after wrap close, before next open
  assert.equal(computeStatus({ now: new Date('2026-09-26T20:00:00Z'), hours: wrap }).open, false);
  // Missing / malformed hours -> null so the UI hides the chip (never guesses)
  assert.equal(computeStatus({ now: new Date(), hours: null }), null);
  assert.equal(computeStatus({ now: new Date(), hours: { open: '9', close: '21:00', timeZone: 'Asia/Ho_Chi_Minh' } }), null);
  assert.equal(computeStatus({ now: new Date(), hours: { open: '09:00', close: '21:00', timeZone: 'Not/AZone' } }), null);
});

test('renderStatus: open/closed copy and hidden fallback', async () => {
  const { renderStatus } = await import(join(ROOT, 'assets/js/business-status.js'));
  const el = { dataset: {} };
  renderStatus(el, null);
  assert.equal(el.hidden, true);
  renderStatus(el, { open: true, opensAt: '09:00', closesAt: '21:00', display: '09:00 - 21:00' });
  assert.equal(el.hidden, false);
  assert.equal(el.dataset.state, 'open');
  assert.ok(el.textContent.includes('Đang mở'));
  renderStatus(el, { open: false, opensAt: '09:00', closesAt: '21:00', display: '09:00 - 21:00' });
  assert.equal(el.dataset.state, 'closed');
  assert.ok(el.textContent.includes('Đã đóng'));
  assert.ok(el.textContent.includes('09:00'));
});

// ---------- Blog shell contract (v58: chat homepage + normal content site) ----------

const STATIC_PAGES = ['privacy/index.html', 'terms/index.html',
  'gioi-thieu/index.html', 'chinh-sach/index.html', 'lien-he/index.html', 'gia-thue/index.html', 'doi-tac/index.html'];
const CLUSTER_DIRS = ['cong-cu-huong-dan', 'thue-xe-phuong-tien', 'kham-pha-an-toan'];

// v79 responsive navigation V2: ONE ☰ Danh mục control (labels from
// config/blog-ui.json) opens the ONE sidebar from every header; no bottom bar.
const L = JSON.parse(read('config/blog-ui.json')).labels;
const NAV = JSON.parse(read('config/navigation.json'));
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MENU_BTN = `<button type="button" class="motoai-menu" id="motoai-menu-btn" title="${L.menuOpen}" aria-label="${L.menuOpen}" aria-expanded="false" aria-controls="motoai-drawer" data-open="${L.menuOpen}" data-close="${L.menuClose}"><span class="menu-lines" aria-hidden="true"></span> <span class="motoai-menu-label">${L.menuLabel}</span></button>`;
// The sidebar is never shipped with a hidden attribute: CSS (.is-open / the desktop column) owns its state.
const DRAWER_OPEN = new RegExp(`<div class="motoai-drawer-backdrop" id="motoai-drawer-backdrop"></div>\\s*<nav class="motoai-drawer" id="motoai-drawer" aria-label="${rx(L.menuLabel)}" data-expand="${rx(L.menuExpand)}" data-collapse="${rx(L.menuCollapse)}">`);
const NO_BOTTOM_BAR = /app-tabbar|class="app-tab\b|motoai-dock|data-drawer-open|is-typing/;

function blogPages() {
  const pages = ['blog/index.html', ...CLUSTER_DIRS.map((c) => `blog/${c}/index.html`), ...HUBS.map((h) => `blog/${h}/index.html`)];
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  pages.push(...walk('blog/app').filter((p) => p.endsWith('index.html') && p !== 'blog/app/index.html'));
  pages.push(...walk('blog/huong-dan').filter((p) => p.endsWith('index.html') && p !== 'blog/huong-dan/index.html'));
  return pages;
}

test('v58 content site: every generated page uses the shared site header + footer', () => {
  for (const page of [...blogPages(), ...STATIC_PAGES]) {
    const html = read(page);
    // Normal website chrome: shared site header with the MotoAI identity.
    assert.match(html, /<header class="site-header">/, `${page}: shared site header`);
    assert.ok(html.includes('Hỗ trợ Agent'), `${page}: Agent identity in the header`);
    assert.equal((html.match(/id="motoai-menu-btn"/g) ?? []).length, 1, `${page}: exactly one ☰ Danh mục button`);
    assert.ok(html.includes('id="blog-theme-toggle"'), `${page}: theme control`);
    assert.equal((html.match(/id="motoai-drawer"/g) ?? []).length, 1, `${page}: exactly one shared sidebar`);
    assert.match(html, DRAWER_OPEN, `${page}: shared sidebar + backdrop, labelled from config, no hidden attribute`);
    // v79 header row, left → right: ☰ Danh mục FIRST (owner spec: visible on every
    // device), brand, desktop menu, then the actions (search → theme → Hỏi Agent
    // /agent/, the last interactive element), then the status as the final child.
    const row = new RegExp('<div class="site-header-inner">\\s*' + rx(MENU_BTN) +
      '\\s*<a class="site-brand" href="/"[^>]*>[\\s\\S]*?</a>' +
      '\\s*<nav class="site-nav" aria-label="[^"]+">[\\s\\S]*?</nav>' +
      '\\s*<div class="site-actions">' +
      '\\s*<a class="site-search-link" href="/blog/#blog-search"[^>]*>[\\s\\S]*?</a>' +
      '\\s*<button type="button" class="blog-theme-toggle" id="blog-theme-toggle"[^>]*>[^<]*</button>' +
      `\\s*<a class="site-agent-cta" href="/agent/" aria-label="${rx(L.headerAgent)}">[\\s\\S]*?</a>` +
      '\\s*</div>' +
      '\\s*<span class="motoai-status" id="blog-business-status"[^>]*></span>' +
      '\\s*</div>(?:\\s*<span class="read-progress" aria-hidden="true"></span>)?\\s*</header>');
    assert.match(html, row, `${page}: ☰ Danh mục, brand, menu, then search → theme → Hỏi Agent, then status`);
    const actions = html.slice(html.indexOf('<div class="site-actions">'), html.indexOf('</header>'));
    assert.ok(!actions.includes('motoai-menu'), `${page}: no second Menu control in the right-hand actions`);
    // Real footer on every content page — generated from navigation config.
    assert.match(html, /<footer class="blog-footer">/, `${page}: site footer`);
    assert.ok(html.includes('blog-footer-nav'), `${page}: footer nav groups`);
    // No chat dock and no bottom tab bar on content pages: the sidebar is the only menu.
    assert.ok(!NO_BOTTOM_BAR.test(html), `${page}: no chat dock, no bottom tab bar on content pages`);
    assert.ok(!html.includes('id="motoai-reset"') && !html.includes('id="motoai-menu-agent"'), `${page}: content sidebar, not the chat variant`);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${page}: exactly one H1`);
    assert.ok(html.includes('<link rel="canonical"'), `${page}: canonical`);
    assert.match(html, /motoai-theme/, `${page}: no-flash theme script`);
    assert.ok(html.includes('app-shell.js'), `${page}: app shell runtime`);
    // Legacy standalone blog chrome must be gone.
    for (const legacy of ['class="blog-back"', 'class="blog-header"', 'class="blog-hero"', 'class="blog-cta"', 'class="blog-contact"', 'id="motoai-menu-zalo"']) {
      assert.ok(!html.includes(legacy), `${page}: legacy chrome "${legacy}" removed`);
    }
    // Ask Agent is a native action that opens the Agent app (v76: /agent/, no longer /).
    assert.ok(html.includes('/agent/?ask='), `${page}: Ask Agent action`);
    assert.ok(!/href="\/\?(ask|action)=/.test(html), `${page}: no chat deep link to / (chat lives at /agent/)`);
  }
});

test('Agent app (/agent/) keeps the app shell: shared sidebar (chat variant), NO bottom bar, NO site footer, ☰ Danh mục first', () => {
  const html = read('agent/index.html');
  // v79: the v78 bottom tab bar is retired; the shared sidebar (chat variant) is the Agent's one menu.
  assert.ok(!NO_BOTTOM_BAR.test(html), 'Agent app has no bottom tab bar and no dock');
  assert.equal((html.match(/id="motoai-drawer"/g) ?? []).length, 1, 'exactly one sidebar');
  assert.match(html, DRAWER_OPEN, 'Agent app carries the shared sidebar + backdrop, never a hidden attribute');
  const start = html.indexOf('<nav class="motoai-drawer"');
  const drawer = html.slice(start, html.indexOf('</nav>', start));
  assert.match(drawer, new RegExp(`<li><button type="button" id="motoai-menu-agent"><svg class="motoai-nav-icon i-chat"[^>]*>[\\s\\S]*?</svg><span>${rx(NAV.agent.label)}</span></button></li>`), 'chat variant: Hỏi Agent focuses the chat');
  for (const id of ['motoai-menu-address', 'motoai-menu-contact']) {
    assert.match(drawer, new RegExp(`<button type="button" id="${id}"><span>[^<]+</span></button>`), `chat variant: ${id} action`);
  }
  for (const id of ['motoai-menu-call', 'motoai-menu-whatsapp', 'motoai-menu-map']) {
    assert.match(drawer, new RegExp(`<a id="${id}" href="#"[^>]*><span>[^<]+</span></a>`), `chat variant: ${id} contact (href resolved at runtime)`);
  }
  assert.match(drawer, new RegExp('<li class="motoai-drawer-util"><button type="button" class="blog-theme-toggle motoai-drawer-theme"[^>]*>[^<]*</button></li>' +
    '\\s*<li class="motoai-drawer-divider" role="separator"></li>' +
    `\\s*<li class="motoai-drawer-util"><button type="button" id="motoai-reset">${rx(NAV.chat_extras.reset.icon)} ${rx(NAV.chat_extras.reset.label)}</button></li>\\s*</ul>\\s*$`),
  'chat variant ends with the theme row, a divider and the reset action');
  assert.ok(!html.includes('class="blog-footer"'), 'Agent app has NO traditional footer');
  assert.ok(!html.includes('class="site-header"'), 'Agent app keeps its own app header');
  assert.equal((html.match(/id="motoai-menu-btn"/g) ?? []).length, 1, 'exactly one ☰ Danh mục button');
  // ☰ Danh mục is the FIRST control of the header (left on mobile + desktop), then
  // the identity, the status, the desktop menu row and the actions (theme → install).
  const header = html.slice(html.indexOf('<header class="motoai-header">'), html.indexOf('</header>') + '</header>'.length);
  assert.match(header, new RegExp('^<header class="motoai-header">\\s*' + rx(MENU_BTN) +
    '\\s*<div class="motoai-header-text">[\\s\\S]*?<h1 class="motoai-title">[^<]+</h1>[\\s\\S]*?</div>\\s*</div>' +
    '\\s*<span class="motoai-status" id="motoai-status"[^>]*></span>' +
    '\\s*<nav class="site-nav" aria-label="[^"]+">[\\s\\S]*?</nav>' +
    '\\s*<div class="motoai-header-actions">' +
    '\\s*<button type="button" class="motoai-theme blog-theme-toggle" id="blog-theme-toggle"[^>]*>[^<]*</button>' +
    '\\s*<button type="button" class="motoai-install" id="motoai-install"[^>]*>[^<]*</button>' +
    '\\s*</div>\\s*</header>$'), 'header: ☰ Danh mục first, theme + install last on the right');
  // The header is a grid: the "menu" cell opens the identity row at every breakpoint.
  const shared = read('assets/css/style.css');
  assert.match(shared, /\.motoai-menu \{[^}]*grid-area: menu;/, '☰ Danh mục sits in the "menu" grid cell');
  assert.match(shared, /\.motoai-header \{[^}]*grid-template-areas: "menu mark title actions" "sub sub sub sub" "status status status status";/, 'phones: menu first, actions last');
  assert.match(shared, /grid-template-areas: "menu mark title status actions" "menu mark sub status actions";/, '>= 768px: menu first, actions last');
  assert.match(shared, /\.motoai-header \{ grid-template-areas: "nav nav nav nav nav" "menu mark title status actions" "menu mark sub status actions"; \}/, 'desktop: the menu row above, menu still first');
  for (const m of shared.matchAll(/grid-template-areas:([^;]*);/g)) {
    if (m[1].includes('mark')) assert.match(m[1], /"menu mark /, `every Agent header layout starts with ☰ Danh mục: ${m[1].trim()}`);
  }
  assert.ok(!/\.motoai-header \.motoai-menu \{[^}]*display: none/.test(shared), 'never hidden in the Agent app (only the embed widget hides it)');
});

test('site header CSS contract: sticky header, ☰ Danh mục left, actions pinned right, no tiny identity column', () => {
  const css = read('assets/css/blog.css');
  assert.match(css, /\.site-header\s*\{[^}]*position:\s*sticky/, 'sticky site header');
  assert.match(css, /\.site-actions\s*\{[^}]*margin-left:\s*auto/, 'actions (search, theme, Hỏi Agent) pinned to the right');
  assert.match(css, /\.site-brand\s*\{[^}]*min-width:\s*0/, 'identity block can shrink safely');
  assert.match(css, /\.site-main\s*\{[^}]*min-width:\s*0/, 'main column never forces page overflow');
  // v79: ☰ Danh mục is the first flex child of the header row, styled as a pill on
  // content pages and never reordered, pushed right or hidden there.
  const pills = [...css.matchAll(/body\.content-page \.motoai-menu\s*\{([^}]*)\}/g)];
  assert.ok(pills.length >= 1, 'content pages style the ☰ Danh mục pill');
  for (const m of pills) assert.ok(!/(^|;)\s*(order:|margin-left:\s*auto|display:\s*none)/.test(m[1]), `☰ Danh mục stays first and visible: ${m[1]}`);
  assert.ok(!css.includes('.site-actions .motoai-menu'), 'the menu is no longer one of the right-hand actions');
  assert.ok(!/(^|[},])\.motoai-menu\s*\{[^}]*display:\s*none/.test(css), 'no content-page rule hides the menu');
  // Desktop (>= 1200px): the header spans the sidebar grid; 1200–1359px is compact.
  assert.match(css, /@media \(min-width: 1200px\)\{[^@]*\.site-header-inner\{max-width:none\}\}/, 'the header row spans sidebar + main at >= 1200px');
  assert.match(css, /@media \(min-width: 1200px\) and \(max-width: 1359\.98px\)\{\.site-brand-text span,\.site-header \.motoai-status\{display:none\}\}/, 'compact 1200–1359px header');
  assert.match(css, /@media \(max-width: 479px\)\{\.site-agent-cta\{width:44px;padding:0\}\.site-agent-cta span\{display:none\}\}/, 'Hỏi Agent icon-only below 480px only');
  assert.equal((css.match(/\.site-agent-cta span\{display:none\}/g) ?? []).length, 1, 'Hỏi Agent keeps its text from 480px up');
  // v77: the desktop menu is shared with the Agent app, so its CSS lives in style.css.
  const shared = read('assets/css/style.css');
  assert.match(shared, /\.site-nav\s*\{[^}]*display:\s*none/, 'desktop nav hidden on phones + tablets (the sidebar serves them)');
  assert.match(shared, /@media \(min-width: 1200px\) \{\s*\.site-nav\s*\{[^}]*display:\s*flex/, 'desktop nav appears >= 1200px (v79, was 900px)');
  const shows = [...shared.matchAll(/\.site-nav\s*\{[^}]*display:\s*flex/g)];
  assert.ok(shows.length >= 1);
  for (const m of shows) {
    const before = shared.slice(0, m.index);
    const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
    assert.ok(depth > 0, 'the desktop nav is never shown by a top-level rule');
    assert.match(before.slice(before.lastIndexOf('@media')), /^@media \(min-width: 1200px\)/, 'the desktop nav is never shown below 1200px');
  }
  assert.match(shared, /@media \(min-width: 1200px\) and \(max-width: 1359\.98px\) \{\s*\.site-nav > a, \.site-nav-parent \{ padding: 6px 9px;/, 'compact desktop nav 1200–1359px');
  assert.match(shared, /\.site-nav-icon \{ display: none; \}\s*@media \(min-width: 1360px\) \{\s*\.site-nav-icon \{ display: block;/, 'nav icons from 1360px');
  assert.ok(!/\.site-nav\b/.test(css), 'no second copy of the menu CSS in blog.css');
});

test('hub screens mark their own category with aria-current and keep a breadcrumb', () => {
  for (const hub of HUBS) {
    const html = read(`blog/${hub}/index.html`);
    const links = [...html.matchAll(/href="\/blog\/([a-z-]+)\/"[^>]*aria-current="page"/g)].map((m) => m[1]);
    assert.ok(links.includes(hub), `${hub}: active category marked`);
    assert.ok(html.includes('blog-breadcrumb'), `${hub}: breadcrumb present`);
    // Category chips live INSIDE the screen body, not as a second top nav.
    assert.match(html, /<div class="blog-chips" aria-label="Danh mục">/);
  }
});

test('category chips are one non-wrapping horizontal row on mobile (CSS contract)', () => {
  const css = read('assets/css/blog.css');
  assert.match(css, /\.blog-chips\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /\.blog-chips\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.blog-chip\s*\{[^}]*flex:\s*0 0 auto/);
});

test('business status line exists on every page and starts hidden (never guesses)', () => {
  for (const page of [...blogPages(), ...STATIC_PAGES]) {
    const html = read(page);
    assert.ok(html.includes('id="blog-business-status"'), `${page}: status element`);
    assert.match(html, /id="blog-business-status"[^>]*hidden/, `${page}: hidden until data loads`);
  }
});

test('article-card descriptions resolve verified business facts before rendering', async () => {
  const { resolveFacts } = await import(join(ROOT, 'tools/build-blog.mjs'));
  const business = JSON.parse(read('data/business/business.json'));
  const raw = 'Du khách đến {{ business.brand }} cần hướng dẫn thuê xe.';
  assert.equal(resolveFacts(raw, business), `Du khách đến ${business.brand} cần hướng dẫn thuê xe.`);
  const builder = read('tools/build-blog.mjs');
  assert.match(builder, /description: resolveFacts\(a\.description, business\)/,
    'build must resolve summary placeholders for cards, snippets and meta');
});

test('no unrendered template placeholders anywhere in generated HTML', () => {
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  for (const p of [...walk('blog').filter((p) => p.endsWith('.html')), ...STATIC_PAGES]) {
    assert.ok(!read(p).includes('{{'), `${p}: no template placeholders`);
  }
});

test('articles resolve contact CTA hrefs at runtime — no hard-coded contact values', () => {
  const business = JSON.parse(read('data/business/business.json'));
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  for (const p of walk('blog').filter((p) => p.endsWith('.html'))) {
    const html = read(p);
    // Informational prose may mention communication platforms, but the
    // runtime contact shell must never expose Zalo as an active channel.
    assert.ok(!/data-contact-ref="zalo"/i.test(html), `${p}: Zalo is not an active contact ref`);
    assert.ok(!html.includes(business.contact.whatsapp), `${p}: WhatsApp URL must come from business.json`);
    assert.ok(!html.includes(business.contact.maps), `${p}: Maps URL must come from business.json`);
    assert.ok(!html.includes(business.contact.phone_uri), `${p}: phone URI must come from business.json`);
    assert.ok(!/href="tel:\+/.test(html), `${p}: no tel: href`);
    assert.ok(!/href="https:\/\/(zalo\.me|wa\.me|maps\.app\.goo\.gl)/.test(html), `${p}: no hard-coded contact hrefs`);
  }
});

test('contact mechanism: data-contact-ref anchors cover whatsapp, call and map (no Zalo)', () => {
  const refs = new Set();
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  for (const p of [...walk('blog'), 'privacy', 'terms', 'gioi-thieu', 'chinh-sach', 'lien-he', 'gia-thue', 'doi-tac'].filter((p) => p.endsWith('.html'))) {
    for (const m of read(p).matchAll(/data-contact-ref="([a-z]+)"/g)) refs.add(m[1]);
  }
  for (const ref of ['whatsapp', 'call', 'map']) {
    assert.ok(refs.has(ref), `contact ref "${ref}" used somewhere in the app UI`);
  }
  assert.ok(!refs.has('zalo'), 'Zalo is not a contact ref anymore');
  const app = read('assets/js/app-shell.js');
  assert.ok(app.includes("phone_uri"), 'call ref maps to verified phone_uri');
  assert.ok(app.includes('noopener noreferrer'), 'external links are safe');
});

test('theme styles: shared data-motoai-theme tokens + focus-visible + touch targets', () => {
  const css = read('assets/css/blog.css');
  assert.ok(css.includes('data-motoai-theme="dark"]') || /html\[data-motoai-theme="dark"\]/.test(read('assets/css/style.css')), 'dark theme reuses shared tokens');
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.blog-theme-toggle\s*\{[^}]*min-height:\s*4\dpx/);
  assert.match(css, /\.screen-ask-btn\s*\{[^}]*min-height:\s*4\dpx/);
});

// ---------- Content factory safety ----------

test('NO mass article generation: matrix stays 2,000 rows, manifest stays in sync', () => {
  const lines = read('data/blog/content-matrix.csv').trim().split('\n');
  assert.equal(lines.length - 1, MATRIX_ROWS);
  const statuses = lines.slice(1).map((l) => l.split(',')[3]);
  const published = statuses.filter((s) => s === 'PUBLISHED').length;
  // v64 micro loop: one article per cycle. The manifest may hold ONE
  // in-flight draft (QA/PASS row) before the workflow's derived commit;
  // every PUBLISHED matrix row must exist in the manifest.
  const manifest = JSON.parse(read('data/blog/published.json'));
  const manifestIds = new Set(manifest.articles.map((a) => a.article_id));
  const publishedIds = lines.slice(1).filter((l) => l.split(',')[3] === 'PUBLISHED').map((l) => l.split(',')[0]);
  for (const id of publishedIds) assert.ok(manifestIds.has(id), `PUBLISHED ${id} missing from manifest`);
  assert.ok(manifest.articles.length >= published, 'manifest cannot lag behind the matrix');
  assert.ok(published >= 2, 'pilot articles remain published');
});
