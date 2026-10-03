#!/usr/bin/env node
/**
 * Build the blog + legal screens from PUBLISHED article manifests
 * (data/blog/published.json).
 *
 * v57 SINGLE APP SHELL: every generated screen (blog home, category hub,
 * subtopic hub, article, paginated hub pages, privacy, terms) is rendered
 * by tools/app-shell.mjs — the SAME permanent MotoAI shell as the chat
 * homepage (top chrome + main viewport + bottom dock + drawer). Only the
 * CENTER CONTENT changes; no page gets its own blog-style website chrome.
 *
 * Also produces (unchanged contracts):
 *   - blog/search-index.json with cluster/subtopic/location fields
 *   - data/blog/knowledge-index.json (Agent retrieval chunks)
 *   - sitemap.xml + robots.txt
 *   - matrix row sync for published articles
 *
 * Business facts inside article bodies use {{ business.* }} placeholders,
 * resolved from data/business/business.json — articles can never go stale
 * relative to the verified source of truth.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  taxonomy, navigation, CLUSTER_BY_ID, viSlug, deriveSubtopic, clusterNav
} from './taxonomy.mjs';
import {
  SITE, esc, rel, pageHead, askAgentAction, appShellPage
} from './app-shell.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const write = (p, s) => { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), s, 'utf8'); };

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

/** Resolve {{ business.x.y }} / {{ business.x.y | vnd }} placeholders.
 *  {{ business.array | list }} joins arrays with ", " (for inline lists). */
export function resolveFacts(html, business) {
  return html.replace(/\{\{\s*business\.([a-z0-9_.]+)(?:\s*\|\s*(\w+))?\s*\}\}/gi, (_, path, filter) => {
    const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), business);
    if (value === undefined) throw new Error(`unresolved business fact: business.${path}`);
    if (filter === 'list' && Array.isArray(value)) return value.join(', ');
    return typeof value === 'number' ? value.toLocaleString('vi-VN') + 'đ' : String(value);
  });
}

