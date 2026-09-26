#!/usr/bin/env node
/**
 * Build the blog from PUBLISHED article manifests (data/blog/published.json).
 *
 * Idempotent, deterministic, transactional-friendly generator:
 *   - builds article pages under blog/<category-dir>/<slug>/index.html
 *   - builds blog home + six category hubs (v54 app shell: compact header,
 *     theme toggle, verified business status, category bar, contact CTA)
 *   - writes blog/search-index.json (compact search fields)
 *   - writes data/blog/knowledge-index.json (Agent retrieval chunks)
 *   - writes sitemap.xml + robots.txt (homepage, blog home, hubs, published)
 *   - syncs matrix rows of published articles to status=PUBLISHED
 *
 * v55 SEO build:
 *   - correct relative asset prefix for EVERY page depth (v54 shipped
 *     broken stylesheet hrefs on the blog home and article pages)
 *   - og:locale + og:site_name on all generated pages
 *   - hub pages: richer honest intro, aria-current category bar
 *   - article pages: related-article links, Q&A-friendly structure
 *   - resolveFacts supports {{ business.x.y | vnd }} filter placeholders
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
  { id: 'APP', dir: 'app', name: 'App & Ứng dụng', desc: 'Ứng dụng web, Agent và cách dùng công cụ thuê xe máy trực tuyến.', intro: 'Cách dùng ứng dụng thuê xe máy MotoAI: hỏi giá, chọn xe, tính chi phí và xem thủ tục ngay trên trình duyệt — không cần cài đặt, không cần tài khoản.', meta: 'Ứng dụng web, Agent và cách dùng công cụ thuê xe máy MotoAI: hỏi giá, chọn xe, tính chi phí và xem thủ tục ngay trên trình duyệt.' },
  { id: 'RENT', dir: 'thue-xe', name: 'Thuê xe máy', desc: 'Giá thuê, loại xe, kỳ thuê và kinh nghiệm thuê xe máy.', intro: 'Giá thuê theo ngày, tuần, tháng; chọn xe số hay xe ga; kỳ thuê và kinh nghiệm thuê xe máy cho từng mục đích chuyến đi.', meta: 'Giá thuê xe máy theo ngày, tuần, tháng; chọn xe số hay xe ga; kỳ thuê và kinh nghiệm thuê xe máy cho từng mục đích chuyến đi.' },
  { id: 'EV', dir: 'xe-dien', name: 'Xe điện / xe máy điện', desc: 'Thuê xe điện: pin, phạm vi, sạc và cách chọn xe điện phù hợp.', intro: 'Thuê xe máy điện: tầm hoạt động theo pin, cách sạc, chi phí và cách chọn xe điện phù hợp với hành trình của bạn.', meta: 'Thuê xe điện: tầm hoạt động theo pin, cách sạc, chi phí và cách chọn xe máy điện phù hợp với hành trình của bạn.' },
  { id: 'GUIDE', dir: 'huong-dan', name: 'Hướng dẫn / thủ tục', desc: 'Thủ tục nhận xe, giấy tờ, đặt cọc và quy trình trả xe.', intro: 'Thủ tục thuê xe máy từng bước: giấy tờ cần mang, tiền đặt cọc theo loại xe, cách nhận và trả xe đúng giờ.', meta: 'Thủ tục thuê xe máy từng bước: giấy tờ cần mang, tiền đặt cọc theo loại xe, cách nhận và trả xe đúng giờ.' },
  { id: 'SAFE', dir: 'an-toan', name: 'An toàn / pháp lý', desc: 'Luật giao thông, an toàn lái xe và trách nhiệm khi thuê xe.', intro: 'An toàn khi thuê và lái xe máy: trang bị bảo hộ, luật giao thông và trách nhiệm của người thuê.', meta: 'An toàn khi thuê và lái xe máy: trang bị bảo hộ, luật giao thông và trách nhiệm của người thuê.' },
  { id: 'LOCAL', dir: 'dia-phuong', name: 'Địa phương / du lịch', desc: 'Hành trình Hà Nội và vùng ven bằng xe máy thuê, gợi ý điểm đến theo khu vực.', intro: 'Hành trình Hà Nội và vùng ven bằng xe máy thuê: gợi ý điểm đến, thời gian và cung đường cho từng khu vực.', meta: 'Hành trình Hà Nội và vùng ven bằng xe máy thuê: gợi ý điểm đến, thời gian và cung đường cho từng khu vực.' }
]);
const HUB_BY_ID = Object.fromEntries(HUBS.map((h) => [h.id, h]));

/** Resolve {{ business.x.y }} / {{ business.x.y | vnd }} placeholders. */
export function resolveFacts(html, business) {
  return html.replace(/\{\{\s*business\.([a-z0-9_.]+)(?:\s*\|\s*\w+)?\s*\}\}/gi, (_, path) => {
    const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), business);
    if (value === undefined) throw new Error(`unresolved business fact: business.${path}`);
    return typeof value === 'number' ? value.toLocaleString('vi-VN') + 'đ' : String(value);
  });
}

