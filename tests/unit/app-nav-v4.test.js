import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { navigation, drawerCore, blogHome } from '../../tools/taxonomy.mjs';
import { tabBar, siteNav } from '../../tools/app-shell.mjs';
import { icon } from '../../tools/blog-components.mjs';
import { STATIC_DIRS } from '../../tools/site-pages.mjs';

/**
 * v78 APP-LIKE NAVIGATION: one bottom tab bar (config/navigation.json
 * tab_bar → tools/app-shell.mjs tabBar) on every page group and in the
 * Agent app, opening the one shared drawer (assets/js/drawer.js); app-style
 * icons on the desktop menu; app-style footer cards on phones. No new URL,
 * no second menu, nothing covering the chat composer or the keyboard.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const CONTENT_PAGES = ['index.html', ...walk('blog').filter((p) => p.endsWith('index.html')), ...STATIC_DIRS.map((d) => `${d}/index.html`)];
const tabbar = (html) => /<nav class="app-tabbar"[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0];
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const pathOf = (p) => p.replace(/index\.html$/, '');
const css = read('assets/css/style.css');
// The authored source (assets/css/blog.css is its minified build, kept in sync by css-build tests).
const blogCss = read('assets/css/src/blog.css');
const builtBlogCss = read('assets/css/blog.css');

test('tab bar config: at most 5 tabs, every one a reference to an existing entry (no new URL)', () => {
  const tabs = navigation.tab_bar.tabs;
  assert.ok(tabs.length >= 1 && tabs.length <= 5, 'max 5 tabs');
  const groups = new Set(drawerCore().filter((e) => e.kind === 'group').map((e) => e.id));
  for (const t of tabs) {
    assert.ok(Boolean(t.ref) !== Boolean(t.drawer), 'a tab is either a link reference or a drawer button');
    if (t.ref) assert.ok(['home', 'blog', 'agent'].includes(t.ref), `known ref ${t.ref}`);
    if (t.drawer) assert.ok(t.drawer === 'all' || groups.has(t.drawer), `drawer group ${t.drawer} exists`);
    assert.ok(!('url' in t), 'tabs never carry their own URL');
    assert.doesNotThrow(() => icon(t.icon), `icon ${t.icon} is in the shared icon set`);
  }
  const hrefs = [...tabBar().matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, [navigation.home.url, blogHome().url, navigation.agent.url], 'links = Trang Chủ, the blog home, the Agent app');
});

test('every page group renders the SAME tab bar (homepage, blog, hubs, subtopics, 2.000+ articles, Pages, Agent)', () => {
  assert.ok(CONTENT_PAGES.length > 2000);
  const strip = (s) => flat(s).replace(/ aria-current="(page|true)"/g, '');
  const reference = strip(tabBar());
  for (const p of [...CONTENT_PAGES, 'agent/index.html']) {
    const bar = tabbar(read(p));
    assert.ok(bar, `${p}: tab bar present`);
    assert.equal(strip(bar), reference, `${p}: tab bar == tabBar() (one component, one source)`);
    assert.equal(flat(bar), flat(tabBar({ path: pathOf(p) })), `${p}: active state for this page`);
  }
});

test('active tab: Trang Chủ on /, Cẩm nang on the blog (page on /blog/, section inside it), Agent on /agent/, none on Pages', () => {
  const current = (p) => [...tabbar(read(p)).matchAll(/href="([^"]+)" aria-current="(page|true)"/g)].map((m) => `${m[1]}|${m[2]}`);
  assert.deepEqual(current('index.html'), ['/|page']);
  assert.deepEqual(current('blog/index.html'), ['/blog/|page']);
  assert.deepEqual(current('blog/thue-xe/index.html'), ['/blog/|true']);
  assert.deepEqual(current('blog/thue-xe/thue-xe-may-gia-re/index.html'), ['/blog/|true']);
  assert.deepEqual(current('agent/index.html'), ['/agent/|page']);
  for (const d of STATIC_DIRS) assert.deepEqual(current(`${d}/index.html`), [], `${d}: no tab claims a static Page`);
});

test('drawer tabs open the one shared drawer; both shells use the same controller', () => {
  const bar = tabBar();
  assert.match(bar, /<button type="button" class="app-tab" data-drawer-open="cm" aria-controls="motoai-drawer" aria-expanded="false">/);
  assert.match(bar, /<button type="button" class="app-tab" data-drawer-open="" aria-controls="motoai-drawer" aria-expanded="false">/);
  for (const p of ['index.html', 'agent/index.html']) {
    const html = read(p);
    assert.ok(html.includes('id="motoai-group-cm-btn"'), `${p}: the drawer has the Cẩm nang group the Danh Mục tab expands`);
    assert.equal((html.match(/<nav class="app-tabbar"/g) ?? []).length, 1, `${p}: exactly one bottom bar`);
    assert.ok(!html.includes('motoai-dock'), `${p}: no second bottom menu`);
  }
  const drawer = read('assets/js/drawer.js');
  assert.match(drawer, /querySelectorAll\('\[aria-controls="motoai-drawer"\]'\)/, 'every drawer toggle (Menu button + tabs) is wired');
  assert.match(drawer, /motoai-group-\$\{t\.dataset\.drawerOpen\}-btn/, 'a tab expands its drawer group');
  assert.match(drawer, /setAttribute\('aria-expanded', state \? 'true' : 'false'\)/, 'aria-expanded mirrors the drawer state on every toggle');
  assert.match(drawer, /opener\?\.focus\(\)/, 'Escape returns focus to the tab that opened the drawer');
});

test('content pages: tab bar fixed above the home indicator on phones/tablets only, never covering content or the keyboard', () => {
  assert.match(blogCss, /body\.content-page \.app-tabbar \{[^}]*position: fixed;[^}]*bottom: 0;[^}]*z-index: 35;/s, 'fixed bottom bar, under the drawer (41) and its backdrop (40)');
  assert.match(blogCss, /body\.content-page \.app-tabbar \{[^}]*env\(safe-area-inset-bottom/s, 'iOS safe area');
  assert.match(blogCss, /@media \(max-width: 899\.98px\) \{\s*body\.content-page \{ padding-bottom: calc\(56px \+ env\(safe-area-inset-bottom, 0px\)\); \}/, 'the page reserves the bar height');
  assert.match(blogCss, /body\.content-page \.site-actions \.motoai-menu \{ display: none; \}/, 'one Menu: the tab bar carries it on phones');
  assert.match(blogCss, /body\.content-page\.is-typing \.app-tabbar \{ display: none; \}/, 'the keyboard owns the bottom edge while typing');
  assert.match(read('assets/js/app-shell.js'), /classList\.toggle\('is-typing', e\.target\.matches\('input, textarea, select'\)\)/);
  assert.match(blogCss, /@media \(min-width: 900px\) \{\s*body\.content-page \.app-tabbar \{ display: none; \}/, 'desktop keeps the header menu');
  assert.match(blogCss, /@media print \{\s*[^{]*\.app-tabbar \{ display: none !important; \}/, 'never printed');
  assert.ok(builtBlogCss.includes('body.content-page .app-tabbar{position:fixed;'), 'the served stylesheet carries the bar');
});

test('Agent app: tab bar in the app column under the composer; hidden in embed and where the desktop menu shows', () => {
  const html = read('agent/index.html');
  const at = html.indexOf('<nav class="app-tabbar"');
  assert.ok(html.indexOf('id="motoai-composer"') < at && at < html.indexOf('</section>', at), 'below the composer, inside .motoai-app');
  assert.match(css, /\.motoai-app \.app-tabbar \{ margin-inline:/, 'in-flow inside the flex column (never fixed over the messages)');
  assert.match(css, /body\[data-motoai-embed="1"\] \.app-tabbar \{ display: none; \}/, 'embed widget stays minimal');
  const desk = /@media \(min-width: 900px\) and \(min-height: 600px\) and \(hover: hover\) and \(pointer: fine\) \{([\s\S]*?)\n\}/.exec(css)[1];
  assert.match(desk, /\.motoai-app \.app-tabbar \{ display: none; \}/, 'one primary navigation per screen');
  assert.match(desk, /\.motoai-header \.motoai-menu \{ display: inline-flex; \}/, 'Menu button returns with the desktop menu');
  assert.match(css, /\.motoai-header \.motoai-menu \{ display: none; \}/, 'the tab bar carries Menu elsewhere');
});

test('tab bar look: icon above a short label, accent colour + indicator for the open page, touch-sized, V2 tokens only', () => {
  assert.match(css, /\.app-tab \{[^}]*min-height: 50px;/s);
  assert.match(css, /\.app-tab\[aria-current\], \.app-tab\[aria-expanded="true"\] \{ color: var\(--signal-ink\); \}/);
  assert.match(css, /\.app-tab\[aria-current\]::before \{[^}]*background: var\(--signal\);/);
  const block = css.slice(css.indexOf('/* ---------- App tab bar (v78)'), css.indexOf('/* ---------- Header controls'));
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(block), 'no hard-coded colours: Light/Dark come from the shared tokens');
});

test('desktop menu: app-style icons on the top level from config (>= 1360px), same component on every shell', () => {
  const nav = siteNav({ home: true });
  const svg = navigation.svg_icons;
  for (const name of [svg.home, svg.blog, svg.pages, ...Object.values(svg.hubs)]) {
    assert.ok(nav.includes(icon(name, 'site-nav-icon')), `icon ${name}`);
  }
  assert.match(css, /\.site-nav-icon \{ display: none; \}\s*@media \(min-width: 1360px\) \{\s*\.site-nav-icon \{ display: block;/, 'icons only where the header row has room');
});

test('footer: app-style cards on phones/tablets, every link kept, full columns on desktop', () => {
  assert.match(blogCss, /@media \(max-width: 899\.98px\) \{\s*\.blog-footer \{ padding-top: var\(--s6\); \}[\s\S]*?\.blog-footer-nav \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?\.blog-footer-col \{[^}]*border-radius: var\(--r-md\);[^}]*background: var\(--surface\);/);
  const links = (html) => [...html.slice(html.indexOf('<footer class="blog-footer">'), html.indexOf('</footer>')).matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const home = links(read('index.html'));
  assert.equal(home.length, 25, 'all 25 footer links kept');
  for (const url of [...drawerCore().find((e) => e.id === 'pl').children, ...drawerCore().find((e) => e.id === 'pages').children].map((c) => c.url)) {
    assert.ok(home.includes(url), `footer keeps ${url}`);
  }
});