/** Deterministic reading time: visible words / 200 per minute, min 1. */
export function readingTime(bodyHtml) {
  const words = bodyHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/** Article card (app-style, used by every list screen). */
function card(a, hub) {
  return `      <a class="blog-card" href="/aichatbot/blog/${hub.dir}/${a.slug}/">
        <span class="cat">${esc(hub.label)}</span>
        <h2>${esc(a.title)}</h2>
        <p>${esc(a.description)}</p>
      </a>`;
}

/** Compact screen head: small label + H1 + lead — never a giant hero. */
function screenHead({ label, title, lead }) {
  return `      <p class="blog-screen-label">${esc(label)}</p>
      <h1 class="blog-screen-title">${esc(title)}</h1>
      ${lead ? `<p class="blog-screen-lead">${esc(lead)}</p>` : ''}
`;
}

/** Compact breadcrumb (inside the screen, not another site's chrome). */
function breadcrumb(trail) {
  const items = trail.map((t, i) =>
    i === trail.length - 1
      ? `<span>${esc(t.label)}</span>`
      : `<a href="${t.href}">${esc(t.label)}</a>`)
    .join(' › ');
  return `      <nav class="blog-breadcrumb" aria-label="Đường dẫn">${items}</nav>
`;
}

/** Category chips row (inside the screen, under the title). */
function categoryChips({ activeHub }) {
  const items = navigation.categories.map((c) => {
    const dir = taxonomy.categories[c.id].dir;
    return `        <a class="blog-chip" href="/aichatbot/blog/${dir}/"${dir === activeHub ? ' aria-current="page"' : ''}>${esc(c.label)}</a>`;
  }).join('\n');
  return `      <div class="blog-chips" aria-label="Danh mục">
${items}
      </div>
`;
}

const CRUMB_HOME = { label: 'Agent', href: '/aichatbot/' };
const CRUMB_BLOG = { label: 'Cẩm nang', href: '/aichatbot/blog/' };
/** Cluster crumb entry (v61: blog home → PARENT HUB → category → article). */
const crumbCluster = (cluster) => ({ label: cluster.name, href: `/aichatbot/blog/${cluster.dir}/` });
/** Visible + JSON-LD breadcrumb trail for any cluster/category/subtopic/article page. */
function clusterTrail(cluster, extra = []) {
  return [CRUMB_HOME, CRUMB_BLOG, crumbCluster(cluster), ...extra];
}
/** Schema trail entries (absolute item URLs) matching clusterTrail exactly. */
function clusterTrailSchema(cluster, extra = []) {
  const entries = [
    { name: 'Agent', item: SITE },
    { name: 'Cẩm nang', item: `${SITE}blog/` },
    { name: cluster.name, item: `${SITE}blog/${cluster.dir}/` }
  ];
  for (const e of extra) entries.push({ name: e.label, item: e.href ? `${SITE}${e.href.replace('/aichatbot/', '')}` : `${SITE}${e.itemPath}` });
  return entries;
}
/** Hub parent block: prominent link UP to the parent SEO hub (v61 §8). */
function hubParentBlock(cluster) {
  return `      <p class="blog-hub-parent">Nhóm chủ đề: <a href="/aichatbot/blog/${cluster.dir}/">${esc(cluster.name)}</a></p>\n`;
}
/** Bottom contextual block: explore the whole parent cluster (v61 §8). */
function hubClusterFooter(cluster) {
  const links = cluster.categories.map((id) => {
    const c = taxonomy.categories[id];
    return `<a href="/aichatbot/blog/${c.dir}/">${esc(c.label)}</a>`;
  }).join(' · ');
  return `      <p class="blog-hub-cluster">Khám phá thêm trong ${esc(cluster.name)}: ${links}</p>\n`;
}

/** Blog home (v61 hub-first): H1/intro → search → 3 PARENT HUB cards →
 *  Bài mới → the six child category cards. Users and crawlers see the
 *  topical architecture before any single article. */
function buildHome(published) {
  // v61 SUPER HUB: three primary parent-hub sections — semantic <section>
  // with a LINKED H2 (crawlable parent), short description, child-hub
  // pills, the 2–4 latest articles of the parent, and a CTA to the hub.
  const hubSections = taxonomy.clusters.map((c) => {
    const hub = clusterNav(c.id);
    const pills = hub.children.map((ch) =>
      `        <a class="blog-cluster-link" href="/aichatbot/blog/${ch.dir}/">${ch.icon} ${esc(ch.label)}</a>`).join('\n');
    const latest = published.filter((a) => c.categories.includes(a.category)).slice(0, 4);
    const latestCards = latest.map((a) => card(a, HUB_BY_ID[a.category])).join('\n');
    return `      <section class="blog-hub-section" aria-label="${esc(c.name)}">
        <h2><a href="/aichatbot/blog/${c.dir}/">${hub.icon} ${esc(c.name)}</a></h2>
        <p>${esc(c.desc)}</p>
        <div class="blog-cluster-links">
${pills}
        </div>
${latestCards ? `        <div class="blog-grid">
${latestCards}
        </div>
` : ''}        <a class="blog-cluster-more" href="/aichatbot/blog/${c.dir}/">Xem toàn bộ ${esc(c.name)} →</a>
      </section>`;
  }).join('\n');

  const categoryCards = navigation.categories.map((navItem) => {
    const cat = taxonomy.categories[navItem.id];
    return `      <a class="blog-cat-card" href="/aichatbot/blog/${cat.dir}/">
        <span class="cat-icon" aria-hidden="true">${navItem.icon}</span>
        <strong>${esc(navItem.label)}</strong>
        <span>${esc(cat.desc)}</span>
      </a>`;
  }).join('\n');

  const cards = published.map((a) => card(a, HUB_BY_ID[a.category])).join('\n');

  const content = breadcrumb([CRUMB_HOME, { label: 'Cẩm nang', href: null }])
    + screenHead({
      label: 'Cẩm nang',
      title: 'Thuê xe máy & xe điện',
      lead: 'Hướng dẫn, ứng dụng, giá, xe, an toàn và địa phương — viết kèm Agent để bạn hỏi sâu hơn từng chủ đề.'
    })
    + `      <div class="blog-search">
        <input id="blog-search-input" type="search" placeholder="Tìm bài viết..." aria-label="Tìm bài viết">
        <select id="blog-search-filter" aria-label="Lọc theo danh mục">
          <option value="">Tất cả danh mục</option>
        </select>
        <button id="blog-search-btn" type="button" onclick="document.getElementById('blog-search-input').dispatchEvent(new Event('input'))">Tìm</button>
        <button id="blog-search-clear" type="button" aria-label="Xóa tìm kiếm" hidden>✕</button>
      </div>
      <p class="blog-search-note">Tìm theo tiêu đề, danh mục, chủ đề và địa phương của các bài đã xuất bản. <span id="blog-search-count" hidden></span></p>
      <div class="blog-grid" id="blog-search-results"></div>
      <section class="blog-hubs" aria-label="Nhóm chủ đề chính">
${hubSections}
      </section>
      <section>
        <h2>Bài mới</h2>
        <div class="blog-grid">
${cards || '          <p class="blog-empty">Chưa có bài đã xuất bản. Hỏi <a href="/aichatbot/">Agent</a> nếu cần thông tin ngay.</p>'}
        </div>
      </section>
      <section aria-label="Danh mục">
        <h2>Danh mục</h2>
        <div class="blog-cat-grid">
${categoryCards}
        </div>
      </section>
${askAgentAction('thuê xe máy')}`;

  const html = appShellPage({
    title: 'Cẩm nang thuê xe máy — ứng dụng, giá, xe điện, thủ tục',
    description: 'Cẩm nang thuê xe máy và xe điện: cách dùng ứng dụng thuê xe, bảng giá, thủ tục, an toàn và hành trình Hà Nội.',
    path: 'blog/',
    screen: 'blog-index',
    activeHub: null,
    contentHtml: content,
    search: true,
    schemaHtml: `  <script type="application/ld+json">
${jsonLd({
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: 'Cẩm nang thuê xe máy & xe điện',
      description: 'Cẩm nang thuê xe máy và xe điện: ứng dụng, giá, thủ tục, an toàn và hành trình Hà Nội.',
      url: `${SITE}blog/`,
      isPartOf: { '@type': 'WebSite', name: 'MotoAI — Cẩm nang thuê xe máy & xe điện', url: SITE },
      mainEntity: {
        '@type': 'ItemList',
        name: 'Nhóm chủ đề chính',
        itemListElement: taxonomy.clusters.map((c, i) => ({
          '@type': 'ListItem', position: i + 1, name: c.name, url: `${SITE}blog/${c.dir}/`
        }))
      }
    })}
  </script>
  <script type="application/ld+json">
${jsonLd({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Agent', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Cẩm nang', item: `${SITE}blog/` }
      ]
    })}
  </script>
`
  });
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
  return `      <nav class="blog-pagination" aria-label="Trang">
        ${page > 1 ? `<a href="${page === 2 ? `/aichatbot/blog/${hub.dir}/` : `/aichatbot/blog/${hub.dir}/page/${page - 1}/`}">‹ Trước</a>` : ''}
${links.join('\n')}
        ${page < pages.length ? `<a href="/aichatbot/blog/${hub.dir}/page/${page + 1}/">Sau ›</a>` : ''}
      </nav>
`;
}

/** Category hub screen (real content hub, paginated, subtopic chips). */
function buildHub(hub, published, subtopicMap) {
  const articles = published.filter((a) => a.category === hub.id);
  const pages = paginate(articles);

  // Subtopic chips: only subtopics that actually hold a published article.
  const chips = (subtopicMap[hub.id] ?? [])
    .filter((s) => s.count > 0 && s.slug)
    .map((s) => `        <a class="blog-chip" href="/aichatbot/blog/${hub.dir}/${s.slug}/">${esc(s.label)} <span class="blog-chip-count">${s.count}</span></a>`)
    .join('\n');

  // Sibling category in the same cluster (related category).
  const cluster = CLUSTER_BY_ID[hub.cluster];
  const sibling = cluster.categories.map((id) => HUB_BY_ID[id]).find((h) => h.id !== hub.id);

  for (let p = 0; p < pages.length; p++) {
    const pageNo = p + 1;
    const cards = pages[p].map((a) => card(a, hub)).join('\n')
      || `        <p class="blog-empty">Chưa có bài đã xuất bản trong danh mục này. Danh mục sẽ được bổ sung theo kế hoạch sản xuất nội dung — hỏi <a href="/aichatbot/">Agent</a> nếu cần thông tin ngay.</p>`;
    const nav = paginationNav(hub, pageNo, pages);
    const title = pages.length > 1 ? `${hub.name} — trang ${pageNo} — Cẩm nang thuê xe máy` : `${hub.name} — Cẩm nang thuê xe máy & xe điện`;

    const content = breadcrumb(clusterTrail(cluster, [{ label: hub.label, href: null }]))
      + screenHead({ label: 'Danh mục', title: hub.name, lead: hub.desc })
      + hubParentBlock(cluster)
      + (hub.intro ? `      <p class="blog-screen-lead">${esc(hub.intro)}</p>\n` : '')
      + categoryChips({ activeHub: hub.dir })
      + (chips ? `      <div class="blog-chips" aria-label="Chủ đề">
${chips}
      </div>
` : '')
      + `      <div class="blog-grid">
${cards}
      </div>
${nav}${sibling ? `      <p class="blog-hub-sibling">Chủ đề liên quan: <a href="/aichatbot/blog/${sibling.dir}/">${esc(sibling.label)}</a></p>
` : ''}${hubClusterFooter(cluster)}${askAgentAction(hub.name)}`;

    const html = appShellPage({
      title,
      description: hub.meta,
      path: pageNo === 1 ? `blog/${hub.dir}/` : `blog/${hub.dir}/page/${pageNo}/`,
      screen: `category-${hub.dir}`,
      activeHub: hub.dir,
      activeCluster: cluster.dir,
      contentHtml: content,
      schemaHtml: `  <script type="application/ld+json">
${jsonLd({
        '@context': 'https://schema.org', '@type': 'CollectionPage',
        name: hub.name, description: hub.meta, url: `${SITE}blog/${hub.dir}/`,
        isPartOf: { '@type': 'WebSite', name: 'MotoAI — Cẩm nang thuê xe máy & xe điện', url: SITE }
      })}
  </script>
  <script type="application/ld+json">
${jsonLd({
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: clusterTrailSchema(cluster, [{ label: hub.label, itemPath: `blog/${hub.dir}/` }]).map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: b.item }))
      })}
  </script>
`
    });
    if (pageNo === 1) write(`blog/${hub.dir}/index.html`, html);
    else write(`blog/${hub.dir}/page/${pageNo}/index.html`, html);
  }
}

/** Subtopic hub screen — generated ONLY with >= 1 published article. */
function buildSubtopic(hub, sub, articles) {
  const cards = articles.map((a) => card(a, hub)).join('\n');
  const cluster = CLUSTER_BY_ID[hub.cluster];
  const content = breadcrumb(clusterTrail(cluster, [{ label: hub.label, href: `/aichatbot/blog/${hub.dir}/` }, { label: sub.label, href: null }]))
    + screenHead({ label: hub.label, title: sub.label, lead: hub.desc })
    + `      <div class="blog-grid">
${cards}
      </div>
${askAgentAction(`${sub.label} — ${hub.name}`)}`;

  const html = appShellPage({
    title: `${sub.label} — ${hub.name} — Cẩm nang thuê xe máy`,
    description: `${sub.label} trong ${hub.name.toLowerCase()}: ${hub.meta}`,
    path: `blog/${hub.dir}/${sub.slug}/`,
    screen: `subtopic-${sub.slug}`,
    activeHub: hub.dir,
    contentHtml: content,
    // v63.1 hybrid hardening: subtopic schema = CollectionPage + ItemList
    // + BreadcrumbList whose trail EXACTLY matches the visible breadcrumb
    // (Agent › Cẩm nang › parent hub › silo › subtopic), derived from the
    // same clusterTrailSchema helper as hubs/articles — no self-conflict.
    schemaHtml: `  <script type="application/ld+json">
${jsonLd({
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: sub.label, description: `${sub.label} trong ${hub.name.toLowerCase()}`, url: `${SITE}blog/${hub.dir}/${sub.slug}/`,
      isPartOf: { '@type': 'WebSite', name: 'MotoAI — Cẩm nang thuê xe máy & xe điện', url: SITE },
      mainEntity: {
        '@type': 'ItemList',
        name: `${sub.label} — bài viết`,
        itemListElement: articles.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.title, url: `${SITE}blog/${hub.dir}/${a.slug}/` }))
      }
    })}
  </script>
  <script type="application/ld+json">
${jsonLd({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: clusterTrailSchema(cluster, [
        { label: hub.label, itemPath: `blog/${hub.dir}/` },
        { label: sub.label, itemPath: `blog/${hub.dir}/${sub.slug}/` }
      ]).map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: b.item }))
    })}
  </script>
`
  });
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
${items.map((it) => `        <li class="toc-l${it.level}"><a href="#${it.id}">${esc(it.text)}</a></li>`).join('\n')}
      </ol>`;
  return {
    markup: `      <nav class="blog-toc" aria-label="Mục lục">
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

/**
 * Parent cluster hub (/blog/<cluster-dir>/) — a real parent page connecting
 * its two category hubs. Canonical category IDs and dirs are untouched.
 */
function buildClusterHub(cluster, published) {
  // v61: a REAL topical parent hub — H1, intro, child category cards,
  // the strongest/latest articles per child, and the full cluster context.
  const cats = cluster.categories.map((id) => HUB_BY_ID[id]);
  const clusterArticles = published.filter((a) => cluster.categories.includes(a.category));

  const catCards = cats.map((hub) => {
    const navItem = navigation.categories.find((n) => n.id === hub.id);
    const top = published.filter((a) => a.category === hub.id).slice(0, 3);
    const topCards = top.map((a) => card(a, hub)).join('\n');
    return `      <section class="blog-cluster-child">
        <a class="blog-cat-card" href="/aichatbot/blog/${hub.dir}/">
          <span class="cat-icon" aria-hidden="true">${navItem.icon}</span>
          <strong>${esc(hub.label)}</strong>
          <span>${esc(hub.desc)}</span>
        </a>
${topCards ? `        <div class="blog-grid">
${topCards}
        </div>` : ''}
      </section>`;
  }).join('\n');

  const shown = new Set(clusterArticles.slice(0, 6).map((a) => a.article_id));
  const latestCards = clusterArticles.slice(0, 6).map((a) => card(a, HUB_BY_ID[a.category])).join('\n');
  const path = `blog/${cluster.dir}/`;
  const content = breadcrumb([CRUMB_HOME, CRUMB_BLOG, { label: cluster.name, href: null }])
    + screenHead({ label: 'Nhóm chủ đề', title: cluster.name, lead: cluster.desc })
    + (cluster.intro ? `      <p class="blog-screen-lead">${esc(cluster.intro)}</p>\n` : '')
    + `      <div class="blog-cat-grid">
${catCards}
      </div>
      <section>
        <h2>Bài mới trong ${esc(cluster.name)}</h2>
        <div class="blog-grid">
${latestCards || '          <p class="blog-empty">Chưa có bài đã xuất bản trong nhóm này. Danh mục sẽ được bổ sung theo kế hoạch sản xuất nội dung — hỏi <a href="/aichatbot/">Agent</a> nếu cần thông tin ngay.</p>'}
        </div>
      </section>
${hubClusterFooter(cluster)}${askAgentAction(cluster.name)}`;
  const itemList = [
    ...cats.map((hub) => ({ '@type': 'ListItem', position: cats.indexOf(hub) + 1, name: hub.name, url: `${SITE}blog/${hub.dir}/` })),
    ...clusterArticles.slice(0, 10).map((a, i) => ({ '@type': 'ListItem', position: cats.length + 1 + i, name: a.title, url: `${SITE}blog/${HUB_BY_ID[a.category].dir}/${a.slug}/` }))
  ];
  const html = appShellPage({
    title: `${cluster.name} — Cẩm nang thuê xe máy`,
    description: cluster.meta,
    path,
    screen: `cluster-${cluster.dir}`,
    activeCluster: cluster.dir,
    contentHtml: content,
    schemaHtml: `  <script type="application/ld+json">
${jsonLd({
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: cluster.name, description: cluster.meta, url: `${SITE}${path}`,
      isPartOf: { '@type': 'WebSite', name: 'MotoAI — Cẩm nang thuê xe máy & xe điện', url: SITE },
      mainEntity: { '@type': 'ItemList', name: `${cluster.name} — danh mục và bài viết`, itemListElement: itemList }
    })}
  </script>
  <script type="application/ld+json">
${jsonLd({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: clusterTrailSchema(cluster).map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: b.item }))
    })}
  </script>
`
  });
  write(`${path}index.html`, html);
}

/**
 * Build the article screen. v58 editorial upgrades: quick-answer summary box,
 * deterministic reading time (words/200, ceil), TOC, related articles.
 */
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
  const relatedSection = related ? `      <section class="blog-related">
        <h2>Bài viết liên quan</h2>
        <div class="blog-grid">
${related}
        </div>
      </section>
` : '';

  const cluster = CLUSTER_BY_ID[hub.cluster];
  const breadcrumbSchema = clusterTrailSchema(cluster, [
    { label: hub.label, itemPath: `blog/${hub.dir}/` },
    ...(subHubUrl ? [{ label: sub.label, itemPath: `blog/${hub.dir}/${sub.slug}/` }] : []),
    { name: a.title, itemPath: path, label: a.title }
  ]);
  const crumbTrail = clusterTrail(cluster, [
    { label: hub.label, href: `/aichatbot/blog/${hub.dir}/` },
    ...(subHubUrl ? [{ label: sub.label, href: subHubUrl }] : []),
    { label: a.title, href: null }
  ]);

  // v61 §8: topic context near the article end — the article states BOTH its
  // parent hub and its child hub as crawlable links.
  const topicContext = `      <section class="blog-topic-context">
        <h2>Bài viết thuộc</h2>
        <p>
          <a href="/aichatbot/blog/${cluster.dir}/">${esc(cluster.name)}</a>
          <span aria-hidden="true">→</span>
          <a href="/aichatbot/blog/${hub.dir}/">${esc(hub.label)}</a>
        </p>
      </section>
`;

  const content = breadcrumb(crumbTrail)
    + `      <p class="blog-chips">
        <a class="blog-chip" href="/aichatbot/blog/${hub.dir}/">${esc(hub.label)}</a>${subHubUrl ? `
        <a class="blog-chip" href="${subHubUrl}">${esc(sub.label)}</a>` : ''}
        <a class="blog-chip blog-chip-parent" href="/aichatbot/blog/${cluster.dir}/">${esc(cluster.name)}</a>
      </p>
${screenHead({ label: hub.label, title: a.title, lead: a.description })}      <p class="byline">${esc(a.author)} · ${a.published_date} · ${esc(hub.label)} · ${readingTime(body)} phút đọc</p>
      <div class="blog-summary" role="note">
        <p class="blog-summary-title">Tóm tắt nhanh</p>
        <p>${esc(a.description)}</p>
      </div>
      <div class="blog-article-layout">
${toc.markup}        <article class="blog-article-body">
  ${bodyWithIds.trim().split('\n').join('\n  ')}
        </article>
      </div>
${topicContext}${relatedSection}${hubClusterFooter(cluster)}${askAgentAction(a.title)}`;

  const html = appShellPage({
    title: a.title,
    description: a.description,
    path,
    screen: `article-${a.slug}`,
    activeHub: hub.dir,
    activeCluster: cluster.dir,
    contentHtml: content,
    schemaHtml: `  <script type="application/ld+json">
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
      itemListElement: breadcrumbSchema.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: b.item }))
    })}
  </script>
`
  });
  write(`blog/${hub.dir}/${a.slug}/index.html`, html);
}

/** Legal/static screens (privacy, terms, about, policy, contact, price) —
 *  same shell, same source of truth. */
function buildLegal({ dir, title, description, bodyPath, screen, business }) {
  const body = resolveFacts(read(bodyPath), business ?? JSON.parse(read('data/business/business.json')));
  const content = breadcrumb([CRUMB_HOME, { label: title, href: null }])
    + screenHead({ label: 'MotoAI', title, lead: description })
    + `      <div class="blog-grid blog-legal-grid">
${body.trim().split('\n').join('\n')}
      </div>
${askAgentAction(title)}`;
  const html = appShellPage({
    title: `${title} — MotoAI`,
    description,
    path: `${dir}/`,
    screen,
    activeHub: dir,
    contentHtml: content,
    schemaHtml: `  <script type="application/ld+json">
${jsonLd({
      '@context': 'https://schema.org', '@type': 'WebPage',
      name: title, description, url: `${SITE}${dir}/`,
      isPartOf: { '@type': 'WebSite', name: 'MotoAI', url: SITE }
    })}
  </script>
`
  });
  write(`${dir}/index.html`, html);
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
  const matrix = matrixRows();
  // v66 chunk contract: the MATRIX decides what is published — a manifest
  // draft whose row is not PUBLISHED yet (QA/REPAIR in-flight draft of
  // a chunk, or a backlog draft from a dead workflow) must NOT be built,
  // indexed or matrix-synced by this build. The factory marks rows
  // PUBLISHED before calling build(), so this changes nothing for the
  // happy path.
  const published = manifest.articles
    .filter((a) => matrix[a.article_id]?.status === 'PUBLISHED');
  const updated = published.reduce((m, a) => a.published_date > m ? a.published_date : m, '2026-09-26');

  buildHome(published);
  for (const cluster of taxonomy.clusters) buildClusterHub(cluster, published);
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

  // Legal screens — inside the SAME app shell (v57).
  buildLegal({
    dir: 'privacy', screen: 'legal-privacy',
    title: 'Chính sách bảo mật',
    description: 'Chính sách bảo mật của MotoAI: dữ liệu lưu ở đâu, Agent chạy thế nào, liên kết ngoài và cách liên hệ.',
    bodyPath: 'data/legal/privacy.body.html'
  });
  buildLegal({
    dir: 'terms', screen: 'legal-terms',
    title: 'Điều khoản sử dụng',
    description: 'Điều khoản sử dụng MotoAI: nội dung tham khảo, xác nhận thông tin quan trọng và trách nhiệm khi sử dụng.',
    bodyPath: 'data/legal/terms.body.html'
  });

  // Static screens — same shell, verified facts only (v58).
  buildLegal({
    dir: 'gioi-thieu', screen: 'about',
    title: 'Giới thiệu',
    description: 'Giới thiệu MotoAI: thuê xe máy Hà Nội Nguyễn Tú, Agent hỗ trợ, phạm vi phục vụ và cách liên hệ.',
    bodyPath: 'data/site/gioi-thieu.body.html', business
  });
  buildLegal({
    dir: 'chinh-sach', screen: 'policy',
    title: 'Chính sách dịch vụ & thuê xe',
    description: 'Chính sách thuê xe: giờ hoạt động, đặt cọc, giao nhận xe, giấy tờ và xác nhận trước khi đặt.',
    bodyPath: 'data/site/chinh-sach.body.html', business
  });
  buildLegal({
    dir: 'lien-he', screen: 'contact',
    title: 'Liên hệ',
    description: 'Liên hệ Thuê Xe Máy Hà Nội Nguyễn Tú: điện thoại, WhatsApp, bản đồ và Agent hỗ trợ.',
    bodyPath: 'data/site/lien-he.body.html', business
  });
  buildPrice(business);

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
    ...taxonomy.clusters.map((c) => `${SITE}blog/${c.dir}/`),
    ...HUBS.map((h) => `${SITE}blog/${h.dir}/`),
    ...subtopicPages.map((p) => `${SITE}${p}`),
    ...published.map((a) => `${SITE}blog/${HUB_BY_ID[a.category].dir}/${a.slug}/`),
    `${SITE}privacy/`, `${SITE}terms/`,
    `${SITE}gioi-thieu/`, `${SITE}chinh-sach/`, `${SITE}lien-he/`, `${SITE}gia-thue/`];
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
      const a = published.find((x) => x.article_id === cols[0]);
      cols[3] = 'PUBLISHED';
      cols[21] = a.published_date;
      cols[22] = updated;
      // v64: only pilot/fixture articles get the pilot note; factory
      // production articles keep notes empty (they are not fixtures).
      if (cols[23] === '' && a.pilot) cols[23] = 'pilot/fixture';
      csv[i] = cols.join(',');
    }
  }
  write('data/blog/content-matrix.csv', csv.join('\n'));
  console.log(`blog built: ${published.length} published articles, ${subtopicPages.length} subtopic hubs, ${urls.length} sitemap urls`);
}

