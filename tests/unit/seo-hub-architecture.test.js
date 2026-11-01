import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { taxonomy, navigation, deriveSubtopic } from '../../tools/taxonomy.mjs';
import { parseMatrix } from '../../tools/blog-factory.mjs';
import { SITE_PAGES } from '../../tools/site-pages.mjs';
import { BLOG_UI } from '../../tools/blog-components.mjs';

const ROWS = Object.fromEntries(parseMatrix().map((r) => [r.article_id, r]));

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
// v64: audit only articles whose matrix row is PUBLISHED — a writer cycle
// may commit a draft (QA row) before the publish workflow builds it.
import { publishedManifestArticles } from '../helpers/factory-sandbox.mjs';

const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const blogPages = () => walk('blog').filter((p) => p.endsWith('index.html'));
// M3: a subtopic hub's pages (page 1 + …/page/N/), read once per file.
const cache = new Map();
const readCached = (p) => (cache.has(p) ? cache.get(p) : cache.set(p, read(p)).get(p));
const subtopicPagesOf = (base) => [`${base}index.html`, ...(existsSync(join(ROOT, base, 'page'))
  ? readdirSync(join(ROOT, base, 'page')).sort((x, y) => Number(x) - Number(y)).map((n) => `${base}page/${n}/index.html`) : [])];
const PARENT_DIRS = taxonomy.clusters.map((c) => c.dir);
const CHILD_DIRS = Object.values(taxonomy.categories).map((c) => c.dir);
const ARTICLES = publishedManifestArticles(ROOT);
const STATIC = ['privacy/index.html', 'terms/index.html', 'gioi-thieu/index.html',
  'chinh-sach/index.html', 'lien-he/index.html', 'gia-thue/index.html'];

function resolveHref(href) {
  if (!href || href.startsWith('#') || /^(https?:|mailto:|tel:|data:|javascript:)/i.test(href)) return null;
  if (!href.startsWith('/')) return null;
  let p = href.slice('/'.length).split('#')[0].split('?')[0];
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
      assert.ok(html.includes(`href="/blog/${taxonomy.categories[id].dir}/"`),
        `${c.dir}: links child ${id}`);
    }
  }
});

test('audit: CHILD_WITHOUT_PARENT_LINK = 0 (every child links its parent, visible)', () => {
  for (const cat of Object.values(taxonomy.categories)) {
    const cluster = taxonomy.clusters.find((c) => c.id === cat.cluster);
    const html = read(`blog/${cat.dir}/index.html`);
    assert.ok(html.includes(`href="/blog/${cluster.dir}/"`), `${cat.dir}: parent link`);
    assert.ok(unesc(html).includes(`Nhóm chủ đề: <a href="/blog/${cluster.dir}/">${cluster.name}</a>`),
      `${cat.dir}: prominent parent context`);
  }
});

test('audit: ARTICLE_WITHOUT_CHILD_LINK = 0 and ARTICLE_WITHOUT_PARENT_CONTEXT = 0', () => {
  for (const a of ARTICLES) {
    const cat = taxonomy.categories[a.category];
    const cluster = taxonomy.clusters.find((c) => c.id === cat.cluster);
    const html = read(`blog/${cat.dir}/${a.slug}/index.html`);
    assert.ok(html.includes(`href="/blog/${cat.dir}/"`), `${a.slug}: child hub link`);
    assert.ok(html.includes(`href="/blog/${cluster.dir}/"`), `${a.slug}: parent hub link`);
    assert.ok(html.includes('blog-topic-context'), `${a.slug}: topic context section`);
    assert.ok(unesc(html).includes('Bài viết thuộc'), `${a.slug}: topic context label`);
    assert.ok(unesc(html).includes(`<a href="/blog/${cluster.dir}/">${cluster.name}</a>`), `${a.slug}: context names the parent`);
  }
});

// ---------- Menu hierarchy: desktop + mobile drawer ----------

test('menu: desktop header exposes the 3 parent hubs as crawlable anchors', () => {
  for (const page of ['blog/index.html', 'blog/thue-xe/index.html', ...STATIC]) {
    const html = read(page);
    for (const c of taxonomy.clusters) {
      assert.ok(html.includes(`class="site-nav-parent" href="/blog/${c.dir}/"`), `${page}: parent anchor ${c.dir}`);
      for (const id of c.categories) {
        assert.ok(html.includes(`href="/blog/${taxonomy.categories[id].dir}/"`), `${page}: dropdown child ${id}`);
      }
    }
  }
});

