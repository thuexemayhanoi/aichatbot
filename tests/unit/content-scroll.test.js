import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * v59 content scroll + mobile regression contract:
 *   - exactly ONE footer per content page, emitted AFTER </main>
 *   - chat homepage: 0 footers, keeps the app shell; content pages: no
 *     chat viewport wrapper (.motoai-app), no dock, no composer
 *   - content pages scroll as normal documents (body.content-page contract)
 *   - service worker: navigation responses cached per-URL — a content page
 *     can NEVER overwrite the cached chat homepage
 *   - v79 sidebar: the ONLY scroll lock is html.drawer-lock, applied while the
 *     overlay is open on a content page (never on body.chat-home) and released
 *     by every close path, restoring the reading position — no freeze possible
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const STATIC_DIRS = ['privacy', 'terms', 'gioi-thieu', 'chinh-sach', 'lien-he', 'gia-thue'];
const CLUSTER_DIRS = ['cong-cu-huong-dan', 'thue-xe-phuong-tien', 'kham-pha-an-toan'];

function contentPages() {
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  return [
    'index.html', // v76: / is the website homepage on the shared content shell
    'blog/index.html',
    ...CLUSTER_DIRS.map((c) => `blog/${c}/index.html`),
    ...walk('blog/app').filter((p) => p.endsWith('index.html')),
    ...walk('blog/huong-dan').filter((p) => p.endsWith('index.html')),
    ...STATIC_DIRS.map((d) => `${d}/index.html`)
  ];
}

const pages = contentPages();

test('v59: every content page has EXACTLY ONE footer, after </main>, never inside it', () => {
  for (const p of pages) {
    const html = read(p);
    assert.equal((html.match(/<footer class="blog-footer"/g) ?? []).length, 1, `${p}: exactly one blog footer`);
    const mainEnd = html.indexOf('</main>');
    const footerAt = html.indexOf('<footer class="blog-footer"');
    assert.ok(mainEnd !== -1 && footerAt > mainEnd, `${p}: footer sits after </main>`);
    const main = html.slice(html.indexOf('<main'), mainEnd);
    assert.ok(!main.includes('<footer'), `${p}: no footer inside main`);
    // The footer must also not be duplicated by the shell twice.
    assert.equal((html.match(/<\/footer>/g) ?? []).length, 1, `${p}: one closing footer tag`);
  }
});

test('v59/v76: the Agent app (/agent/) has ZERO footers and is NOT a content-page', () => {
  const html = read('agent/index.html');
  assert.equal((html.match(/<footer/g) ?? []).length, 0, 'Agent app: no site footer at all');
  assert.ok(!html.includes('class="content-page"'), 'Agent app keeps the app body, not the content-page body');
  assert.ok(html.includes('class="motoai-app"'), 'Agent app keeps the chat app shell');
});

