#!/usr/bin/env node
/**
 * MotoAI CONTENT SITE SHELL — the ONE source of truth for every generated
 * content page (blog home, parent cluster hubs, category hubs, subtopic
 * hubs, articles, search, static pages, privacy, terms).
 *
 * Product model:
 *   /                  = CHAT HOMEPAGE — the app screen (own shell in
 *                        index.html, no footer, Menu on the right).
 *   every other page   = content website page that consumes THIS shell:
 *                        sticky site header (identity left, hub nav center
 *                        on desktop, search/theme/Menu RIGHT), main content
 *                        column, page-ending contact band and a real footer
 *                        generated from config/navigation.json.
 *
 * Single sources (change one, every page follows on the next build):
 *   config/blog-ui.json        site identity, feature flags, CTA, slots
 *   config/navigation.json     header, drawer and footer vocabulary
 *   data/business/*.json       NAP, hours, contact, pricing
 *   assets/css/blog.css        design tokens (color, type, space, motion)
 *   tools/blog-components.mjs  icons, brand mark, contact band, slots
 * Asset URLs carry a content hash (?v=<digits>), so editing a stylesheet or
 * script busts browser + service-worker caches on every page automatically.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { navigation, taxonomy, clusterNav, drawerCore } from './taxonomy.mjs';
import { BLOG_UI, bannerSlot, esc, feature, icon, brandMark, contactBand, renderSlot, t } from './blog-components.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUSINESS = JSON.parse(readFileSync(join(ROOT, 'data/business/business.json'), 'utf8'));

import { SITE } from '../src/config/site.js';
export { SITE, esc };

/** Build marker (page diagnostics). Cache busting no longer depends on it:
 *  every asset URL carries its own content hash (assetVersion). */
export const BUILD_VERSION = 'v72';

const versions = new Map();
/** Deterministic numeric content hash of a repo file (digits only, so the
 *  `?v=\d+` cache contract holds). Same bytes → same URL → CI-stable. */
export function assetVersion(file) {
  if (!versions.has(file)) {
    const hex = createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex');
    versions.set(file, String(parseInt(hex.slice(0, 8), 16)));
  }
  return versions.get(file);
}

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
  const site = BLOG_UI.site;
  const og = site.ogImage;
  const css = (file) => `  <link rel="stylesheet" href="${prefix}${file}?v=${assetVersion(file)}">`;
  return `<!DOCTYPE html>
<html lang="vi" data-motion="${feature('motion') ? 'on' : 'off'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="motoai-build" content="${BUILD_VERSION}">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta name="theme-color" content="${site.themeColor.light}" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="${site.themeColor.dark}" media="(prefers-color-scheme: dark)">
  <meta name="color-scheme" content="light dark">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="${esc(site.name)}">
  <meta property="og:locale" content="vi_VN">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}${og.path}">
  <meta property="og:image:width" content="${og.width}">
  <meta property="og:image:height" content="${og.height}">
  <meta property="og:image:alt" content="${esc(og.alt)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${SITE}${og.path}">
${css('assets/css/style.css')}
${css('assets/css/blog.css')}
  ${NO_FLASH_THEME}
</head>
<body class="content-page">
`;
}

/** Desktop dropdown entry: index numeral + label. Category descriptions
 *  stay on the hub pages — repeating them in the chrome of every page would
 *  only add boilerplate text (and unqualified "đặt cọc" claims) site-wide. */
function dropItem(ch, i, activeHub) {
  return `            <a href="/blog/${ch.dir}/"${ch.dir === activeHub ? ' aria-current="page"' : ''}><span class="drop-idx">${String(i + 1).padStart(2, '0')}</span><span class="drop-label">${esc(ch.label)}</span></a>`;
}

/**
 * Shared content-site header. LEFT: brand mark + MotoAI / Hỗ trợ Agent
 * (link back to the chat homepage). CENTER (>= 900px): Cẩm nang + the three
 * parent hubs with category dropdowns. RIGHT: search, theme toggle and
 * Menu — always the LAST element of .site-actions. The open/closed status
 * is a SEPARATE flex child after .site-actions (own row on mobile).
 */
