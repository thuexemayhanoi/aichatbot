#!/usr/bin/env node
/**
 * Build the blog from PUBLISHED article manifests (data/blog/published.json).
 *
 * Idempotent, deterministic, transactional-friendly generator:
 *   - builds article pages under blog/<category-dir>/<slug>/index.html
 *   - builds blog home + six category hubs
 *   - writes blog/search-index.json (compact search fields)
 *   - writes data/blog/knowledge-index.json (Agent retrieval chunks)
 *   - writes sitemap.xml + robots.txt (homepage, blog home, hubs, published)
 *   - syncs matrix rows of published articles to status=PUBLISHED
 *
 * Business facts inside article bodies use {{ business.* }} placeholders,
 * resolved from data/business/business.json — articles can never go stale
 * relative to the verified source of truth.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const write = (p, s) => { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), s, 'utf8'); };

export const SITE = 'https://thuexemayhanoi.github.io/aichatbot/';
export const HUBS = Object.freeze([
  { id: 'APP', dir: 'app', name: 'App & Ứng dụng', desc: 'Ứng dụng web, Agent và cách dùng công cụ thuê xe máy trực tuyến.' },
  { id: 'RENT', dir: 'thue-xe', name: 'Thuê xe máy', desc: 'Giá thuê, loại xe, kỳ thuê và kinh nghiệm thuê xe máy.' },
  { id: 'EV', dir: 'xe-dien', name: 'Xe điện / xe máy điện', desc: 'Thuê xe điện: pin, phạm vi, sạc và cách chọn xe điện phù hợp.' },
  { id: 'GUIDE', dir: 'huong-dan', name: 'Hướng dẫn / thủ tục', desc: 'Thủ tục nhận xe, giấy tờ, đặt cọc và quy trình trả xe.' },
  { id: 'SAFE', dir: 'an-toan', name: 'An toàn / pháp lý', desc: 'Luật giao thông, an toàn lái xe và trách nhiệm khi thuê xe.' },
  { id: 'LOCAL', dir: 'dia-phuong', name: 'Địa phương / du lịch', desc: 'Hành trình Hà Nội và vùng ven bằng xe máy thuê.' }
]);

/** Resolve {{ business.x.y }} placeholders against verified business.json. */
export function resolveFacts(html, business) {
  return html.replace(/\{\{\s*business\.([a-z0-9_.]+)\s*\}\}/gi, (_, path) => {
    const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), business);
    if (value === undefined) throw new Error(`unresolved business fact: business.${path}`);
    return typeof value === 'number' ? value.toLocaleString('vi-VN') + 'đ' : String(value);
  });
}

