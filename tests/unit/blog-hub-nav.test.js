import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { taxonomy, navigation, drawerCore } from '../../tools/taxonomy.mjs';
import { SITE_PAGES } from '../../tools/site-pages.mjs';
import { publishedManifestArticles } from '../helpers/factory-sandbox.mjs';

/**
 * v61 contract: SEO hub → category → article architecture + Liquid Glass UI.
 * The hierarchy is expressed by navigation, drawer, footer, breadcrumbs and
 * schema — NEVER by moving URLs (every canonical URL stays stable).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;');

const CLUSTER_DIRS = taxonomy.clusters.map((c) => c.dir);
const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
// Pháp Lý = the site-pages.json registry entries marked "group": "legal".
const LEGAL = SITE_PAGES.filter((p) => p.group === 'legal').map((p) => ({ url: `/${p.dir}/` }));
const ALL_CONTENT = [...walk('blog').filter((p) => p.endsWith('.html')),
  ...['privacy', 'terms', 'gioi-thieu', 'chinh-sach', 'lien-he', 'gia-thue', 'doi-tac'].map((d) => `${d}/index.html`)];

// ---------- Desktop menu: parent hubs with dropdowns ----------

test('v61 desktop menu prioritizes the 3 parent hubs, each as a REAL crawlable <a>', () => {
  for (const page of ALL_CONTENT) {
    const html = read(page);
    const nav = html.slice(html.indexOf('<nav class="site-nav"'), html.indexOf('</nav>', html.indexOf('<nav class="site-nav"')));
    for (const c of taxonomy.clusters) {
      // Parent label is a link to its hub — never a JS-only button.
      assert.ok(nav.includes(`class="site-nav-parent" href="/blog/${c.dir}/"`), `${page}: parent hub link ${c.dir}`);
      assert.ok(nav.includes(esc(navigation.hub_labels?.[c.id] ?? c.name)), `${page}: compact parent label ${c.id}`);
      for (const id of c.categories) {
        const dir = taxonomy.categories[id].dir;
        assert.ok(nav.includes(`href="/blog/${dir}/"`), `${page}: dropdown child ${dir}`);
      }
    }
    // The six child categories are NOT a flat top-level row anymore:
    // outside the dropdown panels, only Cẩm nang + the 3 parent hubs remain.
    const outsideDrops = nav.replace(/<div class="site-nav-drop">[\s\S]*?<\/div>/g, '');
    const topLevel = [...outsideDrops.matchAll(/<a [^>]*href="\/blog\/([a-z-]+)\/"[^>]*>/g)].map((m) => m[1]);
    assert.deepEqual(topLevel.sort(), CLUSTER_DIRS.slice().sort(), `${page}: top level = Cẩm nang + 3 parent hubs`);
  }
});

test('v61 dropdowns are keyboard/touch accessible, not hover-only', () => {
  // v77: the desktop menu CSS is shared by the website and the Agent app (style.css).
  const css = read('assets/css/style.css');
  const js = read('assets/js/app-shell.js');
  assert.match(css, /\.site-nav-item:focus-within \.site-nav-drop[\s\S]{0,80}display:\s*block/, 'focus-within opens the dropdown (keyboard)');
  assert.match(css, /\.site-nav-item\.open \.site-nav-drop[\s\S]{0,60}display:\s*block/, 'open class opens the dropdown (touch)');
  assert.match(css, /\.site-nav-drop a\s*\{[^}]*min-height:\s*44px/, 'dropdown touch targets >= 44px');
  assert.ok(js.includes("key === 'Escape'"), 'Escape closes an open dropdown');
  assert.ok(js.includes("closest('.site-nav')"), 'outside tap closes dropdowns');
});

// ---------- Mobile drawer: hub → children hierarchy ----------

test('v61 drawer Cẩm nang group mirrors the hub → category hierarchy with real links', () => {
  // v79: nested accordions (group › hub › category › subtopics). Every level is
  // a real crawlable <a>; expand/collapse is a SEPARATE button beside it. The
  // check is scoped to the sidebar markup, so a link that only exists in the
  // desktop menu or the footer can no longer satisfy it.
  const subtopicUrls = (dir) => drawerCore().find((e) => e.kind === 'group' && e.id === 'cm').children
    .filter((e) => e.kind === 'hub').flatMap((h) => h.children)
    .filter((e) => e.level === 'subtopic' && e.url.startsWith(`/blog/${dir}/`)).map((e) => e.url);
  for (const page of ALL_CONTENT) {
    const html = read(page);
    const start = html.indexOf('<nav class="motoai-drawer" id="motoai-drawer"');
    assert.ok(start >= 0, `${page}: sidebar rendered`);
    const drawer = html.slice(start, html.indexOf('</nav>', start));
    const cmAt = drawer.indexOf('<li class="motoai-group" data-group="cm">');
    assert.ok(cmAt >= 0, `${page}: drawer Cẩm nang group`);
    const cm = drawer.slice(cmAt, drawer.indexOf('<li class="motoai-group" data-group=', cmAt + 1));
    assert.ok(cm.includes('<div class="motoai-row motoai-group-head"><a class="motoai-group-link" href="/blog/"'), `${page}: Cẩm nang heads its group as a real link`);
    const hubs = cm.split('<li class="motoai-hub">').slice(1);
    assert.equal(hubs.length, taxonomy.clusters.length, `${page}: one drawer hub per parent hub`);
    taxonomy.clusters.forEach((c, i) => {
      const hub = hubs[i];
      assert.ok(hub.includes(`<div class="motoai-row"><a class="motoai-hub-link" href="/blog/${c.dir}/"`), `${page}: drawer hub link ${c.dir}`);
      assert.ok(hub.includes(`<button type="button" class="motoai-toggle" id="motoai-hub-${c.id}-btn" aria-expanded="true" aria-controls="motoai-hub-${c.id}"`), `${page}: ${c.dir} has its own expand/collapse control`);
      const itemsAt = hub.indexOf(`<ul class="motoai-hub-items" id="motoai-hub-${c.id}">`);
      assert.ok(itemsAt > hub.indexOf('motoai-hub-link'), `${page}: ${c.dir} children nested under the hub link`);
      const cats = hub.slice(itemsAt).split('<li class="motoai-category">').slice(1);
      assert.deepEqual(cats.map((x) => /<a href="\/blog\/([a-z0-9-]+)\/"/.exec(x)?.[1]),
        c.categories.map((id) => taxonomy.categories[id].dir), `${page}: drawer children of ${c.dir} (taxonomy order)`);
      c.categories.forEach((id, j) => {
        const dir = taxonomy.categories[id].dir;
        const topics = [...cats[j].matchAll(/<li class="motoai-subtopic"><a href="([^"]+)"/g)].map((m) => m[1]);
        assert.deepEqual(topics, subtopicUrls(dir), `${page}: ${dir} subtopics nested under their category`);
        if (topics.length) {
          assert.match(cats[j], new RegExp(`^\\s*<div class="motoai-row"><a href="/blog/${dir}/"[^>]*><span>[^<]+</span></a><button type="button" class="motoai-toggle" id="motoai-cat-${id}-btn" aria-expanded="(?:true|false)" aria-controls="motoai-cat-${id}"`), `${page}: ${dir} link + its own toggle`);
          assert.match(cats[j], new RegExp(`<ul class="motoai-topic-items" id="motoai-cat-${id}"(?: hidden)?>`), `${page}: ${dir} topic list controlled by its toggle`);
        }
      });
    });
  }
  // v63: drawer visual rules live ONCE in style.css (loaded by BOTH the Agent
  // app and content pages) — single source, identical look. v79 row heights:
  // hub links inherit the shared 46px sidebar row (no hub-specific override),
  // category links are 42px and subtopics 40px, each category row pairs its
  // link with a 44×44 expand/collapse control.
  const css = read('assets/css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.motoai-drawer-list a,\s*\.motoai-drawer-list button\s*\{[^}]*min-height:\s*46px/, 'drawer hub links >= 44px (shared 46px row)');
  assert.match(css, /\.motoai-drawer-list \.motoai-hub-link\s*\{[^}]*\}/, 'hub link rule present');
  assert.ok(!/\.motoai-hub-link[^{}]*\{[^}]*min-height/.test(css), 'no rule lowers the hub link below the shared 46px row');
  assert.match(css, /\.motoai-hub-items \.motoai-category > a,\s*\.motoai-hub-items \.motoai-category \.motoai-row > a\s*\{[^}]*min-height:\s*42px/, 'drawer child (category) links: 42px rows');
  assert.match(css, /\.motoai-topic-items \.motoai-subtopic a\s*\{[^}]*min-height:\s*40px/, 'drawer subtopic links: 40px rows');
  assert.match(css, /\.motoai-drawer-list \.motoai-toggle\s*\{[^}]*width:\s*44px;\s*min-width:\s*44px;\s*min-height:\s*44px/, 'expand/collapse controls >= 44px');
  assert.ok(!/\.motoai-hub-items li a\s*\{/.test(css), 'the v61 flat child-link rule is gone (nested rows replace it)');
});

// ---------- Footer: hub silo columns + secondary services/legal row ----------

test('v61 footer renders the hub silo columns and a secondary Dịch vụ/Pháp lý row', () => {
  for (const page of ALL_CONTENT) {
    const html = read(page);
    assert.ok(html.includes('blog-footer-secondary'), `${page}: secondary footer row`);
    for (const l of LEGAL) {
      assert.ok(html.includes(`href="${l.url}"`), `${page}: legal link ${l.url}`);
    }
  }
});

// ---------- Parent hub pages: real topical hubs ----------

test('v61 parent hub pages are topical hubs: H1, intro, child cards, ItemList', () => {
  for (const c of taxonomy.clusters) {
    const html = read(`blog/${c.dir}/index.html`);
    assert.ok(html.includes(`<h1 class="blog-screen-title">${esc(c.name)}</h1>`), `${c.dir}: H1 = ${c.name}`);
    assert.ok(html.includes('blog-screen-lead'), `${c.dir}: intro lead`);
    assert.ok(html.includes('blog-cluster-child'), `${c.dir}: child category section`);
    for (const id of c.categories) {
      assert.ok(html.includes(`href="/blog/${taxonomy.categories[id].dir}/"`), `${c.dir}: links child ${id}`);
    }
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const col = lds.find((o) => o['@type'] === 'CollectionPage');
    assert.ok(col, `${c.dir}: CollectionPage schema`);
    assert.equal(col.name, c.name, `${c.dir}: schema name = display name`);
    assert.ok(col.mainEntity?.['@type'] === 'ItemList', `${c.dir}: ItemList of children + articles`);
    const crumbs = lds.find((o) => o['@type'] === 'BreadcrumbList');
    assert.deepEqual(crumbs.itemListElement.map((i) => i.name), [navigation.home.label, 'Cẩm nang', c.name], `${c.dir}: breadcrumb = Trang chủ › Cẩm nang › hub`);
    const visibleTrail = /<nav class="blog-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];
    const visible = [...visibleTrail.matchAll(/>([^<>]+)<\/(?:a|span)>/g)].map((m) => m[1]).filter((t) => t !== ' › ').map((t) => t.replace(/&amp;/g, '&'));
    assert.deepEqual(visible, [navigation.home.label, 'Cẩm nang', c.name], `${c.dir}: visible breadcrumb agrees with schema`);
  }
});

// ---------- Category hubs: link UP to the parent prominently ----------

test('v61 category hubs link UP to their parent hub (visible + schema + bottom block)', () => {
  for (const cat of Object.values(taxonomy.categories)) {
    const cluster = taxonomy.clusters.find((c) => c.id === cat.cluster);
    const html = read(`blog/${cat.dir}/index.html`);
    assert.ok(html.includes(`blog-hub-parent">Nhóm chủ đề: <a href="/blog/${cluster.dir}/"`), `${cat.dir}: prominent parent link`);
    assert.ok(html.includes(`blog-hub-cluster">Khám phá thêm trong ${esc(cluster.name)}`), `${cat.dir}: bottom cluster block`);
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const crumbs = lds.find((o) => o['@type'] === 'BreadcrumbList');
    assert.deepEqual(crumbs.itemListElement.map((i) => i.name), [navigation.home.label, 'Cẩm nang', cluster.name, cat.label], `${cat.dir}: breadcrumb hierarchy`);
    const visibleTrail = /<nav class="blog-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];
    const visible = [...visibleTrail.matchAll(/>([^<>]+)<\/(?:a|span)>/g)].map((m) => m[1]).filter((t) => t !== ' › ').map((t) => t.replace(/&amp;/g, '&'));
    assert.deepEqual(visible, [navigation.home.label, 'Cẩm nang', cluster.name, cat.label], `${cat.dir}: visible breadcrumb agrees with schema`);
  }
});

// ---------- Articles: child hub + parent hub + related, no orphans ----------

test('v61 articles link to their child hub AND parent hub (chip + breadcrumb + cluster block)', () => {
  // v64: a writer cycle may commit a draft manifest entry before the
  // publish workflow builds its page — audit only PUBLISHED articles.
  const published = publishedManifestArticles(ROOT);
  for (const a of published) {
    const cat = taxonomy.categories[a.category];
    const cluster = taxonomy.clusters.find((c) => c.id === cat.cluster);
    const html = read(`blog/${cat.dir}/${a.slug}/index.html`);
    assert.ok(html.includes(`href="/blog/${cat.dir}/"`), `${a.slug}: child hub link`);
    assert.ok(html.includes(`class="blog-chip blog-chip-parent" href="/blog/${cluster.dir}/"`), `${a.slug}: parent hub chip`);
    assert.ok(html.includes(`blog-hub-cluster">Khám phá thêm trong ${esc(cluster.name)}`), `${a.slug}: parent cluster block`);
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const crumbs = lds.find((o) => o['@type'] === 'BreadcrumbList').itemListElement.map((i) => i.name);
    assert.ok(crumbs[0] === navigation.home.label && crumbs[1] === 'Cẩm nang' && crumbs[2] === cluster.name && crumbs[3] === cat.label && crumbs[crumbs.length - 1] === a.title, `${a.slug}: breadcrumb = Trang chủ › Cẩm nang › hub › category (› subtopic) › title`);
    const visibleTrail = /<nav class="blog-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];
    const visible = [...visibleTrail.matchAll(/>([^<>]+)<\/(?:a|span)>/g)].map((m) => m[1]).filter((t) => t !== ' › ').map((t) => t.replace(/&amp;/g, '&'));
    assert.deepEqual(visible, crumbs, `${a.slug}: visible breadcrumb agrees with schema`);
  }
});

// ---------- URL stability: no URL moved ----------

test('v61 URL safety: every hub, child and article URL is unchanged and canonical', () => {
  const xml = read('sitemap.xml');
  for (const loc of [`${'https://chatbot.thuexemaynguyentu.com/'}blog/`,
    ...CLUSTER_DIRS.map((d) => `${'https://chatbot.thuexemaynguyentu.com/'}blog/${d}/`),
    ...Object.values(taxonomy.categories).map((c) => `${'https://chatbot.thuexemaynguyentu.com/'}blog/${c.dir}/`)]) {
    assert.ok(xml.includes(`<loc>${loc}</loc>`), `sitemap keeps ${loc}`);
  }
  for (const c of taxonomy.clusters) {
    const html = read(`blog/${c.dir}/index.html`);
    assert.ok(html.includes(`<link rel="canonical" href="https://chatbot.thuexemaynguyentu.com/blog/${c.dir}/"`), `${c.dir}: self-canonical`);
  }
});

// ---------- Content-site CSS contract (v72 editorial system; supersedes v61 Liquid Glass) ----------

test('v72 content CSS: translucent header + fallback, solid dropdown, reduced motion, dark tokens, scoped to content pages', () => {
  const css = read('assets/css/blog.css');
  // Scoped: nothing leaks into the chat homepage shell.
  assert.ok(!/body\.chat-home\s*\{/.test(css), 'content CSS never targets the chat homepage');
  assert.match(css, /body\.content-page \.site-header\s*\{[^}]*backdrop-filter/, 'translucent sticky header');
  assert.match(read('assets/css/style.css'), /\.site-nav-drop\s*\{[^}]*backdrop-filter:\s*blur\(18px\)/, 'dropdown panel blur (shared menu CSS)');
  assert.match(css, /body\.content-page \.blog-card,/, 'shared card surface rule');
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\)/, 'solid fallback when backdrop-filter is missing');
  assert.match(css, /prefers-reduced-motion: reduce/, 'reduced-motion respected');
  assert.match(css, /html\[data-motoai-theme="dark"\]\s*\{[^}]*--paper:/, 'dark-mode design tokens');
  // Article readability: opaque reading surface + comfortable Vietnamese leading.
  assert.match(css, /body\.content-page \.blog-article-body\s*\{[^}]*background:\s*var\(--reading-bg\)/, 'opaque reading surface');
  assert.match(css, /blog-article-body\s*\{[^}]*line-height:\s*1\.78/, 'line-height ~1.78');
  // No heavy dependencies: pure CSS, no external imports.
  assert.ok(!/@import|url\(https?:/.test(css), 'no external CSS/images');
});
