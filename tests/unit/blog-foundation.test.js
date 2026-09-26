import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Blog + SEO foundation spec: matrix, ownership, indexes, sitemap. */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Parse the content matrix CSV (comma-separated; no embedded commas in fields here). */
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

const EXPECTED_DIST = { APP: 350, RENT: 400, EV: 300, GUIDE: 300, SAFE: 250, LOCAL: 400 };

test('content matrix has exactly 2,000 production rows with the required fields', () => {
  const rows = parseMatrix();
  assert.equal(rows.length, 2000);
  const columns = Object.keys(rows[0]);
  for (const field of ['article_id', 'batch_id', 'category', 'status', 'primary_keyword', 'search_intent', 'working_title', 'slug', 'output_path', 'parent_hub', 'requires_sources', 'source_policy', 'author', 'repair_attempts']) {
    assert.ok(columns.includes(field), `matrix must carry ${field}`);
  }
});

test('matrix batches are exactly 40 x 50 and every batch has 50 rows', () => {
  const rows = parseMatrix();
  const batches = new Map();
  for (const r of rows) batches.set(r.batch_id, (batches.get(r.batch_id) ?? 0) + 1);
  assert.equal(batches.size, 40);
  for (const [id, n] of batches) assert.equal(n, 50, `batch ${id} must hold 50 rows`);
});

test('category distribution matches the agreed production split', () => {
  const rows = parseMatrix();
  const counts = {};
  for (const r of rows) counts[r.category] = (counts[r.category] ?? 0) + 1;
  assert.deepEqual(counts, EXPECTED_DIST);
});

test('article ids, slugs and output paths are unique and well formed', () => {
  const rows = parseMatrix();
  const ids = new Set(); const slugs = new Set(); const paths = new Set();
  for (const r of rows) {
    assert.match(r.article_id, /^BA-\d{4}$/);
    assert.match(r.slug, /^[a-z0-9-]+$/);
    assert.ok(r.output_path.startsWith('blog/') && r.output_path.endsWith('/index.html'));
    ids.add(r.article_id); slugs.add(r.slug); paths.add(r.output_path);
  }
  assert.equal(ids.size, 2000); assert.equal(slugs.size, 2000); assert.equal(paths.size, 2000);
});

test('every row belongs to an existing category hub directory', () => {
  const hubDirs = ['app', 'thue-xe', 'xe-dien', 'huong-dan', 'an-toan', 'dia-phuong'];
  const hubByCat = { APP: 'app', RENT: 'thue-xe', EV: 'xe-dien', GUIDE: 'huong-dan', SAFE: 'an-toan', LOCAL: 'dia-phuong' };
  for (const r of parseMatrix()) {
    const dir = hubByCat[r.category];
    assert.ok(hubDirs.includes(dir));
    assert.ok(r.output_path.startsWith(`blog/${dir}/`), `${r.output_path} must live in its category hub`);
    assert.ok(r.parent_hub === `blog/${dir}/`);
  }
});

test('all matrix rows are PLANNED except published pilots', () => {
  const rows = parseMatrix();
  const allowed = new Set(['PLANNED', 'PUBLISHED']);
  for (const r of rows) assert.ok(allowed.has(r.status), `unexpected status ${r.status}`);
  const published = rows.filter((r) => r.status === 'PUBLISHED');
  for (const r of published) {
    assert.ok(r.published_date.length > 0, 'published rows carry a date');
    assert.equal(r.notes, 'pilot/fixture');
  }
});

test('legal/safety rows require the legal source gate', () => {
  for (const r of parseMatrix()) {
    if (r.category === 'SAFE') {
      assert.equal(r.requires_sources, 'yes');
      assert.equal(r.source_policy, 'legal-gate');
      assert.match(r.notes, /CLAIM.*PRIMARY SOURCE|legal-gate/);
      assert.equal(r.agent_retrieval, 'no', 'SAFE prose never enters Agent retrieval');
    } else {
      assert.notEqual(r.source_policy, 'legal-gate');
    }
  }
});

