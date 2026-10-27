import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { navigation, taxonomy, drawerCore, blogHome } from '../../tools/taxonomy.mjs';
import { renderDrawer } from '../../tools/menu-drawer.mjs';
import { menuButton } from '../../tools/app-shell.mjs';
import { BLOG_UI, icon } from '../../tools/blog-components.mjs';
import { STATIC_DIRS } from '../../tools/site-pages.mjs';

/**
 * v79 RESPONSIVE NAVIGATION V2: the bottom tab bar is gone. ONE sidebar
 * (tools/menu-drawer.mjs, data from navigation.json + taxonomy.json +
 * site-pages.json) is a left panel on phones/tablets and in the Agent app,
 * and an in-flow collapsible column on desktop content pages; ONE ☰ Danh mục
 * button (tools/app-shell.mjs menuButton) opens it from every header. Every
 * taxonomy level is a crawlable link with its own expand/collapse control.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const CONTENT_PAGES = ['index.html', ...walk('blog').filter((p) => p.endsWith('index.html')), ...STATIC_DIRS.map((d) => `${d}/index.html`)];
const drawerOf = (html) => /<nav class="motoai-drawer"[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0];
const flat = (s) => s.replace(/\s+/g, ' ').trim();
// State-free form of the sidebar: aria-current, open/closed lists and the
// expand/collapse labels depend on the page; everything else must be identical.
const stateless = (s) => flat(s)
  .replace(/ aria-current="page"/g, '')
  .replace(/ hidden>/g, '>')
  .replace(/aria-expanded="(true|false)"/g, 'aria-expanded="?"')
  .replace(/aria-label="(Mở rộng|Thu gọn) [^"]+"/g, 'aria-label="?"');
const css = read('assets/css/style.css');
const blogCss = read('assets/css/src/blog.css');
const builtBlogCss = read('assets/css/blog.css');
const labels = BLOG_UI.labels;

test('config: no tab bar; groups in order with collapsed legal/services; every glyph is in the shared icon set; one Agent label', () => {
  assert.equal(navigation.tab_bar, undefined, 'the bottom tab bar is retired');
  assert.deepEqual(navigation.drawer.groups.map((g) => g.id), ['cm', 'pages', 'pl', 'dv']);
  assert.deepEqual(navigation.drawer.groups.filter((g) => g.collapsed).map((g) => g.id), ['pl', 'dv']);
  assert.equal(navigation.drawer.groups[0].url, blogHome().url, 'Cẩm nang is a link to the blog home');
  const svg = navigation.svg_icons;
  for (const name of [svg.home, svg.agent, svg.blog, svg.pages, svg.search, svg.theme, ...Object.values(svg.groups), ...Object.values(svg.hubs)]) {
    assert.doesNotThrow(() => icon(name), `icon ${name}`);
  }
  assert.deepEqual(Object.keys(svg.groups).sort(), ['cm', 'dv', 'pages', 'pl']);
  assert.deepEqual(Object.keys(svg.hubs).sort(), taxonomy.clusters.map((c) => c.id).sort());
  assert.equal(navigation.agent.label, labels.headerAgent, 'the sidebar, footer and header name the Agent the same way');
  for (const key of ['menuLabel', 'menuOpen', 'menuClose', 'menuCollapseSidebar', 'menuExpand', 'menuCollapse', 'menuTheme']) {
    assert.ok(labels[key]?.trim(), `labels.${key}`);
  }
  assert.match(labels.menuExpand, /\{name\}/);
  assert.match(labels.menuCollapse, /\{name\}/);
});

test('drawerCore: Trang Chủ, Hỏi Agent, the four groups, then the theme row; hubs and categories carry taxonomy ids', () => {
  const core = drawerCore();
  assert.deepEqual(core.map((e) => e.kind), ['link', 'link', 'group', 'group', 'group', 'group', 'theme']);
  assert.equal(core[0].url, navigation.home.url);
  assert.equal(core[1].url, navigation.agent.url);
  const cm = core.find((e) => e.id === 'cm');
  const hubs = cm.children.filter((e) => e.kind === 'hub');
  assert.deepEqual(hubs.map((h) => h.id), taxonomy.clusters.map((c) => c.id));
  for (const h of hubs) {
    const cats = h.children.filter((c) => c.level === 'category');
    assert.deepEqual(cats.map((c) => c.id), taxonomy.clusters.find((c) => c.id === h.id).categories);
  }
  assert.equal(cm.children.at(-1).ref, 'search', 'Tìm Bài closes the Cẩm nang group');
  assert.ok(core.find((e) => e.id === 'pl').collapsed && core.find((e) => e.id === 'dv').collapsed);
});

test('every page group renders the SAME sidebar from the one renderer (homepage, blog, hubs, subtopics, 2.000+ articles, Pages) and the Agent app its chat variant', () => {
  assert.ok(CONTENT_PAGES.length > 2000);
  const reference = stateless(drawerOf(renderDrawer({ mode: 'content' })));
  for (const p of CONTENT_PAGES) {
    const html = read(p);
    const nav = drawerOf(html);
    assert.ok(nav, `${p}: sidebar present`);
    assert.equal(stateless(nav), reference, `${p}: sidebar == renderDrawer() (one component, one source)`);
    assert.ok(!nav.includes('<nav class="motoai-drawer" id="motoai-drawer" aria-label="Danh mục" hidden'), `${p}: CSS owns the open state, never a hidden attribute`);
    assert.equal((html.match(/id="motoai-drawer"/g) ?? []).length, 1, `${p}: exactly one sidebar`);
    assert.equal((html.match(/id="motoai-menu-btn"/g) ?? []).length, 1, `${p}: exactly one ☰ Danh mục`);
    assert.ok(!/app-tabbar|motoai-dock|data-drawer-open/.test(html), `${p}: no bottom bar, no second menu`);
  }
  const agent = read('agent/index.html');
  assert.equal(stateless(drawerOf(agent)), stateless(drawerOf(renderDrawer({ mode: 'chat' }))));
  assert.ok(!/app-tabbar|motoai-dock/.test(agent) && agent.includes('id="motoai-menu-agent"') && agent.includes('id="motoai-reset"'));
});

test('☰ Danh mục: the same button first in the content header and first in the Agent header, labelled from config, visible on every device', () => {
  const button = menuButton();
  assert.ok(button.includes(`<span class="motoai-menu-label">${labels.menuLabel}</span>`) && button.includes(`aria-label="${labels.menuOpen}"`));
  assert.ok(button.includes('aria-controls="motoai-drawer"') && button.includes(`data-close="${labels.menuClose}"`));
  for (const p of ['index.html', 'blog/index.html', 'blog/thue-xe/index.html', 'blog/thue-xe/thue-xe-may-gia-re/index.html', ...STATIC_DIRS.map((d) => `${d}/index.html`)]) {
    const html = read(p);
    const inner = /<div class="site-header-inner">\s*([\s\S]*?)<a class="site-brand"/.exec(html)?.[1];
    assert.ok(inner && flat(inner) === flat(button), `${p}: ☰ Danh mục opens the header row`);
    assert.ok(!/<div class="site-actions">[\s\S]*?motoai-menu[\s\S]*?<\/div>\n/.test(html.slice(html.indexOf('<div class="site-actions">'), html.indexOf('</header>'))), `${p}: not a second copy in the actions`);
  }
  const agent = read('agent/index.html');
  const head = /<header class="motoai-header">\s*([\s\S]*?)<div class="motoai-header-text">/.exec(agent)?.[1];
  assert.equal(flat(head), flat(button), 'Agent header: the same control, first');
  assert.ok(!read('data/site/agent.html.tpl').includes('tab-bar') && read('data/site/agent.html.tpl').includes('@generated menu-button'));
  // Never hidden by the shared stylesheets (only the embed widget hides it).
  assert.ok(!/\.motoai-header \.motoai-menu \{ display: none; \}/.test(css) && !/\.motoai-menu \{ display: none; \}/.test(blogCss));
  assert.match(css, /body\[data-motoai-embed="1"\] \.motoai-menu \{ display: none; \}/);
  assert.match(css, /\.motoai-menu \{[^}]*min-height: 44px;/s, 'touch target');
});

test('hierarchy: group › hub › category › subtopic, every level a link, every list behind its own control, no taxonomy URL missing', () => {
  const html = renderDrawer({ mode: 'content' });
  const core = drawerCore();
  const urls = (items) => items.flatMap((i) => [...(i.url ? [i.url] : []), ...urls(i.children ?? [])]);
  for (const url of urls(core)) assert.ok(html.includes(`href="${url}"`), `link ${url}`);
  for (const g of core.filter((e) => e.kind === 'group')) {
    assert.ok(html.includes(`id="motoai-group-${g.id}-btn" aria-expanded="${g.collapsed ? 'false' : 'true'}" aria-controls="motoai-group-${g.id}"`), `group ${g.id} control`);
    assert.ok(html.includes(`<ul class="motoai-group-items" id="motoai-group-${g.id}"${g.collapsed ? ' hidden' : ''}>`), `group ${g.id} list`);
  }
  for (const c of taxonomy.clusters) {
    assert.ok(html.includes(`id="motoai-hub-${c.id}-btn" aria-expanded="true" aria-controls="motoai-hub-${c.id}"`), `hub ${c.id} control`);
    assert.ok(html.includes(`<a class="motoai-hub-link" href="/blog/${c.dir}/">`), `hub ${c.id} link`);
  }
  const cm = core.find((e) => e.id === 'cm');
  const sitemapTopics = new Set([...read('sitemap.xml').matchAll(/<loc>[^<]*(\/blog\/[a-z-]+\/[a-z-]+\/)<\/loc>/g)].map((m) => m[1]));
  for (const hub of cm.children.filter((e) => e.kind === 'hub')) {
    for (const cat of hub.children.filter((x) => x.level === 'category')) {
      const topics = hub.children.filter((x) => x.level === 'subtopic' && x.parent === cat.label);
      if (!topics.length) continue;
      assert.ok(html.includes(`id="motoai-cat-${cat.id}-btn" aria-expanded="false" aria-controls="motoai-cat-${cat.id}"`), `category ${cat.id} control`);
      assert.ok(html.includes(`<ul class="motoai-topic-items" id="motoai-cat-${cat.id}" hidden>`), `category ${cat.id} list closed by default`);
      for (const t of topics) assert.ok(sitemapTopics.has(t.url), `${t.url} is a published topic hub`);
    }
  }
  // Controls carry the name for relabelling; the nav carries both templates.
  assert.ok(html.includes(`data-expand="${labels.menuExpand}" data-collapse="${labels.menuCollapse}"`));
  const toggles = [...html.matchAll(/<button type="button" class="motoai-toggle[^>]*><\/button>/g)];
  assert.ok(toggles.length >= 4 + taxonomy.clusters.length, 'one control per group, hub and category with topics');
  for (const m of toggles) assert.match(m[0], / data-name="[^"]+"><\/button>$/);
  assert.ok(!html.includes('aria-controls="motoai-drawer"'), 'no control inside the panel targets the panel');
});

test('state per page: the current category opens its subtopics, a collapsed group opens for its own page, the current link is marked', () => {
  const ev = read('blog/xe-dien/index.html');
  assert.ok(ev.includes('<a href="/blog/xe-dien/" aria-current="page">') && ev.includes('id="motoai-cat-EV-btn" aria-expanded="true"') && ev.includes('<ul class="motoai-topic-items" id="motoai-cat-EV">'));
  assert.ok(ev.includes('<ul class="motoai-topic-items" id="motoai-cat-RENT" hidden>'), 'the sibling category stays closed');
  const privacy = read('privacy/index.html');
  assert.ok(privacy.includes('id="motoai-group-pl-btn" aria-expanded="true"') && privacy.includes('<ul class="motoai-group-items" id="motoai-group-pl">') && privacy.includes('<a href="/privacy/" aria-current="page">'));
  const home = read('index.html');
  assert.ok(home.includes('<ul class="motoai-group-items" id="motoai-group-pl" hidden>') && home.includes('<ul class="motoai-group-items" id="motoai-group-dv" hidden>'));
  assert.ok(home.includes('<a href="/" aria-current="page">'), 'Trang Chủ is current on the homepage');
  assert.ok(read('blog/thue-xe/thue-xe-may-gia-re/index.html').includes('<a href="/blog/thue-xe/" aria-current="page">'), 'an article marks its category');
  assert.ok(read('blog/index.html').includes('<a class="motoai-group-link" href="/blog/" aria-current="page">'), 'the blog home marks Cẩm nang');
  assert.ok(read('blog/app/web-app/index.html').includes('<a href="/blog/app/web-app/" aria-current="page" aria-label='), 'a topic hub marks its own row');
});

test('phones + tablets + Agent app: a LEFT off-canvas panel (85vw ≤ 340px; 320–380px on tablets) driven by .is-open, with backdrop, safe area and reduced motion', () => {
  const panel = /\.motoai-drawer \{([^}]*)\}/.exec(css)[1];
  assert.match(panel, /position: fixed;/);
  assert.match(panel, /left: 0;/);
  assert.match(panel, /width: min\(85vw, 340px\);/);
  assert.match(panel, /transform: translateX\(-100%\);/);
  assert.match(panel, /visibility: hidden;/);
  assert.match(panel, /env\(safe-area-inset-top/);
  assert.match(panel, /overscroll-behavior: contain;/);
  assert.match(css, /\.motoai-drawer\.is-open \{ transform: none; visibility: visible;/);
  assert.match(css, /@media \(min-width: 768px\) \{\s*\.motoai-drawer \{ width: clamp\(320px, 42vw, 380px\); \}/);
  assert.match(css, /\.motoai-drawer-backdrop\.is-open \{ opacity: 1; visibility: visible;/);
  assert.match(css, /\.motoai-drawer, \.motoai-drawer-backdrop \{ transition: none; \}/, 'prefers-reduced-motion');
  assert.ok(!/\.app-tab|motoai-dock|drawer-in/.test(css) && !/app-tab|is-typing|padding-bottom: calc\(56px/.test(blogCss));
  assert.match(css, /\.motoai-drawer-list \.motoai-toggle \{[^}]*min-width: 44px; min-height: 44px;/s, 'expand/collapse targets');
  assert.match(css, /\.motoai-drawer-list a,\s*\.motoai-drawer-list button \{[^}]*min-height: 46px;/s);
  assert.match(blogCss, /html\.drawer-lock body\.content-page \{ position: fixed; left: 0; right: 0; width: 100%; overflow-y: hidden; \}/, 'the page stays put under the open panel');
});

test('desktop content pages (>= 1200px): header / [sidebar | main] / footer grid, sticky collapsible column, horizontal menu; the Agent app keeps the overlay', () => {
  const desk = blogCss.slice(blogCss.indexOf('/* ==================== Desktop layout (v79'));
  assert.match(desk, /@media \(min-width: 1200px\) \{\s*body\.content-page \{\s*display: grid; grid-template-columns: var\(--sidebar-w\) minmax\(0, 1fr\);/);
  assert.match(desk, /grid-template-areas: "header header" "banner banner" "sidebar main" "footer footer";/);
  assert.match(desk, /body\.content-page > \.motoai-drawer \{\s*grid-area: sidebar; position: sticky;/);
  assert.match(desk, /transform: none; visibility: visible; transition: none;/);
  assert.match(desk, /html\[data-motoai-sidebar="closed"\] body\.content-page \{ grid-template-columns: 0 minmax\(0, 1fr\); \}/);
  assert.match(desk, /html\[data-motoai-sidebar="closed"\] body\.content-page > \.motoai-drawer \{ display: none; \}/);
  assert.match(desk, /@media \(min-width: 1200px\) and \(max-width: 1399\.98px\) \{\s*html:not\(\[data-motoai-sidebar="closed"\]\) \.site-main\[data-motoai-screen\^="article-"\] \{ display: flex; \}/, 'articles keep one column beside the open sidebar until the rail fits');
  assert.match(blogCss, /--sidebar-w: 280px;/);
  assert.ok(builtBlogCss.includes('grid-template-areas:"header header" "banner banner" "sidebar main" "footer footer"'), 'the served stylesheet carries the grid');
  assert.match(css, /@media \(min-width: 1200px\) \{\s*\.site-nav \{ display: flex;/, 'the horizontal menu starts where the sidebar column does');
  assert.match(css, /@media \(min-width: 1200px\) and \(min-height: 600px\) and \(hover: hover\) and \(pointer: fine\) \{\s*body:not\(\[data-motoai-embed="1"\]\) \.motoai-header \{ grid-template-areas: "nav nav nav nav nav" "menu mark title status actions" "menu mark sub status actions"; \}/);
  assert.ok(!/body\.chat-home[^{]*\.motoai-drawer \{[^}]*position: sticky/.test(css), 'the Agent app never turns the panel into a column');
  // The saved collapse state is applied before first paint by the shared head script.
  assert.ok(read('index.html').includes("localStorage.getItem('motoai-sidebar')==='closed'") && read('blog/index.html').includes("data-motoai-sidebar"));
});

test('drawer.js: one controller for both shells — overlay, scroll lock, focus, Escape, Tab trap, independent accordions, desktop persistence', () => {
  const js = read('assets/js/drawer.js');
  for (const needle of ["'(min-width: 1200px)'", "classList.toggle('is-open', state)", "classList.add('drawer-lock')", "scrollTo(0, scrollY)",
    "event.key === 'Escape'", "event.key !== 'Tab'", "querySelectorAll('.motoai-toggle')", "list.hidden = !expanded", "localStorage.setItem(KEY",
    "setAttribute('data-motoai-sidebar', 'closed')", "contains('content-page')", "contains('chat-home')", "menu)?.focus({ preventScroll: true })"]) {
    assert.ok(js.includes(needle), `drawer.js: ${needle}`);
  }
  assert.match(read('assets/js/app-shell.js'), /import \{ createDrawer \} from '\.\/drawer\.js\?v=79';/);
  assert.match(read('assets/js/main.js'), /import \{ createDrawer \} from '\.\/drawer\.js\?v=79';/);
  assert.ok(!read('assets/js/app-shell.js').includes('is-typing'));
});

test('footer and desktop menu are untouched: every link kept, hub dropdowns intact', () => {
  const home = read('index.html');
  const links = [...home.slice(home.indexOf('<footer class="blog-footer">'), home.indexOf('</footer>')).matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(links.length, 25);
  for (const url of [...drawerCore().find((e) => e.id === 'pl').children, ...drawerCore().find((e) => e.id === 'pages').children].map((c) => c.url)) {
    assert.ok(links.includes(url), `footer keeps ${url}`);
  }
  assert.ok(home.includes(`<span>${navigation.agent.label}</span>`) && links.includes(navigation.agent.url));
  assert.equal((home.match(/class="site-nav-item"/g) ?? []).length, taxonomy.clusters.length + 1, 'three hub dropdowns + Trang Web');
});

test('no page keeps a stale artefact: tab bar CSS, the old dock, the hidden drawer', () => {
  for (const p of ['assets/css/blog.css', 'assets/css/style.css', 'service-worker.js', 'agent/index.html', 'index.html']) {
    assert.ok(existsSync(join(ROOT, p)) && !/app-tabbar|motoai-dock/.test(read(p)), p);
  }
});
