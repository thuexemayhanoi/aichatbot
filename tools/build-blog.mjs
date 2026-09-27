#!/usr/bin/env node
/**
 * Build the blog from PUBLISHED article manifests (data/blog/published.json).
 *
 * Idempotent, deterministic, transactional-friendly generator (v56 app-blog
 * foundation — taxonomy driven):
 *   - article pages under blog/<category-dir>/<slug>/index.html with
 *     build-time table of contents, breadcrumb, related articles, Agent CTA
 *     and the shared footer
 *   - blog home + six category hubs (v54 app shell: compact header, theme
 *     toggle, verified business status, category bar, contact CTA)
 *   - three parent cluster cards on the blog home (taxonomy Level 2)
 *   - subtopic hub pages ONLY for subtopics with >= 1 PUBLISHED article
 *     (no empty SEO hubs — the factory needs no manual edits when more
 *     articles publish)
 *   - crawlable pagination on category hubs (24 cards per page)
 *   - shared app footer generated from ONE source of truth
 *     (config/navigation.json) — never copy/pasted per page
 *   - blog/search-index.json with cluster/subtopic/location fields
 *   - data/blog/knowledge-index.json (Agent retrieval chunks)
 *   - sitemap.xml + robots.txt (homepage, blog home, hubs, subtopic hubs,
 *     published articles)
 *   - syncs matrix rows of published articles to status=PUBLISHED
 *
 * Business facts inside article bodies use {{ business.* }} placeholders,
 * resolved from data/business/business.json — articles can never go stale
 * relative to the verified source of truth.
 *
 * Navigation/footer labels and category taxonomy come from
 * config/navigation.json + data/blog/taxonomy.json via tools/taxonomy.mjs.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  taxonomy, navigation, CLUSTER_BY_ID, viSlug, deriveSubtopic
} from './taxonomy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const write = (p, s) => { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), s, 'utf8'); };

export const SITE = 'https://thuexemayhanoi.github.io/aichatbot/';
export const PER_PAGE = 24;

/** Canonical category order (IDs never change). */
export const HUBS = Object.freeze(['APP', 'RENT', 'EV', 'GUIDE', 'SAFE', 'LOCAL'].map((id) => ({
  id,
  dir: taxonomy.categories[id].dir,
  name: taxonomy.categories[id].name,          // full H1 / title name
  label: taxonomy.categories[id].label,        // short nav label
  cluster: taxonomy.categories[id].cluster,
  desc: taxonomy.categories[id].desc,
  intro: taxonomy.categories[id].intro,
  meta: taxonomy.categories[id].meta
})));
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

/** Relative asset prefix from a page path back to repo root. */
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