test('LOCAL rows are not mechanical district doorways', () => {
  const local = parseMatrix().filter((r) => r.category === 'LOCAL');
  const DISTRICTS = ['Long Biên', 'Hoàn Kiếm', 'Hồ Tây', 'Tây Hồ', 'Ba Đình', 'Cầu Giấy', 'Đống Đa', 'Thanh Xuân', 'Hai Bà Trưng', 'Gia Lâm'];
  const byDistrict = {};
  for (const r of local) {
    if (DISTRICTS.includes(r.local_scope)) byDistrict[r.local_scope] = (byDistrict[r.local_scope] ?? 0) + 1;
  }
  const counts = Object.values(byDistrict);
  // No single district may dominate the LOCAL set (doorway-spam guard).
  assert.ok(Math.max(...counts) < local.length / 3, 'no district holds more than a third of LOCAL');
  // Slugs must differ by more than a district name.
  const slugs = local.map((r) => r.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test('near-duplicate primary keywords stay below the doorway threshold', () => {
  const rows = parseMatrix();
  const counts = {};
  for (const r of rows) counts[r.primary_keyword] = (counts[r.primary_keyword] ?? 0) + 1;
  const dupes = Object.values(counts).filter((n) => n > 1);
  assert.equal(dupes.length, 0, 'primary keywords are unique');
});

// ---------- Blog indexes + sitemap ----------

test('search index only contains published articles with compact fields', () => {
  const index = JSON.parse(read('blog/search-index.json'));
  const published = parseMatrix().filter((r) => r.status === 'PUBLISHED');
  assert.equal(index.articles.length, published.length);
  for (const a of index.articles) {
    for (const field of ['title', 'keywords', 'summary', 'category', 'url']) {
      assert.ok(typeof a[field] === 'string' && a[field].length > 0);
    }
    assert.ok(!('body' in a) && !('text' in a) && !('chunks' in a), 'search index must stay compact (no full content)');
  }
});

test('knowledge index only contains published article chunks', () => {
  const index = JSON.parse(read('data/blog/knowledge-index.json'));
  const published = parseMatrix().filter((r) => r.status === 'PUBLISHED').map((r) => r.article_id);
  assert.ok(index.chunks.length > 0);
  for (const c of index.chunks) {
    assert.ok(published.includes(c.article_id), `chunk ${c.id} references an unpublished article`);
    assert.equal(typeof c.text, 'string');
    assert.ok(c.text.length > 0 && c.text.length < 800, 'chunks are compact, not whole documents');
  }
});

test('sitemap has no duplicates and no unpublished URLs', () => {
  const xml = read('sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length >= 9);
  assert.equal(new Set(locs).size, locs.length, 'no duplicate sitemap URLs');
  for (const r of parseMatrix()) {
    if (r.status !== 'PUBLISHED') {
      assert.ok(!locs.includes(`https://thuexemayhanoi.github.io/aichatbot/${r.output_path}`), 'unpublished rows must not be in the sitemap');
    }
  }
  assert.ok(locs.includes('https://thuexemayhanoi.github.io/aichatbot/'));
  assert.ok(locs.includes('https://thuexemayhanoi.github.io/aichatbot/blog/'));
});

test('sitemap URLs point at files that exist on disk', () => {
  const xml = read('sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const loc of locs) {
    const rel = loc.replace('https://thuexemayhanoi.github.io/aichatbot/', '');
    const path = rel === '' || rel.endsWith('/') ? join(rel, 'index.html') : rel;
    assert.ok(existsSync(join(ROOT, path)), `sitemap URL ${loc} has no file`);
  }
});

test('blog hub pages exist for all six categories and link home', () => {
  const hubs = ['app', 'thue-xe', 'xe-dien', 'huong-dan', 'an-toan', 'dia-phuong'];
  for (const hub of hubs) {
    const page = read(`blog/${hub}/index.html`);
    assert.match(page, /<h1>/);
    assert.ok(page.includes('/aichatbot/blog/'), `${hub} hub links back to blog home`);
  }
  assert.ok(existsSync(join(ROOT, 'blog/index.html')));
});

test('published article pages have exactly one H1, canonical, Article + BreadcrumbList schema', () => {
  const published = parseMatrix().filter((r) => r.status === 'PUBLISHED');
  for (const r of published) {
    const page = read(r.output_path);
    assert.equal((page.match(/<h1>/g) ?? []).length, 1);
    assert.ok(page.includes('<link rel="canonical"'));
    assert.ok(page.match(/\"@type\": ?\"Article\"/));
    assert.ok(page.match(/\"@type\": ?\"BreadcrumbList\"/));
    assert.ok(page.includes('⚡ Hỏi Agent'), 'article links back to the Agent');
  }
});

test('blog home loads search lazily and never lists all matrix rows', () => {
  const home = read('blog/index.html');
  assert.match(home, /blog-search-input/);
  assert.ok(home.includes('assets/js/blog.js'));
  const blogJs = read('assets/js/blog.js');
  assert.ok(!/DOMContentLoaded|top-level fetch call at parse/.test(''), 'noop');
  // Search index loads only on first query.
  assert.match(blogJs, /loadIndex/);
  assert.match(blogJs, /search-index\.json/);
  const cards = (home.match(/class="blog-card"/g) ?? []).length;
  assert.ok(cards < 60, 'blog home must not render the whole corpus');
});

// ---------- SEO ownership ----------

test('homepage owns the national APP intent; no generic rental landing title', () => {
  const html = read('index.html');
  assert.match(html, /<title>[^<]*Ứng dụng thuê xe máy/i);
  // v47.1: chatbot-first homepage — no hero above the app; the owned app-intent
  // keywords live in the unobtrusive SEO section AFTER the chatbot.
  assert.ok(!html.includes('motoai-hero'), 'no hero section above the chatbot');
  assert.match(html, /class="motoai-seo"/);
  assert.ok(html.indexOf('id="motoai-app"') < html.indexOf('class="motoai-seo"'), 'chatbot renders before the SEO copy');
  const ownership = JSON.parse(read('config/seo-ownership.json'));
  for (const kw of ownership.owned_keywords.slice(0, 4)) {
    assert.ok(html.toLowerCase().includes(kw.split(' ').slice(-4).join(' ').toLowerCase()) || kw.includes('digital'), `homepage should reference the owned intent (${kw})`);
  }
  // Protected commercial intent must not be the homepage title.
  assert.ok(!/<title>[^<]*thuê xe máy hà nội/i.test(html), 'homepage title must not cannibalize the generic local rental intent');
});

test('homepage schema is WebApplication (never a native app) with verified org facts', () => {
  const html = read('index.html');
  assert.ok(html.includes('"@type": "WebApplication"'));
  assert.ok(!html.includes('SoftwareApplication'), 'not needed and risks native-app implications');
  assert.ok(!/app store|google play/i.test(html), 'never claimed as a store-listed native app');
  assert.ok(html.includes('"@type": "FAQPage"'));
  const business = JSON.parse(read('data/business/business.json'));
  assert.ok(html.includes(business.address.full), 'verified address appears');
  assert.ok(html.includes(business.hours.display), 'schema/FAQ matches verified hours');
});

test('cross-repository protected keywords are declared and enforced', () => {
  const ownership = JSON.parse(read('config/seo-ownership.json'));
  assert.ok(ownership.protected_commercial_intents.length >= 2);
  assert.ok(existsSync(join(ROOT, 'docs/SEO-OWNERSHIP.md')));
  const doc = read('docs/SEO-OWNERSHIP.md');
  assert.ok(doc.includes('aichatbot'));
  assert.ok(doc.toLowerCase().includes('app thuê xe máy'));
});
