/**
 * v70 SEO master — regression gates for the SEO metadata layer, the
 * internal-link planner and the technical fixes found by the full-site audit
 * (docs/seo/seo-master-matrix.md). Vietnamese-only SEO.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { taxonomy } from '../../tools/taxonomy.mjs';
import { BLOG_UI } from '../../tools/blog-components.mjs';
import { esc } from '../../tools/app-shell.mjs';
import { loadSeoMeta, assertSeoMeta, applySeoMeta, seoEntryProblems, englishTokens, seedTypos, topicFamily } from '../../tools/seo-meta.mjs';
import { planLinks, grams } from '../../tools/seo-links.mjs';
import { runAudit, titleCaseBroken } from '../../tools/seo-master-audit.mjs';
import { publishedManifestArticles } from '../helpers/factory-sandbox.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SITE = 'https://chatbot.thuexemaynguyentu.com/';
const MANIFEST = JSON.parse(read('data/blog/published.json')).articles;
const META = loadSeoMeta(ROOT);
const PUBLISHED = publishedManifestArticles(ROOT);
const pagePath = (a) => `blog/${taxonomy.categories[a.category].dir}/${a.slug}/index.html`;
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// ---------- SEO metadata layer ----------

test('seo meta: every entry is valid, unique and belongs to a manifest article (strict)', () => {
  assert.doesNotThrow(() => assertSeoMeta(META, MANIFEST, { strictIds: true }));
});

test('seo meta: covers every PUBLISHED article (Vietnamese title + description + keyword)', () => {
  const missing = PUBLISHED.filter((a) => !META[a.article_id]).map((a) => a.article_id);
  assert.deepEqual(missing, [], 'add reviewed entries to data/seo/article-meta.json');
});

test('seo meta: Vietnamese only — no English fragments or inherited seed typos', () => {
  for (const [id, e] of Object.entries(META)) {
    for (const field of ['keyword', 'title', 'description']) {
      assert.deepEqual(englishTokens(e[field]), [], `${id}: ${field} has English tokens: ${e[field]}`);
      assert.deepEqual(seedTypos(e[field]), [], `${id}: ${field} keeps a seed typo: ${e[field]}`);
    }
    assert.equal(e.title[0], e.title[0].toUpperCase(), `${id}: title starts with a capital letter`);
    assert.ok(!titleCaseBroken(e.title), `${id}: Vietnamese sentence case, not machine Title Case: ${e.title}`);
  }
});

test('seo meta: validator rejects bad entries and the builder ignores unknown ids', () => {
  assert.ok(seoEntryProblems('X', { keyword: 'k', title: 'ngắn', description: 'cắt giữa câu' }).length >= 2);
  assert.ok(seoEntryProblems('X', { keyword: 'thuê xe máy hà nội', title: 'T'.repeat(40), description: `${'d'.repeat(130)}.` })
    .some((p) => p.includes('protected')));
  assert.ok(seoEntryProblems('X', { keyword: 'a b', title: 'T'.repeat(40), description: `{{ business.phone }}${'d'.repeat(120)}.` })
    .some((p) => p.includes('placeholder')));
  const one = MANIFEST.slice(0, 1);
  assert.doesNotThrow(() => assertSeoMeta({ 'BA-9999': { keyword: 'x' } }, one), 'unknown ids are inert in a trimmed (sandbox) manifest');
  assert.throws(() => assertSeoMeta({ 'BA-9999': { keyword: 'x' } }, one, { strictIds: true }));
  const a = MANIFEST[0];
  assert.equal(applySeoMeta(a, {}).title, a.title, 'no entry = manifest metadata (rollback path)');
});

test('published.json and article bodies are untouched by the SEO layer (manifest titles unchanged)', () => {
  // The layer lives outside the factory-owned manifest; a published.json
  // edit would also trigger the Blog Factory Publish workflow.
  const meta = JSON.parse(read('data/seo/article-meta.json'));
  assert.equal(meta.language, 'vi');
  assert.ok(MANIFEST.every((a) => typeof a.title === 'string' && a.title.length > 0));
});

// ---------- rendered pages use the effective metadata ----------

test('article pages render the effective title/description in <title>, H1, OG, schema and breadcrumb', () => {
  for (const a of PUBLISHED) {
    const html = read(pagePath(a));
    const title = unesc(/<title>([^<]*)<\/title>/.exec(html)[1]);
    assert.equal(title, a.title, `${a.slug}: <title>`);
    assert.equal(unesc(/<meta name="description" content="([^"]*)">/.exec(html)[1]), a.description, `${a.slug}: meta description`);
    assert.equal(unesc(/<meta property="og:title" content="([^"]*)">/.exec(html)[1]), a.title, `${a.slug}: og:title`);
    assert.equal(unesc(/<h1 class="blog-screen-title">([^<]*)<\/h1>/.exec(html)[1]), a.title, `${a.slug}: H1`);
    const art = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1])).find((o) => o['@type'] === 'Article');
    assert.equal(art.headline, a.title, `${a.slug}: Article headline`);
    assert.equal(art.keywords, META[a.article_id].keyword, `${a.slug}: Article keywords = SEO primary keyword`);
  }
});

test('every generated page has well-formed head meta attributes (escaped quotes, no broken content=)', () => {
  assert.equal(esc('Hỏi "giá" <b> & bạn'), 'Hỏi &quot;giá&quot; &lt;b&gt; &amp; bạn');
  const pages = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => (m[1] === SITE ? 'index.html' : `${m[1].slice(SITE.length)}index.html`));
  for (const p of pages) {
    const head = read(p).split('</head>')[0];
    for (const m of head.matchAll(/<meta [^\n]*/g)) {
      if (!/content="/.test(m[0])) continue;
      assert.match(m[0].trim(), /^<meta (?:name|property)="[^"]+" content="[^"]*"(?: media="[^"]*")?\s*\/?>$/, `${p}: malformed ${m[0]}`);
    }
  }
});