test('v59: content pages use the normal document — no chat viewport, dock or composer', () => {
  for (const p of pages) {
    const html = read(p);
    assert.ok(!html.includes('class="motoai-app'), `${p}: no chat viewport wrapper`);
    assert.ok(!html.includes('motoai-dock'), `${p}: no chat dock`);
    assert.ok(!html.includes('motoai-send'), `${p}: no chat composer`);
    assert.ok(html.includes('<body class="content-page">'), `${p}: content-page body class`);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${p}: exactly one H1`);
  }
});

test('v60: CSS contract — content pages scroll as documents, chat lock stays chat-only', () => {
  const css = read('assets/css/blog.css');
  const style = read('assets/css/style.css');
  // NO global root lock in style.css (the v59 killer bug).
  assert.ok(!/html,\s*body\s*\{/.test(style), 'no global html,body selector block at all');
  assert.ok(!/html(\s*,\s*body)?\s*\{[^}]*[;{\s]height:\s*100%/.test(style), 'no root height:100%');
  assert.ok(!/html(\s*,\s*body)?\s*\{[^}]*[;{\s]overflow:\s*hidden/.test(style), 'no root overflow:hidden');
  assert.ok(!/html(\s*,\s*body)?\s*\{[^}]*[;{\s]overscroll-behavior:\s*none/.test(style), 'no root overscroll-behavior:none');
  // The chat lock is scoped to body.chat-home ONLY.
  assert.match(style, /body\.chat-home\s*\{[^}]*overflow:\s*hidden/, 'chat lock scoped to body.chat-home');
  assert.match(read('agent/index.html'), /<body class="chat-home">/, 'the Agent app carries the chat-home class');
  assert.ok(!read('index.html').includes('chat-home'), 'the homepage never takes the chat lock');
  // v60 content reset: direct, no :has() dependency.
  assert.ok(!/[.:#\[][\w-]*:has\(/.test(css), 'no :has() scroll dependency');
  assert.match(css, /html\s*\{[^}]*height:\s*auto\s*!important/, 'html height auto');
  assert.match(css, /html\s*\{[^}]*overflow-y:\s*auto/, 'html scrolls the document');
  assert.match(css, /body\.content-page\s*\{[^}]*overflow-y:\s*visible/, 'body does not create a scroll container');
  assert.match(css, /body\.content-page\s*\{[^}]*position:\s*static/, 'body position static');
  assert.match(css, /\.site-main\s*\{[^}]*overflow:\s*visible\s*!important/, 'site-main never traps scroll');
  assert.match(css, /\.site-main\s*\{[^}]*max-height:\s*none\s*!important/, 'site-main never height-capped');
  // No root-level iOS momentum hack.
  assert.ok(!/body\.content-page\s*\{[^}]*-webkit-overflow-scrolling/.test(css), 'no root momentum hack');
  // The 100dvh app lock exists ONLY for the chat shell.
  assert.match(style, /\.motoai-app\s*\{[^}]*height:\s*100dvh/, 'chat homepage keeps its app lock');
  assert.ok(!/\.site-main[\s\S]{0,80}100dvh/.test(css), 'no 100dvh on the content column');
  // Chips rail: horizontal scroll only, vertical swipes stay free.
  assert.match(css, /\.blog-chips\s*\{[^}]*overflow-x:\s*auto/, 'chips rail horizontal only');
  assert.ok(!/touch-action:\s*none/.test(css + style), 'no touch-action:none anywhere');
  // Closed drawer/backdrop can never intercept touch gestures. v79: the panel is
  // rendered WITHOUT `hidden`; CSS owns the open state, and closed means
  // visibility:hidden — an element that is never hit-tested cannot swallow a swipe.
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/, 'hidden attribute fully removes elements');
  const styleRules = style.replace(/\/\*[\s\S]*?\*\//g, '');
  const closedBackdrop = /(?:^|\})\s*\.motoai-drawer-backdrop\s*\{([^}]*)\}/.exec(styleRules)?.[1] ?? '';
  assert.match(closedBackdrop, /visibility:\s*hidden/, 'closed backdrop is visibility:hidden — never hit-tested, never intercepts swipes');
  assert.match(closedBackdrop, /opacity:\s*0;/, 'closed backdrop is fully transparent');
  const closedPanel = /(?:^|\})\s*\.motoai-drawer\s*\{([^}]*)\}/.exec(styleRules)?.[1] ?? '';
  assert.match(closedPanel, /visibility:\s*hidden/, 'closed panel is never hit-tested either');
  assert.match(closedPanel, /transform:\s*translateX\(-100%\)/, 'closed panel sits off screen');
  const visibleRules = (src) => [...src.matchAll(/([^{}]+)\{[^}]*visibility:\s*visible/g)].map((m) => m[1].trim());
  assert.deepEqual(visibleRules(styleRules).filter((s) => s.includes('motoai-drawer')), ['.motoai-drawer-backdrop.is-open', '.motoai-drawer.is-open'],
    'only the .is-open class (drawer.js) makes the overlay hit-testable');
  assert.ok(!visibleRules(css).some((s) => s.includes('motoai-drawer-backdrop')), 'the content stylesheet never reveals the backdrop');
  assert.match(css, /body\.content-page\s*>\s*\.motoai-drawer-backdrop\s*\{\s*display:\s*none/, 'desktop column mode has no backdrop at all');
  // v79 scoped scroll lock: the ONLY rule that fixes the page is the overlay lock
  // (html.drawer-lock on a content page); the chat stylesheet never fixes html/body.
  const fixedRules = (src) => [...src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^}]*position:\s*fixed/g)].map((m) => m[1].trim());
  assert.deepEqual(fixedRules(css), ['html.drawer-lock body.content-page'], 'the overlay lock is the only fixed rule of the content stylesheet');
  assert.match(css, /html\.drawer-lock body\.content-page\s*\{\s*position:\s*fixed;\s*left:\s*0;\s*right:\s*0;\s*width:\s*100%;\s*overflow-y:\s*hidden\s*\}/, 'the lock pins the document in place, nothing more');
  for (const sel of fixedRules(style)) assert.ok(!/(^|[\s,>+~])(html|body)\b/.test(sel), `style.css never fixes html/body (${sel})`);
  assert.ok(!style.includes('drawer-lock'), 'the chat shell never takes the overlay lock');
});

test('v60: asset cache-bust + build marker so iOS Safari cannot serve stale v58/v59 assets', () => {
  for (const p of pages.slice(0, 6)) {
    const html = read(p);
    assert.match(html, /<meta name="motoai-build" content="v\d+">/, `${p}: build marker present`);
    assert.match(html, /style\.css\?v=\d+/, `${p}: versioned style.css`);
    assert.match(html, /blog\.css\?v=\d+/, `${p}: versioned blog.css`);
    assert.match(html, /app-shell\.js\?v=\d+/, `${p}: versioned app-shell.js`);
  }
  const agent = read('agent/index.html');
  assert.match(agent, /<meta name="motoai-build" content="v\d+">/, 'Agent app build marker');
  assert.match(agent, /style\.css\?v=\d+/, 'Agent app versioned style.css');
  assert.match(agent, /main\.js\?v=\d+/, 'Agent app versioned main.js');
  const sw = read('service-worker.js');
  assert.match(sw, /const CORE_VERSION = 'v\d+'/, 'SW version constant');
  assert.ok(sw.includes('style.css?v='), 'SW precaches the versioned CSS');
});

test('v63/v79: mobile header — ☰ Danh mục + brand left, compact theme + actions right, status on its own row', () => {
  const css = read('assets/css/blog.css');
  // v79: the ☰ pill opens the row (body.content-page .motoai-menu); the old right-hand Menu selector is gone.
  assert.match(css, /body\.content-page \.motoai-menu\s*\{/, 'the ☰ Danh mục pill is styled on content pages');
  assert.ok(!/\.site-actions \.motoai-menu/.test(css), 'Menu is no longer part of the action group');
  // Theme stays visible as a compact >= 44px control in the action group.
  assert.match(css, /max-width:\s*767\.98px[\s\S]{0,300}\.site-actions \.blog-theme-toggle\s*\{[^}]*min-width:\s*44px/, 'compact theme toggle on mobile');
  // Only the search link hides on mobile (search lives in the drawer + blog search).
  assert.match(css, /max-width:\s*767\.98px[\s\S]{0,220}\.site-actions \.site-search-link\s*\{\s*display:\s*none/, 'search link hidden on mobile header');
  assert.ok(!/\.site-actions \.blog-theme-toggle[^{]*\{[^}]*display:\s*none/.test(css), 'theme toggle never hides on mobile');
  // Status is NOT part of the action group: it drops to its own full-width row.
  assert.match(css, /max-width:\s*767\.98px[\s\S]{0,400}\.site-header \.motoai-status\s*\{[^}]*flex-basis:\s*100%/, 'status drops to its own row');
  assert.match(css, /\.site-actions\s*\{[^}]*margin-left:\s*auto/, 'the action group stays right-aligned');
  assert.ok(!/\.site-actions \.motoai-status/.test(css), 'status is never a child of .site-actions');
  // Drawer carries the theme control so it is also reachable inside the menu.
  for (const p of pages.slice(0, 5)) {
    const html = read(p);
    assert.ok(html.includes('motoai-drawer-theme'), `${p}: theme control in drawer`);
    assert.ok((html.match(/blog-theme-toggle/g) ?? []).length >= 2, `${p}: header + drawer theme controls`);
  }
});

test('v63/v79: generated header markup — ☰ Danh mục OPENS the header row, the action group carries no menu, status outside it', () => {
  // v79 owner spec: a clearly visible ☰ Danh mục first on every header (replaces "Menu is the last control").
  const labels = JSON.parse(read('config/blog-ui.json')).labels;
  const menuButton = `<button type="button" class="motoai-menu" id="motoai-menu-btn" title="${labels.menuOpen}" aria-label="${labels.menuOpen}" aria-expanded="false" aria-controls="motoai-drawer" data-open="${labels.menuOpen}" data-close="${labels.menuClose}"><span class="menu-lines" aria-hidden="true"></span> <span class="motoai-menu-label">${labels.menuLabel}</span></button>`;
  for (const p of pages.slice(0, 5)) {
    const html = read(p);
    const header = html.slice(html.indexOf('<header class="site-header">'), html.indexOf('</header>'));
    assert.ok(header.startsWith('<header class="site-header">'), `${p}: site header present`);
    assert.equal((html.match(/id="motoai-menu-btn"/g) ?? []).length, 1, `${p}: exactly one ☰ Danh mục`);
    const first = /<div class="site-header-inner">\s*(<[\s\S]*?<\/button>)/.exec(header)?.[1];
    assert.equal(first, menuButton, `${p}: ☰ Danh mục is the FIRST child of .site-header-inner, labelled from config`);
    const actionsAt = header.indexOf('<div class="site-actions">');
    const actionsEnd = header.indexOf('</div>', actionsAt);
    const actions = header.slice(actionsAt, actionsEnd);
    assert.ok(actionsAt > -1 && actionsEnd > actionsAt, `${p}: action group present`);
    assert.ok(!actions.includes('motoai-menu'), `${p}: no second menu control inside the action group`);
    const controls = [...actions.matchAll(/<(?:a|button) [^>]*class="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(controls, ['site-search-link', 'blog-theme-toggle', 'site-agent-cta'], `${p}: search, theme, then Hỏi Agent — the Agent CTA is the LAST control of .site-actions`);
    assert.ok(!actions.includes('blog-business-status'), `${p}: business status never inside .site-actions`);
    const order = ['id="motoai-menu-btn"', '<a class="site-brand"', '<nav class="site-nav"', '<div class="site-actions">', 'id="blog-business-status"'].map((n) => header.indexOf(n));
    assert.ok(order.every((at, i) => at > -1 && (i === 0 || at > order[i - 1])), `${p}: ☰ → brand → menu → actions → status (${order.join(', ')})`);
    assert.ok(header.indexOf('id="blog-business-status"') > actionsEnd, `${p}: status sits after the action group closes (never between ☰ and the actions)`);
  }
});

test('v59: service worker caches navigations per-URL — homepage cache can never be overwritten', () => {
  const sw = read('service-worker.js');
  assert.match(sw, /const CORE_VERSION = 'v\d+'/, 'version constant');
  // Per-URL navigation cache (the bug was cache.put('./index.html', copy)).
  assert.ok(!sw.includes("cache.put('./index.html'"), 'no blind homepage-key caching');
  const nav = sw.slice(sw.indexOf("request.mode === 'navigate'"), sw.indexOf('// Same-origin static'));
  assert.ok(nav.includes('cache.put(request,'), 'navigation stored under its own URL');
  // Homepage fallback only for the home request; other URLs fall back to themselves.
  assert.ok(nav.includes('isHomeRequest'), 'home fallback is scoped to the home URL');
  assert.ok(!/caches\.match\('\.\/index\.html'\)\s*\)/.test(nav.replace(/isHomeRequest \? /, '')), 'content URLs never served the homepage offline');
  // Old caches are purged on activate; no mass precaching of articles.
  assert.match(sw, /startsWith\('motoai-'\)/, 'old cache cleanup');
  assert.ok(!sw.includes('blog/'), 'no article/blog precaching');
  const assets = sw.match(/SHELL_ASSETS = \[([\s\S]*?)\]/)[1];
  assert.ok((assets.match(/'/g) ?? []).length <= 20, 'precache list stays small');
});

// Minimal DOM double for assets/js/drawer.js: only the members createDrawer touches.
function fakeDrawerDom(bodyClass) {
  const doc = { activeElement: null, getElementById: (id) => byId[id] ?? null };
  const keydown = [];
  doc.addEventListener = (type, fn) => { if (type === 'keydown') keydown.push(fn); };
  doc.key = (key) => { for (const fn of keydown) fn({ key, shiftKey: false, preventDefault() {} }); };
  const node = (id, closestFor = () => null) => {
    const classes = new Set();
    const attrs = new Map();
    const on = {};
    const el = {
      id, dataset: {}, style: {}, hidden: false, title: '',
      classList: {
        add: (c) => { classes.add(c); },
        remove: (c) => { classes.delete(c); },
        contains: (c) => classes.has(c),
        toggle: (c, force = !classes.has(c)) => { if (force) classes.add(c); else classes.delete(c); return force; }
      },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      setAttribute: (k, v) => { attrs.set(k, String(v)); },
      removeAttribute: (k) => { attrs.delete(k); },
      addEventListener: (type, fn) => { (on[type] ??= []).push(fn); },
      fire: (type, event = {}) => { for (const fn of on[type] ?? []) fn({ target: el, ...event }); },
      focus: () => { doc.activeElement = el; },
      closest: (sel) => closestFor(sel, el),
      querySelector: () => null,
      querySelectorAll: () => []
    };
    return el;
  };
  const root = node('html');
  const body = node('body');
  body.classList.add(bodyClass);
  const drawer = node('motoai-drawer');
  const backdrop = node('motoai-drawer-backdrop');
  const menu = node('motoai-menu-btn');
  Object.assign(menu.dataset, { open: 'Mở danh mục', close: 'Đóng danh mục' });
  const close = node('motoai-drawer-close');
  Object.assign(close.dataset, { close: 'Đóng danh mục', collapse: 'Thu gọn danh mục' });
  const link = node('link', (sel, el) => (sel === 'a, button' ? el : null));
  const toggle = node('toggle', (sel, el) => (sel.includes('.motoai-toggle') || sel === 'a, button' ? el : null));
  const inside = new Set([close, link, toggle]);
  drawer.contains = (el) => el === drawer || inside.has(el);
  const byId = { 'motoai-drawer': drawer, 'motoai-drawer-backdrop': backdrop, 'motoai-menu-btn': menu, 'motoai-drawer-close': close };
  Object.assign(doc, { documentElement: root, body });
  return { doc, root, body, drawer, backdrop, menu, close, link, toggle };
}

test('v79: the sidebar scroll lock is SCOPED to the open overlay and ALWAYS released (no freeze possible)', async () => {
  for (const f of ['assets/js/app-shell.js', 'assets/js/main.js', 'assets/js/drawer.js']) {
    const js = read(f);
    assert.ok(!/document\.body\.style\.overflow/.test(js), `${f}: no body overflow lock`);
    assert.ok(!/body\.classList\.(add|remove|toggle)\('[^']*(lock|no-scroll|fixed)/.test(js), `${f}: no scroll-lock class on body`);
  }
  // One drawer controller for both shells: the lock lives ONLY there, behind one switch.
  const shell = read('assets/js/drawer.js');
  for (const f of ['assets/js/app-shell.js', 'assets/js/main.js']) {
    assert.match(read(f), /import \{ createDrawer \} from '\.\/drawer\.js\?v=\d+';/, `${f}: shared drawer controller`);
    assert.ok(!read(f).includes('drawer-lock'), `${f}: never touches the scroll lock itself`);
  }
  assert.equal((shell.match(/classList\.add\('drawer-lock'\)/g) ?? []).length, 1, 'one place adds the lock');
  assert.equal((shell.match(/classList\.remove\('drawer-lock'\)/g) ?? []).length, 1, 'one place removes the lock');
  assert.match(shell, /const lock = \(on\) => \{\s*if \(body\.classList\.contains\('chat-home'\)\) return;/, 'the Agent app (chat-home) is never locked');
  assert.deepEqual(shell.match(/\block\(/g), ['lock('], 'the lock is driven only by the overlay state');
  assert.match(shell, /lock\(state\);/, 'lock follows setOverlay(state)');
  assert.match(shell, /if \(state === open\) return;/, 'opening twice never overwrites the saved scroll position');
  assert.ok(shell.includes("key === 'Escape'"), 'Escape closes the drawer');
  assert.ok(shell.includes("backdrop.addEventListener('click', () => setOverlay(false, false))"), 'backdrop click closes');
  assert.ok(shell.includes("closest('a, button') && !sidebarMode()) setOverlay(false, false)"), 'following a link closes');

  // Behaviour: run the real controller against a DOM double.
  const { createDrawer } = await import(join(ROOT, 'assets/js/drawer.js'));
  const saved = { matchMedia: globalThis.matchMedia, scrollY: globalThis.scrollY, scrollTo: globalThis.scrollTo };
  const scrolls = [];
  const mq = { matches: false, query: null, change: [], addEventListener(type, fn) { if (type === 'change') this.change.push(fn); } };
  try {
    globalThis.matchMedia = (query) => { mq.query = query; return mq; };
    globalThis.scrollTo = (x, y) => { scrolls.push([x, y]); globalThis.scrollY = y; };

    // Content page, phone/tablet overlay.
    const d = fakeDrawerDom('content-page');
    createDrawer(d.doc);
    assert.equal(mq.query, '(min-width: 1200px)', 'sidebar breakpoint');
    const locked = () => d.root.classList.contains('drawer-lock');
    const open = () => {
      globalThis.scrollY = 1234;
      d.menu.fire('click');
      assert.ok(locked(), 'open: html.drawer-lock applied');
      assert.equal(d.body.style.top, '-1234px', 'open: the document is pinned where the reader was');
      assert.ok(d.drawer.classList.contains('is-open') && d.backdrop.classList.contains('is-open') && d.body.classList.contains('drawer-open'), 'open: panel + backdrop + body state');
      assert.equal(d.menu.getAttribute('aria-expanded'), 'true');
      assert.equal(d.doc.activeElement, d.close, 'open: focus moves to ✕');
      globalThis.scrollY = 0; // a fixed body reports no scroll while pinned
    };
    const released = (how, menuExpanded = 'false') => {
      assert.ok(!locked(), `${how}: lock released`);
      assert.equal(d.body.style.top, '', `${how}: inline offset cleared`);
      assert.deepEqual(scrolls.at(-1), [0, 1234], `${how}: reading position restored`);
      assert.ok(!d.drawer.classList.contains('is-open') && !d.backdrop.classList.contains('is-open') && !d.body.classList.contains('drawer-open'), `${how}: overlay closed`);
      assert.equal(d.menu.getAttribute('aria-expanded'), menuExpanded, `${how}: ☰ reports the panel state`);
    };
    assert.ok(!locked() && d.body.style.top === undefined, 'no lock before the panel is opened');
    open(); d.backdrop.fire('click'); released('backdrop');
    open(); d.doc.key('Escape'); released('Escape');
    assert.equal(d.doc.activeElement, d.menu, 'Escape: focus returns to ☰');
    open(); d.close.fire('click'); released('✕');
    open(); d.drawer.fire('click', { target: d.toggle });
    assert.ok(locked() && d.drawer.classList.contains('is-open'), 'an accordion toggle keeps the panel (and its lock) open');
    d.drawer.fire('click', { target: d.link }); released('link');
    open(); d.menu.fire('click'); released('☰ again');
    // Resizing into the desktop column releases the overlay lock; ☰ then reports the visible column.
    open(); mq.matches = true; for (const fn of mq.change) fn(); released('resize into the desktop column', 'true');
    const before = scrolls.length;
    d.menu.fire('click');
    assert.equal(d.root.getAttribute('data-motoai-sidebar'), 'closed', 'desktop: ☰ collapses the in-flow column');
    d.menu.fire('click');
    assert.equal(d.root.getAttribute('data-motoai-sidebar'), null, 'desktop: ☰ restores the column');
    assert.ok(!locked() && scrolls.length === before, 'desktop column never locks or scrolls the page');

    // The Agent app (body.chat-home) is already a fixed shell: overlay at every width, never locked.
    mq.matches = true;
    mq.change = [];
    scrolls.length = 0;
    const c = fakeDrawerDom('chat-home');
    createDrawer(c.doc);
    globalThis.scrollY = 500;
    c.menu.fire('click');
    assert.ok(c.drawer.classList.contains('is-open'), 'Agent app: ☰ opens the overlay even on desktop');
    assert.ok(!c.root.classList.contains('drawer-lock') && c.body.style.top === undefined, 'Agent app: no lock on chat-home');
    c.doc.key('Escape');
    assert.ok(!c.drawer.classList.contains('is-open') && !c.root.classList.contains('drawer-lock'), 'Agent app: closes cleanly');
    assert.deepEqual(scrolls, [], 'Agent app: the controller never scrolls the chat shell');
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
    }
  }
});