/** Shared v56 app shell header: back link, brand, theme toggle, category bar. */
function shellHeader({ activeHub }) {
  const items = navigation.categories.map((c) => {
    const dir = taxonomy.categories[c.id].dir;
    return `      <a href="/aichatbot/blog/${dir}/"${dir === activeHub ? ' aria-current="page"' : ''}>${esc(c.label)}</a>`;
  }).join('\n');
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

/** Article-screen header (compact, no status chip). */
function articleHeader() {
  return `  <header class="blog-header">
    <a class="blog-back" href="/aichatbot/">← Agent</a>
    <a class="blog-brand" href="/aichatbot/blog/">Cẩm nang</a>
    <div class="blog-header-tools">
      <button type="button" class="blog-theme-toggle" id="blog-theme-toggle" aria-label="Chủ đề: tự động">Auto</button>
    </div>
  </header>
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

/**
 * Shared app footer — generated from ONE source of truth
 * (config/navigation.json footer_groups). Never copy/paste per page.
 */
export function footerHtml() {
  const groups = navigation.footer_groups.map((g) => {
    const links = g.items.map((item) => {
      if (item.ref) {
        // Contact-backed destination (href resolved at runtime from business.json)
        return `        <li><a data-contact-ref="${item.ref}" href="/aichatbot/">${esc(item.label)}</a></li>`;
      }
      return `        <li><a href="${item.url}">${esc(item.label)}</a></li>`;
    }).join('\n');
    return `      <div class="blog-footer-col">
        <p class="blog-footer-title">${esc(g.title)}</p>
        <ul>
${links}
        </ul>
      </div>`;
  }).join('\n');
  return `  <footer class="blog-footer">
    <div class="blog-footer-brand">
      <a class="blog-footer-agent" href="/aichatbot/">⚡ Agent</a>
      <p>Cẩm nang thuê xe máy &amp; xe điện — Thuê xe máy Hà Nội Nguyễn Tú</p>
    </div>
    <nav class="blog-footer-nav" aria-label="Chân trang">
${groups}
    </nav>
  </footer>
`;
}

function scripts() {
  return `  <script src="/aichatbot/assets/js/blog.js"></script>
  <script type="module" src="/aichatbot/assets/js/blog-app.js"></script>
`;
}

/** Article card (app-style). */
function card(a, hub) {
  return `      <a class="blog-card" href="/aichatbot/blog/${hub.dir}/${a.slug}/">
        <span class="cat">${esc(hub.label)}</span>
        <h2>${esc(a.title)}</h2>
        <p>${esc(a.description)}</p>
      </a>`;
}

/** Blog home = content home screen of the app. */
function buildHome(published) {
  const clusterCards = taxonomy.clusters.map((c) => {
    const cats = c.categories.map((id) => {
      const cat = taxonomy.categories[id];
      const nav = navigation.categories.find((n) => n.id === id);
      return `      <a class="blog-cluster-link" href="/aichatbot/blog/${cat.dir}/">${nav.icon} ${esc(nav.label)}</a>`;
    }).join('\n');
    return `    <section class="blog-cluster-card">
      <h2>${esc(c.name)}</h2>
      <p>${esc(c.desc)}</p>
      <div class="blog-cluster-links">
${cats}
      </div>
    </section>`;
  }).join('\n');

  const categoryCards = navigation.categories.map((nav) => {
    const cat = taxonomy.categories[nav.id];
    return `      <a class="blog-cat-card" href="/aichatbot/blog/${cat.dir}/">
        <span class="cat-icon" aria-hidden="true">${nav.icon}</span>
        <strong>${esc(nav.label)}</strong>
        <span>${esc(cat.desc)}</span>
      </a>`;
  }).join('\n');

  const cards = published.map((a) => card(a, HUB_BY_ID[a.category])).join('\n');
  const html = head({
    title: 'Cẩm nang thuê xe máy — ứng dụng, giá, xe điện, thủ tục',
    description: 'Cẩm nang thuê xe máy và xe điện: cách dùng ứng dụng thuê xe, bảng giá, thủ tục, an toàn và hành trình Hà Nội.',
    path: 'blog/'
  }) + `<main class="blog-page">
${shellHeader({ activeHub: null })}
  <section class="blog-hero">
    <h1>Cẩm nang thuê xe máy &amp; xe điện</h1>
    <p>Tìm hướng dẫn, ứng dụng, xe, an toàn và địa phương — viết kèm Agent để bạn hỏi sâu hơn từng chủ đề.</p>
  </section>
  <div class="blog-search">
    <input id="blog-search-input" type="search" placeholder="Tìm bài viết..." aria-label="Tìm bài viết">
    <button id="blog-search-btn" type="button" onclick="document.getElementById('blog-search-input').dispatchEvent(new Event('input'))">Tìm</button>
  </div>
  <p class="blog-search-note">Tìm theo tiêu đề, danh mục, chủ đề và địa phương của các bài đã xuất bản.</p>
  <div class="blog-grid" id="blog-search-results"></div>
  <section class="blog-clusters" aria-label="Nhóm chủ đề">
    <h2>Nhóm chủ đề</h2>
    <div class="blog-cluster-grid">
${clusterCards}
    </div>
  </section>
  <section aria-label="Danh mục">
    <h2>Danh mục</h2>
    <div class="blog-cat-grid">
${categoryCards}
    </div>
  </section>
  <section>
    <h2>Bài đã xuất bản</h2>
    <div class="blog-grid">
${cards || '      <p class="blog-empty">Chưa có bài đã xuất bản. Hỏi <a href="/aichatbot/">Agent</a> nếu cần thông tin ngay.</p>'}
    </div>
  </section>
${contactsCta('Cần trả lời ngay cho tình huống của bạn? Hỏi Agent — trả lời từ dữ liệu cửa hàng, chạy trên máy bạn.')}
${footerHtml()}
${scripts()}
</main>
</body>
</html>
`;
  write('blog/index.html', html);
}

/** Crawlable pagination slice. */
export function paginate(list, perPage = PER_PAGE) {
  const pages = [];
  for (let i = 0; i < list.length; i += perPage) pages.push(list.slice(i, i + perPage));
  return pages.length > 0 ? pages : [[]];
}

function paginationNav(hub, page, pages) {
  if (pages.length <= 1) return '';
  const links = [];
  for (let i = 0; i < pages.length; i++) {
    const p = i + 1;
    const href = p === 1 ? `/aichatbot/blog/${hub.dir}/` : `/aichatbot/blog/${hub.dir}/page/${p}/`;
    links.push(p === page ? `      <span class="blog-page-current" aria-current="page">${p}</span>` : `      <a href="${href}">${p}</a>`);
  }
  return `  <nav class="blog-pagination" aria-label="Trang">
    ${page > 1 ? `<a href="${page === 2 ? `/aichatbot/blog/${hub.dir}/` : `/aichatbot/blog/${hub.dir}/page/${page - 1}/`}">‹ Trước</a>` : ''}
${links.join('\n')}
    ${page < pages.length ? `<a href="/aichatbot/blog/${hub.dir}/page/${page + 1}/">Sau ›</a>` : ''}
  </nav>
`;
}

/** Category hub (real content hub, paginated, subtopic chips when real). */
function buildHub(hub, published, subtopicMap) {
  const articles = published.filter((a) => a.category === hub.id);
  const pages = paginate(articles);

  // Subtopic chips: only subtopics that actually hold a published article.
  const chips = (subtopicMap[hub.id] ?? [])
    .filter((s) => s.count > 0 && s.slug)
    .map((s) => `      <a class="blog-chip" href="/aichatbot/blog/${hub.dir}/${s.slug}/">${esc(s.label)} <span class="blog-chip-count">${s.count}</span></a>`)
    .join('\n');

  // Sibling category in the same cluster (related category).
  const cluster = CLUSTER_BY_ID[hub.cluster];
  const sibling = cluster.categories.map((id) => HUB_BY_ID[id]).find((h) => h.id !== hub.id);

  for (let p = 0; p < pages.length; p++) {
    const pageNo = p + 1;
    const cards = pages[p].map((a) => card(a, hub)).join('\n')
      || `      <p class="blog-empty">Chưa có bài đã xuất bản trong danh mục này. Danh mục sẽ được bổ sung theo kế hoạch sản xuất nội dung — hỏi <a href="/aichatbot/">Agent</a> nếu cần thông tin ngay.</p>`;
    const nav = paginationNav(hub, pageNo, pages);
    const title = pages.length > 1 ? `${hub.name} — trang ${pageNo} — Cẩm nang thuê xe máy` : `${hub.name} — Cẩm nang thuê xe máy & xe điện`;
    const html = head({
      title,
      description: hub.meta,
      path: pageNo === 1 ? `blog/${hub.dir}/` : `blog/${hub.dir}/page/${pageNo}/`
    }) + `<main class="blog-page">
${shellHeader({ activeHub: hub.dir })}
  <nav class="blog-breadcrumb"><a href="/aichatbot/">Agent</a> › <a href="/aichatbot/blog/">Cẩm nang</a> › <span>${esc(hub.label)}</span></nav>
  <section class="blog-hero">
    <h1>${esc(hub.name)}</h1>
    <p>${esc(hub.desc)}</p>
    <p>${esc(hub.intro)}</p>
  </section>
${chips ? `  <div class="blog-chips" aria-label="Chủ đề">
${chips}
  </div>
` : ''}  <div class="blog-grid">
${cards}
  </div>
${nav}${sibling ? `  <p class="blog-hub-sibling">Chủ đề liên quan: <a href="/aichatbot/blog/${sibling.dir}/">${esc(sibling.label)}</a></p>
` : ''}${contactsCta('Hỏi Agent về chủ đề này để nhận trả lời từ dữ liệu cửa hàng đã xác minh.')}
${footerHtml()}
  <script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: hub.name, description: hub.meta, url: `${SITE}blog/${hub.dir}/`,
    isPartOf: { '@type': 'WebSite', name: 'MotoAI — Cẩm nang thuê xe máy & xe điện', url: SITE }
  })}
  </script>
  <script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Agent', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Cẩm nang', item: `${SITE}blog/` },
      { '@type': 'ListItem', position: 3, name: hub.label, item: `${SITE}blog/${hub.dir}/` }
    ]
  })}
  </script>