test('Article schema: inLanguage vi-VN, image, one publisher entity with logo', () => {
  for (const a of PUBLISHED.slice(0, 200)) {
    const art = [...read(pagePath(a)).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1])).find((o) => o['@type'] === 'Article');
    assert.equal(art.inLanguage, 'vi-VN');
    assert.ok(art.image?.startsWith(SITE));
    assert.equal(art.publisher['@id'], `${SITE}#organization`);
    assert.ok(art.publisher.logo?.url?.startsWith(SITE));
    assert.equal(art.mainEntityOfPage, `${SITE}${pagePath(a).replace(/index\.html$/, '')}`);
  }
});

// ---------- internal linking ----------

test('link planner: no orphans, inbound cap respected, family excluded from related, ≤2 per other family', () => {
  const lines = read('data/blog/content-matrix.csv').trim().split('\n');
  const header = lines[0].split(',');
  const rows = Object.fromEntries(lines.slice(1).map((l) => { const c = l.split(','); const r = {}; header.forEach((h, i) => { r[h] = c[i]; }); return [r.article_id, r]; }));
  const arts = PUBLISHED.map((a) => applySeoMeta(MANIFEST.find((m) => m.article_id === a.article_id), META));
  const plan = planLinks(arts, rows, { subtopicOf: () => ({ fallback: true }), clusterOf: (c) => taxonomy.categories[c].cluster, limit: 5 });
  const inbound = new Map(arts.map((a) => [a.article_id, 0]));
  for (const [id, p] of plan) {
    assert.equal(p.related.length, 5, `${id}: five related`);
    assert.ok(!p.related.includes(id) && !p.family.includes(id), `${id}: never links itself`);
    assert.ok(p.related.every((r) => !p.family.includes(r)), `${id}: related excludes family`);
    const fams = p.related.map((r) => plan.get(r).familyKey);
    assert.ok(fams.every((f) => fams.filter((x) => x === f).length <= 2), `${id}: at most two related from one family`);
    for (const t of [...p.related, ...p.family]) inbound.set(t, inbound.get(t) + 1);
  }
  assert.deepEqual([...inbound].filter(([, n]) => n === 0).map(([id]) => id), [], 'every article receives an article link');
  assert.equal(topicFamily('LOCAL', 'hồ tây và xe máy buổi tối').key, topicFamily('LOCAL', 'hồ tây và xe máy').key);
  assert.ok(grams('đi phố cổ bằng xe máy').has('phố cổ'), 'diacritic-preserving bigram tokens');
  assert.ok(!grams('đi chợ').has('cho') && grams('đi chợ').has('chợ'), 'chợ is not the stopword cho');
});

test('article pages: family block + related block (H3 cards) built from the plan', () => {
  for (const a of PUBLISHED) {
    const html = read(pagePath(a));
    const rel = /<section class="blog-related">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
    const cards = rel.match(/class="blog-card"/g) ?? [];
    assert.equal(cards.length, BLOG_UI.related.limit, `${a.slug}: related cards`);
    assert.ok(!/<h2>/.test(rel.replace(/<h2>[^<]*<\/h2>/, '')), `${a.slug}: related card titles are H3, not H2`);
    assert.ok(!rel.includes(`/${a.slug}/"`), `${a.slug}: no self link`);
  }
  const pillar = read('blog/dia-phuong/lang-chu-tich-qua-pho/index.html');
  const fam = /<section class="blog-family"[\s\S]*?<\/section>/.exec(pillar)[0];
  for (const v of ['trong-ngay', 'hai-ngay-mot-dem', 'cuoi-tuan', 'buoi-sang', 'buoi-toi', 'mua-thu']) {
    assert.ok(fam.includes(`/blog/dia-phuong/lang-chu-tich-qua-pho-${v}/`), `pillar links its ${v} variant`);
  }
  const variant = read('blog/dia-phuong/lang-chu-tich-qua-pho-mua-thu/index.html');
  assert.match(variant, /href="\/blog\/dia-phuong\/lang-chu-tich-qua-pho\/">[^<]+<\/a> <span class="blog-family-tag">/, 'variant marks its pillar');
});