function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function head({ title, description, path }) {
  const url = SITE + path.replace(/^\//, '');
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${url}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <link rel="stylesheet" href="${rel(path)}assets/css/style.css">
  <link rel="stylesheet" href="${rel(path)}assets/css/blog.css">
</head>
<body>
`;
}
/** Relative asset prefix from a page path back to repo root. */
function rel(path) {
  const depth = path.replace(/^\//, '').split('/').filter((s) => s.length > 0).length - 1;
  return depth <= 0 ? '' : '../'.repeat(depth) ;
}

function footer(path) {
  return `  <footer class="blog-article-footer">
    <span>Cẩm nang thuê xe máy — Thuê xe máy Hà Nội Nguyễn Tú</span>
    <a href="${rel(path)}index.html">Hỏi Agent</a>
  </footer>
`;
}

/** Blog home. */
function buildHome(published) {
  const cards = published.map((a) => {
    const hub = HUBS.find((h) => h.id === a.category);
    return `      <a class="blog-card" href="${SITE.replace(/^https?:\/\/[^/]+\//, '/')}blog/${hub.dir}/${a.slug}/">
        <span class="cat">${hub.name}</span>
        <h2>${a.title}</h2>
        <p>${a.description}</p>
      </a>`;
  }).join('\n');
  const cats = HUBS.map((h) => `      <a class="blog-card" href="/aichatbot/blog/${h.dir}/">
        <span class="cat">${h.name}</span>
        <h3>${h.desc}</h3>
      </a>`).join('\n');
  const html = head({
    title: 'Cẩm nang thuê xe máy — ứng dụng, giá, xe điện, thủ tục',
    description: 'Cẩm nang thuê xe máy và xe điện: cách dùng ứng dụng thuê xe, bảng giá, thủ tục nhận xe, an toàn và hành trình Hà Nội.',
    path: 'blog/'
  }) + `<main class="blog-page">
  <header class="blog-header">
    <a class="blog-brand" href="/aichatbot/">🏍️ MotoAI — Cẩm nang thuê xe</a>
    <nav class="blog-nav">
      <a href="/aichatbot/">Agent</a><a href="/aichatbot/blog/" aria-current="page">Cẩm nang</a>
    </nav>
  </header>
  <section class="blog-hero">
    <h1>Cẩm nang thuê xe máy &amp; xe điện</h1>
    <p>Bài viết về ứng dụng thuê xe, bảng giá, xe điện, thủ tục, an toàn và hành trình Hà Nội — viết kèm Agent để bạn hỏi sâu hơn từng chủ đề.</p>
  </section>
  <div class="blog-search">
    <input id="blog-search-input" type="search" placeholder="Tìm bài viết..." aria-label="Tìm bài viết">
    <button id="blog-search-btn" type="button" onclick="document.getElementById('blog-search-input').dispatchEvent(new Event('input'))">Tìm</button>
  </div>
  <p class="blog-search-note">Tìm theo tiêu đề và từ khóa của các bài đã xuất bản.</p>
  <div class="blog-grid" id="blog-search-results"></div>
  <section>
    <h2 style="font-size:1.1rem">Danh mục</h2>
    <div class="blog-grid">
${cats}
    </div>
  </section>
  <section>
    <h2 style="font-size:1.1rem">Bài đã xuất bản</h2>
    <div class="blog-grid">
${cards}
    </div>
  </section>
  <div class="blog-cta">
    <p>Cần trả lời ngay cho tình huống của bạn? Hỏi Agent — trả lời từ dữ liệu cửa hàng, chạy trên máy bạn.</p>
    <a href="/aichatbot/">⚡ Hỏi Agent</a>
  </div>
  <script src="/aichatbot/assets/js/blog.js"></script>
</main>
</body>
</html>
`;
  write('blog/index.html', html);
}

/** Category hub. */
function buildHub(hub, published) {
  const cards = published.filter((a) => a.category === hub.id).map((a) => `      <a class="blog-card" href="../${a.slug}/">
        <h2>${a.title}</h2>
        <p>${a.description}</p>
      </a>`).join('\n') || '      <p>Chưa có bài đã xuất bản trong danh mục này. Danh mục sẽ được bổ sung theo kế hoạch sản xuất nội dung.</p>';
  const html = head({
    title: `${hub.name} — Cẩm nang thuê xe máy`,
    description: hub.desc,
    path: `blog/${hub.dir}/`
  }) + `<main class="blog-page">
  <nav class="blog-breadcrumb"><a href="/aichatbot/blog/">Cẩm nang</a> › <span>${hub.name}</span></nav>
  <header class="blog-header">
    <a class="blog-brand" href="/aichatbot/">🏍️ MotoAI</a>
    <nav class="blog-nav"><a href="/aichatbot/blog/">Cẩm nang</a><a href="/aichatbot/">Agent</a></nav>
  </header>
  <section class="blog-hero">
    <h1>${hub.name}</h1>
    <p>${hub.desc}</p>
  </section>
  <div class="blog-grid">
${cards}
  </div>
  <div class="blog-cta">
    <p>Hỏi Agent về chủ đề này để nhận trả lời từ dữ liệu cửa hàng.</p>
    <a href="/aichatbot/">⚡ Hỏi Agent</a>
  </div>
  <script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Cẩm nang', item: `${SITE}blog/` },
      { '@type': 'ListItem', position: 2, name: hub.name, item: `${SITE}blog/${hub.dir}/` }
    ]
  })}
  </script>