${scripts()}
</main>
</body>
</html>
`;
    if (pageNo === 1) write(`blog/${hub.dir}/index.html`, html);
    else write(`blog/${hub.dir}/page/${pageNo}/index.html`, html);
  }
}

/** Subtopic hub — generated ONLY for subtopics with >= 1 published article. */
function buildSubtopic(hub, sub, articles) {
  const cards = articles.map((a) => card(a, hub)).join('\n');
  const html = head({
    title: `${sub.label} — ${hub.name} — Cẩm nang thuê xe máy`,
    description: `${sub.label} trong ${hub.name.toLowerCase()}: ${hub.meta}`,
    path: `blog/${hub.dir}/${sub.slug}/`
  }) + `<main class="blog-page">
${shellHeader({ activeHub: hub.dir })}
  <nav class="blog-breadcrumb"><a href="/aichatbot/">Agent</a> › <a href="/aichatbot/blog/">Cẩm nang</a> › <a href="/aichatbot/blog/${hub.dir}/">${esc(hub.label)}</a> › <span>${esc(sub.label)}</span></nav>
  <section class="blog-hero">
    <h1>${esc(sub.label)}</h1>
    <p>${esc(hub.desc)}</p>
  </section>
  <div class="blog-grid">
${cards}
  </div>
${contactsCta('Hỏi Agent về chủ đề này để nhận trả lời từ dữ liệu cửa hàng đã xác minh.')}
${footerHtml()}
  <script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Agent', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Cẩm nang', item: `${SITE}blog/` },
      { '@type': 'ListItem', position: 3, name: hub.label, item: `${SITE}blog/${hub.dir}/` },
      { '@type': 'ListItem', position: 4, name: sub.label, item: `${SITE}blog/${hub.dir}/${sub.slug}/` }
    ]
  })}
  </script>
