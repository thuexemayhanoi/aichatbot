#!/usr/bin/env node
/**
 * MotoAI SINGLE APP SHELL (v57) — the ONE source of truth for every
 * generated content screen (blog home, category hub, subtopic hub,
 * article, paginated hub pages, legal screens).
 *
 * The chat app (index.html) stays the permanent shell of the product:
 *   TOP AREA   = Hỗ trợ Agent identity + address/status + theme + Menu
 *   MAIN       = screen-specific content (only this slot changes)
 *   BOTTOM     = the same 4-item MotoAI dock
 *   DRAWER     = the same menu, built from config/navigation.json
 *
 * SEO URLs stay normal crawlable URLs — every page consumes THIS shell,
 * so a category or article opens INSIDE the app, never as a separate
 * blog-style website with its own chrome.
 *
 * Navigation/footer vocabulary comes from config/navigation.json via
 * tools/taxonomy.mjs — labels are never copy/pasted per page.
 */
import { navigation, taxonomy } from './taxonomy.mjs';

export const SITE = 'https://thuexemayhanoi.github.io/aichatbot/';

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
  <link rel="stylesheet" href="${prefix}assets/css/style.css">
  <link rel="stylesheet" href="${prefix}assets/css/blog.css">
  ${NO_FLASH_THEME}
</head>
<body>
`;
}

/**
 * Top chrome — IDENTICAL structure to the chat homepage header:
 * identity (tapping it returns to the Agent home screen), verified
 * address, open/closed status line, theme toggle, Menu button.
 */
function shellHeader({ screen }) {
  return `    <header class="motoai-header">
      <a class="motoai-header-text" href="/aichatbot/" aria-label="Về màn hình Agent">
        <div class="motoai-brand-mark" aria-hidden="true">🏍️</div>
        <div>
          <p class="motoai-title">Hỗ trợ Agent</p>
          <p class="motoai-subtitle">112 Nguyễn Văn Cừ, Long Biên, Hà Nội · Cẩm nang</p>
        </div>
      </a>
      <span class="motoai-status" id="blog-business-status" role="status" aria-live="polite" hidden></span>
      <button type="button" class="blog-theme-toggle" id="blog-theme-toggle" aria-label="Chủ đề: tự động" title="Chủ đề: Auto → Sáng → Tối">Auto</button>
      <button type="button" class="motoai-menu" id="motoai-menu-btn" title="Mở menu" aria-label="Mở menu" aria-expanded="false" aria-controls="motoai-drawer" data-screen="${esc(screen)}">☰ <span class="motoai-menu-label">Menu</span></button>
    </header>
`;
}

/**
 * Bottom dock — the SAME 4-item navigation as the chat homepage.
 * Chat actions (Liên hệ / Giá thuê) become links that return to the
 * home screen with the action parameter; the home app runs the flow.
 */
function shellDock({ activeScreen }) {
  const isServices = activeScreen === 'thue-xe';
  return `    <nav class="motoai-dock" id="motoai-dock" aria-label="Điều hướng nhanh">
      <a class="motoai-dock-item"${isServices ? ' aria-current="page"' : ''} href="/aichatbot/blog/thue-xe/"><span class="motoai-dock-icon" aria-hidden="true">🛵</span><span>Dịch vụ</span></a>
      <a class="motoai-dock-item" href="/aichatbot/?action=contact"><span class="motoai-dock-icon" aria-hidden="true">☎️</span><span>Liên hệ</span></a>
      <a class="motoai-dock-item" href="/aichatbot/?action=price"><span class="motoai-dock-icon" aria-hidden="true">💰</span><span>Giá thuê</span></a>
      <a class="motoai-dock-item" data-contact-ref="map" href="#" rel="noopener noreferrer" target="_blank"><span class="motoai-dock-icon" aria-hidden="true">🗺️</span><span>Bản đồ</span></a>
    </nav>
`;
}

/**
 * Menu drawer — same structure as the chat homepage drawer, same labels
 * from config/navigation.json. Actions (price/address/contact) link
 * back to the home screen with the action parameter; contact refs are
 * resolved at runtime from verified business.json.
 */
function shellDrawer({ activeHub }) {
  const cmItems = [...navigation.categories.map((c) => {
    const dir = taxonomy.categories[c.id].dir;
    const active = dir === activeHub ? ' aria-current="page"' : '';
    return `          <li><a href="/aichatbot/blog/${dir}/"${active}>${c.icon} ${esc(c.label)}</a></li>`;
  }), `          <li><a href="${navigation.search.url}">${navigation.search.icon} ${esc(navigation.search.label)}</a></li>`].join('\n');
  const dvItems = navigation.services.map((s) => {
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

/** Compact SEO footer (config/navigation.json) — lives at the END of the
 *  screen content, clearly inside the MotoAI app, never another site chrome. */
export function footerHtml() {
  const groups = navigation.footer_groups.map((g) => {
    const links = g.items.map((item) => {
      if (item.ref) {
        return `          <li><a data-contact-ref="${esc(item.ref)}" href="/aichatbot/">${esc(item.label)}</a></li>`;
      }
      return `          <li><a href="${item.url}">${esc(item.label)}</a></li>`;
    }).join('\n');
    return `      <div class="blog-footer-col">
        <p class="blog-footer-title">${esc(g.title)}</p>
        <ul>
${links}
        </ul>
      </div>`;
  }).join('\n');
  return `    <footer class="blog-footer">
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
  return (search ? `  <script src="/aichatbot/assets/js/blog.js"></script>\n` : '')
    + `  <script type="module" src="/aichatbot/assets/js/app-shell.js"></script>
`;
}

/**
 * Compose one full content-screen page inside the single app shell.
 * @param {object} o
 * @param {string} o.title / o.description / o.path — SEO head values
 * @param {string} o.screen — screen id (chat-home sibling), used for stats
 * @param {string} o.activeHub — active category dir (drawer/dock state)
 * @param {string} o.contentHtml — the MAIN VIEWPORT slot (screen body)
 * @param {string} o.schemaHtml — JSON-LD scripts (placed before closing body)
 * @param {boolean} o.search — include the blog search runtime (blog home only)
 */
export function appShellPage({ title, description, path, screen, activeHub = null, contentHtml, schemaHtml = '', search = false }) {
  return pageHead({ title, description, path })
    + `  <main class="motoai-shell motoai-shell-content">
    <section class="motoai-app motoai-screen" id="motoai-app" data-motoai-screen="${esc(screen)}">
${shellHeader({ screen })}
      <section class="motoai-screen-body" id="motoai-screen-body">
${contentHtml}
      </section>
${shellDock({ activeScreen: activeHub })}
    </section>
  </main>
${shellDrawer({ activeHub })}
${schemaHtml}
${shellScripts({ search })}</body>
</html>
`;
}