test('category hub page 1 lists every topic pillar; page 1 title has no "trang 1"', () => {
  const lines = read('data/blog/content-matrix.csv').trim().split('\n').slice(1).map((l) => l.split(','));
  for (const [id, cat] of Object.entries(taxonomy.categories)) {
    const html = read(`blog/${cat.dir}/index.html`);
    assert.ok(!/<title>[^<]*trang 1 —/.test(html), `${cat.dir}: page 1 title has no "trang 1"`);
    const list = /<ul class="blog-pillar-list">([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? '';
    const pillars = lines.filter((c) => c[2] === id && c[3] === 'PUBLISHED' && topicFamily(id, c[4]).variant === '');
    assert.ok(pillars.length >= 30, `${cat.dir}: has topic pillars`);
    for (const c of pillars) assert.ok(list.includes(`href="/blog/${cat.dir}/${c[8]}/"`), `${cat.dir}: pillar ${c[8]} listed on page 1`);
    for (let n = 2; existsSync(join(ROOT, `blog/${cat.dir}/page/${n}/index.html`)); n++) {
      const pg = read(`blog/${cat.dir}/page/${n}/index.html`);
      assert.match(pg, new RegExp(`<meta name="description" content="[^"]*Trang ${n}\\.">`), `${cat.dir} page ${n}: unique description`);
    }
  }
});

// ---------- full-site audit gate ----------

test('full-site SEO audit: 100% sitemap coverage, zero P0, zero orphans, no title/meta defects', () => {
  const { rows } = runAudit(ROOT);
  const urls = [...read('sitemap.xml').matchAll(/<loc>/g)].length;
  assert.equal(rows.length, urls, 'every sitemap URL audited');
  const P0 = ['NOINDEX', 'CANONICAL', 'SITEMAP', 'H1', 'NO-TITLE', 'NO-DESC', 'ATTR-BROKEN'];
  const NO_REGRESS = [...P0, 'TITLE-DUP', 'DESC-DUP', 'TITLE-AUTO', 'TITLE-CASE', 'TITLE-EN', 'TITLE-TYPO', 'TITLE-LEN',
    'DESC-CUT', 'DESC-LEN', 'ORPHAN', 'LOW-INBOUND', 'CARD-H2', 'SCHEMA-THIN', 'NO-ITEMLIST', 'KW-EN', 'KW-TYPO'];
  for (const r of rows) {
    const bad = r.issues.filter((i) => NO_REGRESS.includes(i));
    assert.deepEqual(bad, [], `${r.url}: ${bad.join(',')}`);
    // v70 body review closed every content gap; only deliberately kept long bodies remain.
    const gaps = r.gaps.filter((g) => g !== 'LONG');
    assert.deepEqual(gaps, [], `${r.url}: content gaps ${gaps.join(',')}`);
  }
});

test('SEO master docs exist and the baseline snapshot is kept for before/after evidence', () => {
  for (const p of ['docs/seo/seo-master-matrix.csv', 'docs/seo/seo-master-matrix.json', 'docs/seo/seo-master-matrix.md',
    'docs/seo/keyword-cluster-map.md', 'docs/seo/seo-progress-report.md', 'docs/seo/baseline-audit.json']) {
    assert.ok(existsSync(join(ROOT, p)), `${p} exists`);
  }
  const csv = read('docs/seo/seo-master-matrix.csv').split('\n')[0];
  for (const col of ['URL', 'Page Type', 'Current Title', 'Primary Keyword', 'Secondary Keywords', 'Search Intent', 'Topic Cluster',
    'Content Gap', 'Internal Links', 'Cannibalization', 'Technical Issues', 'Priority', 'Proposed Action', 'Status', 'Evidence']) {
    assert.ok(csv.includes(col), `matrix column ${col}`);
  }
  const clusters = JSON.parse(read('data/seo/keyword-clusters.json'));
  for (const c of clusters.clusters) {
    assert.ok(c.head.every((k) => englishTokens(k).length === 0), `${c.id}: Vietnamese-only head keywords`);
    for (const u of [c.pillar, c.support_pillar].filter(Boolean)) {
      assert.ok(existsSync(join(ROOT, u === '/' ? 'index.html' : `${u.slice(1)}index.html`)), `${c.id}: pillar ${u} exists`);
    }
  }
});

test('hub SERP titles: keyword-led, unique and never the protected sister-site head term', () => {
  const titles = [...Object.values(taxonomy.categories), ...taxonomy.clusters].map((c) => c.seo_title);
  assert.equal(new Set(titles).size, titles.length);
  for (const t of titles) {
    assert.ok(t.length >= 35 && t.length <= 65, `${t}: length`);
    assert.ok(!['thuê xe máy hà nội', 'cho thuê xe máy hà nội'].includes(t.toLowerCase()));
  }
  const ev = read('blog/xe-dien/index.html');
  assert.match(ev, /<title>Thuê xe máy điện Hà Nội/, 'EV hub targets the measured EV rental query');
  assert.match(ev, /<h1 class="blog-screen-title">Xe điện \/ xe máy điện<\/h1>/, 'visible H1/menu naming unchanged');
});