// v79 sidebar: nested accordions (Cẩm nang › hub › category › subtopic).
// `listBody` returns ONE list, balanced over its nested <ul>s, so a child is
// proven to sit in its OWN parent's list — not merely somewhere in the panel.
const tight = (s) => String(s).replace(/>\s+</g, '><');
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const listBody = (html, openTag) => {
  const start = html.indexOf(openTag);
  if (start < 0) return null;
  const re = /<ul\b|<\/ul>/g;
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0] === '</ul>' ? -1 : 1;
    if (depth === 0) return html.slice(start + openTag.length, m.index);
  }
  return null;
};
// Declarations of the stylesheet rule whose selector list is exactly `selector`.
const cssRule = (css, selector) => {
  const sel = reEsc(selector).replace(/,\s*/g, ',\\s*').replace(/ /g, '\\s+');
  return new RegExp(`(?:^|[}\\n])\\s*${sel}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
};
const pxOf = (decls, prop) => {
  const m = new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(decls ?? '');
  return m ? Number(m[1]) : undefined;
};

test('menu: chat homepage drawer mirrors the hub → child hierarchy (mobile menu)', () => {
  const html = read('index.html');
  const drawer = html.slice(html.indexOf('id="motoai-drawer"'), html.indexOf('</nav>', html.indexOf('id="motoai-drawer"')));
  for (const c of taxonomy.clusters) {
    assert.ok(drawer.includes(`href="/blog/${c.dir}/"`), `home drawer: parent link ${c.dir}`);
    assert.ok(unesc(drawer).includes(navigation.hub_labels?.[c.id] ?? c.name), `home drawer: compact parent label ${c.id}`);
    for (const id of c.categories) {
      assert.ok(drawer.includes(`href="/blog/${taxonomy.categories[id].dir}/"`), `home drawer: child ${id}`);
    }
  }

  // The hierarchy itself (v79 nested accordions): every hub sits in the
  // Cẩm nang group as its own row (crawlable link + its own control) followed
  // by its OWN list holding exactly its categories in taxonomy order; each
  // category lists exactly its live subtopic hubs behind its own control.
  const L = BLOG_UI.labels;
  const cm = listBody(tight(drawer), '<ul class="motoai-group-items" id="motoai-group-cm">');
  assert.ok(cm, 'home drawer: the Cẩm nang group holds the hubs');
  const liveUrls = new Set([...read('sitemap.xml').matchAll(/<loc>https?:\/\/[^/]+(\/blog\/[^<]+)<\/loc>/g)].map((m) => m[1]));
  const ICON = '<svg class="motoai-nav-icon[^"]*"[^>]*>[\\s\\S]*?<\\/svg>';
  let bareCategories = 0;
  let lastHub = -1;
  for (const c of taxonomy.clusters) {
    const label = navigation.hub_labels?.[c.id] ?? c.name;
    const row = new RegExp(`<li class="motoai-hub"><div class="motoai-row"><a class="motoai-hub-link" href="/blog/${reEsc(c.dir)}/">${ICON}<span>${reEsc(label)}</span></a>`
      + `<button type="button" class="motoai-toggle" id="motoai-hub-${reEsc(c.id)}-btn" aria-expanded="true" aria-controls="motoai-hub-${reEsc(c.id)}" `
      + `aria-label="${reEsc(L.menuCollapse.replace('{name}', label))}" data-name="${reEsc(label)}"></button></div>`
      + `<ul class="motoai-hub-items" id="motoai-hub-${reEsc(c.id)}">`).exec(cm);
    assert.ok(row, `home drawer: hub ${c.id} = link + own control + own open list, inside Cẩm nang`);
    assert.ok(row.index > lastHub, `home drawer: hub ${c.id} in taxonomy order`);
    lastHub = row.index;
    assert.equal((drawer.match(new RegExp(`href="/blog/${reEsc(c.dir)}/"`, 'g')) ?? []).length, 1, `home drawer: hub ${c.id} linked once`);

    const items = listBody(cm, `<ul class="motoai-hub-items" id="motoai-hub-${c.id}">`);
    assert.ok(items, `home drawer: hub ${c.id} list closes`);
    assert.equal((items.match(/<li class="motoai-category">/g) ?? []).length, c.categories.length, `home drawer: hub ${c.id} holds exactly its categories`);
    let lastCat = -1;
    for (const id of c.categories) {
      const cat = taxonomy.categories[id];
      const link = `<a href="/blog/${cat.dir}/"><span>${cat.label}</span></a>`;
      const topics = (taxonomy.subtopics[id] ?? [])
        .map((t) => ({ url: `/blog/${cat.dir}/${t.slug}/`, label: t.label.replace(/\s*\/\s*/g, ' ').trim() }))
        .filter((t) => liveUrls.has(t.url));
      const head = topics.length
        ? `<li class="motoai-category"><div class="motoai-row">${link}<button type="button" class="motoai-toggle" id="motoai-cat-${id}-btn" aria-expanded="false" aria-controls="motoai-cat-${id}" aria-label="${L.menuExpand.replace('{name}', cat.label)}" data-name="${cat.label}"></button></div><ul class="motoai-topic-items" id="motoai-cat-${id}" hidden>`
        : `<li class="motoai-category">${link}</li>`;
      const at = unesc(items).indexOf(head);
      assert.ok(at > lastCat, `home drawer: child ${id} nested under hub ${c.id}, in order${topics.length ? ', with its own closed topic list' : ''}`);
      lastCat = at;
      assert.equal((drawer.match(new RegExp(`href="/blog/${reEsc(cat.dir)}/"`, 'g')) ?? []).length, 1, `home drawer: child ${id} linked once`);
      if (!topics.length) { bareCategories += 1; continue; }
      const topicList = listBody(items, `<ul class="motoai-topic-items" id="motoai-cat-${id}" hidden>`);
      assert.equal(unesc(topicList), topics.map((t) =>
        `<li class="motoai-subtopic"><a href="${t.url}" aria-label="${cat.label}: ${t.label}"><span>${t.label}</span></a></li>`).join(''),
      `home drawer: ${id} lists exactly its live subtopic hubs`);
    }
  }

  // Touch targets on the home shell (v79 rows). Parent (hub) links keep a
  // 44px+ box; every hub/category row pairs its link with a 44×44 control in
  // a flex row, so each row of the hierarchy stays >= 44px tall. Pinned
  // floors catch any further shrink of the category/subtopic link boxes.
  const css = read('assets/css/style.css');
  const base = pxOf(cssRule(css, '.motoai-drawer-list a, .motoai-drawer-list button'), 'min-height');
  const hubRule = cssRule(css, '.motoai-drawer-list .motoai-hub-link');
  assert.ok(hubRule !== undefined, 'drawer hub link rule present');
  const hubLink = pxOf(hubRule, 'min-height') ?? base;
  assert.ok(hubLink >= 44, `drawer hub links >= 44px (got ${hubLink}px)`);
  for (const m of css.matchAll(/([^{}]*\.motoai-hub-link[^{}]*)\{([^}]*)\}/g)) {
    const v = pxOf(m[2], 'min-height');
    assert.ok(v === undefined || v >= 44, `no rule shrinks the hub link below 44px: ${m[1].trim()}`);
  }
  const toggle = cssRule(css, '.motoai-drawer-list .motoai-toggle');
  assert.ok(pxOf(toggle, 'min-width') >= 44 && pxOf(toggle, 'min-height') >= 44, 'drawer expand/collapse controls >= 44×44px');
  assert.match(cssRule(css, '.motoai-row') ?? '', /display: flex;/, 'a row lays its link and control side by side');
  const catLink = pxOf(cssRule(css, '.motoai-hub-items .motoai-category > a, .motoai-hub-items .motoai-category .motoai-row > a'), 'min-height') ?? base;
  assert.ok(Math.max(catLink, pxOf(toggle, 'min-height')) >= 44, `drawer child rows >= 44px (link ${catLink}px + 44px control)`);
  assert.ok(catLink >= 44, `drawer child links are ${catLink}px (>= 44px)`);
  if (bareCategories) assert.ok(catLink >= 44, 'a child row without its own control needs a 44px link');
  const topicLink = pxOf(cssRule(css, '.motoai-topic-items .motoai-subtopic a'), 'min-height') ?? base;
  assert.ok(topicLink >= 44, `drawer subtopic links are ${topicLink}px (>= 44px)`);
});

// ---------- Blog home = super hub (task §5) ----------

test('blog home: THREE primary hub sections with linked H2 + child pills + latest articles + CTA', () => {
  const home = read('blog/index.html');
  for (const c of taxonomy.clusters) {
    assert.ok(home.includes(`<section class="blog-hub-section" aria-label="`), 'semantic <section>');
    assert.ok(unesc(home).includes(`<h2><a href="/blog/${c.dir}/">${c.name}</a></h2>`), `linked H2 ${c.name}`);
    assert.ok(unesc(home).includes(`Xem toàn bộ ${c.name} →`), `CTA ${c.name}`);
    for (const id of c.categories) {
      assert.ok(home.includes(`href="/blog/${taxonomy.categories[id].dir}/"`), `child pill ${id}`);
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

test('breadcrumbs: Trang chủ › Cẩm nang › Parent › Child › Article, visible == JSON-LD', () => {
  for (const a of ARTICLES) {
    const cat = taxonomy.categories[a.category];
    const cluster = taxonomy.clusters.find((c) => c.id === cat.cluster);
    const html = read(`blog/${cat.dir}/${a.slug}/index.html`);
    const trail = /<nav class="blog-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];
    const visible = [...trail.matchAll(/>([^<>]+)<\/(?:a|span)>/g)].map((m) => unesc(m[1])).filter((t) => t !== ' › ');
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1])).find((o) => o['@type'] === 'BreadcrumbList');
    assert.deepEqual(ld.itemListElement.map((i) => i.name), visible, `${a.slug}: visible == schema`);
    assert.equal(visible[0], navigation.home.label);
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
    assert.ok(footer.includes(`class="footer-hub-link" href="/blog/${c.dir}/"`), `footer parent ${c.name}`);
    for (const id of c.categories) {
      const cat = taxonomy.categories[id];
      assert.ok(footer.includes(`href="/blog/${cat.dir}/">${cat.label}<`), `footer child ${cat.label}`);
    }
  }
  assert.ok(footer.includes('blog-footer-secondary'), 'secondary service/legal row');
  for (const l of SITE_PAGES.filter((pg) => pg.group === 'legal').map((pg) => ({ url: `/${pg.dir}/` }))) {
    assert.ok(footer.includes(`href="${l.url}"`), `secondary row links ${l.url}`);
  }
});