function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/** Escape & for HTML text/attribute contexts (titles, descriptions, names). */
const esc = (s) => String(s).replace(/&(?![a-z]+;|#)/gi, '&amp;');

/** Relative asset prefix from a page path ('blog/app/slug/') back to repo root. */
export function rel(path) {
  const depth = path.replace(/^\/|\/$/g, '').split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

function head({ title, description, path }) {
  const url = SITE + path.replace(/^\//, '');
  const prefix = rel(path);
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MotoAI — Cẩm nang thuê xe máy & xe điện">
  <meta property="og:locale" content="vi_VN">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <link rel="stylesheet" href="${prefix}assets/css/style.css">
  <link rel="stylesheet" href="${prefix}assets/css/blog.css">
  <script>/* apply saved theme before first paint (no flash) */(function(){try{var t=localStorage.getItem('motoai-theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.setAttribute('data-motoai-theme','dark');}}catch(e){}})();</script>
</head>
<body>
`;
}

/** Shared v54 app shell header: back link, brand, theme toggle, status chip, category bar. */
function shellHeader({ activeHub }) {
  const items = HUBS.map((h) =>
    `      <a href="/aichatbot/blog/${h.dir}/"${h.dir === activeHub ? ' aria-current="page"' : ''}>${esc(h.name)}</a>`).join('\n');
  return `  <header class="blog-header">
    <a class="blog-back" href="/aichatbot/">← Agent</a>
    <a class="blog-brand" href="/aichatbot/blog/">Cẩm nang</a>
    <div class="blog-header-tools">
      <button type="button" class="blog-theme-toggle" id="blog-theme-toggle" aria-label="Chủ đề: tự động">Auto</button>
    </div>
  </header>
  <p class="blog-status" id="blog-business-status" hidden></p>
  <nav class="blog-categories" aria-label="Danh mục">
${items}
  </nav>
`;
}

function contactsCta(copy) {
  return `  <div class="blog-cta">
    <p>${copy}</p>
    <div class="blog-contacts">
      <a class="blog-contact" href="/aichatbot/">⚡ Hỏi Agent</a>
      <a class="blog-contact" data-contact-ref="call" href="#">📞 Gọi</a>
      <a class="blog-contact" data-contact-ref="zalo" href="#">💬 Zalo</a>
      <a class="blog-contact" data-contact-ref="whatsapp" href="#">🟢 WhatsApp</a>
      <a class="blog-contact" data-contact-ref="map" href="#">🗺️ Bản đồ</a>
    </div>
  </div>
`;
}

function scripts(prefix) {
  return `  <script src="/aichatbot/assets/js/blog.js"></script>
  <script type="module" src="/aichatbot/assets/js/blog-app.js"></script>
`;
}

/** Blog home. */
function buildHome(published) {
  const cards = published.map((a) => {
    const hub = HUB_BY_ID[a.category];
    return `      <a class="blog-card" href="/aichatbot/blog/${hub.dir}/${a.slug}/">
        <span class="cat">${esc(hub.name)}</span>
        <h2>${esc(a.title)}</h2>
        <p>${esc(a.description)}</p>
      </a>`;
  }).join('\n');
  const html = head({
    title: 'Cẩm nang thuê xe máy — ứng dụng, giá, xe điện, thủ tục',
    description: 'Cẩm nang thuê xe máy và xe điện: cách dùng ứng dụng thuê xe, bảng giá, thủ tục nhận xe, an toàn và hành trình Hà Nội.',
    path: 'blog/'
  }) + `<main class="blog-page">
${shellHeader({ activeHub: null })}
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
    <h2>Bài đã xuất bản</h2>
    <div class="blog-grid">
${cards}
    </div>
  </section>
${contactsCta('Cần trả lời ngay cho tình huống của bạn? Hỏi Agent — trả lời từ dữ liệu cửa hàng, chạy trên máy bạn.')}
${scripts()}
</main>
</body>
</html>
`;
  write('blog/index.html', html);
}

/** Category hub. */
function buildHub(hub, published) {
  const cards = published.filter((a) => a.category === hub.id).map((a) => `      <a class="blog-card" href="/aichatbot/blog/${hub.dir}/${a.slug}/">
        <span class="cat">${esc(hub.name)}</span>
        <h2>${esc(a.title)}</h2>
        <p>${esc(a.description)}</p>
      </a>`).join('\n') || `      <p class="blog-empty">Chưa có bài đã xuất bản trong danh mục này. Danh mục sẽ được bổ sung theo kế hoạch sản xuất nội dung — hỏi <a href="/aichatbot/">Agent</a> nếu cần thông tin ngay.</p>`;
  const html = head({
    title: `${hub.name} — Cẩm nang thuê xe máy & xe điện`,
    description: hub.meta,
    path: `blog/${hub.dir}/`
  }) + `<main class="blog-page">
${shellHeader({ activeHub: hub.dir })}
  <nav class="blog-breadcrumb"><a href="/aichatbot/blog/">Cẩm nang</a> › <span>${esc(hub.name)}</span></nav>
  <section class="blog-hero">
    <h1>${esc(hub.name)}</h1>
    <p>${esc(hub.desc)}</p>
    <p>${esc(hub.intro)}</p>
  </section>
  <div class="blog-grid">
${cards}
  </div>
${contactsCta('Hỏi Agent về chủ đề này để nhận trả lời từ dữ liệu cửa hàng đã xác minh.')}
  <script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Cẩm nang', item: `${SITE}blog/` },
      { '@type': 'ListItem', position: 2, name: hub.name, item: `${SITE}blog/${hub.dir}/` }
    ]
  })}
  </script>
${scripts()}
</main>
</body>
</html>
`;
  write(`blog/${hub.dir}/index.html`, html);
}

/** Article page. */
function buildArticle(a, business, hub, published) {
  const bodyRaw = read(a.body);
  const body = resolveFacts(bodyRaw, business);
  const path = `blog/${hub.dir}/${a.slug}/`;
  // Related articles: other published articles, same category first.
  const related = published
    .filter((x) => x.article_id !== a.article_id)
    .sort((x, y) => (x.category === a.category ? -1 : 0) - (y.category === a.category ? -1 : 0))
    .slice(0, 3)
    .map((x) => {
      const h = HUB_BY_ID[x.category];
      return `    <a class="blog-card" href="/aichatbot/blog/${h.dir}/${x.slug}/">
      <span class="cat">${esc(h.name)}</span>
      <h2>${esc(x.title)}</h2>
      <p>${x.description}</p>
    </a>`;
    }).join('\n');
  const relatedSection = related ? `  <section class="blog-related">
    <h2>Bài viết liên quan</h2>
    <div class="blog-grid">
${related}
    </div>
  </section>
` : '';
  const html = head({ title: a.title, description: a.description, path }) + `<main class="blog-page blog-article">
  <header class="blog-header">
    <a class="blog-back" href="/aichatbot/">← Agent</a>
    <a class="blog-brand" href="/aichatbot/blog/">Cẩm nang</a>
    <div class="blog-header-tools">
      <button type="button" class="blog-theme-toggle" id="blog-theme-toggle" aria-label="Chủ đề: tự động">Auto</button>
    </div>
  </header>
  <nav class="blog-breadcrumb"><a href="/aichatbot/">Trang chủ</a> › <a href="/aichatbot/blog/">Cẩm nang</a> › <a href="/aichatbot/blog/${hub.dir}/">${esc(hub.name)}</a></nav>
  <h1>${esc(a.title)}</h1>
  <p class="byline">${esc(a.author)} · ${a.published_date} · ${esc(hub.name)}</p>
  <article>
  ${body.trim().split('\n').join('\n  ')}
  </article>
${relatedSection}${contactsCta('Hỏi Agent về chủ đề bài viết này — trả lời từ dữ liệu cửa hàng đã xác minh.')}
  <footer class="blog-article-footer">
    <span>Cẩm nang thuê xe máy — Thuê xe máy Hà Nội Nguyễn Tú</span>
    <a href="/aichatbot/">Hỏi Agent</a>
  </footer>
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
${scripts()}
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
  for (const a of published) buildArticle(a, business, HUB_BY_ID[a.category], published);

  // Search index (compact; only published).
  write('blog/search-index.json', JSON.stringify({
    updated: '2026-09-26',
    articles: published.map((a) => ({
      title: a.title,
      keywords: a.title + ' ' + a.description,
      summary: a.description,
      category: a.category,
      category_name: HUB_BY_ID[a.category].name,
      url: `/aichatbot/blog/${HUB_BY_ID[a.category].dir}/${a.slug}/`
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
      url: `/aichatbot/blog/${HUB_BY_ID[a.category].dir}/${a.slug}/`,
      category: a.category,
      text
    })))
  }, null, 2) + '\n');

  // Sitemap: homepage, blog home, hubs, published articles only.
  const urls = [SITE, `${SITE}blog/`, ...HUBS.map((h) => `${SITE}blog/${h.dir}/`),
    ...published.map((a) => `${SITE}blog/${HUB_BY_ID[a.category].dir}/${a.slug}/`),
    `${SITE}privacy/`, `${SITE}terms/`];
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

if (process.argv && process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) build();
