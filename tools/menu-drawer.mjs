#!/usr/bin/env node
/**
 * One deterministic sidebar renderer for the Agent app and all content pages
 * (v79). Sources: navigation config, Page registry and live taxonomy; UI
 * strings from config/blog-ui.json labels; glyphs from the shared icon set.
 *
 * The panel is server-rendered WITHOUT a `hidden` attribute: CSS decides
 * where it lives (an off-canvas left panel on phones/tablets and in the Agent
 * app, an in-flow left column on desktop content pages — assets/css/style.css
 * + assets/css/src/blog.css) and assets/js/drawer.js only toggles classes and
 * ARIA. Every level is a real crawlable link; the expand/collapse buttons are
 * separate controls, so a reader can open a hub without leaving the page.
 *
 * Accordion levels: group (Cẩm nang, Trang Web, Pháp Lý, Dịch Vụ) › hub
 * (Công Cụ, Phương Tiện, Khám Phá) › category (Ứng Dụng, …) › subtopics.
 * Groups marked `collapsed` in config open only when they hold the current
 * page; the current category's subtopics open; everything else starts open.
 */
import { drawerCore, navigation } from './taxonomy.mjs';
import { BLOG_UI, brandMark, icon, t } from './blog-components.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ACTION_IDS = { address: 'motoai-menu-address', contact: 'motoai-menu-contact' };
const CONTACT_IDS = { call: 'motoai-menu-call', whatsapp: 'motoai-menu-whatsapp', map: 'motoai-menu-map' };

/** Content-page link for one drawerCore entry — the sidebar and the footer
 *  share it: actions open the Agent app, contacts resolve at runtime from
 *  business.json (app-shell.js), everything else is a plain page link. */
export function contentLink(item, inner, extra = '') {
  if (item.kind === 'action') return '<a href="' + navigation.agent.url + '?action=' + esc(item.action) + '">' + inner + '</a>';
  if (item.kind === 'contact') {
    return '<a data-contact-ref="' + esc(item.ref) + '" href="#" rel="noopener noreferrer" target="_blank">' + inner + '</a>';
  }
  return '<a href="' + esc(item.url) + '"' + extra + '>' + inner + '</a>';
}

/** Sidebar glyph: an inline SVG from the shared set, or nothing. */
const glyph = (name) => (name ? icon(name, 'motoai-nav-icon') : '');
/** A sidebar row label: optional glyph + text in its own span (truncation, alignment). */
const row = (name, label) => glyph(name) + '<span>' + esc(label) + '</span>';

/** An expand/collapse control for the list `id`, independent of the link
 *  beside it: the chevron is drawn by CSS (no markup per row). drawer.js
 *  swaps aria-expanded + `hidden` and rebuilds the label from the templates
 *  on the <nav> (data-expand / data-collapse) and the control's data-name. */
function toggle(id, name, expanded, cls = '') {
  return '<button type="button" class="motoai-toggle' + (cls ? ' ' + cls : '') + '" id="' + esc(id) + '-btn" aria-expanded="' +
    (expanded ? 'true' : 'false') + '" aria-controls="' + esc(id) + '" aria-label="' + esc(t(expanded ? 'menuCollapse' : 'menuExpand', { name })) +
    '" data-name="' + esc(name) + '"></button>';
}