${scripts()}
</main>
</body>
</html>
`;
  write(`blog/${hub.dir}/${sub.slug}/index.html`, html);
}

/**
 * Build-time table of contents: deterministic Vietnamese-safe anchor IDs,
 * deduplicated, from the article's H2/H3. No manual TOC maintenance.
 */
export function buildToc(bodyHtml) {
  const used = new Set();
  const items = [];
  const html = bodyHtml.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/g, (_, lvl, attrs, inner) => {
    const existing = /id="([^"]+)"/.exec(attrs);
    const base = existing ? existing[1] : viSlug(inner.replace(/<[^>]+>/g, ''));
    let id = base || 'muc';
    let i = 2;
    while (used.has(id)) id = `${base || 'muc'}-${i++}`;
    used.add(id);
    const text = inner.replace(/<[^>]+>/g, '').trim();
    items.push({ level: Number(lvl), id, text });
    return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
  });
  return { html, items };
}

function tocHtml(items) {
  if (items.length < 2) return { markup: '', html: items };
  const list = (cls) => `<ol class="${cls}">
${items.map((it) => `      <li class="toc-l${it.level}"><a href="#${it.id}">${esc(it.text)}</a></li>`).join('\n')}
    </ol>`;
  return {
    markup: `  <nav class="blog-toc" aria-label="Mục lục">
    <details class="blog-toc-mobile">
      <summary>Mục lục</summary>
