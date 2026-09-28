#!/usr/bin/env node
/**
 * MotoAI CONTENT SITE SHELL (v58) — the ONE source of truth for every
 * generated content page (blog home, parent cluster hubs, category hubs,
 * subtopic hubs, articles, search, static pages, privacy, terms).
 *
 * Product model (final):
 *   /aichatbot/        = CHAT HOMEPAGE — the app screen (own shell in
 *                        index.html, no footer, Menu on the right).
 *   every other page   = NORMAL professional content website page that
 *                        consumes THIS shell: compact site header
 *                        (identity left, category nav center on desktop,
 *                        search/theme/Menu RIGHT), main content column and
 *                        a real footer generated from config/navigation.json.
 * Same brand, colors, typography, theme tokens — different page purpose.
 * No chat dock, no chat-window look on content pages.
 *
 * Navigation/footer vocabulary comes from config/navigation.json via
 * tools/taxonomy.mjs — labels are never copy/pasted per page.
 */
import { navigation, taxonomy, clusterNav } from './taxonomy.mjs';

export const SITE = 'https://thuexemayhanoi.github.io/aichatbot/';

/** Build/cache version: bumped every release that changes shell CSS/JS so
 *  iOS Safari can never keep serving a stale v58/v59 asset. */
export const BUILD_VERSION = 'v62';

