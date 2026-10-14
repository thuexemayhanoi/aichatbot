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
export const BUILD_VERSION = 'v67';
/** Cache-bust suffix for shell assets (derived from BUILD_VERSION). */
const V = BUILD_VERSION.replace(/^v/, '');

/** Escape & for HTML text/attribute contexts (titles, descriptions, names). */
export const esc = (s) => String(s).replace(/&(?![a-z]+;|#)/gi, '&amp;');

/** Relative asset prefix from a page path back to repo root. */
export function rel(path) {
  const depth = path.replace(/^\/|\/$/g, '').split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

const NO_FLASH_THEME = `<script>/* apply saved theme before first paint (no flash) */(function(){try{var t=localStorage.getItem('motoai-theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.setAttribute('data-motoai-theme','dark');}}catch(e){}})();</script>`;

/** <head> block — same meta contract as the chat homepage. v67
 *  `noindex` (404 only): robots noindex, NO canonical / og:url, and
 *  root-absolute asset URLs (GitHub Pages serves 404.html at any path). */
export function pageHead({ title, description, path, ogType = 'website', noindex = false }) {
  const url = SITE + path.replace(/^\//, '');
  const prefix = noindex ? '/' : rel(path);
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="motoai-build" content="${BUILD_VERSION}">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
  <meta name="theme-color" content="#4f46e5">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="MotoAI — Cẩm nang thuê xe máy & xe điện">
  <meta property="og:locale" content="vi_VN">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
${noindex ? '' : `  <meta property="og:url" content="${url}">\n`}  <meta property="og:image" content="${SITE}assets/icons/icon-512.png">
  <meta property="og:image:width" content="512">
  <meta property="og:image:height" content="512">
  <meta property="og:image:alt" content="MotoAI — Trợ lý thuê xe máy">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${SITE}assets/icons/icon-512.png">
  <link rel="stylesheet" href="${prefix}assets/css/style.css?v=${V}">
  <link rel="stylesheet" href="${prefix}assets/css/blog.css?v=${V}">
  ${NO_FLASH_THEME}
</head>
<body class="content-page">
`;
}

/**
 * v67 build context, set ONCE per build by tools/build-blog.mjs:
 *   menu: { [clusterId]: { columns: [{ id, subtopics: [{ label, url }], featured: [{ title, url }] }] } }
 *   year: newest manifest published_date year (footer ©; deterministic —
 *         never the wall clock, so the CI diff gate stays green).
 * Without a context (unit tests, ad-hoc renders) the panel degrades to the
 * plain child-category links and the year to SITE_LAUNCH_YEAR. Panels and
 * the footer are cached so 40k pages cost string concatenation only.
 */
export const SITE_LAUNCH_YEAR = 2026;
let MENU = null;
let YEAR = SITE_LAUNCH_YEAR;
const PANEL_CACHE = new Map();
let FOOTER = null;
export function setBuildContext({ menu = null, year = SITE_LAUNCH_YEAR } = {}) {
  MENU = menu; YEAR = Math.max(SITE_LAUNCH_YEAR, Number(year) || SITE_LAUNCH_YEAR);
  PANEL_CACHE.clear(); FOOTER = null;
}

/** Mega panel for one parent hub — one column per child category: the
 *  category link, up to 3 subtopic hubs holding articles, 2 cornerstone
 *  guides. DIV-FREE on purpose: tests/unit/blog-hub-nav strips
 *  `<div class="site-nav-drop">…</div>` non-greedily to find the top-level
 *  links, so nothing but lists/links/paragraphs may live inside. */
function megaPanel(cluster, hub, activeHub) {
  const key = `${cluster.id}|${activeHub}`;
  if (PANEL_CACHE.has(key)) return PANEL_CACHE.get(key);
  const cols = hub.children.map((ch) => {
    const col = MENU?.[cluster.id]?.columns.find((c) => c.id === ch.id);
    const subs = (col?.subtopics ?? []).map((s) => `<li><a href="${s.url}">${esc(s.label)}</a></li>`).join('');
    const feat = (col?.featured ?? []).map((f) => `<li><a href="${f.url}">${esc(f.title)}</a></li>`).join('');
    return `<li class="site-mega-col"><a class="site-mega-head" href="/blog/${ch.dir}/"${ch.dir === activeHub ? ' aria-current="page"' : ''}>${ch.icon} ${esc(ch.label)}</a>`
      + (subs ? `<ul class="site-mega-links">${subs}</ul>` : '')
      + (feat ? `<p class="site-mega-label">Nổi bật</p><ul class="site-mega-links site-mega-feat">${feat}</ul>` : '')
      + '</li>';
  }).join('');
  const html = `<ul class="site-mega" id="site-mega-${cluster.id.toLowerCase()}">${cols}</ul>`;
  PANEL_CACHE.set(key, html);
  return html;
}

/**
 * Shared content-site header. LEFT: MotoAI / Hỗ trợ Agent identity (link
 * back to the chat homepage). CENTER (>= 900px): Cẩm nang + the 3 parent
 * hubs, each an APG "disclosure navigation with top-level links": the
 * parent <a> navigates, its sibling <button aria-expanded aria-controls>
 * opens the mega panel (CSS :hover/:focus-within open it too; app-shell.js
 * handles Escape, outside click and aria sync). RIGHT: search, theme
 * toggle and Menu — always the LAST element of the .site-actions group.
 * The business open/closed status is a SEPARATE flex child AFTER
 * .site-actions inside a RESERVED slot (v67: fixed row/width, so the chip
 * never shifts layout when it appears — no CLS in the sticky header): on
 * mobile it is its own full-width row under the controls (v63 iPhone
 * contract), on desktop a small muted line next to the actions.
 */
function siteHeader({ activeHub, activeCluster }) {
  const hubItems = taxonomy.clusters.map((c) => {
    const hub = clusterNav(c.id);
    const hubActive = c.dir === activeCluster || hub.children.some((ch) => ch.dir === activeHub);
    return `        <div class="site-nav-item"${hubActive ? ' data-active="1"' : ''}>
          <a class="site-nav-parent" href="${hub.url}"${hubActive ? ' aria-current="page"' : ''}><span class="site-nav-ico" aria-hidden="true">${hub.icon}</span> ${esc(hub.name)}</a>
          <button type="button" class="site-nav-toggle" aria-expanded="false" aria-controls="site-mega-${c.id.toLowerCase()}" aria-label="Mở danh mục ${esc(c.name)}"><span aria-hidden="true">▾</span></button>
          <div class="site-nav-drop">
            ${megaPanel(c, hub, activeHub)}
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
        <div class="site-status-slot"><span class="motoai-status" id="blog-business-status" role="status" aria-live="polite" hidden></span></div>
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

/** Mega footer (v67). Brand block (🏍️ MotoAI · Hỗ trợ Agent, short
 *  description, verified NAP in <address>: name/address/hours from
 *  data/business/business.json at build time, phone href resolved at
 *  runtime via data-contact-ref="call" — never a hard-coded tel:, never
 *  24/7 — and the ⚡ Hỏi Agent CTA); link columns from
 *  config/navigation.json (MOTOAI + each parent hub with its child
 *  categories from taxonomy.json via the "hub" field; 2 columns on phones,
 *  4 on desktop); a secondary Dịch vụ + Pháp lý row; and a bottom bar with
 *  the verified business line, © SITE_LAUNCH_YEAR[–newest content year]
 *  and back-to-top (#top = document top per the HTML spec, no JS).
 *  Identical on every page (same link set, ≤ 22 links) and built once. */
export function footerHtml() {
  if (FOOTER) return FOOTER;
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
  const brand = BUSINESS.brand;               // "Nguyễn Tú" — verified business.json
  const address = BUSINESS.address.full;       // "112 Nguyễn Văn Cừ, Bồ Đề, Long Biên, Hà Nội"
  const hours = BUSINESS.hours.display;        // "09:00 - 21:00"
  const years = YEAR > SITE_LAUNCH_YEAR ? `${SITE_LAUNCH_YEAR}–${YEAR}` : `${SITE_LAUNCH_YEAR}`;
  FOOTER = `    <footer class="blog-footer">
      <div class="blog-footer-inner">
        <div class="blog-footer-brand">
          <p class="blog-footer-brand-name"><span aria-hidden="true">🏍️</span> <strong>MotoAI</strong> <span class="blog-footer-agent">· Hỗ trợ Agent</span></p>
          <p class="blog-footer-desc">Cẩm nang thuê xe máy &amp; xe điện — Thuê xe máy Hà Nội ${esc(brand)}</p>
          <address class="blog-footer-nap">
            <strong>${esc(BUSINESS.display_name)}</strong>
            <span><span aria-hidden="true">📍</span> ${esc(address)}</span>
            <span><span aria-hidden="true">🕘</span> ${esc(hours)} mỗi ngày</span>
            <a data-contact-ref="call" href="/">📞 ${esc(BUSINESS.contact.phone_display)}</a>
          </address>
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
        <p>© ${years} MotoAI · ${esc(BUSINESS.display_name)}</p>
        <a class="blog-footer-top" href="#top">↑ Lên đầu trang</a>
      </div>
    </footer>
`;
  return FOOTER;
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
  return (search ? `  <script src="/assets/js/blog.js?v=${V}"></script>\n` : '')
    + `  <script type="module" src="/assets/js/app-shell.js?v=${V}"></script>\n`;
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
export function appShellPage({ title, description, path, screen, activeHub = null, activeCluster = null, contentHtml, schemaHtml = '', search = false, ogType = 'website', noindex = false }) {
  return pageHead({ title, description, path, ogType, noindex })
    + `  <a class="skip-link" href="#site-main">Bỏ qua đến nội dung chính</a>\n`
    + siteHeader({ activeHub, activeCluster })
    + `  <main class="site-main" id="site-main" tabindex="-1" data-motoai-screen="${esc(screen)}">
${contentHtml}
  </main>
${footerHtml()}
${siteDrawer({ activeHub, activeCluster })}
${schemaHtml}
${shellScripts({ search })}</body>
</html>
`;
}