${list('blog-toc-list')}
    </details>
    <div class="blog-toc-desktop">
      <p class="blog-toc-title">Mục lục</p>
${list('blog-toc-list')}
    </div>
  </nav>
`
  };
}

/** Article page = premium app detail screen. */
function buildArticle(a, business, hub, published, row) {
  const bodyRaw = read(a.body);
  const body = resolveFacts(bodyRaw, business);
  const { html: bodyWithIds, items } = buildToc(body);
  const toc = tocHtml(items);
  const path = `blog/${hub.dir}/${a.slug}/`;

  // Deterministic subtopic (from the canonical taxonomy model, not prose).
  const sub = deriveSubtopic(a.category, row ?? {});
  const subHubUrl = sub.fallback ? null : `/aichatbot/blog/${hub.dir}/${sub.slug}/`;

  // Related: same subtopic first, then same category, then others. 3-5, never self.
  const score = (x) => {
    let s = 0;
    if (x.category === a.category) s -= 2;
    const xsub = deriveSubtopic(x.category, published.find((p) => p.article_id === x.article_id) ?? {});
    if (!sub.fallback && xsub.code === sub.code && x.category === a.category) s -= 3;
    return s;
  };
  const related = published
    .filter((x) => x.article_id !== a.article_id)
    .map((x) => ({ x, s: score(x), id: x.article_id }))
    .sort((p, q) => p.s - q.s || p.id.localeCompare(q.id))
    .slice(0, 5)
    .map(({ x }) => card(x, HUB_BY_ID[x.category]))
    .join('\n');
  const relatedSection = related ? `  <section class="blog-related">
    <h2>Bài viết liên quan</h2>
    <div class="blog-grid">
${related}
    </div>
  </section>
` : '';

  const breadcrumb = [
    { name: 'Agent', item: SITE },
    { name: 'Cẩm nang', item: `${SITE}blog/` },
    { name: hub.label, item: `${SITE}blog/${hub.dir}/` },
    ...(subHubUrl ? [{ name: sub.label, item: `${SITE}blog/${hub.dir}/${sub.slug}/` }] : []),
    { name: a.title, item: `${SITE}${path}` }
  ];

  const html = head({ title: a.title, description: a.description, path }) + `<main class="blog-page blog-article">
${articleHeader()}
  <nav class="blog-breadcrumb"><a href="/aichatbot/">Agent</a> › <a href="/aichatbot/blog/">Cẩm nang</a> › <a href="/aichatbot/blog/${hub.dir}/">${esc(hub.label)}</a>${subHubUrl ? ` › <a href="${subHubUrl}">${esc(sub.label)}</a>` : ''} › <span>${esc(a.title)}</span></nav>
  <p class="blog-chips">
    <a class="blog-chip" href="/aichatbot/blog/${hub.dir}/">${esc(hub.label)}</a>${subHubUrl ? `
    <a class="blog-chip" href="${subHubUrl}">${esc(sub.label)}</a>` : ''}
  </p>
  <h1>${esc(a.title)}</h1>
  <p class="blog-dek">${esc(a.description)}</p>
  <p class="byline">${esc(a.author)} · ${a.published_date} · ${esc(hub.label)}</p>
  <div class="blog-article-layout">
${toc.markup}  <article>
  ${bodyWithIds.trim().split('\n').join('\n  ')}
  </article>
  </div>
${relatedSection}${contactsCta('Hỏi Agent về chủ đề bài viết này — trả lời từ dữ liệu cửa hàng đã xác minh.')}
${footerHtml()}
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
    itemListElement: breadcrumb.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: b.item }))
  })}
  </script>
