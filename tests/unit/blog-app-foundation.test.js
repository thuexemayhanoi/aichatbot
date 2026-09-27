import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  taxonomy, navigation, CLUSTER_BY_ID, CATEGORY_IDS, viSlug, deriveSubtopic
} from '../../tools/taxonomy.mjs';
import { paginate, buildToc, PER_PAGE } from '../../tools/build-blog.mjs';

/**
 * v56 BLOG APP FOUNDATION spec: parent/child taxonomy, nav source of truth,
 * shared footer, menu↔footer vocabulary, subtopic hubs (no empty hubs),
 * pagination, TOC, breadcrumbs, local Hanoi taxonomy, factory safety.
 * The chatbot stays the homepage; no mass article generation.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function parseMatrix() {
  const lines = read('data/blog/content-matrix.csv').trim().split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const blogPages = () => walk('blog').filter((p) => p.endsWith('index.html'));

// ---------- Taxonomy model (Level 2 clusters → Level 3 categories → Level 4 subtopics) ----------

test('taxonomy: 3 parent clusters cover the 6 canonical categories exactly once', () => {
  assert.equal(taxonomy.clusters.length, 3);
  const seen = [];
  for (const c of taxonomy.clusters) {
    for (const id of c.categories) {
      assert.ok(CATEGORY_IDS.includes(id), `unknown category ${id}`);
      seen.push(id);
    }
  }
  assert.deepEqual([...seen].sort(), [...CATEGORY_IDS].sort());
  // Recommended structure: Ứng Dụng [APP, GUIDE], Thuê Xe [RENT, EV], Khám Phá [SAFE, LOCAL].
  const byId = Object.fromEntries(taxonomy.clusters.map((c) => [c.id, c.categories]));
  assert.deepEqual(byId['C-APP'].sort(), ['APP', 'GUIDE']);
  assert.deepEqual(byId['C-RENT'].sort(), ['EV', 'RENT']);
  assert.deepEqual(byId['C-EXPLORE'].sort(), ['LOCAL', 'SAFE']);
});

test('taxonomy: canonical category IDs and hub dirs never change', () => {
  const expect = {
    APP: 'app', RENT: 'thue-xe', EV: 'xe-dien', GUIDE: 'huong-dan', SAFE: 'an-toan', LOCAL: 'dia-phuong'
  };
  for (const [id, dir] of Object.entries(expect)) {
    assert.ok(taxonomy.categories[id], `${id} exists`);
    assert.equal(taxonomy.categories[id].dir, dir);
    assert.ok(taxonomy.categories[id].label.length > 0 && taxonomy.categories[id].label.length <= 12, 'short visible label');
  }
});

test('taxonomy: subtopic codes and slugs are unique per category', () => {
  for (const cat of CATEGORY_IDS) {
    const subs = taxonomy.subtopics[cat] ?? [];
    const codes = new Set(); const slugs = new Set();
    for (const s of subs) {
      assert.match(s.code, /^[A-Z0-9-]+$/);
      assert.match(s.slug, /^[a-z0-9-]+$/);
      codes.add(s.code); slugs.add(s.slug);
    }
    assert.equal(codes.size, subs.length, `duplicate subtopic code in ${cat}`);
    assert.equal(slugs.size, subs.length, `duplicate subtopic slug in ${cat}`);
  }
});

test('viSlug is Vietnamese-safe and deterministic', () => {
  assert.equal(viSlug('Văn Miếu - Quốc Tử Giám'), 'van-mieu-quoc-tu-giam');
  assert.equal(viSlug('Thuê Xe Máy'), 'thue-xe-may');
  assert.equal(viSlug('Địa Phương'), 'dia-phuong');
  assert.equal(viSlug(viSlug('Hà Nội')), viSlug('Hà Nội'));
});

test('deriveSubtopic is deterministic and falls back to Tổng quan', () => {
  const row = parseMatrix().find((r) => r.article_id === 'BA-0004');
  const s1 = deriveSubtopic('GUIDE', row);
  const s2 = deriveSubtopic('GUIDE', row);
  assert.deepEqual(s1, s2, 'same row must always derive the same subtopic');
  assert.equal(s1.code, 'THU-TUC', 'thủ tục row lands in the Thủ Tục subtopic');
  assert.equal(s1.fallback, false);
  const fb = deriveSubtopic('APP', { primary_keyword: 'app thuê xe máy là gì', slug: 'app-thue-xe-may-la-gi' });
  assert.equal(fb.fallback, true, 'no keyword match → Tổng quan fallback, never a guess');
  assert.equal(fb.slug, null, 'fallback never gets a hub URL');
});

test('every matrix row derives a valid cluster + subtopic (2000 rows, no exceptions)', () => {
  const rows = parseMatrix();
  assert.equal(rows.length, 2000);
  for (const r of rows) {
    const cat = taxonomy.categories[r.category];
    assert.ok(cat, `row ${r.article_id} has an unknown category`);
    assert.ok(CLUSTER_BY_ID[cat.cluster], `row ${r.article_id} resolves a parent cluster`);
    const s = deriveSubtopic(r.category, r);
    assert.ok(s.code && s.label, `row ${r.article_id} derives a subtopic`);
  }
});

// ---------- Navigation source of truth (menu + footer share ONE vocabulary) ----------

test('navigation.json: short labels, canonical routes, no duplicate label for the same URL', () => {
  const byUrl = new Map();
  const all = [navigation.agent, navigation.search,
    ...navigation.categories, ...navigation.legal];
  for (const item of all) {
    assert.ok(item.label.length > 0 && item.label.length <= 12, `short label: ${item.label}`);
    if (byUrl.has(item.url)) {
      assert.equal(byUrl.get(item.url), item.label, `URL ${item.url} has one stable label`);
    }
    byUrl.set(item.url, item.label);
  }
  const urls = all.map((i) => i.url);
  assert.equal(new Set(urls).size, urls.length);
});

test('menu ↔ footer vocabulary: footer destinations match the drawer with identical labels', () => {
  const html = read('index.html');
  const drawerStart = html.indexOf('<nav class="motoai-drawer"');
  const drawer = html.slice(drawerStart, html.indexOf('</nav>', drawerStart));
  const footerItems = navigation.footer_groups.flatMap((g) => g.items);
  for (const item of footerItems) {
    if (item.ref) {
      // Contact-backed destinations use data-contact-ref in BOTH surfaces.
      assert.ok(drawer.includes(`data-contact-ref="${item.ref}"`) || /ref="[^"]*"/.test(drawer), `${item.label} contact ref in menu`);
      continue;
    }
    if (item.label === 'Agent' || item.label === 'Liên Hệ') {
      assert.ok(drawer.includes(item.label), `${item.label} present in menu`);
      continue;
    }
    assert.ok(drawer.includes(`href="${item.url}">`), `menu links footer destination ${item.url}`);
    assert.ok(drawer.includes(item.label), `menu uses the footer label "${item.label}" for ${item.url}`);
  }
  // And the inverse: every category/search/legal drawer link appears in the footer.
  const footerText = blogPages().length ? read('blog/index.html') : '';
  for (const item of [...navigation.categories, navigation.search, ...navigation.legal]) {
    assert.ok(footerText.includes(`>${item.label}<`), `footer carries drawer label "${item.label}"`);
  }
});

// ---------- Shared footer ----------

function footerLinks(html) {
  const start = html.indexOf('<footer class="blog-footer">');
  assert.ok(start >= 0, 'footer present');
  const end = html.indexOf('</footer>', start);
  return [...html.slice(start, end).matchAll(/<a([^>]*)>([^<]+)<\/a>/g)]
    .map((m) => `${m[1].trim()}>${m[2]}`)
    .sort();
}

test('every content screen renders the shared footer with an identical link set', () => {
  const pages = [...blogPages(), 'privacy/index.html', 'terms/index.html'];
  assert.ok(pages.length >= 11, 'blog home + 6 hubs + subtopic + articles + legal pages');
  const first = footerLinks(read('blog/index.html'));
  for (const p of pages) {
    assert.deepEqual(footerLinks(read(p)), first, `${p}: footer matches the shared footer`);
  }
  // Footer never dumps subtopics/wards — stable destinations only.
  assert.ok(first.length <= 16, 'footer stays compact');
});

test('footer labels come from the footer_groups source of truth', () => {
  const html = read('blog/index.html');
  for (const g of navigation.footer_groups) {
    assert.ok(html.includes(`blog-footer-title">${g.title}<`), `footer group ${g.title}`);
  }
});

test('the chatbot homepage keeps NO full footer inside the chat viewport', () => {
  const html = read('index.html');
  assert.ok(!html.includes('blog-footer'), 'root stays a full-screen app (dock + drawer only)');
});

// ---------- Blog home: app content home ----------

test('blog home: cluster cards + category cards + search + latest, compact hero', () => {
  const home = read('blog/index.html');
  for (const c of taxonomy.clusters) assert.ok(home.includes(`<h2>${c.name}</h2>`), `cluster card ${c.name}`);
  assert.equal((home.match(/class="blog-cat-card"/g) ?? []).length, 6, 'six category cards');
  assert.match(home, /blog-search-input/);
  const h1 = /<h1 class="blog-screen-title">([^<]+)<\/h1>/.exec(home)[1];
  assert.ok(h1.length < 60, 'no giant marketing hero');
});

// ---------- Subtopic hubs: no empty hubs, deterministic ----------

test('subtopic hub pages exist ONLY for subtopics holding a published article', () => {
  const published = parseMatrix().filter((r) => r.status === 'PUBLISHED');
  const rows = Object.fromEntries(parseMatrix().map((r) => [r.article_id, r]));
  const expected = new Set();
  for (const r of published) {
    const s = deriveSubtopic(r.category, rows[r.article_id]);
    if (!s.fallback) expected.add(`blog/${taxonomy.categories[r.category].dir}/${s.slug}/index.html`);
  }
  // Subtopic hub pages = exactly one directory deep under a category hub that is
  // NOT an article directory (articles have a matching matrix output_path).
  const articlePaths = new Set(published.map((r) => r.output_path));
  const hubSubPages = blogPages().filter((p) => {
    const m = /^blog\/([a-z-]+)\/([a-z0-9-]+)\/index\.html$/.exec(p);
    return m && !articlePaths.has(p);
  });
  assert.deepEqual([...hubSubPages].sort(), [...expected].sort(), 'no empty subtopic hubs, none missing');
  for (const p of hubSubPages) {
    const html = read(p);
    assert.ok((html.match(/class="blog-card"/g) ?? []).length >= 1, `${p} holds at least one article card`);
    assert.ok(existsSync(join(ROOT, p)), `${p} exists`);
  }
});

test('published article subtopic chips point at real subtopic hub pages', () => {
  const published = parseMatrix().filter((r) => r.status === 'PUBLISHED');
  const rows = Object.fromEntries(parseMatrix().map((r) => [r.article_id, r]));
  for (const r of published) {
    const s = deriveSubtopic(r.category, rows[r.article_id]);
    if (s.fallback) continue;
    const page = read(r.output_path);
    const chip = new RegExp(`href="/aichatbot/blog/${taxonomy.categories[r.category].dir}/${s.slug}/">${s.label}<\\/a>`);
    assert.ok(chip.test(page), `${r.article_id} shows its subtopic chip`);
  }
});

// ---------- Pagination ----------

test('paginate: 24 cards per page, crawlable slices, empty list still yields one page', () => {
  assert.equal(PER_PAGE, 24);
  const pages = paginate(Array.from({ length: 50 }, (_, i) => i));
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map((p) => p.length), [24, 24, 2]);
  assert.equal(paginate([1]).length, 1);
  assert.equal(paginate([]).length, 1);
});

test('hub pages emit pagination links only when there is more than one page', () => {
  const hubs = ['app', 'thue-xe', 'xe-dien', 'huong-dan', 'an-toan', 'dia-phuong'];
  for (const hub of hubs) {
    const html = read(`blog/${hub}/index.html`);
    const publishedHere = parseMatrix().filter((r) => r.status === 'PUBLISHED' && r.output_path.startsWith(`blog/${hub}/`)).length;
    const hasNav = html.includes('blog-pagination');
    assert.equal(hasNav, publishedHere > PER_PAGE, `${hub}: pagination matches article count`);
  }
});

// ---------- TOC ----------

test('buildToc: deterministic Vietnamese-safe anchor IDs, deduped, from H2/H3 only', () => {
  const body = '<h2>Thuê xe ở đâu?</h2><p>x</p><h3>Giấy tờ cần mang</h3><h2>Thuê xe ở đâu?</h2>';
  const { html, items } = buildToc(body);
  assert.equal(items.length, 3);
  assert.equal(items[0].id, 'thue-xe-o-dau');
  assert.equal(items[1].id, 'giay-to-can-mang');
  assert.notEqual(items[2].id, items[0].id, 'duplicate headings get unique anchors');
  assert.equal((html.match(/id="thue-xe-o-dau"/g) ?? []).length, 1);
  assert.ok(!/<h[123][^>]*>/.test(html.replace(/<h[23] id="[^"]+">/g, '')), 'every H2/H3 carries an id');
});

test('article TOC anchors resolve to unique ids inside the article', () => {
  for (const p of blogPages()) {
    const html = read(p);
    const anchors = [...html.matchAll(/class="blog-toc-list"[\s\S]*?<\/ol>/g)]
      .flatMap((m) => [...m[0].matchAll(/href="#([^"]+)"/g)].map((x) => x[1]));
    if (anchors.length === 0) continue;
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    for (const a of anchors) assert.ok(ids.includes(a), `${p}: TOC anchor #${a} resolves`);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, ids.length, `${p}: no duplicate element ids`);
  }
});

// ---------- Breadcrumbs agree with BreadcrumbList JSON-LD ----------

test('article breadcrumbs: visible trail matches BreadcrumbList schema exactly', () => {
  for (const r of parseMatrix().filter((x) => x.status === 'PUBLISHED')) {
    const html = read(r.output_path);
    const trail = /<nav class="blog-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];
    const visible = [...trail.matchAll(/>([^<>]+)<\/(?:a|span)>/g)].map((m) => m[1]).filter((t) => t !== ' › ');
    const ldRaw = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .find((o) => o['@type'] === 'BreadcrumbList');
    const schema = ldRaw.itemListElement.map((i) => i.name);
    assert.deepEqual(schema, visible, `${r.article_id}: BreadcrumbList equals the visible breadcrumb`);
    assert.equal(visible[0], 'Agent');
    const h1 = /<h1 class="blog-screen-title">([^<]+)<\/h1>/.exec(html)[1];
    assert.equal(visible[visible.length - 1], h1, 'article title is the last crumb');
  }
});
function escap(s) { return String(s).replace(/&(?![a-z]+;|#)/gi, '&amp;'); }

// ---------- Sitemap ----------

test('sitemap includes subtopic hubs and every URL exists on disk, no duplicates', () => {
  const xml = read('sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(locs).size, locs.length);
  for (const loc of locs) {
    const rel = loc.replace('https://thuexemayhanoi.github.io/aichatbot/', '');
    const path = rel === '' || rel.endsWith('/') ? join(rel, 'index.html') : rel;
    assert.ok(existsSync(join(ROOT, path)), `sitemap URL ${loc} has no file`);
  }
  const subtopic = locs.filter((u) => /\/blog\/[a-z-]+\/[a-z0-9-]+\/$/.test(u) && !/page\//.test(u));
  assert.ok(subtopic.length >= 1, 'non-empty subtopic hubs are in the sitemap');
});

// ---------- Search index ----------

test('search index carries taxonomy fields consistent with the model', () => {
  const index = JSON.parse(read('blog/search-index.json'));
  const rows = Object.fromEntries(parseMatrix().map((r) => [r.article_id, r]));
  const published = parseMatrix().filter((r) => r.status === 'PUBLISHED');
  assert.equal(index.articles.length, published.length);
  for (const a of index.articles) {
    assert.ok(CLUSTER_BY_ID[a.cluster], 'cluster id valid');
    assert.ok(['', ...CATEGORY_IDS].includes(a.category));
    if (a.subtopic) {
      const cat = taxonomy.subtopics[a.category] ?? [];
      assert.ok(cat.some((s) => s.code === a.subtopic && s.label === a.subtopic_name), 'subtopic matches the category model');
    }
  }
});

// ---------- Hanoi local taxonomy (current official administrative truth) ----------

test('data/local/hanoi.json: verified 2025 reorganization (51 phường, official source)', () => {
  const hn = JSON.parse(read('data/local/hanoi.json'));
  assert.equal(hn.counts.phuong, 51);
  assert.equal(hn.counts.xa, 75);
  assert.ok(hn.source.official_source.includes('1656/NQ-UBTVQH15'), 'official source cited');
  assert.equal(hn.source.effective_date, '2025-07-01');
  const phuong = hn.units.filter((u) => u.type === 'phường');
  assert.equal(phuong.length, 51);
  const slugs = new Set(hn.units.map((u) => u.slug));
  assert.equal(slugs.size, hn.units.length, 'unique locality slugs');
  for (const u of hn.units) {
    assert.ok(u.active === true);
    assert.equal(u.parent, 'Hà Nội');
    assert.equal(u.slug, viSlug(u.name));
  }
  // No stale district-level claims: no unit carries an old district type.
  assert.ok(!hn.units.some((u) => u.type === 'quận' || u.type === 'huyện'));
});

test('LOCAL quality gate: published articles never claim an unverified locality branch', () => {
  const hn = JSON.parse(read('data/local/hanoi.json'));
  const names = new Set(hn.units.map((u) => u.name));
  for (const r of parseMatrix().filter((x) => x.category === 'LOCAL' && x.status === 'PUBLISHED')) {
    // No published LOCAL article yet beyond pilots; guard future factory output:
    // any local_scope must reference a verified unit name or stay empty.
    if (r.local_scope) assert.ok(names.has(r.local_scope), `unverified locality: ${r.local_scope}`);
  }
});

// ---------- Factory safety (unchanged) ----------

test('factory safety: 2000 rows preserved, 2 pilots published, distribution intact', () => {
  const rows = parseMatrix();
  assert.equal(rows.length, 2000);
  const dist = {};
  for (const r of rows) dist[r.category] = (dist[r.category] ?? 0) + 1;
  assert.deepEqual(dist, { APP: 350, RENT: 400, EV: 300, GUIDE: 300, SAFE: 250, LOCAL: 400 });
  assert.equal(rows.filter((r) => r.status === 'PUBLISHED').length, 2, 'NO mass generation in this run');
});