/** Escape & for HTML text/attribute contexts (titles, descriptions, names). */
export const esc = (s) => String(s).replace(/&(?![a-z]+;|#)/gi, '&amp;');

/** Relative asset prefix from a page path back to repo root. */
export function rel(path) {
  const depth = path.replace(/^\/|\/$/g, '').split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

const NO_FLASH_THEME = `<script>/* apply saved theme before first paint (no flash) */(function(){try{var t=localStorage.getItem('motoai-theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.setAttribute('data-motoai-theme','dark');}}catch(e){}})();</script>`;

/** <head> block — same meta contract as the chat homepage. */
export function pageHead({ title, description, path }) {
  const url = SITE + path.replace(/^\//, '');
  const prefix = rel(path);
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="motoai-build" content="${BUILD_VERSION}">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta name="theme-color" content="#4f46e5">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MotoAI — Cẩm nang thuê xe máy & xe điện">
  <meta property="og:locale" content="vi_VN">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <link rel="stylesheet" href="${prefix}assets/css/style.css?v=60">
  <link rel="stylesheet" href="${prefix}assets/css/blog.css?v=62">
  ${NO_FLASH_THEME}
</head>
<body class="content-page">
`;
}

/**
 * Shared content-site header. LEFT: MotoAI / Hỗ trợ Agent identity (link
 * back to the chat homepage). CENTER (>= 900px): Cẩm nang + the six
 * categories. RIGHT: search, theme toggle and Menu — always the LAST
 * element on the row (flex margin-left:auto keeps it right-aligned).
 */
function siteHeader({ activeHub, activeCluster }) {
  // v61: the desktop menu prioritizes the 3 PARENT SEO HUBS. Each parent
  // label is a REAL crawlable <a>; its child categories live in a glass
  // dropdown opened by CSS :hover/:focus-within plus a small touch toggle
  // (app-shell.js). activeHub = category dir; a child page also highlights
  // its parent hub (activeCluster or child match).
  const hubItems = taxonomy.clusters.map((c) => {
    const hub = clusterNav(c.id);
    const hubActive = c.dir === activeCluster || hub.children.some((ch) => ch.dir === activeHub);
    const kids = hub.children.map((ch) =>
      `            <a href="/aichatbot/blog/${ch.dir}/"${ch.dir === activeHub ? ' aria-current="page"' : ''}>${ch.icon} ${esc(ch.label)}</a>`).join('\n');
    return `        <div class="site-nav-item"${hubActive ? ' data-active="1"' : ''}>
          <a class="site-nav-parent" href="${hub.url}" aria-haspopup="true"${hubActive ? ' aria-current="page"' : ''}>${hub.icon} ${esc(hub.name)} <span class="site-nav-caret" aria-hidden="true">▾</span></a>
          <div class="site-nav-drop">
${kids}
          </div>
        </div>`;
  }).join('\n');
  return `    <header class="site-header">
      <div class="site-header-inner">
        <a class="site-brand" href="/aichatbot/" aria-label="MotoAI — về màn hình Agent">
          <span class="site-brand-mark" aria-hidden="true">🏍️</span>
          <span class="site-brand-text">
            <strong>MotoAI</strong>
            <span>Hỗ trợ Agent</span>
          </span>
        </a>
        <nav class="site-nav" aria-label="Chuyên mục">
          <a href="/aichatbot/blog/"${activeCluster === null && activeHub === null ? ' aria-current="page"' : ''}>Cẩm nang</a>
${hubItems}
        </nav>
        <div class="site-actions">
          <span class="motoai-status" id="blog-business-status" role="status" aria-live="polite" hidden></span>
          <a class="site-search-link" href="/aichatbot/blog/#blog-search" aria-label="Tìm bài" title="Tìm bài">🔎</a>
          <button type="button" class="blog-theme-toggle" id="blog-theme-toggle" aria-label="Chủ đề: tự động" title="Chủ đề: Auto → Sáng → Tối">Auto</button>
          <button type="button" class="motoai-menu" id="motoai-menu-btn" title="Mở menu" aria-label="Mở menu" aria-expanded="false" aria-controls="motoai-drawer">☰ <span class="motoai-menu-label">Menu</span></button>
        </div>
      </div>
    </header>
`;
}

/**
 * Menu drawer — same structure and labels as the chat homepage drawer
 * (config/navigation.json). Actions link to real pages or open the Agent
 * flow; contact refs are resolved at runtime from verified business.json.
 */
function siteDrawer({ activeHub, activeCluster }) {
  // v61: Cẩm nang = the SAME parent-hub → category hierarchy as the desktop
  // menu. Parent hubs are real links; children sit directly underneath
  // (no second accordion level), each with a >= 44px touch target.
  const cmItems = [...taxonomy.clusters.map((c) => {
    const hub = clusterNav(c.id);
    const hubActive = c.dir === activeCluster || hub.children.some((ch) => ch.dir === activeHub);
    const kids = hub.children.map((ch) =>
      `            <li><a href="/aichatbot/blog/${ch.dir}/"${ch.dir === activeHub ? ' aria-current="page"' : ''}>${ch.icon} ${esc(ch.label)}</a></li>`).join('\n');
    return `          <li class="motoai-hub">
            <a class="motoai-hub-link" href="${hub.url}"${hubActive ? ' aria-current="page"' : ''}>${hub.icon} ${esc(hub.name)}</a>
            <ul class="motoai-hub-items">
${kids}
            </ul>
          </li>`;
  }), `          <li><a href="${navigation.search.url}">${navigation.search.icon} ${esc(navigation.search.label)}</a></li>`].join('\n');
  const dvItems = navigation.services.map((s) => {
    if (s.url) return `          <li><a href="${s.url}">${s.icon} ${esc(s.label)}</a></li>`;
    if (s.action) return `          <li><a href="/aichatbot/?action=${esc(s.action)}">${s.icon} ${esc(s.label)}</a></li>`;
    return `          <li><a data-contact-ref="${esc(s.ref)}" href="#" rel="noopener noreferrer" target="_blank">${s.icon} ${esc(s.label)}</a></li>`;
  }).join('\n');
  const plItems = navigation.legal.map((l) =>
    `          <li><a href="${l.url}"${activeHub === l.url.replace(/^\/aichatbot\//, '').replace(/\/$/, '') ? ' aria-current="page"' : ''}>${l.icon} ${esc(l.label)}</a></li>`).join('\n');
  return `  <div class="motoai-drawer-backdrop" id="motoai-drawer-backdrop" hidden></div>
  <nav class="motoai-drawer" id="motoai-drawer" aria-label="Menu" hidden>
    <div class="motoai-drawer-head">
      <strong>MotoAI</strong>
      <button type="button" class="motoai-drawer-close" id="motoai-drawer-close" aria-label="Đóng menu">✕</button>
    </div>
    <ul class="motoai-drawer-list">
      <li><a href="/aichatbot/">⚡ Agent</a></li>
      <li><a href="${navigation.about.url}">${navigation.about.icon} ${esc(navigation.about.label)}</a></li>
      <li><button type="button" class="blog-theme-toggle motoai-drawer-theme" aria-label="Chủ đề: tự động">🌗 Chủ đề: Auto</button></li>
      <li class="motoai-group">
        <button type="button" class="motoai-group-btn" aria-expanded="false" aria-controls="motoai-group-cm">📚 Cẩm nang <span class="motoai-caret" aria-hidden="true">▾</span></button>
        <ul class="motoai-group-items" id="motoai-group-cm" hidden>
${cmItems}
        </ul>
      </li>
      <li class="motoai-group">
        <button type="button" class="motoai-group-btn" aria-expanded="false" aria-controls="motoai-group-dv">🛵 Dịch vụ <span class="motoai-caret" aria-hidden="true">▾</span></button>
        <ul class="motoai-group-items" id="motoai-group-dv" hidden>
${dvItems}
        </ul>
      </li>
      <li class="motoai-group">
        <button type="button" class="motoai-group-btn" aria-expanded="false" aria-controls="motoai-group-pl">🔒 Pháp lý <span class="motoai-caret" aria-hidden="true">▾</span></button>
        <ul class="motoai-group-items" id="motoai-group-pl" hidden>
${plItems}
        </ul>
      </li>
    </ul>
  </nav>
`;
}

/** Real site footer (v61 SEO hub silo): column 1 = MotoAI, columns 2–4 =
 *  each parent hub + its child categories (expanded from taxonomy.json via
 *  the "hub" field in navigation.footer_groups), then a compact secondary
 *  row for Dịch vụ + Pháp lý. Every entry is a real crawlable <a>. */
export function footerHtml() {
  const primary = [];
  const secondary = [];
  for (const g of navigation.footer_groups) {
    if (g.hub) {
      const hub = clusterNav(g.hub);
      const kids = hub.children.map((ch) =>
        `            <li class="footer-sub"><a href="/aichatbot/blog/${ch.dir}/">${esc(ch.label)}</a></li>`).join('\n');
      primary.push(`      <div class="blog-footer-col">
        <p class="blog-footer-title">${esc(hub.name)}</p>
        <ul>
          <li><a class="footer-hub-link" href="${hub.url}">${hub.icon} ${esc(hub.name)}</a></li>
${kids}
        </ul>
      </div>`);
    } else if (g.title === 'DỊCH VỤ' || g.title === 'PHÁP LÝ') {
      const links = g.items.map((item) => {
        if (item.ref) return `          <li><a data-contact-ref="${esc(item.ref)}" href="/aichatbot/">${esc(item.label)}</a></li>`;
        return `          <li><a href="${item.url}">${esc(item.label)}</a></li>`;
      }).join('\n');
      secondary.push(`      <div class="blog-footer-col">
        <p class="blog-footer-title">${esc(g.title)}</p>
        <ul>
${links}
        </ul>
      </div>`);
    } else {
      const links = g.items.map((item) =>
        `          <li><a href="${item.url}">${esc(item.label)}</a></li>`).join('\n');
      primary.push(`      <div class="blog-footer-col">
        <p class="blog-footer-title">${esc(g.title)}</p>
        <ul>
${links}
        </ul>
      </div>`);
    }
  }
  return `    <footer class="blog-footer">
      <div class="blog-footer-inner">
        <div class="blog-footer-brand">
          <a class="blog-footer-agent" href="/aichatbot/">⚡ Agent</a>
          <p>Cẩm nang thuê xe máy &amp; xe điện — Thuê xe máy Hà Nội Nguyễn Tú</p>
        </div>
        <nav class="blog-footer-nav" aria-label="Chân trang">
${primary.join('\n')}
        </nav>
      </div>
      <div class="blog-footer-secondary">
        <nav class="blog-footer-nav" aria-label="Dịch vụ và pháp lý">
${secondary.join('\n')}
        </nav>
      </div>
    </footer>
`;
}

/** Native "Ask Agent" action: returns to the HOME chat screen with the
 *  topic prefilled. Never a giant multi-button marketing CTA box. */
export function askAgentAction(topic) {
  const q = encodeURIComponent(topic);
  return `    <div class="screen-ask">
      <a class="screen-ask-btn" href="/aichatbot/?ask=${q}">⚡ Hỏi Agent về chủ đề này</a>
    </div>
`;
}

function shellScripts({ search }) {
  return (search ? `  <script src="/aichatbot/assets/js/blog.js?v=62"></script>\n` : '')
    + `  <script type="module" src="/aichatbot/assets/js/app-shell.js?v=62"></script>\n`;
}

/**
 * Compose one full content page inside the shared content-site shell.
 * @param {object} o
 * @param {string} o.title / o.description / o.path — SEO head values
 * @param {string} o.screen — screen id (page stats)
 * @param {string} o.activeHub — active category dir (header/drawer state)
 * @param {string} o.contentHtml — the main content column
 * @param {string} o.schemaHtml — JSON-LD scripts (placed before closing body)
 * @param {boolean} o.search — include the blog search runtime (blog home only)
 */
export function appShellPage({ title, description, path, screen, activeHub = null, activeCluster = null, contentHtml, schemaHtml = '', search = false }) {
  return pageHead({ title, description, path })
    + siteHeader({ activeHub, activeCluster })
    + `  <main class="site-main" id="site-main" data-motoai-screen="${esc(screen)}">
${contentHtml}
  </main>
${footerHtml()}
${siteDrawer({ activeHub, activeCluster })}
${schemaHtml}
${shellScripts({ search })}</body>
</html>
`;
}