${scripts()}
</main>
</body>
</html>
`;
  write(`blog/${hub.dir}/${a.slug}/index.html`, html);
}

/** Parse the matrix CSV into { article_id -> row } (schema untouched). */
function matrixRows() {
  const lines = read('data/blog/content-matrix.csv').split('\n');
  const header = lines[0].split(',');
  const rows = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split(',');
    const row = {};
    header.forEach((h, j) => { row[h] = cells[j] ?? ''; });
    rows[row.article_id] = row;
  }
  return rows;
}

export function build() {
  const business = JSON.parse(read('data/business/business.json'));
  const manifest = JSON.parse(read('data/blog/published.json'));
  const published = manifest.articles;
  const matrix = matrixRows();
  const updated = published.reduce((m, a) => a.published_date > m ? a.published_date : m, '2026-09-26');

  buildHome(published);
  for (const hub of HUBS) buildHub(hub, published, subtopicCounts(published, matrix));
  const subtopicPages = [];
  for (const hub of HUBS) {
    const subs = (taxonomy.subtopics[hub.id] ?? []);
    for (const sub of subs) {
      const arts = published.filter((a) => {
        if (a.category !== hub.id) return false;
        const s = deriveSubtopic(a.category, matrix[a.article_id] ?? {});
        return !s.fallback && s.code === sub.code;
      });
      // No empty SEO hubs: a subtopic page exists only with real content.
      if (arts.length > 0) {
        buildSubtopic(hub, sub, arts);
        subtopicPages.push(`blog/${hub.dir}/${sub.slug}/`);
      }
    }
  }
  for (const a of published) buildArticle(a, business, HUB_BY_ID[a.category], published, matrix[a.article_id]);

  // Search index (compact; only published; cluster/subtopic/location aware).
  write('blog/search-index.json', JSON.stringify({
    updated,
    articles: published.map((a) => {
      const hub = HUB_BY_ID[a.category];
      const row = matrix[a.article_id] ?? {};
      const sub = deriveSubtopic(a.category, row);
      const cluster = CLUSTER_BY_ID[hub.cluster];
      return {
        title: a.title,
        keywords: [a.title, a.description, sub.fallback ? '' : sub.label, row.local_scope].filter(Boolean).join(' '),
        summary: a.description,
        category: a.category,
        category_name: hub.name,
        cluster: hub.cluster,
        cluster_name: cluster.name,
        subtopic: sub.fallback ? '' : sub.code,
        subtopic_name: sub.fallback ? '' : sub.label,
        location: row.local_scope ?? '',
        url: `/aichatbot/blog/${hub.dir}/${a.slug}/`
      };
    })
  }, null, 2) + '\n');

  // Knowledge index for Agent retrieval (chunks, not full documents).
  write('data/blog/knowledge-index.json', JSON.stringify({
    $schema: 'motoai/blog-knowledge@1',
    updated,
    chunks: published.flatMap((a) => a.knowledge_chunks.map((text, i) => ({
      id: `${a.article_id}:c${i + 1}`,
      article_id: a.article_id,
      title: a.title,
      url: `/aichatbot/blog/${HUB_BY_ID[a.category].dir}/${a.slug}/`,
      category: a.category,
      text
    })))
  }, null, 2) + '\n');

  // Sitemap: homepage, blog home, hubs, non-empty subtopic hubs, published articles only.
  const urls = [SITE, `${SITE}blog/`,
    ...HUBS.map((h) => `${SITE}blog/${h.dir}/`),
    ...subtopicPages.map((p) => `${SITE}${p}`),
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
      cols[22] = updated;
      if (cols[23] === '') cols[23] = 'pilot/fixture';
      csv[i] = cols.join(',');
    }
  }
  write('data/blog/content-matrix.csv', csv.join('\n'));
  console.log(`blog built: ${published.length} published articles, ${subtopicPages.length} subtopic hubs, ${urls.length} sitemap urls`);
}

/** Subtopic counts per category for hub chips (only real subtopics counted). */
function subtopicCounts(published, matrix) {
  const map = {};
  for (const hub of HUBS) {
    const counts = new Map();
    for (const a of published.filter((x) => x.category === hub.id)) {
      const s = deriveSubtopic(a.category, matrix[a.article_id] ?? {});
      if (s.fallback) continue;
      counts.set(s.code, (counts.get(s.code) ?? 0) + 1);
    }
    map[hub.id] = (taxonomy.subtopics[hub.id] ?? []).map((sub) => ({
      ...sub,
      count: counts.get(sub.code) ?? 0
    }));
  }
  return map;
}

if (process.argv && process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) build();
