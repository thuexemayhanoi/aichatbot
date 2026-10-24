#!/usr/bin/env node
/**
 * One deterministic drawer renderer for chat home and all content pages.
 * Sources: navigation config, Page registry and live taxonomy. No new client JS.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawerCore } from './taxonomy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ACTION_IDS = { address: 'motoai-menu-address', contact: 'motoai-menu-contact' };
const CONTACT_IDS = { call: 'motoai-menu-call', whatsapp: 'motoai-menu-whatsapp', map: 'motoai-menu-map' };

export function renderDrawer({ mode = 'content', activeHub = null, activeCluster = null } = {}) {
  if (mode !== 'chat' && mode !== 'content') throw new Error('unknown menu mode');
  const chat = mode === 'chat';
  const currentAttr = (url) => {
    const dir = url.replace(/^\/(?:blog\/)?/, '').replace(/\/$/, '').split('/')[0];
    return dir && (dir === activeHub || dir === activeCluster) ? ' aria-current="page"' : '';
  };
  const renderItem = (item, indent = '      ') => {
    const text = [item.icon, item.label].filter(Boolean).map(esc).join(' ');
    if (item.kind === 'theme') {
      return indent + '<li><button type="button" class="blog-theme-toggle motoai-drawer-theme" aria-label="Chủ đề: tự động">' + text + ': Auto</button></li>';
    }
    if (item.kind === 'hub') {
      const childLinks = item.children.map((ch) => {
        const isTopic = ch.level === 'subtopic';
        const type = isTopic ? 'motoai-subtopic' : 'motoai-category';
        const extra = isTopic ? ' aria-label="' + esc(ch.parent) + ': ' + esc(ch.label) + '"' : '';
        return indent + '    <li class="' + type + '"><a href="' + esc(ch.url) + '"' + currentAttr(ch.url) + extra + '>' +
          [ch.icon, ch.label].filter(Boolean).map(esc).join(' ') + '</a></li>';
      }).join('\n');
      return indent + '<li class="motoai-hub">\n' +
        indent + '  <a class="motoai-hub-link" href="' + esc(item.url) + '"' + currentAttr(item.url) + '>' + text + '</a>\n' +
        indent + '  <ul class="motoai-hub-items">\n' + childLinks + '\n' +
        indent + '  </ul>\n' + indent + '</li>';
    }
    if (item.kind === 'action') {
      return chat
        ? indent + '<li><button type="button" id="' + (ACTION_IDS[item.action] ?? '') + '">' + text + '</button></li>'
        : indent + '<li><a href="/?action=' + esc(item.action) + '">' + text + '</a></li>';
    }
    if (item.kind === 'contact') {
      const attrs = chat
        ? ' id="' + (CONTACT_IDS[item.ref] ?? '') + '"'
        : ' data-contact-ref="' + esc(item.ref) + '"';
      return indent + '<li><a' + attrs + ' href="#" rel="noopener noreferrer" target="_blank">' + text + '</a></li>';
    }
    if (chat && item.url === '/') {
      return indent + '<li><button type="button" id="motoai-menu-agent">' + text + '</button></li>';
    }
    return indent + '<li><a' + (chat && item.url === '/gia-thue/' ? ' id="motoai-menu-price"' : '') +
      ' href="' + esc(item.url) + '"' + currentAttr(item.url) + '>' + text + '</a></li>';
  };
  const li = drawerCore().map((entry) => entry.kind === 'group'
    ? '      <li class="motoai-group">\n' +
      '        <button type="button" class="motoai-group-btn" id="motoai-group-' + esc(entry.id) +
      '-btn" aria-expanded="false" aria-controls="motoai-group-' + esc(entry.id) + '">' +
      esc(entry.icon) + ' ' + esc(entry.label) + ' <span class="motoai-caret" aria-hidden="true">▾</span></button>\n' +
      '        <ul class="motoai-group-items" id="motoai-group-' + esc(entry.id) + '" hidden>\n' +
      entry.children.map((child) => renderItem(child, '          ')).join('\n') + '\n        </ul>\n      </li>'
    : renderItem(entry)).join('\n');
  return '  <div class="motoai-drawer-backdrop" id="motoai-drawer-backdrop" hidden></div>\n' +
    '  <nav class="motoai-drawer" id="motoai-drawer" aria-label="Menu" hidden>\n' +
    '    <div class="motoai-drawer-head">\n' +
    '      <strong>MotoAI</strong>\n' +
    '      <button type="button" class="motoai-drawer-close" id="motoai-drawer-close" aria-label="Đóng menu">✕</button>\n' +
    '    </div>\n' +
    '    <ul class="motoai-drawer-list">\n' + li + '\n' +
    (chat ? '      <li class="motoai-drawer-divider" role="separator"></li>\n' +
      '      <li><button type="button" id="motoai-reset">🧹 Xóa chat</button></li>\n' : '') +
    '    </ul>\n  </nav>';
}

/** The root app shell is hand-maintained; only its drawer is generated. */
export function syncChatRootMenu(root = ROOT) {
  const path = join(root, 'index.html');
  const html = readFileSync(path, 'utf8');
  const start = html.indexOf('  <div class="motoai-drawer-backdrop"');
  if (start === -1) throw new Error('chat root: backdrop marker missing');
  const end = html.indexOf('</nav>', start);
  if (end === -1) throw new Error('chat root: drawer ending missing');
  const output = html.slice(0, start) + renderDrawer({ mode: 'chat' }) + html.slice(end + '</nav>'.length);
  if (output !== html) writeFileSync(path, output, 'utf8');
  return output;
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  syncChatRootMenu();
  console.log('index.html: shared full menu synchronized');
}