</main>
</body>
</html>
`;
  write(`blog/${hub.dir}/index.html`, html);
}

/** Article page. */
function buildArticle(a, business, hub) {
  const bodyRaw = read(a.body);
  const body = resolveFacts(bodyRaw, business);
  const path = `blog/${hub.dir}/${a.slug}/`;
  const html = head({ title: a.title, description: a.description, path }) + `<main class="blog-page blog-article">
  <nav class="blog-breadcrumb"><a href="${rel(path)}">Trang chủ</a> › <a href="${rel(path)}blog/">Cẩm nang</a> › <a href="../">${hub.name}</a></nav>
  <h1>${a.title}</h1>
  <p class="byline">${a.author} · ${a.published_date} · ${hub.name}</p>
  <article>
  ${body.trim().split('\n').join('\n  ')}
  </article>
  <div class="blog-cta">
    <p>Hỏi Agent về chủ đề bài viết này — trả lời từ dữ liệu cửa hàng đã xác minh.</p>
    <a href="${rel(path)}">⚡ Hỏi Agent</a>
  </div>
  ${footer(path)}
  <script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.description,
    datePublished: a.published_date,
    dateModified: a.published_date,
    author: { '@type': 'Organization', name: a.author },
    publisher: { '@type': 'Organization', name: business.display_name, url: SITE },
    mainEntityOfPage: `${SITE}${path}`,
    isAccessibleForFree: true
  })}
  </script>
  <script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Cẩm nang', item: `${SITE}blog/` },
      { '@type': 'ListItem', position: 2, name: hub.name, item: `${SITE}blog/${hub.dir}/` },
      { '@type': 'ListItem', position: 3, name: a.title, item: `${SITE}${path}` }
    ]
  })}
  </script>
</main>
</body>
</html>
`;
  write(`blog/${hub.dir}/${a.slug}/index.html`, html);
}

export function build() {
  const business = JSON.parse(read('data/business/business.json'));
  const manifest = JSON.parse(read('data/blog/published.json'));
  const published = manifest.articles;

  buildHome(published);
  for (const hub of HUBS) buildHub(hub, published);
  for (const a of published) buildArticle(a, business, HUBS.find((h) => h.id === a.category));

  // Search index (compact; only published).
  write('blog/search-index.json', JSON.stringify({
    updated: '2026-09-26',
    articles: published.map((a) => ({
      title: a.title,
      keywords: a.title + ' ' + a.description,
      summary: a.description,
      category: a.category,
      category_name: HUBS.find((h) => h.id === a.category).name,
      url: `/aichatbot/blog/${HUBS.find((h) => h.id === a.category).dir}/${a.slug}/`
    }))
  }, null, 2) + '\n');

  // Knowledge index for Agent retrieval (chunks, not full documents).
  write('data/blog/knowledge-index.json', JSON.stringify({
    $schema: 'motoai/blog-knowledge@1',
    updated: '2026-09-26',
    chunks: published.flatMap((a) => a.knowledge_chunks.map((text, i) => ({
      id: `${a.article_id}:c${i + 1}`,
      article_id: a.article_id,
      title: a.title,
      url: `/aichatbot/blog/${HUBS.find((h) => h.id === a.category).dir}/${a.slug}/`,
      category: a.category,
      text
    })))
  }, null, 2) + '\n');

  // Sitemap: homepage, blog home, hubs, published articles only.
  const urls = [SITE, `${SITE}blog/`, ...HUBS.map((h) => `${SITE}blog/${h.dir}/`),
    ...published.map((a) => `${SITE}blog/${HUBS.find((h) => h.id === a.category).dir}/${a.slug}/`)];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`);
  write('robots.txt', `User-agent: *
Allow: /
Sitemap: ${SITE}sitemap.xml
`);

  // Sync matrix rows for published articles.
  const csv = read('data/blog/content-matrix.csv').split('\n');
  const ids = new Set(published.map((a) => a.article_id));
  for (let i = 1; i < csv.length; i++) {
    const cols = csv[i].split(',');
    if (ids.has(cols[0])) {
      cols[3] = 'PUBLISHED';
      cols[21] = published.find((a) => a.article_id === cols[0]).published_date;
      cols[22] = '2026-09-26';
      if (cols[23] === '') cols[23] = 'pilot/fixture';
      csv[i] = cols.join(',');
    }
  }
  write('data/blog/content-matrix.csv', csv.join('\n'));
  console.log(`blog built: ${published.length} published articles, ${urls.length} sitemap urls`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) build();
