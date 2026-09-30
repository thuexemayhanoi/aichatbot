#!/usr/bin/env node
/**
 * MotoAI local SEO score — deterministic, offline, no API keys.
 *
 * Audits the STATIC pages of this repository (index.html, blog home,
 * six category hubs, published article pages, privacy/terms) plus
 * robots.txt / sitemap.xml, and produces a weighted 0–100 score:
 *
 *   TECHNICAL SEO            25
 *   CONTENT / ON-PAGE        25
 *   STRUCTURED DATA          15
 *   INTERNAL LINKING         10
 *   CRAWL / INDEXABILITY     10
 *   UX / PERFORMANCE         10
 *   AI SEARCH / GEO READY     5
 *
 * Every point comes from a concrete named check — no invented scores.
 * Pure core (scoreRepo) takes an injected `io` so the same code runs
 * in tests / sandboxes without node:fs.
 *
 * Usage:  node tools/seo-score.mjs            # prints markdown summary
 *         node tools/seo-score.mjs --json     # prints the JSON payload
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://thuexemayhanoi.github.io/aichatbot/';
export const HUBS = ['app', 'thue-xe', 'xe-dien', 'huong-dan', 'an-toan', 'dia-phuong'];
export const CLUSTER_DIRS = ['cong-cu-huong-dan', 'thue-xe-phuong-tien', 'kham-pha-an-toan'];

export function pageSet(published) {
  const pages = [
    { path: 'index.html', kind: 'home' },
    { path: 'blog/index.html', kind: 'blog-home' },
    ...CLUSTER_DIRS.map((c) => ({ path: `blog/${c}/index.html`, kind: 'hub', hub: c })),
    ...HUBS.map((h) => ({ path: `blog/${h}/index.html`, kind: 'hub', hub: h })),
    ...published.map((a) => ({ path: `blog/${a.dir}/${a.slug}/index.html`, kind: 'article', slug: a.slug, dir: a.dir, title: a.title })),
    { path: 'privacy/index.html', kind: 'legal' },
    { path: 'terms/index.html', kind: 'legal' },
    { path: 'gioi-thieu/index.html', kind: 'legal' },
    { path: 'chinh-sach/index.html', kind: 'legal' },
    { path: 'lien-he/index.html', kind: 'legal' },
    { path: 'gia-thue/index.html', kind: 'legal' }
  ];
  return pages;
}

// ---------- helpers ----------
// v64: exported so tools/article-qa.mjs reuses the SAME extraction logic
// (no duplicated text/meta/word-count code across factory tools).

export const text = (html) => String(html)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const words = (s) => (s ? s.split(/\s+/).filter(Boolean).length : 0);

export function tag(html, name) {
  const m = String(html).match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].trim() : '';
}

export function meta(html, name) {
  const m = String(html).match(new RegExp(`<meta[^>]+(?:name|property)="${name}"[^>]*content="([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

function jsonLdBlocks(html) {
  return [...String(html).matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
}

/** Normalize a repo-relative path (resolve "." and ".." segments). */
function normalizeRepoPath(p) {
  const out = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { out.pop(); continue; }
    out.push(seg);
  }
  return out.join('/');
}

