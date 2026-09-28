import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { taxonomy, navigation } from '../../tools/taxonomy.mjs';

/**
 * v62 SEO HUB LINK-GRAPH AUDIT (task §17) over the v61 hub architecture:
 *   BLOG_HOME=1, PARENT_HUBS=3, CHILD_HUBS=6, ARTICLES=published count
 *   ORPHANS=0, BROKEN_INTERNAL_LINKS=0,
 *   PARENT_WITHOUT_CHILD_LINK=0, CHILD_WITHOUT_PARENT_LINK=0,
 *   ARTICLE_WITHOUT_CHILD_LINK=0, ARTICLE_WITHOUT_PARENT_CONTEXT=0.
 * No URL migrations; no mass article generation.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const unesc = (s) => String(s).replace(/&amp;/g, '&');

const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const blogPages = () => walk('blog').filter((p) => p.endsWith('index.html'));
const PARENT_DIRS = taxonomy.clusters.map((c) => c.dir);
const CHILD_DIRS = Object.values(taxonomy.categories).map((c) => c.dir);
const ARTICLES = JSON.parse(read('data/blog/published.json')).articles;
const STATIC = ['privacy/index.html', 'terms/index.html', 'gioi-thieu/index.html',
  'chinh-sach/index.html', 'lien-he/index.html', 'gia-thue/index.html'];

function resolveHref(href) {
  if (!href || href.startsWith('#') || /^(https?:|mailto:|tel:|data:|javascript:)/i.test(href)) return null;
  if (!href.startsWith('/aichatbot/')) return null;
  let p = href.slice('/aichatbot/'.length).split('#')[0].split('?')[0];
  if (p === '' || p.endsWith('/')) p += 'index.html';
  return p;
}

// ---------- §17 audit metrics ----------

test('audit: ZERO broken internal links across every page (home + blog + static)', () => {
  const broken = [];
  for (const page of [...blogPages(), 'index.html', ...STATIC]) {
    for (const m of read(page).matchAll(/href="([^"]+)"/g)) {
      const target = resolveHref(m[1]);
      if (target === null) continue;
      if (!existsSync(join(ROOT, target))) broken.push(`${page} → ${m[1]}`);
    }
  }
  assert.deepEqual(broken, [], `broken internal links: ${broken.join(', ')}`);
});

test('audit: ZERO orphan pages — every hub/article page has an inbound internal link', () => {
  const inbound = new Set();
  for (const page of [...blogPages(), ...STATIC]) {
    for (const m of read(page).matchAll(/href="([^"]+)"/g)) {
      const target = resolveHref(m[1]);
      if (target) inbound.add(target);
    }
  }
  const orphans = blogPages().filter((p) => !inbound.has(p));
  assert.deepEqual(orphans, [], `orphan pages: ${orphans.join(', ')}`);
});

test('audit: PARENT_WITHOUT_CHILD_LINK = 0 (every parent links both children)', () => {
  for (const c of taxonomy.clusters) {
    const html = read(`blog/${c.dir}/index.html`);
    for (const id of c.categories) {
      assert.ok(html.includes(`href="/aichatbot/blog/${taxonomy.categories[id].dir}/"`),
        `${c.dir}: links child ${id}`);
    }
  }
});

test('audit: CHILD_WITHOUT_PARENT_LINK = 0 (every child links its parent, visible)', () => {
  for (const cat of Object.values(taxonomy.categories)) {
    const cluster = taxonomy.clusters.find((c) => c.id === cat.cluster);
    const html = read(`blog/${cat.dir}/index.html`);
    assert.ok(html.includes(`href="/aichatbot/blog/${cluster.dir}/"`), `${cat.dir}: parent link`);
    assert.ok(unesc(html).includes(`Nhóm chủ đề: <a href="/aichatbot/blog/${cluster.dir}/">${cluster.name}</a>`),
      `${cat.dir}: prominent parent context`);
  }
});

test('audit: ARTICLE_WITHOUT_CHILD_LINK = 0 and ARTICLE_WITHOUT_PARENT_CONTEXT = 0', () => {
  for (const a of ARTICLES) {
    const cat = taxonomy.categories[a.category];
    const cluster = taxonomy.clusters.find((c) => c.id === cat.cluster);
    const html = read(`blog/${cat.dir}/${a.slug}/index.html`);
    assert.ok(html.includes(`href="/aichatbot/blog/${cat.dir}/"`), `${a.slug}: child hub link`);
    assert.ok(html.includes(`href="/aichatbot/blog/${cluster.dir}/"`), `${a.slug}: parent hub link`);
    assert.ok(html.includes('blog-topic-context'), `${a.slug}: topic context section`);
    assert.ok(unesc(html).includes('Bài viết thuộc'), `${a.slug}: topic context label`);
    assert.ok(unesc(html).includes(`<a href="/aichatbot/blog/${cluster.dir}/">${cluster.name}</a>`), `${a.slug}: context names the parent`);
  }
});

// ---------- Menu hierarchy: desktop + mobile drawer ----------

test('menu: desktop header exposes the 3 parent hubs as crawlable anchors', () => {
  for (const page of ['blog/index.html', 'blog/thue-xe/index.html', ...STATIC]) {
    const html = read(page);
    for (const c of taxonomy.clusters) {
      assert.ok(html.includes(`class="site-nav-parent" href="/aichatbot/blog/${c.dir}/"`), `${page}: parent anchor ${c.dir}`);
      for (const id of c.categories) {
        assert.ok(html.includes(`href="/aichatbot/blog/${taxonomy.categories[id].dir}/"`), `${page}: dropdown child ${id}`);
      }
    }
  }
});

test('menu: chat homepage drawer mirrors the hub → child hierarchy (mobile menu)', () => {
  const html = read('index.html');
  const drawer = html.slice(html.indexOf('id="motoai-drawer"'), html.indexOf('</nav>', html.indexOf('id="motoai-drawer"')));
  for (const c of taxonomy.clusters) {
    assert.ok(drawer.includes(`href="/aichatbot/blog/${c.dir}/"`), `home drawer: parent link ${c.dir}`);
    assert.ok(unesc(drawer).includes(c.name), `home drawer: parent label ${c.name}`);
    for (const id of c.categories) {
      assert.ok(drawer.includes(`href="/aichatbot/blog/${taxonomy.categories[id].dir}/"`), `home drawer: child ${id}`);
    }
  }
  // Parent links keep 44px+ touch targets on the home shell too.
  const css = read('assets/css/style.css');
  assert.match(css, /\.motoai-hub-link\s*\{[^}]*min-height:\s*48px/, 'drawer hub links >= 44px');
  assert.match(css, /\.motoai-hub-items li a\s*\{[^}]*min-height:\s*44px/, 'drawer child links >= 44px');
});

// ---------- Blog home = super hub (task §5) ----------

test('blog home: THREE primary hub sections with linked H2 + child pills + latest articles + CTA', () => {
  const home = read('blog/index.html');
  for (const c of taxonomy.clusters) {
    assert.ok(home.includes(`<section class="blog-hub-section" aria-label="`), 'semantic <section>');
    assert.ok(unesc(home).includes(`<h2><a href="/aichatbot/blog/${c.dir}/">${c.icon} ${c.name}</a></h2>`), `linked H2 ${c.name}`);
    assert.ok(unesc(home).includes(`Xem toàn bộ ${c.name} →`), `CTA ${c.name}`);
    for (const id of c.categories) {
      assert.ok(home.includes(`href="/aichatbot/blog/${taxonomy.categories[id].dir}/"`), `child pill ${id}`);
    }
  }
});

// ---------- Schema ----------

test('schema: CollectionPage + ItemList on home/parents/children; Article + BreadcrumbList everywhere', () => {
  const types = (p) => [...read(p).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1])['@type']);
  const home = types('blog/index.html');
  assert.ok(home.includes('CollectionPage'), 'home: CollectionPage');
  assert.ok(home.some((t, i) => t === 'CollectionPage' || t === 'ItemList'), 'home: schema present');
  const homeLds = [...read('blog/index.html').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
  const homeCol = homeLds.find((o) => o['@type'] === 'CollectionPage');
  assert.equal(homeCol?.mainEntity?.itemListElement?.length, 3, 'home: ItemList of the 3 parent hubs');
  for (const dir of [...PARENT_DIRS, ...CHILD_DIRS]) {
    const t = types(`blog/${dir}/index.html`);
    assert.ok(t.includes('CollectionPage') && t.includes('BreadcrumbList'), `${dir}: CollectionPage + BreadcrumbList`);
  }
  for (const c of taxonomy.clusters) {
    const lds = [...read(`blog/${c.dir}/index.html`).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]));
    const col = lds.find((o) => o['@type'] === 'CollectionPage');
    assert.ok(col?.mainEntity?.['@type'] === 'ItemList', `${c.dir}: ItemList mainEntity`);
  }
  for (const a of ARTICLES) {
    const cat = taxonomy.categories[a.category];
    const t = types(`blog/${cat.dir}/${a.slug}/index.html`);
    assert.ok(t.includes('Article') && t.includes('BreadcrumbList'), `${a.slug}: Article + BreadcrumbList`);
  }
});

// ---------- Breadcrumb hierarchy (task §9) ----------

test('breadcrumbs: Agent › Cẩm nang › Parent › Child › Article, visible == JSON-LD', () => {
  for (const a of ARTICLES) {
    const cat = taxonomy.categories[a.category];
    const cluster = taxonomy.clusters.find((c) => c.id === cat.cluster);
    const html = read(`blog/${cat.dir}/${a.slug}/index.html`);
    const trail = /<nav class="blog-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];
    const visible = [...trail.matchAll(/>([^<>]+)<\/(?:a|span)>/g)].map((m) => unesc(m[1])).filter((t) => t !== ' › ');
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1])).find((o) => o['@type'] === 'BreadcrumbList');
    assert.deepEqual(ld.itemListElement.map((i) => i.name), visible, `${a.slug}: visible == schema`);
    assert.equal(visible[0], 'Agent');
    assert.equal(visible[1], 'Cẩm nang');
    assert.equal(visible[2], cluster.name, `${a.slug}: parent level`);
    assert.equal(visible[3], cat.label, `${a.slug}: child level`);
  }
});

// ---------- Footer hub map (task §10) ----------

test('footer: parent-hub columns with indented children + compact secondary row', () => {
  const html = unesc(read('blog/index.html'));
  const footer = html.slice(html.indexOf('<footer class="blog-footer">'), html.indexOf('</footer>'));
  for (const c of taxonomy.clusters) {
    assert.ok(footer.includes(`class="footer-hub-link" href="/aichatbot/blog/${c.dir}/"`), `footer parent ${c.name}`);
    for (const id of c.categories) {
      const cat = taxonomy.categories[id];
      const navItem = navigation.categories.find((n) => n.id === id);
      assert.ok(footer.includes(`href="/aichatbot/blog/${cat.dir}/">${navItem.label}<`), `footer child ${navItem.label}`);
    }
  }
  assert.ok(footer.includes('blog-footer-secondary'), 'secondary service/legal row');
  for (const l of navigation.legal) {
    assert.ok(footer.includes(`href="${l.url}"`), `secondary row links ${l.url}`);
  }
});

// ---------- URL freeze (task §16) ----------

test('URL freeze: no hub/article URL or canonical changed', () => {
  const SITE = 'https://thuexemayhanoi.github.io/aichatbot/';
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const dir of [...PARENT_DIRS, ...CHILD_DIRS]) {
    assert.ok(locs.includes(`${SITE}blog/${dir}/`), `sitemap keeps /blog/${dir}/`);
  }
  for (const a of ARTICLES) {
    const cat = taxonomy.categories[a.category];
    assert.ok(locs.includes(`${SITE}blog/${cat.dir}/${a.slug}/`), `sitemap keeps article ${a.slug}`);
  }
  for (const dir of [...PARENT_DIRS, ...CHILD_DIRS]) {
    assert.ok(read(`blog/${dir}/index.html`).includes(`rel="canonical" href="${SITE}blog/${dir}/"`), `${dir}: canonical self`);
  }
});