export function renderDrawer({ mode = 'content', activeHub = null, activeCluster = null, path = null } = {}) {
  if (mode !== 'chat' && mode !== 'content') throw new Error('unknown menu mode');
  const chat = mode === 'chat';
  const svg = navigation.svg_icons ?? {};
  // Current = the exact page (`path`, e.g. '' for the homepage, 'blog/app/web-app/'
  // for a topic hub) or the page's category / cluster / static dir.
  const isCurrent = (url) => {
    if (path !== null && url === '/' + path) return true;
    const target = (url || '').replace(/\/$/, '');
    const hub = activeHub ? '/blog/' + activeHub : '';
    const cluster = activeCluster ? '/blog/' + activeCluster : '';
    const staticPage = activeHub ? '/' + activeHub : '';
    return Boolean(target) && (target === hub || target === cluster || target === staticPage);
  };
  const currentAttr = (url) => (isCurrent(url) ? ' aria-current="page"' : '');
  const holdsCurrent = (item) => isCurrent(item.url) || (item.children ?? []).some(holdsCurrent);

  const renderLink = (item, indent) => {
    const text = row(null, item.label);
    if (item.kind === 'theme') {
      // theme.js owns the "🌗 Chủ đề: …" text + aria-label of every .blog-theme-toggle.
      return indent + '<li class="motoai-drawer-util"><button type="button" class="blog-theme-toggle motoai-drawer-theme" aria-label="' +
        esc(t('menuTheme')) + ': tự động">' + esc(item.icon) + ' ' + esc(item.label) + ': Auto</button></li>';
    }
    if (item.kind === 'action') {
      return chat
        ? indent + '<li><button type="button" id="' + (ACTION_IDS[item.action] ?? '') + '">' + text + '</button></li>'
        : indent + '<li>' + contentLink(item, text) + '</li>';
    }
    if (item.kind === 'contact') {
      return chat
        ? indent + '<li><a id="' + (CONTACT_IDS[item.ref] ?? '') + '" href="#" rel="noopener noreferrer" target="_blank">' + text + '</a></li>'
        : indent + '<li>' + contentLink(item, text) + '</li>';
    }
    if (item.level === 'subtopic') {
      return indent + '<li class="motoai-subtopic"><a href="' + esc(item.url) + '"' + currentAttr(item.url) +
        ' aria-label="' + esc(item.parent) + ': ' + esc(item.label) + '">' + text + '</a></li>';
    }
    const top = item.url === navigation.home.url ? svg.home : item.url === navigation.agent.url ? svg.agent : item.ref === 'search' ? svg.search : null;
    // In the Agent app the Agent entry is the in-app Agent toggle (main.js aiToggle).
    if (chat && item.url === navigation.agent.url) {
      return indent + '<li><button type="button" id="motoai-menu-agent">' + row(top, item.label) + '</button></li>';
    }
    return indent + '<li><a' + (chat && item.url === '/gia-thue/' ? ' id="motoai-menu-price"' : '') +
      ' href="' + esc(item.url) + '"' + currentAttr(item.url) + '>' + row(top, item.label) + '</a></li>';
  };

  /** Hub › categories › subtopics: the flat drawerCore children regrouped
   *  under each category, every category with topics gets its own toggle. */
  const renderHub = (hub, indent) => {
    const cats = [];
    for (const ch of hub.children) {
      if (ch.level === 'category') cats.push({ cat: ch, topics: [] });
      else cats[cats.length - 1].topics.push(ch);
    }
    const catsHtml = cats.map(({ cat, topics }) => {
      const id = 'motoai-cat-' + cat.id;
      const open = cat.url === '/blog/' + activeHub + '/' || topics.some((x) => isCurrent(x.url));
      const link = '<a href="' + esc(cat.url) + '"' + currentAttr(cat.url) + '>' + row(null, cat.label) + '</a>';
      if (!topics.length) return indent + '    <li class="motoai-category">' + link + '</li>';
      return indent + '    <li class="motoai-category">\n' +
        indent + '      <div class="motoai-row">' + link + toggle(id, cat.label, open) + '</div>\n' +
        indent + '      <ul class="motoai-topic-items" id="' + id + '"' + (open ? '' : ' hidden') + '>\n' +
        topics.map((x) => renderLink(x, indent + '        ')).join('\n') + '\n' +
        indent + '      </ul>\n' + indent + '    </li>';
    }).join('\n');
    const id = 'motoai-hub-' + hub.id;
    return indent + '<li class="motoai-hub">\n' +
      indent + '  <div class="motoai-row"><a class="motoai-hub-link" href="' + esc(hub.url) + '"' + currentAttr(hub.url) + '>' +
      row(svg.hubs?.[hub.id], hub.label) + '</a>' + toggle(id, hub.label, true) + '</div>\n' +
      indent + '  <ul class="motoai-hub-items" id="' + id + '">\n' + catsHtml + '\n' +
      indent + '  </ul>\n' + indent + '</li>';
  };

  const renderGroup = (g) => {
    const id = 'motoai-group-' + g.id;
    const open = !g.collapsed || holdsCurrent(g);
    const head = g.url
      ? '<a class="motoai-group-link" href="' + esc(g.url) + '"' + currentAttr(g.url) + '>' + row(svg.groups?.[g.id], g.label) + '</a>'
      : '<span class="motoai-group-title">' + row(svg.groups?.[g.id], g.label) + '</span>';
    return '      <li class="motoai-group" data-group="' + esc(g.id) + '">\n' +
      '        <div class="motoai-row motoai-group-head">' + head + toggle(id, g.label, open, 'motoai-group-btn') + '</div>\n' +
      '        <ul class="motoai-group-items" id="' + id + '"' + (open ? '' : ' hidden') + '>\n' +
      g.children.map((child) => (child.kind === 'hub' ? renderHub(child, '          ') : renderLink(child, '          '))).join('\n') +
      '\n        </ul>\n      </li>';
  };

  const li = drawerCore().map((entry) => (entry.kind === 'group' ? renderGroup(entry) : renderLink(entry, '      '))).join('\n');
  const site = BLOG_UI.site;
  return '  <div class="motoai-drawer-backdrop" id="motoai-drawer-backdrop"></div>\n' +
    '  <nav class="motoai-drawer" id="motoai-drawer" aria-label="' + esc(t('menuLabel')) + '" data-expand="' + esc(t('menuExpand', { name: '{name}' })) +
    '" data-collapse="' + esc(t('menuCollapse', { name: '{name}' })) + '">\n' +
    '    <div class="motoai-drawer-head">\n' +
    '      <a class="motoai-drawer-brand" href="' + esc(navigation.home.url) + '" aria-label="' + esc(site.shortName) + ' — ' + esc(navigation.home.label.toLowerCase()) + '">' +
    brandMark() + '<strong>' + esc(site.shortName) + '</strong></a>\n' +
    '      <button type="button" class="motoai-drawer-close" id="motoai-drawer-close" aria-label="' + esc(t('menuClose')) +
    '" data-close="' + esc(t('menuClose')) + '" data-collapse="' + esc(t('menuCollapseSidebar')) + '">' + icon('close', 'motoai-icon') + '</button>\n' +
    '    </div>\n' +
    '    <ul class="motoai-drawer-list">\n' + li + '\n' +
    (chat ? '      <li class="motoai-drawer-divider" role="separator"></li>\n' +
      '      <li class="motoai-drawer-util"><button type="button" id="motoai-reset">' + esc(navigation.chat_extras.reset.icon) + ' ' + esc(navigation.chat_extras.reset.label) + '</button></li>\n' : '') +
    '    </ul>\n  </nav>';
}