/** Resolve an href against a page path inside the repo (no network). */
export function resolveHref(pagePath, href) {
  if (!href || href.startsWith('#') || /^(https?:|mailto:|tel:|data:|javascript:)/i.test(href)) return null;
  let p = href;
  if (p.startsWith('/aichatbot/')) p = p.slice('/aichatbot/'.length);
  else if (p.startsWith('/')) return null; // outside this Pages site
  else p = normalizeRepoPath(`${dirname(pagePath)}/${p}`);
  p = p.replace(/#.*$/, '');
  p = p.replace(/\?.*$/, '');
  if (p === '' || p.endsWith('/')) p += 'index.html';
  return p;
}

// ---------- check groups (each returns { score: 0..1, issues: [] }) ----------

function checkTechnical(pages, io) {
  const issues = [];
  let pass = 0, total = 0;
  const add = (ok, label, page) => { total++; if (ok) pass++; else issues.push(`${page}: ${label}`); };
  for (const p of pages) {
    const html = io.read(p.path);
    const title = tag(html, 'title');
    const desc = meta(html, 'description');
    const canon = (String(html).match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '';
    const expected = p.kind === 'home' ? SITE : SITE + p.path.replace(/index\.html$/, '');
    add(title.length >= 10 && title.length <= 70, `title length ${title.length} (10–70)`, p.path);
    add(desc.length >= 50 && desc.length <= 165, `meta description length ${desc.length} (50–165)`, p.path);
    add(canon === expected, `canonical "${canon}" != self "${expected}"`, p.path);
    add(/<html lang="vi"/.test(html), 'missing lang="vi"', p.path);
    add((html.match(/<h1\b/g) || []).length === 1, 'must have exactly one H1', p.path);
    add(!/noindex/i.test(html), 'noindex found', p.path);
    add(/name="viewport"/.test(html), 'missing viewport meta', p.path);
    const ogOk = meta(html, 'og:title') && meta(html, 'og:description') && meta(html, 'og:url');
    add(!!ogOk, 'missing og:title/og:description/og:url', p.path);
    add(!!meta(html, 'og:locale'), 'missing og:locale (vi_VN)', p.path);
    const h1i = html.search(/<h1\b/i);
    const h2i = html.search(/<h2\b/i);
    add(!(h2i > -1 && h2i > -1 && h1i > -1 && h2i < h1i), 'H2 appears before H1', p.path);
    const hasH3 = /<h3\b/.test(html);
    add(!(/<h4\b/.test(html) && !hasH3), 'heading levels skip (H4 without H3)', p.path);
    add(!(hasH3 && h2i === -1), 'heading levels skip (H3 without H2)', p.path);
  }
  // broken internal links across all pages
  for (const p of pages) {
    const html = io.read(p.path);
    for (const m of String(html).matchAll(/href="([^"]+)"/g)) {
      const target = resolveHref(p.path, m[1]);
      if (target && !io.exists(target)) issues.push(`${p.path}: broken internal link -> ${m[1]}`);
    }
  }
  total += pages.length; pass += pages.length - issues.filter((i) => i.includes('broken internal link')).length;
  return { score: total ? pass / total : 0, issues };
}

function checkContent(pages, io, ctx) {
  const issues = [];
  let pass = 0, total = 0;
  const add = (ok, label, page) => { total++; if (ok) pass++; else issues.push(`${page || 'site'}: ${label}`); };
  const home = io.read('index.html');
  const owned = ctx.ownership.owned_keywords.map((k) => k.toLowerCase());
  add(owned.filter((k) => home.toLowerCase().includes(k)).length >= 4, 'homepage covers <4 owned keywords');
  for (const p of pages.filter((x) => x.kind === 'article')) {
    const html = io.read(p.path);
    const t = text(html);
    const article = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
    const articleText = text(article);
    add((article.match(/<h2\b/g) || []).length >= 2, 'fewer than 2 H2 subheadings', p.path);
    add(words(articleText) >= 300, `article depth ${words(articleText)} words (<300)`, p.path);
    add(/<ul>|<ol>/.test(article), 'no list/actionable structure', p.path);
    add(!/\{\{|lorem|TBD|coming soon/i.test(html), 'filler/placeholder markers', p.path);
    const paras = articleText.split(/(?<=\.) /);
    const seen = new Set(); let dup = false;
    for (const s of paras) { const k = s.trim().slice(0, 80); if (k.length > 40 && seen.has(k)) { dup = true; } seen.add(k); }
    add(!dup, 'duplicate paragraph detected', p.path);
    add(/Thuê Xe Máy Hà Nội|Nguyễn Tú|MotoAI/i.test(t), 'entity clarity: no business/entity name', p.path);
    const kw = p.title.split(' ').slice(0, 4).join(' ').toLowerCase();
    add((t.toLowerCase().match(kw.replace(/[?!.]/g, '')) || []).length <= 10, 'possible keyword stuffing', p.path);
  }
  for (const p of pages) {
    const html = io.read(p.path);
    const body = text(html);
    add(body.length > 0, 'page has no crawlable text content', p.path);
  }
  return { score: total ? pass / total : 0, issues };
}

function checkStructuredData(pages, io) {
  const issues = [];
  let pass = 0, total = 0;
  const add = (ok, label, page) => { total++; if (ok) pass++; else issues.push(`${page || 'site'}: ${label}`); };
  for (const p of pages) {
    const html = io.read(p.path);
    const blocks = jsonLdBlocks(html);
    const types = blocks.flatMap((b) => (Array.isArray(b) ? b : [b]).map((x) => x['@type']));
    if (p.kind === 'home') {
      add(types.includes('WebApplication'), 'missing WebApplication schema');
      add(types.includes('FAQPage'), 'missing FAQPage schema');
      add(types.some((t) => t === 'Organization') || /"@type":\s*"Organization"/.test(html), 'missing Organization schema');
    }
    if (p.kind === 'article') {
      add(types.includes('Article') || types.includes('BlogPosting'), 'missing Article schema');
      add(types.includes('BreadcrumbList'), 'missing BreadcrumbList schema');
      const art = blocks.find((b) => b['@type'] === 'Article');
      add(!!art && !!art.datePublished && !!art.headline, 'Article schema missing datePublished/headline', p.path);
      add(!!art && !!art.author && !!art.publisher, 'Article schema missing author/publisher', p.path);
    }
    if (p.kind === 'hub') add(types.includes('BreadcrumbList'), 'missing BreadcrumbList schema', p.path);
    add(!/aggregateRating|reviewRating|ratingValue|"review"/i.test(html), 'fake rating/review fields in schema', p.path);
  }
  return { score: total ? pass / total : 0, issues };
}

function checkInternalLinks(pages, io, ctx) {
  const issues = [];
  let pass = 0, total = 0;
  const add = (ok, label, page) => { total++; if (ok) pass++; else issues.push(`${page || 'site'}: ${label}`); };
  const articlePaths = pages.filter((x) => x.kind === 'article').map((x) => x.path);
  for (const p of pages.filter((x) => x.kind === 'article')) {
    const html = io.read(p.path);
    const links = [...String(html).matchAll(/href="([^"]+)"/g)].map((m) => resolveHref(p.path, m[1])).filter(Boolean);
    add(links.some((l) => l === `blog/${p.dir}/index.html`), 'article does not link its parent hub', p.path);
    add(links.includes('blog/index.html'), 'article does not link the blog home', p.path);
    add(links.includes('index.html'), 'article does not link the Agent', p.path);
    const related = articlePaths.filter((l) => l !== p.path);
    add(related.some((r) => links.includes(r)), 'no related-article link', p.path);
  }
  // orphan check: every page must be linked from at least one other page
  const linked = new Set();
  for (const p of pages) {
    const html = io.read(p.path);
    for (const m of String(html).matchAll(/href="([^"]+)"/g)) {
      const t = resolveHref(p.path, m[1]);
      if (t && t !== p.path) linked.add(t);
    }
  }
  for (const p of pages) {
    if (p.kind !== 'home') add(linked.has(p.path), 'orphan page (no inbound internal link)', p.path);
  }
  // exact-anchor overuse: same anchor text > 6 times on one page
  for (const p of pages) {
    const html = io.read(p.path);
    const counts = {};
    for (const m of String(html).matchAll(/<a[^>]*>([^<]{3,40})<\/a>/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
    add(Object.values(counts).every((n) => n <= 6), 'exact-match anchor used >6 times', p.path);
  }
  return { score: total ? pass / total : 0, issues };
}

function checkCrawl(pages, io) {
  const issues = [];
  let pass = 0, total = 0;
  const add = (ok, label, page) => { total++; if (ok) pass++; else issues.push(`${page || 'site'}: ${label}`); };
  const robots = io.exists('robots.txt') ? io.read('robots.txt') : '';
  add(/User-agent:\s*\*/i.test(robots) && /Allow:\s*\//i.test(robots), 'robots.txt missing/does not allow all');
  add(/Sitemap:\s*\S+sitemap\.xml/i.test(robots), 'robots.txt missing Sitemap line');
  const xml = io.read('sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  add(new Set(locs).size === locs.length && locs.length >= pages.length, 'sitemap duplicates or missing URLs');
  for (const p of pages) {
    const url = p.kind === 'home' ? SITE : SITE + p.path.replace(/index\.html$/, '');
    add(locs.includes(url), 'URL not in sitemap.xml', p.path);
  }
  for (const loc of locs) {
    const rel = loc.replace(SITE, '');
    const file = rel === '' || rel.endsWith('/') ? rel + 'index.html' : rel;
    add(io.exists(file), `sitemap URL has no file (${loc})`);
  }
  return { score: total ? pass / total : 0, issues };
}

function checkUxPerformance(pages, io) {
  const issues = [];
  let pass = 0, total = 0;
  const add = (ok, label, page) => { total++; if (ok) pass++; else issues.push(`${page || 'site'}: ${label}`); };
  for (const p of pages) {
    const html = io.read(p.path);
    const headHtml = html.slice(0, html.indexOf('</head>'));
    const sheets = (headHtml.match(/<link rel="stylesheet"/g) || []).length;
    add(sheets <= 2, `${sheets} stylesheets in head (>2)`, p.path);
    add(!/fonts\.googleapis|\.woff2?|@font-face/.test(html), 'external webfont / font-face risk', p.path);
    add(!/<script[^>]+src=[^>]*><\/script>/.test(headHtml), 'render-blocking external script in head', p.path);
    add(/viewport-fit=cover/.test(html), 'missing viewport-fit=cover', p.path);
    add(/motoai-theme/.test(html) || p.kind === 'home' || p.kind === 'legal', 'missing no-flash theme script', p.path);
    if (p.kind === 'hub' || p.kind === 'blog-home') {
      add(/id="blog-business-status"[^>]*hidden/.test(html), 'status chip not hidden by default', p.path);
    }
  }
  const css = io.exists('assets/css/blog.css') ? io.read('assets/css/blog.css') : '';
  add(/\.screen-ask-btn\s*\{[^}]*min-height:\s*4\dpx/.test(css), 'blog.css tap targets <40px');
  add(/:focus-visible/.test(css), 'blog.css missing :focus-visible styles');
  const totalCss = (io.exists('assets/css/blog.css') ? io.size('assets/css/blog.css') : 0) + (io.exists('assets/css/style.css') ? io.size('assets/css/style.css') : 0);
  // v62: hub-section + drawer-hierarchy UI raises the budget to 64KB.
  add(totalCss < 64 * 1024, `total CSS ${totalCss} bytes (>=64KB)`);
  return { score: total ? pass / total : 0, issues };
}

function checkAiGEO(pages, io, ctx) {
  const issues = [];
  let pass = 0, total = 0;
  const add = (ok, label, page) => { total++; if (ok) pass++; else issues.push(`${page || 'site'}: ${label}`); };
  const business = ctx.business;
  const home = io.read('index.html');
  add(home.includes(business.contact.phone_display) || home.includes(business.hours.display), 'homepage missing verified business facts for AI extraction');
  add(/"@type":\s*"FAQPage"/.test(home), 'no Q&A surface on homepage (FAQPage)');
  for (const p of pages.filter((x) => x.kind === 'article')) {
    const html = io.read(p.path);
    const t = text(html);
    add(/Câu hỏi thường gặp|FAQ|hỏi đáp/i.test(t), 'no Q&A section', p.path);
    add(html.includes(business.hours.display) || !/mở cửa|giờ/i.test(t) || t.includes(business.hours.display), 'hours claim not backed by verified data', p.path);
    if (/cọc/i.test(t)) add(t.includes('2.000.000đ') && t.includes('5.000.000đ'), 'deposit claim inconsistent with business.json', p.path);
    add(/MotoAI|Thuê Xe Máy Hà Nội|Nguyễn Tú/i.test(t), 'no clear entity naming', p.path);
  }
  for (const p of pages.filter((x) => x.kind === 'hub' || x.kind === 'blog-home')) {
    const t = text(io.read(p.path));
    add(t.length > 150, 'thin crawlable content for AI overview', p.path);
  }
  return { score: total ? pass / total : 0, issues };
}

// ---------- main ----------

export function scoreRepo(io) {
  const ownership = JSON.parse(io.read('config/seo-ownership.json'));
  const business = JSON.parse(io.read('data/business/business.json'));
  const manifest = JSON.parse(io.read('data/blog/published.json'));
  // v64: only articles whose matrix row is PUBLISHED are audited. Between a
  // writer push and the publish workflow's derived commit, the manifest can
  // hold one in-flight draft (QA/PASS row) whose page is not built yet.
  const matrixStatuses = new Map();
  const csv = io.read('data/blog/content-matrix.csv').trim().split('\n');
  for (const line of csv.slice(1)) {
    const cells = line.split(',');
    matrixStatuses.set(cells[0], cells[3]);
  }
  const published = manifest.articles
    .filter((a) => matrixStatuses.get(a.article_id) === 'PUBLISHED')
    .map((a) => {
      const hub = { APP: 'app', RENT: 'thue-xe', EV: 'xe-dien', GUIDE: 'huong-dan', SAFE: 'an-toan', LOCAL: 'dia-phuong' }[a.category];
      return { ...a, dir: hub };
    });
  const ctx = { ownership, business, published };
  const pages = pageSet(published);

  const groups = [
    { id: 'TECHNICAL', label: 'Technical SEO', weight: 25, run: () => checkTechnical(pages, io) },
    { id: 'CONTENT', label: 'Content / On-page', weight: 25, run: () => checkContent(pages, io, ctx) },
    { id: 'STRUCTURED', label: 'Structured Data', weight: 15, run: () => checkStructuredData(pages, io) },
    { id: 'LINKS', label: 'Internal Linking', weight: 10, run: () => checkInternalLinks(pages, io, ctx) },
    { id: 'CRAWL', label: 'Crawl / Indexability', weight: 10, run: () => checkCrawl(pages, io) },
    { id: 'UX', label: 'UX / Performance Structure', weight: 10, run: () => checkUxPerformance(pages, io) },
    { id: 'AIGEO', label: 'AI Search / GEO Readiness', weight: 5, run: () => checkAiGEO(pages, io, ctx) }
  ];

  const subscores = {};
  const issues = [];
  let total = 0;
  for (const g of groups) {
    const r = g.run();
    const rounded = Math.round(r.score * g.weight * 10) / 10;
    subscores[g.id] = { label: g.label, weight: g.weight, raw: rounded, max: g.weight, ratio: Math.round(r.score * 100) / 100, issues: r.issues };
    total += rounded;
    issues.push(...r.issues);
  }
  return {
    tool: 'tools/seo-score.mjs',
    total: Math.round(total * 10) / 10,
    max: 100,
    pages: pages.map((p) => p.path),
    subscores,
    issue_count: issues.length,
    issues
  };
}

/** Render the score payload as a markdown report. */
export function renderMarkdown(result, header) {
  const lines = [`# ${header || 'SEO Score'}`, '', `**TOTAL: ${result.total}/100**`, '', '| Group | Weight | Score | Ratio |', '|---|---|---|---|'];
  for (const k of Object.keys(result.subscores)) {
    const s = result.subscores[k];
    lines.push(`| ${s.label} | ${s.weight} | ${s.raw}/${s.weight} | ${Math.round(s.ratio * 100)}% |`);
  }
  lines.push('', `## Issues (${result.issue_count})`, '');
  if (result.issues.length === 0) lines.push('No issues detected.');
  for (const i of result.issues) lines.push(`- ${i}`);
  lines.push('', '---', '', `Pages audited: ${result.pages.length}`, ...result.pages.map((p) => `- ${p}`));
  return lines.join('\n') + '\n';
}

// ---- CLI (Node only) ----
const isCli = typeof process !== 'undefined' && process.argv && process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isCli) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const io = {
    read: (p) => readFileSync(join(ROOT, p), 'utf8'),
    exists: (p) => existsSync(join(ROOT, p)),
    size: (p) => statSync(join(ROOT, p)).size
  };
  const result = scoreRepo(io);
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(renderMarkdown(result, `MotoAI SEO Score — ${new Date().toISOString().slice(0, 10)}`));
}
