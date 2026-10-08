#!/usr/bin/env node
/**
 * MotoAI CONTENT SITE SHELL (v63) — the ONE source of truth for every
 * generated content page (blog home, parent cluster hubs, category hubs,
 * subtopic hubs, articles, search, static pages, privacy, terms).
 *
 * Product model (final):
 *   /        = CHAT HOMEPAGE — the app screen (own shell in
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
 * v63: the drawer is rendered from taxonomy.drawerCore() (the SAME core
 * menu the chat homepage must match) and the footer gains a brand block +
 * verified business bottom bar (data/business/business.json).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { navigation, taxonomy, clusterNav, drawerCore } from './taxonomy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUSINESS = JSON.parse(readFileSync(join(ROOT, 'data/business/business.json'), 'utf8'));

import { SITE } from '../src/config/site.js';
export { SITE };

/** Build/cache version: bumped every release that changes shell CSS/JS so
 *  iOS Safari can never keep serving a stale v62 asset. */
export const BUILD_VERSION = 'v66';

/** Escape & for HTML text/attribute contexts (titles, descriptions, names). */
export const esc = (s) => String(s).replace(/&(?![a-z]+;|#)/gi, '&amp;');

/** Relative asset prefix from a page path back to repo root. */
export function rel(path) {
  const depth = path.replace(/^\/|\/$/g, '').split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

const NO_FLASH_THEME = `<script>/* apply saved theme before first paint (no flash) */(function(){try{var t=localStorage.getItem('motoai-theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.setAttribute('data-motoai-theme','dark');}}catch(e){}})();</script>`;

/** <head> block — same meta contract as the chat homepage. */
export function pageHead({ title, description, path, ogType = 'website' }) {
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
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="MotoAI — Cẩm nang thuê xe máy & xe điện">
  <meta property="og:locale" content="vi_VN">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}assets/icons/icon-512.png">
  <meta property="og:image:width" content="512">
  <meta property="og:image:height" content="512">
  <meta property="og:image:alt" content="MotoAI — Trợ lý thuê xe máy">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${SITE}assets/icons/icon-512.png">
  <link rel="stylesheet" href="${prefix}assets/css/style.css?v=66">
  <link rel="stylesheet" href="${prefix}assets/css/blog.css?v=66">
  ${NO_FLASH_THEME}
</head>
<body class="content-page">
`;
}

/**
 * Shared content-site header. LEFT: MotoAI / Hỗ trợ Agent identity (link
 * back to the chat homepage). CENTER (>= 900px): Cẩm nang + the six
 * categories. RIGHT: search, theme toggle and Menu — always the LAST
 * element of the .site-actions group (flex margin-left:auto keeps the
 * group right-aligned). The business open/closed status is a SEPARATE
 * flex child of .site-header-inner AFTER .site-actions: on mobile it
 * wraps onto its own full-width row under the header (v63 iPhone fix —
 * it can never squeeze itself between the brand and the Menu button),
 * on desktop it is a small muted line next to the actions.
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
      `            <a href="/blog/${ch.dir}/"${ch.dir === activeHub ? ' aria-current="page"' : ''}>${ch.icon} ${esc(ch.label)}</a>`).join('\n');
    return `        <div class="site-nav-item"${hubActive ? ' data-active="1"' : ''}>
          <a class="site-nav-parent" href="${hub.url}" aria-haspopup="true"${hubActive ? ' aria-current="page"' : ''}>${hub.icon} ${esc(hub.name)} <span class="site-nav-caret" aria-hidden="true">▾</span></a>
          <div class="site-nav-drop">
${kids}
          </div>
        </div>`;
  }).join('\n');
  return `    <header class="site-header">
      <div class="site-header-inner">
        <a class="site-brand" href="/" aria-label="MotoAI — về màn hình Agent">
          <span class="site-brand-mark" aria-hidden="true">🏍️</span>
          <span class="site-brand-text">
            <strong>MotoAI</strong>
            <span>Hỗ trợ Agent</span>
          </span>
        </a>
        <nav class="site-nav" aria-label="Chuyên mục">
          <a href="/blog/"${activeCluster === null && activeHub === null ? ' aria-current="page"' : ''}>Cẩm nang</a>
${hubItems}
        </nav>
        <div class="site-actions">
          <a class="site-search-link" href="/blog/#blog-search" aria-label="Tìm bài" title="Tìm bài">🔎</a>
          <button type="button" class="blog-theme-toggle" id="blog-theme-toggle" aria-label="Chủ đề: tự động" title="Chủ đề: Auto → Sáng → Tối">Auto</button>
          <button type="button" class="motoai-menu" id="motoai-menu-btn" title="Mở menu" aria-label="Mở menu" aria-expanded="false" aria-controls="motoai-drawer">☰ <span class="motoai-menu-label">Menu</span></button>
        </div>
        <span class="motoai-status" id="blog-business-status" role="status" aria-live="polite" hidden></span>
      </div>
    </header>
`;
}

/**
 * Menu drawer — rendered from config/navigation.json via taxonomy.drawerCore()
 * (v63): the SAME order/labels/icons/links/accordion structure as the chat
 * homepage drawer. Chat-only extras (divider + Xóa chat) are intentionally
 * NOT rendered here. Actions link to real pages or open the Agent flow;
 * contact refs are resolved at runtime from verified business.json.
 */
function siteDrawer({ activeHub, activeCluster }) {
  const isActiveLink = (url) => {
    const dir = url.replace(/^\/(?:blog\/)?/, '').replace(/\/$/, '');
    return dir === activeHub || dir === activeCluster;
  };
  const renderItem = (item, indent = '          ') => {
    const current = item.kind === 'link' && isActiveLink(item.url) ? ' aria-current="page"' : '';
    if (item.kind === 'theme') {
      return `${indent}<li><button type="button" class="blog-theme-toggle motoai-drawer-theme" aria-label="Chủ đề: tự động">${item.icon} ${esc(item.label)}: Auto</button></li>`;
    }
    if (item.kind === 'hub') {
      const hubActive = item.url.replace(/^\/blog\//, '').replace(/\/$/, '') === activeCluster
        || item.children.some((ch) => ch.url.replace(/^\/blog\//, '').replace(/\/$/, '') === activeHub);
      const kids = item.children.map((ch) =>
        `            <li><a href="${ch.url}"${ch.url.replace(/^\/blog\//, '').replace(/\/$/, '') === activeHub ? ' aria-current="page"' : ''}>${ch.icon} ${esc(ch.label)}</a></li>`).join('\n');
      return `${indent}<li class="motoai-hub">
${indent}  <a class="motoai-hub-link" href="${item.url}"${hubActive ? ' aria-current="page"' : ''}>${item.icon} ${esc(item.label)}</a>
${indent}  <ul class="motoai-hub-items">
${kids}
${indent}  </ul>
${indent}</li>`;
    }
    if (item.kind === 'action') {
      return `${indent}<li><a href="/?action=${esc(item.action)}">${item.icon} ${esc(item.label)}</a></li>`;
    }
    if (item.kind === 'contact') {
      return `${indent}<li><a data-contact-ref="${esc(item.ref)}" href="#" rel="noopener noreferrer" target="_blank">${item.icon} ${esc(item.label)}</a></li>`;
    }
    return `${indent}<li><a href="${item.url}"${current}>${item.icon} ${esc(item.label)}</a></li>`;
  };
  const listHtml = drawerCore().map((entry) => {
    if (entry.kind === 'group') {
      return `      <li class="motoai-group">
        <button type="button" class="motoai-group-btn" aria-expanded="false" aria-controls="motoai-group-${entry.id}">${entry.icon} ${esc(entry.label)} <span class="motoai-caret" aria-hidden="true">▾</span></button>
        <ul class="motoai-group-items" id="motoai-group-${entry.id}" hidden>
${entry.children.map((child) => renderItem(child)).join('\n')}
        </ul>
      </li>`;
    }
    return renderItem(entry, '      ');
  }).join('\n');
  return `  <div class="motoai-drawer-backdrop" id="motoai-drawer-backdrop" hidden></div>
  <nav class="motoai-drawer" id="motoai-drawer" aria-label="Menu" hidden>
    <div class="motoai-drawer-head">
      <strong>MotoAI</strong>
      <button type="button" class="motoai-drawer-close" id="motoai-drawer-close" aria-label="Đóng menu">✕</button>
    </div>
    <ul class="motoai-drawer-list">
${listHtml}
    </ul>
  </nav>
`;
}

/** Real site footer (v63): brand block (🏍️ MotoAI · Hỗ trợ Agent + short
 *  description + ⚡ Hỏi Agent CTA), link columns from
 *  config/navigation.json (column 1 = MOTOAI, columns 2–4 = each parent
 *  hub + its child categories expanded from taxonomy.json via the "hub"
 *  field, then a compact secondary row for Dịch vụ + Pháp lý) and a
 *  verified business bottom bar (address + hours from
 *  data/business/business.json — never hard-coded, never 24/7).
 *  Every entry is a real crawlable <a>. */
export function footerHtml() {
  const primary = [];
  const secondary = [];
  for (const g of navigation.footer_groups) {
    if (g.hub) {
      const hub = clusterNav(g.hub);
      const kids = hub.children.map((ch) =>
        `            <li class="footer-sub"><a href="/blog/${ch.dir}/">${esc(ch.label)}</a></li>`).join('\n');
      primary.push(`      <div class="blog-footer-col">
        <p class="blog-footer-title">${esc(hub.name)}</p>
        <ul>
          <li><a class="footer-hub-link" href="${hub.url}">${hub.icon} ${esc(hub.name)}</a></li>
${kids}
        </ul>
      </div>`);
    } else if (g.title === 'DỊCH VỤ' || g.title === 'PHÁP LÝ') {
      const links = g.items.map((item) => {
        if (item.ref) return `          <li><a data-contact-ref="${esc(item.ref)}" href="/">${esc(item.label)}</a></li>`;
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
  const brand = BUSINESS.brand;             // "Nguyễn Tú" — verified business.json
  const address = BUSINESS.address.full;     // "112 Nguyễn Văn Cừ, Long Biên, Hà Nội"
  const hours = BUSINESS.hours.display;      // "09:00 - 21:00"
  return `    <footer class="blog-footer">
      <div class="blog-footer-inner">
        <div class="blog-footer-brand">
          <p class="blog-footer-brand-name"><span aria-hidden="true">🏍️</span> <strong>MotoAI</strong> <span class="blog-footer-agent">· Hỗ trợ Agent</span></p>
          <p class="blog-footer-desc">Cẩm nang thuê xe máy &amp; xe điện — Thuê xe máy Hà Nội ${esc(brand)}</p>
          <a class="blog-footer-cta" href="/">⚡ Hỏi Agent</a>
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
      <div class="blog-footer-bottom">
        <p>Thuê xe máy ${esc(brand)} · ${esc(address)}</p>
        <p>${esc(hours)} mỗi ngày</p>
      </div>
    </footer>
`;
}

/** Native "Ask Agent" action: returns to the HOME chat screen with the
 *  topic prefilled. Never a giant multi-button marketing CTA box. */
export function askAgentAction(topic) {
  const q = encodeURIComponent(topic);
  return `    <div class="screen-ask">
      <a class="screen-ask-btn" href="/?ask=${q}">⚡ Hỏi Agent về chủ đề này</a>
    </div>
`;
}

function shellScripts({ search }) {
  return (search ? `  <script src="/assets/js/blog.js?v=66"></script>\n` : '')
    + `  <script type="module" src="/assets/js/app-shell.js?v=66"></script>\n`;
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
export function appShellPage({ title, description, path, screen, activeHub = null, activeCluster = null, contentHtml, schemaHtml = '', search = false, ogType = 'website' }) {
  return pageHead({ title, description, path, ogType })
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
