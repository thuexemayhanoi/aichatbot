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
 *   - menu drawer never locks body scroll
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const STATIC_DIRS = ['privacy', 'terms', 'gioi-thieu', 'chinh-sach', 'lien-he', 'gia-thue'];
const CLUSTER_DIRS = ['cong-cu-huong-dan', 'thue-xe-phuong-tien', 'kham-pha-an-toan'];

function contentPages() {
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  return [
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

test('v59: chat homepage has ZERO footers and is NOT a content-page', () => {
  const html = read('index.html');
  assert.equal((html.match(/<footer/g) ?? []).length, 0, 'homepage: no site footer at all');
  assert.ok(!html.includes('class="content-page"'), 'homepage keeps the app body, not the content-page body');
  assert.ok(html.includes('class="motoai-app"'), 'homepage keeps the chat app shell');
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
  assert.match(read('index.html'), /<body class="chat-home">/, 'chat homepage carries the chat-home class');
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
  // Closed drawer/backdrop can never intercept touch gestures.
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/, 'hidden attribute fully removes elements');
  assert.match(css, /#motoai-drawer-backdrop\[hidden\][^}]*pointer-events:\s*none/, 'closed backdrop never intercepts swipes');
});

test('v60: asset cache-bust + build marker so iOS Safari cannot serve stale v58/v59 assets', () => {
  for (const p of pages.slice(0, 6)) {
    const html = read(p);
    assert.match(html, /<meta name="motoai-build" content="v\d+">/, `${p}: build marker present`);
    assert.match(html, /style\.css\?v=\d+/, `${p}: versioned style.css`);
    assert.match(html, /blog\.css\?v=\d+/, `${p}: versioned blog.css`);
    assert.match(html, /app-shell\.js\?v=\d+/, `${p}: versioned app-shell.js`);
  }
  const home = read('index.html');
  assert.match(home, /<meta name="motoai-build" content="v\d+">/, 'homepage build marker');
  assert.match(home, /style\.css\?v=\d+/, 'homepage versioned style.css');
  assert.match(home, /main\.js\?v=\d+/, 'homepage versioned main.js');
  const sw = read('service-worker.js');
  assert.match(sw, /const CORE_VERSION = 'v\d+'/, 'SW version constant');
  assert.ok(sw.includes('style.css?v='), 'SW precaches the versioned CSS');
});

test('v59: mobile header — search/theme hidden under 768px, live in the drawer instead', () => {
  const css = read('assets/css/blog.css');
  assert.match(css, /max-width:\s*767\.98px[\s\S]{0,220}\.site-actions \.site-search-link,[\s\S]{0,60}\.site-actions \.blog-theme-toggle\s*\{\s*display:\s*none/, 'search + theme hidden on mobile header');
  assert.match(css, /max-width:\s*767\.98px[\s\S]{0,400}\.site-actions \.motoai-status\s*\{[^}]*flex-basis:\s*100%/, 'status drops to its own row');
  assert.match(css, /\.site-actions\s*\{[^}]*margin-left:\s*auto/, 'Menu stays right-aligned');
  // Drawer carries the theme control so it is still reachable on mobile.
  for (const p of pages.slice(0, 5)) {
    const html = read(p);
    assert.ok(html.includes('motoai-drawer-theme'), `${p}: theme control in drawer`);
    assert.ok((html.match(/blog-theme-toggle/g) ?? []).length >= 2, `${p}: header + drawer theme controls`);
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

test('v59: menu drawer never locks body scroll (no freeze possible)', () => {
  for (const f of ['assets/js/app-shell.js', 'assets/js/main.js']) {
    const js = read(f);
    assert.ok(!/document\.body\.style\.overflow/.test(js), `${f}: no body scroll lock`);
    assert.ok(!/body\.classList\.(add|remove)\('[^']*(lock|no-scroll|fixed)/.test(js), `${f}: no scroll-lock class`);
  }
  const shell = read('assets/js/app-shell.js');
  // Every close path exists: backdrop, Escape, link/button click.
  assert.ok(shell.includes("key === 'Escape'"), 'Escape closes the drawer');
  assert.ok(shell.includes("backdrop?.addEventListener"), 'backdrop click closes');
  assert.ok(shell.includes('setDrawer(false)'), 'drawer close restores state');
});
