/**
 * Lô M3 (Master SEO 2026, T20/B15): a subtopic hub holding more than PER_PAGE
 * articles is paginated exactly like a category hub — page 1 keeps its URL,
 * page N lives at …/page/N/ with its own canonical, title and description,
 * crawlable numbered links, and every article of the subtopic appears on
 * exactly one page. No subtopic page ships a multi-hundred-KB HTML again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { taxonomy, deriveSubtopic } from '../../tools/taxonomy.mjs';
import { parseMatrix } from '../../tools/blog-factory.mjs';
import { PER_PAGE } from '../../tools/build-blog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://chatbot.thuexemaynguyentu.com/';
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Expected article paths per subtopic hub, from the matrix (same rule as the builder). */
function subtopicArticles() {
  const rows = parseMatrix().filter((r) => r.status === 'PUBLISHED');
  const map = new Map();
  for (const r of rows) {
    const s = deriveSubtopic(r.category, r);
    if (s.fallback) continue;
    const dir = taxonomy.categories[r.category].dir;
    const base = `/blog/${dir}/${s.slug}/`;
    if (!map.has(base)) map.set(base, new Set());
    map.get(base).add(`/blog/${dir}/${r.slug}/`);
  }
  return map;
}

const pageFile = (base, n) => `${base.slice(1)}${n === 1 ? '' : `page/${n}/`}index.html`;
const cardLinks = (html) => {
  const grid = html.slice(html.indexOf('<div class="blog-grid">'), html.indexOf('</main>'));
  return [...grid.matchAll(/<a class="blog-card-link" href="([^"]+)"|<h3 class="blog-card-title"><a href="([^"]+)"/g)].map((m) => m[1] ?? m[2]);
};

test('every subtopic hub is split into PER_PAGE pages and lists each of its articles exactly once', () => {
  const sitemap = read('sitemap.xml');
  let paged = 0;
  for (const [base, articles] of subtopicArticles()) {
    const pages = Math.ceil(articles.size / PER_PAGE);
    const seen = [];
    for (let n = 1; n <= pages; n++) {
      const file = pageFile(base, n);
      assert.ok(existsSync(join(ROOT, file)), `${file} exists`);
      const html = read(file);
      const url = `${SITE}${file.replace(/index\.html$/, '')}`;
      assert.ok(html.includes(`<link rel="canonical" href="${url}"`), `${file}: self canonical`);
      assert.ok(sitemap.includes(`<loc>${url}</loc>`), `${file}: in the sitemap`);
      const items = [...html.matchAll(/"@type":"ListItem","position":\d+,"name":"[^"]*","url":"([^"]+)"/g)].map((m) => m[1].replace(SITE, '/'));
      assert.ok(items.length > 0 && items.length <= PER_PAGE, `${file}: ${items.length} items`);
      seen.push(...items);
      if (n > 1) {
        assert.match(html, new RegExp(`<title>[^<]*trang ${n}</title>`), `${file}: numbered title`);
        assert.match(html, new RegExp(`<meta name="description" content="[^"]*Trang ${n}\\."`), `${file}: numbered description`);
      }
      if (pages > 1) assert.ok(html.includes('class="blog-pagination"'), `${file}: pagination nav`);
      assert.ok(statSync(join(ROOT, file)).size < 100 * 1024, `${file}: under 100 KB`);
    }
    assert.equal(seen.length, articles.size, `${base}: every article listed once`);
    assert.deepEqual(new Set(seen), articles, `${base}: the subtopic's own articles`);
    assert.ok(!existsSync(join(ROOT, pageFile(base, pages + 1))), `${base}: no empty trailing page`);
    if (pages > 1) {
      const first = read(pageFile(base, 1));
      for (let n = 2; n <= pages; n++) assert.ok(first.includes(`<a href="${base}page/${n}/">${n}</a>`), `${base}: page 1 links page ${n}`);
      paged++;
    }
  }
  assert.ok(paged >= 1, 'at least one subtopic hub is large enough to paginate');
});