// ---------- URL freeze (task §16) ----------

test('URL freeze: no hub/article URL or canonical changed', () => {
  const SITE = 'https://chatbot.thuexemaynguyentu.com/';
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

// ---------- v63.1 hybrid hardening: subtopic layer of the link graph ----------

const ARTICLE_PATHS = new Set(ARTICLES.map((a) => `blog/${taxonomy.categories[a.category].dir}/${a.slug}/index.html`));
/** Subtopic hub pages = one dir under a silo that is NOT an article page. */
const subtopicPages = () => blogPages().filter((p) =>
  /^blog\/[a-z-]+\/[a-z0-9-]+\/index\.html$/.test(p) && !ARTICLE_PATHS.has(p));
const ldjsonOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((m) => JSON.parse(m[1]));
const visibleTrailOf = (html) => {
  const trail = /<nav class="blog-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];
  return [...trail.matchAll(/>([^<>]+)<\/(?:a|span)>/g)].map((m) => unesc(m[1])).filter((t) => t !== '›');
};

test('audit: SUBTOPIC_WITHOUT_SILO_LINK = 0 (subtopic links silo AND parent hub)', () => {
  assert.ok(subtopicPages().length >= 1, 'at least one subtopic hub is published');
  for (const p of subtopicPages()) {
    const siloDir = /^blog\/([a-z-]+)\//.exec(p)[1];
    const [catId, cat] = Object.entries(taxonomy.categories).find(([, c]) => c.dir === siloDir);
    const cluster = taxonomy.clusters.find((c) => c.id === cat.cluster);
    const html = read(p);
    assert.ok(html.includes(`href="/blog/${siloDir}/"`), `${p}: silo link`);
    assert.ok(html.includes(`href="/blog/${cluster.dir}/"`), `${p}: parent hub link (breadcrumb)`);
  }
});

test('audit: subtopic schema = CollectionPage + ItemList + BreadcrumbList; visible == JSON-LD', () => {
  for (const p of subtopicPages()) {
    const siloDir = /^blog\/([a-z-]+)\//.exec(p)[1];
    const subSlug = /^blog\/[a-z-]+\/([a-z0-9-]+)\//.exec(p)[1];
    const [catId, cat] = Object.entries(taxonomy.categories).find(([, c]) => c.dir === siloDir);
    const cluster = taxonomy.clusters.find((c) => c.id === cat.cluster);
    const sub = (taxonomy.subtopics[catId] ?? []).find((s) => s.slug === subSlug);
    const html = read(p);
    const lds = ldjsonOf(html);
    const col = lds.find((o) => o['@type'] === 'CollectionPage');
    assert.ok(col, `${p}: CollectionPage`);
    assert.ok(col.mainEntity?.['@type'] === 'ItemList', `${p}: ItemList mainEntity`);
    assert.equal(col.url, `${'https://chatbot.thuexemaynguyentu.com/'}${p.replace(/index\.html$/, '')}`, `${p}: CollectionPage url is self`);
    const crumbs = lds.find((o) => o['@type'] === 'BreadcrumbList').itemListElement.map((i) => i.name);
    const visible = visibleTrailOf(html);
    assert.deepEqual(visible, crumbs, `${p}: visible breadcrumb == JSON-LD`);
    assert.equal(crumbs.length, 5, `${p}: full 5-level trail`);
    assert.deepEqual([crumbs[0], crumbs[1], crumbs[2], crumbs[3]], [navigation.home.label, 'Cẩm nang', cluster.name, cat.label], `${p}: Trang chủ › Cẩm nang › hub › silo`);
    assert.equal(crumbs[4], sub.label, `${p}: subtopic level`);
  }
});

test('audit: canonical hygiene — every blog page self-canonical, zero duplicates', () => {
  const SITE = 'https://chatbot.thuexemaynguyentu.com/';
  const seen = new Map();
  for (const p of blogPages()) {
    const html = read(p);
    const canon = /<link rel="canonical" href="([^"]+)"\/?>/.exec(html)?.[1];
    assert.ok(canon, `${p}: canonical present`);
    assert.equal(canon, `${SITE}${p.replace(/index\.html$/, '')}`, `${p}: self-canonical`);
    assert.ok(!seen.has(canon), `duplicate canonical ${canon} (${p} vs ${seen.get(canon)})`);
    seen.set(canon, p);
  }
});

