import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { taxonomy, navigation } from '../../tools/taxonomy.mjs';
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
const ALL_CONTENT = [...walk('blog').filter((p) => p.endsWith('.html')),
  ...['privacy', 'terms', 'gioi-thieu', 'chinh-sach', 'lien-he', 'gia-thue'].map((d) => `${d}/index.html`)];

// ---------- Desktop menu: parent hubs with dropdowns ----------

test('v61 desktop menu prioritizes the 3 parent hubs, each as a REAL crawlable <a>', () => {
  for (const page of ALL_CONTENT) {
    const html = read(page);
    const nav = html.slice(html.indexOf('<nav class="site-nav"'), html.indexOf('</nav>', html.indexOf('<nav class="site-nav"')));
    for (const c of taxonomy.clusters) {
      // Parent label is a link to its hub — never a JS-only button.
      assert.ok(nav.includes(`class="site-nav-parent" href="/blog/${c.dir}/"`), `${page}: parent hub link ${c.dir}`);
      assert.ok(nav.includes(esc(c.name)), `${page}: parent label ${c.name}`);
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
  const css = read('assets/css/blog.css');
  const js = read('assets/js/app-shell.js');
  assert.match(css, /\.site-nav-item:focus-within \.site-nav-drop[\s\S]{0,80}display:\s*block/, 'focus-within opens the dropdown (keyboard)');
  assert.match(css, /\.site-nav-item\.open \.site-nav-drop[\s\S]{0,60}display:\s*block/, 'open class opens the dropdown (touch)');
  assert.match(css, /\.site-nav-drop a\s*\{[^}]*min-height:\s*44px/, 'dropdown touch targets >= 44px');
  assert.ok(js.includes("key === 'Escape'"), 'Escape closes an open dropdown');
  assert.ok(js.includes("closest('.site-nav')"), 'outside tap closes dropdowns');
});

// ---------- Mobile drawer: hub → children hierarchy ----------

test('v61 drawer Cẩm nang group mirrors the hub → category hierarchy with real links', () => {
  for (const page of ALL_CONTENT) {
    const html = read(page);
    for (const c of taxonomy.clusters) {
      assert.ok(html.includes(`class="motoai-hub-link" href="/blog/${c.dir}/"`), `${page}: drawer hub link ${c.dir}`);
      for (const id of c.categories) {
        assert.ok(html.includes(`href="/blog/${taxonomy.categories[id].dir}/"`), `${page}: drawer child ${id}`);
      }
    }
  }
  // v63: drawer visual rules live ONCE in style.css (loaded by BOTH the chat
  // homepage and content pages) — single source, identical look.
  const css = read('assets/css/style.css');
  assert.match(css, /\.motoai-hub-link\s*\{[^}]*min-height:\s*48px/, 'drawer hub links >= 44px');
  assert.match(css, /\.motoai-hub-items li a\s*\{[^}]*min-height:\s*44px/, 'drawer child links >= 44px');
});

// ---------- Footer: hub silo columns + secondary services/legal row ----------

test('v61 footer renders the hub silo columns and a secondary Dịch vụ/Pháp lý row', () => {
  for (const page of ALL_CONTENT) {
    const html = read(page);
    assert.ok(html.includes('blog-footer-secondary'), `${page}: secondary footer row`);
    for (const l of navigation.legal) {
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
    assert.deepEqual(crumbs.itemListElement.map((i) => i.name), ['Agent', 'Cẩm nang', c.name], `${c.dir}: breadcrumb = Agent › Cẩm nang › hub`);
    const visibleTrail = /<nav class="blog-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];
    const visible = [...visibleTrail.matchAll(/>([^<>]+)<\/(?:a|span)>/g)].map((m) => m[1]).filter((t) => t !== ' › ').map((t) => t.replace(/&amp;/g, '&'));
    assert.deepEqual(visible, ['Agent', 'Cẩm nang', c.name], `${c.dir}: visible breadcrumb agrees with schema`);
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
    assert.deepEqual(crumbs.itemListElement.map((i) => i.name), ['Agent', 'Cẩm nang', cluster.name, cat.label], `${cat.dir}: breadcrumb hierarchy`);
    const visibleTrail = /<nav class="blog-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];
    const visible = [...visibleTrail.matchAll(/>([^<>]+)<\/(?:a|span)>/g)].map((m) => m[1]).filter((t) => t !== ' › ').map((t) => t.replace(/&amp;/g, '&'));
    assert.deepEqual(visible, ['Agent', 'Cẩm nang', cluster.name, cat.label], `${cat.dir}: visible breadcrumb agrees with schema`);
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
    assert.ok(crumbs[0] === 'Agent' && crumbs[1] === 'Cẩm nang' && crumbs[2] === cluster.name && crumbs[3] === cat.label && crumbs[crumbs.length - 1] === a.title, `${a.slug}: breadcrumb = Agent › Cẩm nang › hub › category (› subtopic) › title`);
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

// ---------- Liquid Glass CSS contract ----------

test('v61 Liquid Glass: translucent surfaces + blur + fallback + reduced motion, scoped to content pages', () => {
  const css = read('assets/css/blog.css');
  // Scoped: nothing leaks into the chat homepage shell.
  assert.ok(!/body\.chat-home\s*\{/.test(css), 'glass CSS never targets the chat homepage');
  assert.match(css, /body\.content-page \.site-header\s*\{[^}]*backdrop-filter/, 'glass header');
  assert.match(css, /\.site-nav-drop\s*\{[^}]*backdrop-filter:\s*blur\(18px\)/, 'glass dropdown 18px blur');
  assert.match(css, /body\.content-page \.blog-card,/, 'glass article cards');
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\)/, 'solid fallback when backdrop-filter is missing');
  assert.match(css, /prefers-reduced-motion: reduce/, 'reduced-motion respected');
  assert.match(css, /html\[data-motoai-theme="dark"\] body\.content-page/, 'dark-mode glass tokens');
  // Article readability: near-opaque reading surface + comfortable type.
  assert.match(css, /body\.content-page \.blog-article-body\s*\{[^}]*--glass-bg-strong|body\.content-page \.blog-article-body\s*\{[^}]*background:\s*var\(--glass-bg-strong\)/, 'high-opacity reading surface');
  assert.match(css, /blog-article-body\s*\{[^}]*line-height:\s*1\.78/, 'line-height ~1.78');
  // No heavy dependencies: pure CSS, no external imports.
  assert.ok(!/@import|url\(https?:/.test(css), 'no external CSS/images');
});
