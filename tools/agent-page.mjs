#!/usr/bin/env node
/**
 * Agent app page `/agent/` + llms.txt generator (v76 — the full-screen chat
 * moved here from `/`; the homepage is now a content page built by
 * tools/build-blog.mjs). Edit the TEMPLATES, never the outputs (CI rebuilds
 * and fails on any diff):
 *
 *   data/site/agent.html.tpl  ->  agent/index.html
 *   data/site/llms.txt.tpl    ->  llms.txt
 *
 * Shop facts resolve from data/business/business.json and rental rates from
 * pricing.json ({{ business.* }} / {{ price.* }}, tools/blog-components.mjs
 * resolveFacts) — the same sources every content page uses. The app page
 * also receives, from the content-site sources: the shared drawer
 * (renderDrawer), the desktop menu (siteNav), the bottom tab bar (tabBar), build marker, brand mark, send icon, light/dark theme-color
 * (config/blog-ui.json), content-hashed stylesheet + app script URLs, and the
 * service worker precaches those exact URLs. All app URLs are root-absolute
 * (/assets, /data, /service-worker.js) so the app works under /agent/.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { BLOG_UI, brandMark, icon, resolveFacts } from './blog-components.mjs';
import { renderDrawer } from './menu-drawer.mjs';
import { BUILD_VERSION, siteNav, tabBar } from './app-shell.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const AGENT_TEMPLATE = 'data/site/agent.html.tpl';
export const AGENT_PAGE = 'agent/index.html';
export const LLMS_TEMPLATE = 'data/site/llms.txt.tpl';
const DRAWER_MARKER = /^ *<!-- @generated drawer:[^\n]*-->$/m;
const NAV_MARKER = /^ *<!-- @generated site-nav:[^\n]*-->$/m;
const TAB_MARKER = /^ *<!-- @generated tab-bar:[^\n]*-->$/m;

/** Content hash of a served file — the ?v= that busts Safari's cache. */
export function fileVersion(root, path) {
  const hash = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
  return String(parseInt(hash.slice(0, 8), 16));
}

export function renderAgent(root = ROOT) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const business = JSON.parse(read('data/business/business.json'));
  const template = read(AGENT_TEMPLATE);
  if (!DRAWER_MARKER.test(template)) throw new Error(`${AGENT_TEMPLATE}: drawer marker missing`);
  if (!NAV_MARKER.test(template)) throw new Error(`${AGENT_TEMPLATE}: site-nav marker missing`);
  if (!TAB_MARKER.test(template)) throw new Error(`${AGENT_TEMPLATE}: tab-bar marker missing`);
  const { light, dark } = BLOG_UI.site.themeColor;
  return resolveFacts(template, business)
    .replace(DRAWER_MARKER, () => renderDrawer({ mode: 'chat' }))
    // The same desktop menu as every website page (one component, one source).
    .replace(NAV_MARKER, () => siteNav({ path: 'agent/', home: true }))
    // The same bottom tab bar as every website page (replaces the v50 dock).
    .replace(TAB_MARKER, () => tabBar({ path: 'agent/' }).replace(/^ {2}/gm, '      '))
    .replace(/(<div class="motoai-brand-mark" aria-hidden="true">)[\s\S]*?(<\/div>)/, (m, open, close) => open + brandMark() + close)
    .replace(/(<button class="motoai-send"[^>]*>)[\s\S]*?(<\/button>)/, (m, open, close) => open + icon('send', 'motoai-icon') + close)
    .replace(/ *<meta name="theme-color"[^\n]*\n/,
      `  <meta name="theme-color" content="${light}" media="(prefers-color-scheme: light)">\n` +
      `  <meta name="theme-color" content="${dark}" media="(prefers-color-scheme: dark)">\n`)
    .replace(/(<meta name="motoai-build" content=")v\d+(">)/, `$1${BUILD_VERSION}$2`)
    .replace(/assets\/css\/style\.css\?v=\d+/, 'assets/css/style.css?v=' + fileVersion(root, 'assets/css/style.css'))
    .replace(/assets\/js\/main\.js\?v=\d+/, 'assets/js/main.js?v=' + fileVersion(root, 'assets/js/main.js'));
}

export function renderLlms(root = ROOT) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  return resolveFacts(read(LLMS_TEMPLATE), JSON.parse(read('data/business/business.json')));
}

/** Writes agent/index.html, llms.txt and the service-worker precache URLs. */
export function buildAgent(root = ROOT) {
  const writeIfChanged = (p, text) => {
    let prev = null;
    try { prev = readFileSync(join(root, p), 'utf8'); } catch { /* first build */ }
    if (prev !== text) writeFileSync(join(root, p), text, 'utf8');
  };
  const html = renderAgent(root);
  mkdirSync(join(root, 'agent'), { recursive: true });
  writeIfChanged(AGENT_PAGE, html);
  writeIfChanged('llms.txt', renderLlms(root));
  // The offline shell precaches the SAME stylesheet + app script URLs the page links.
  const css = /assets\/css\/style\.css\?v=\d+/.exec(html)[0];
  const app = /assets\/js\/main\.js\?v=\d+/.exec(html)[0];
  const sw = readFileSync(join(root, 'service-worker.js'), 'utf8');
  writeIfChanged('service-worker.js', sw
    .replace(/\.\/assets\/css\/style\.css\?v=\d+/, './' + css)
    .replace(/\.\/assets\/js\/main\.js\?v=\d+/, './' + app));
  return html;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  buildAgent();
  console.log('agent/index.html + llms.txt generated from data/site templates');
}