test('audit: full hybrid chain Super Hub → Parent Hub → Silo → Subtopic → Article', () => {
  // Walk the real chain of every published article: the super hub must link
  // the parent hub, the hub the silo, the silo the subtopic (when one exists),
  // and the subtopic/silo the article itself.
  const superHub = read('blog/index.html');
  for (const a of ARTICLES) {
    const cat = taxonomy.categories[a.category];
    const cluster = taxonomy.clusters.find((c) => c.id === cat.cluster);
    assert.ok(superHub.includes(`href="/blog/${cluster.dir}/"`), `super hub → ${cluster.dir}`);
    const hubPage = read(`blog/${cluster.dir}/index.html`);
    assert.ok(hubPage.includes(`href="/blog/${cat.dir}/"`), `hub ${cluster.dir} → silo ${cat.dir}`);
    const siloPage = read(`blog/${cat.dir}/index.html`);
    // v64.3: derive the article's OWN subtopic from the canonical taxonomy
    // model (matrix row) instead of grabbing the first subtopic page of the
    // silo — a silo may hold several subtopics plus fallback articles, and
    // each subtopic page only lists its own members.
    const sub = deriveSubtopic(a.category, ROWS[a.article_id] ?? {});
    if (!sub.fallback) {
      assert.ok(siloPage.includes(`href="/blog/${cat.dir}/${sub.slug}/"`), `silo ${cat.dir} → subtopic ${sub.slug}`);
      // M3: a large subtopic hub is paginated like its silo (…/page/N/). The
      // chain still holds: page 1 of the subtopic links the page that lists
      // the article, and that page links the article.
      const subBase = `blog/${cat.dir}/${sub.slug}/`;
      const subPage = read(`${subBase}index.html`);
      const holder = subtopicPagesOf(subBase).find((p) => readCached(p).includes(`href="/blog/${cat.dir}/${a.slug}/"`));
      assert.ok(holder, `subtopic ${sub.slug} → article ${a.slug}`);
      if (holder !== `${subBase}index.html`) {
        const n = /page\/(\d+)\/index\.html$/.exec(holder)[1];
        assert.ok(subPage.includes(`href="/${subBase}page/${n}/"`), `subtopic ${sub.slug} page 1 → page ${n} (article ${a.slug})`);
      }
    } else {
      const siloPages = blogPages().filter((p) =>
        p === `blog/${cat.dir}/index.html` || p.startsWith(`blog/${cat.dir}/page/`));
      assert.ok(
        siloPages.some((p) => read(p).includes(`href="/blog/${cat.dir}/${a.slug}/"`)),
        `silo ${cat.dir} pagination → article ${a.slug}`
      );
    }
  }
});