function siteHeader({ activeHub, activeCluster, progress }) {
  const hubItems = taxonomy.clusters.map((c) => {
    const hub = clusterNav(c.id);
    const hubActive = c.dir === activeCluster || hub.children.some((ch) => ch.dir === activeHub);
    return `        <div class="site-nav-item"${hubActive ? ' data-active="1"' : ''}>
          <a class="site-nav-parent" href="${hub.url}" aria-haspopup="true"${hubActive ? ' aria-current="page"' : ''}>${esc(hub.name)}${icon('caret', 'site-nav-caret')}</a>
          <div class="site-nav-drop">
${hub.children.map((ch, i) => dropItem(ch, i, activeHub)).join('\n')}
          </div>
        </div>`;
  }).join('\n');
  const site = BLOG_UI.site;
  return `    <header class="site-header">
      <div class="site-header-inner">
        <a class="site-brand" href="/" aria-label="${esc(site.shortName)} — về màn hình Agent">
          <span class="site-brand-mark" aria-hidden="true">${brandMark()}</span>
          <span class="site-brand-text">
            <strong>${esc(site.shortName)}</strong>
            <span>${esc(site.tagline)}</span>
          </span>
        </a>
        <nav class="site-nav" aria-label="Chuyên mục">
          <a href="/blog/"${activeCluster === null && activeHub === null ? ' aria-current="page"' : ''}>Cẩm nang</a>
${hubItems}
        </nav>
        <div class="site-actions">
          <a class="site-search-link" href="/blog/#blog-search" aria-label="Tìm bài" title="Tìm bài">${icon('search')}</a>
          <button type="button" class="blog-theme-toggle" id="blog-theme-toggle" aria-label="Chủ đề: tự động" title="Chủ đề: Auto → Sáng → Tối">Auto</button>
          <button type="button" class="motoai-menu" id="motoai-menu-btn" title="Mở menu" aria-label="Mở menu" aria-expanded="false" aria-controls="motoai-drawer"><span class="menu-lines" aria-hidden="true"></span> <span class="motoai-menu-label">Menu</span></button>
        </div>
        <span class="motoai-status" id="blog-business-status" role="status" aria-live="polite" hidden></span>
      </div>
${progress && feature('readingProgress') ? '      <span class="read-progress" aria-hidden="true"></span>\n' : ''}    </header>
`;
}

/**
 * Menu drawer — rendered from config/navigation.json via taxonomy.drawerCore()
 * (v63): the SAME order/labels/icons/links/accordion structure as the chat
 * homepage drawer. Chat-only extras (divider + Xóa chat) are intentionally
 * NOT rendered here. Contact refs are resolved at runtime from business.json.
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
      <strong>${esc(BLOG_UI.site.shortName)}</strong>
      <button type="button" class="motoai-drawer-close" id="motoai-drawer-close" aria-label="Đóng menu">✕</button>
    </div>
    <ul class="motoai-drawer-list">
${listHtml}
    </ul>
  </nav>
`;
}

/** Real site footer: brand block (mark + MotoAI · Hỗ trợ Agent + short
 *  description + ⚡ Hỏi Agent CTA), link columns from config/navigation.json
 *  (column 1 = MOTOAI, columns 2–4 = each parent hub + its child categories
 *  expanded from taxonomy.json via the "hub" field, then a secondary row for
 *  Dịch vụ + Pháp lý) and a verified business bottom bar (address + hours
 *  from data/business/business.json — never hard-coded, never 24/7). */
export function footerHtml() {
  const primary = [];
  const secondary = [];
  for (const g of navigation.footer_groups) {
    if (g.hub) {
      const hub = clusterNav(g.hub);
      const kids = hub.children.map((ch) =>
        `            <li class="footer-sub"><a href="/blog/${ch.dir}/">${esc(ch.label)}</a></li>`).join('\n');
      primary.push(`      <div class="blog-footer-col is-hub">
        <p class="blog-footer-title">${esc(hub.name)}</p>
        <ul>
          <li><a class="footer-hub-link" href="${hub.url}">${esc(hub.name)}</a></li>
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
  const site = BLOG_UI.site;
  // Copy from config labels; NAP and hours resolve from verified business.json.
  return `    <footer class="blog-footer">
      <div class="blog-footer-inner">
        <div class="blog-footer-brand">
          <p class="blog-footer-brand-name"><span class="blog-footer-mark" aria-hidden="true">${brandMark()}</span> <strong>${esc(site.shortName)}</strong> <span class="blog-footer-agent">· ${esc(site.tagline)}</span></p>
          <p class="blog-footer-desc">${esc(t('footerDesc', {}, BUSINESS))}</p>
          <a class="blog-footer-cta" href="/">${esc(BLOG_UI.cta.footerLabel)}</a>
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
        <p>${esc(t('footerNap', {}, BUSINESS))}</p>
        <p>${esc(t('footerHours', {}, BUSINESS))}</p>
      </div>
    </footer>
`;
}

/** Page-ending action: returns to the HOME chat screen with the topic
 *  prefilled, plus verified call + one contextual action for the category
 *  (config/blog-ui.json cta). Slot `page.beforeContactBand` renders first. */
export function askAgentAction(topic, category = null) {
  return renderSlot('page.beforeContactBand', { category })
    + contactBand({ topic, category, business: BUSINESS });
}

function shellScripts({ search }) {
  const js = (file, module = false) => `  <script${module ? ' type="module"' : ''} src="/${file}?v=${assetVersion(file)}"></script>\n`;
  return (search ? js('assets/js/blog.js') : '') + js('assets/js/app-shell.js', true);
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
    + siteHeader({ activeHub, activeCluster, progress: ogType === 'article' })
    + bannerSlot(esc)
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