/**
 * Giá thuê screen (/gia-thue/): renders ONLY verified pricing.json data.
 * No invented prices, no fabricated deposit — unverified cells show the
 * "confirm with the owner" note instead of a number.
 */
const hasRate = (r) => r && (r.min != null || r.max != null);
const rate = (r) => {
  if (!r || (r.min == null && r.max == null)) return null;
  if (r.min != null && r.max != null && r.min !== r.max) return `${r.min.toLocaleString('vi-VN')}đ – ${r.max.toLocaleString('vi-VN')}đ`;
  const v = r.min ?? r.max;
  return `${v.toLocaleString('vi-VN')}đ`;
};

function buildPrice(business) {
  const pricing = JSON.parse(read('data/business/pricing.json'));
  const rows = pricing.vehicles
    .slice()
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .map((v) => {
      const cells = pricing.rental_types.map((rt) => {
        const r = rate(v.rates[rt.id]);
        return `<td>${r ?? 'Xác nhận trực tiếp'}</td>`;
      }).join('');
      return `        <tr>
          <th scope="row">${esc(v.name)}<span class="blog-price-note">${esc(v.category)}</span></th>
${cells}
        </tr>`;
    }).join('\n');
  const head = pricing.rental_types.map((rt) => `              <th scope="col">${esc(rt.name)}</th>`).join('\n');
  const content = breadcrumb([CRUMB_HOME, { label: 'Giá thuê', href: null }])
    + screenHead({
      label: 'Dịch vụ',
      title: 'Bảng giá thuê xe',
      lead: 'Giá tham khảo theo loại xe và thời gian thuê. Giá thực tế và tiền cọc được xác nhận trực tiếp trước khi đặt xe.'
    })
    + `      <div class="table-wrap">
        <table class="blog-table">
          <caption class="visually-hidden">Bảng giá thuê xe theo ngày, tuần và tháng</caption>
          <thead>
            <tr>
              <th scope="col">Xe</th>
${head}
            </tr>
          </thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>
      <div class="blog-summary" role="note">
        <p class="blog-summary-title">Lưu ý</p>
        <p>${esc(pricing.disclaimer)}</p>
        <p>${esc(business.policies.deposit.note)}</p>
      </div>
${askAgentAction('giá thuê xe')}`;

  const html = appShellPage({
    title: 'Bảng giá thuê xe máy & xe điện — MotoAI',
    description: 'Bảng giá thuê xe máy và xe điện theo ngày, tuần, tháng. Giá tham khảo, xác nhận trực tiếp trước khi đặt xe.',
    path: 'gia-thue/',
    screen: 'price',
    activeHub: 'gia-thue',
    contentHtml: content,
    schemaHtml: `  <script type="application/ld+json">
${jsonLd({
      '@context': 'https://schema.org', '@type': 'WebPage',
      name: 'Bảng giá thuê xe', description: pricing.disclaimer, url: `${SITE}gia-thue/`,
      isPartOf: { '@type': 'WebSite', name: 'MotoAI', url: SITE }
    })}
  </script>
`
  });
  write('gia-thue/index.html', html);
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
