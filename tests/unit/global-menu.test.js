import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { drawerCore, navigation, taxonomy } from '../../tools/taxonomy.mjs';
import { BLOG_UI } from '../../tools/blog-components.mjs';

/**
 * v63 → v79 GLOBAL MENU + FOOTER REGRESSION SPEC.
 *
 * config/navigation.json (via tools/taxonomy.mjs drawerCore()) is the
 * single source of truth for the CORE sidebar. The Agent app
 * (agent/index.html — data/site/agent.html.tpl filled by tools/agent-page.mjs
 * with renderDrawer({ mode: 'chat' })) and every generated content page
 * (tools/app-shell.mjs, renderDrawer({ mode: 'content' })) must expose the
 * SAME order / labels / glyphs / links / accordion structure. The Agent app
 * may append chat-only extras (divider + 🧹 Xóa chat); content pages may not.
 *
 * v79 (responsive navigation V2): the bottom tab bar is gone; ONE left panel
 * (tools/menu-drawer.mjs) is rendered WITHOUT a `hidden` attribute (CSS owns
 * the open state, assets/js/drawer.js toggles classes + ARIA); row glyphs are
 * inline SVG — drawerCore() still carries the emoji "icon" field for the
 * footer/breadcrumbs, but the sidebar never prints it; every group, hub and
 * category with topics owns an independent expand/collapse control whose
 * server-rendered state depends on the current page.
 *
 * These tests exist precisely so the two surfaces can never drift again.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;');
const labels = BLOG_UI.labels;
const SVG = navigation.svg_icons;

const STATIC_DIRS = ['privacy', 'terms', 'gioi-thieu', 'chinh-sach', 'lien-he', 'gia-thue', 'doi-tac'];
const CLUSTER_DIRS = taxonomy.clusters.map((c) => c.dir);
const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);

function contentPages() {
  return [
    'index.html', // v76: / is the website homepage on the shared content shell
    'blog/index.html',
    ...CLUSTER_DIRS.map((c) => `blog/${c}/index.html`),
    ...walk('blog').filter((p) => p.endsWith('index.html') && /^blog[\\/](app|thue-xe|xe-dien|huong-dan|an-toan|dia-phuong)[\\/]/.test(p)),
    ...STATIC_DIRS.map((d) => `${d}/index.html`)
  ];
}

/** Site URL of a generated page file ('' for the homepage → '/'). */
const ownUrl = (p) => (p === 'index.html' ? '/' : '/' + p.replace(/index\.html$/, ''));

// ---------- Minimal drawer parser (top-level <li> tokenizer) ----------

/** Split a <ul>/<li> fragment into its TOP-LEVEL <li> items: {attrs, inner}. */
function topLevelLis(fragment) {
  const items = [];
  const re = /<li\b[^>]*>|<\/li>/g;
  let depth = 0, attrs = '', start = 0, m;
  while ((m = re.exec(fragment))) {
    if (m[0] === '</li>') {
      depth -= 1;
      if (depth === 0) items.push({ attrs, inner: fragment.slice(start, m.index) });
    } else if (depth === 0) {
      depth = 1;
      attrs = m[0];
      start = m.index + m[0].length;
    } else {
      depth += 1;
    }
  }
  return items;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Text of the first <a>/<button> inside an li inner fragment. */
function firstControlText(inner) {
  const m = /<(?:a|button)\b[^>]*>([\s\S]*?)<\/(?:a|button)>/.exec(inner);
  return m ? decode(m[1]) : '';
}
function firstControlAttr(inner, attr) {
  const m = new RegExp(`<(?:a|button)\\b[^>]*\\b${attr}="([^"]*)"`).exec(inner);
  return m ? m[1] : null;
}
/** The inline SVG glyph (a navigation.svg_icons name) of the first row in a fragment, if any. */
const glyphOf = (fragment) => /<svg class="motoai-nav-icon i-([a-z-]+)"/.exec(fragment)?.[1] ?? null;

/** One expand/collapse control exactly as tools/menu-drawer.mjs toggle() prints it. */
const TOGGLE_RE = /<button type="button" class="motoai-toggle(?: motoai-group-btn)?" id="([^"]+)" aria-expanded="(true|false)" aria-controls="([^"]+)" aria-label="([^"]*)" data-name="([^"]*)"><\/button>/;
function toggleOf(fragment) {
  const m = TOGGLE_RE.exec(fragment);
  return m ? { id: m[1], expanded: m[2] === 'true', controls: m[3], label: m[4], name: m[5] } : null;
}
/** The list a control targets, in the same branch: its level + server-rendered open/closed state. */
function listOf(fragment, id) {
  const m = new RegExp(`<ul class="motoai-(group|hub|topic)-items" id="${id}"( hidden)?>`).exec(fragment);
  return m ? { level: m[1], hidden: Boolean(m[2]) } : null;
}

/** Chat-home ids that carry no href — resolve them to config semantics. */
const CHAT_ACTION_IDS = { 'motoai-menu-address': 'address', 'motoai-menu-contact': 'contact' };
const CHAT_CONTACT_IDS = { 'motoai-menu-call': 'call', 'motoai-menu-whatsapp': 'whatsapp', 'motoai-menu-map': 'map' };
const CHAT_ONLY_IDS = ['motoai-menu-agent', 'motoai-menu-price', ...Object.keys(CHAT_ACTION_IDS), ...Object.keys(CHAT_CONTACT_IDS)];

/** Normalize one plain li (top level or inside a group) to a comparable entry. */
function parseChildLi({ inner }) {
  const text = firstControlText(inner);
  const id = firstControlAttr(inner, 'id');
  const href = firstControlAttr(inner, 'href');
  const contactRef = firstControlAttr(inner, 'data-contact-ref');
  const actionMatch = href && /^\/agent\/\?action=([a-z]+)$/.exec(href);
  if (contactRef) return { kind: 'contact', text, ref: contactRef };
  if (actionMatch) return { kind: 'action', text, action: actionMatch[1] };
  if (id && CHAT_ACTION_IDS[id]) return { kind: 'action', text, action: CHAT_ACTION_IDS[id] };
  if (id && CHAT_CONTACT_IDS[id]) return { kind: 'contact', text, ref: CHAT_CONTACT_IDS[id] };
  return { kind: 'link', text, url: href, glyph: glyphOf(inner) };
}

/**
 * Parse a whole sidebar into: the normalized CORE sequence (state-free —
 * what config/navigation.json dictates), the chat-only extras, every
 * accordion control with the list it targets, and the per-page state
 * (which rows are current, which lists are open).
 */
function parseDrawer(html, page) {
  const start = html.indexOf('<nav class="motoai-drawer"');
  assert.ok(start >= 0, `${page}: drawer nav present`);
  const drawer = html.slice(start, html.indexOf('</nav>', start));
  // v79: ONE panel, never server-hidden (CSS owns the open state); the <nav>
  // carries the relabel templates drawer.js uses for every accordion control.
  assert.equal(drawer.slice(0, drawer.indexOf('>') + 1),
    `<nav class="motoai-drawer" id="motoai-drawer" aria-label="${labels.menuLabel}" data-expand="${labels.menuExpand}" data-collapse="${labels.menuCollapse}">`,
    `${page}: drawer opening tag (no hidden attribute, labels from config)`);
  assert.ok(html.slice(0, start).trimEnd().endsWith('<div class="motoai-drawer-backdrop" id="motoai-drawer-backdrop"></div>'), `${page}: backdrop right before the panel`);
  const head = /<div class="motoai-drawer-head">([\s\S]*?)<\/div>/.exec(drawer)?.[1] ?? '';
  assert.match(head, new RegExp(`^\\s*<a class="motoai-drawer-brand" href="${navigation.home.url}"[^>]*><svg class="brand-mark"[\\s\\S]*?</svg><strong>${esc(BLOG_UI.site.shortName)}</strong></a>`), `${page}: brand link opens the panel head`);
  assert.ok(head.includes(`<button type="button" class="motoai-drawer-close" id="motoai-drawer-close" aria-label="${labels.menuClose}" data-close="${labels.menuClose}" data-collapse="${labels.menuCollapseSidebar}"><svg class="motoai-icon i-close"`), `${page}: ✕ carries both its overlay and sidebar labels`);
  const listStart = drawer.indexOf('<ul class="motoai-drawer-list">');
  assert.ok(listStart > 0 && drawer.indexOf('<ul class="motoai-drawer-list">', listStart + 1) < 0, `${page}: exactly one drawer list`);
  const list = drawer.slice(listStart);
  assert.ok(!list.includes('aria-controls="motoai-drawer"'), `${page}: no control inside the panel targets the panel`);
  // Glyphs are inline SVG: the only emoji left are the theme row and (chat) Xóa chat.
  const rows = list
    .replace(/<button type="button" class="blog-theme-toggle motoai-drawer-theme"[^>]*>[^<]*<\/button>/, '')
    .replace(/<button type="button" id="motoai-reset">[^<]*<\/button>/, '');
  assert.ok(!/\p{Extended_Pictographic}/u.test(rows), `${page}: no emoji text in the sidebar rows`);

  const parsed = [];
  const chatExtras = [];
  const controls = [];
  const state = {
    groups: [], hubs: [], categories: [],
    anchors: [...list.matchAll(/<a\b([^>]*)>/g)].map((m) => ({ href: /\bhref="([^"]*)"/.exec(m[1])?.[1] ?? null, current: / aria-current="page"/.test(m[1]) }))
  };
  const record = (toggle, scope, rowText) => {
    assert.ok(toggle, `${page}: accordion control present for "${rowText}"`);
    const target = listOf(scope, toggle.controls);
    controls.push({ ...toggle, rowText, list: target });
    return target;
  };
  const holdsCurrent = (fragment) => / aria-current="page"/.test(fragment);

  const parseCategory = ({ attrs, inner }) => {
    assert.equal(attrs, '<li class="motoai-category">', `${page}: a hub lists categories only`);
    const text = firstControlText(inner);
    const url = firstControlAttr(inner, 'href');
    const toggle = toggleOf(inner);
    const topics = topLevelLis(inner).map((t) => {
      assert.equal(t.attrs, '<li class="motoai-subtopic">', `${page}: ${text} lists subtopics only`);
      return { kind: 'topic', text: firstControlText(t.inner), url: firstControlAttr(t.inner, 'href'), aria: firstControlAttr(t.inner, 'aria-label') };
    });
    if (toggle) {
      const target = record(toggle, inner, text);
      assert.ok(topics.length, `${page}: ${text} has a control only because it has topics`);
      state.categories.push({ url, hidden: target?.hidden, holdsCurrent: holdsCurrent(inner) });
    } else {
      assert.ok(!topics.length && !inner.includes('<ul'), `${page}: ${text} without topics is a plain link`);
    }
    return { kind: 'category', text, url, control: toggle?.id ?? null, list: toggle?.controls ?? null, topics };
  };
  const parseHub = ({ inner }) => {
    const row = /<div class="motoai-row">([\s\S]*?)<\/div>/.exec(inner)?.[1] ?? '';
    const link = /^<a class="motoai-hub-link" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
    assert.ok(link, `${page}: a hub row starts with its link`);
    const text = decode(link[2]);
    const toggle = toggleOf(row);
    const target = record(toggle, inner, text);
    state.hubs.push({ id: toggle.id, hidden: target?.hidden });
    return { kind: 'hub', text, glyph: glyphOf(row), url: link[1], control: toggle.id, list: toggle.controls, children: topLevelLis(inner).map(parseCategory) };
  };

  for (const li of topLevelLis(list)) {
    if (/class="motoai-drawer-divider"/.test(li.attrs)) { chatExtras.push('divider'); continue; }
    if (/id="motoai-reset"/.test(li.inner)) { chatExtras.push(decode(li.inner)); continue; }
    if (/motoai-drawer-theme/.test(li.inner)) {
      assert.equal(firstControlAttr(li.inner, 'aria-label'), `${labels.menuTheme}: tự động`, `${page}: theme row label`);
      parsed.push({ kind: 'theme', text: firstControlText(li.inner).replace(/: Auto$/, '') });
      continue;
    }
    if (/class="motoai-group"/.test(li.attrs)) {
      const id = /data-group="([^"]+)"/.exec(li.attrs)?.[1] ?? null;
      const head = /<div class="motoai-row motoai-group-head">([\s\S]*?)<\/div>/.exec(li.inner)?.[1] ?? '';
      const url = /^<a class="motoai-group-link" href="([^"]*)"/.exec(head)?.[1] ?? null;
      assert.ok(url !== null || head.startsWith('<span class="motoai-group-title">'), `${page}: group ${id} head is a landing link or a plain title`);
      const text = decode(head);
      const toggle = toggleOf(head);
      const target = record(toggle, li.inner, text);
      state.groups.push({ id, hidden: target?.hidden, holdsCurrent: holdsCurrent(li.inner) });
      const children = topLevelLis(li.inner).map((child) => (/class="motoai-hub"/.test(child.attrs) ? parseHub(child) : parseChildLi(child)));
      parsed.push({ kind: 'group', id, text, glyph: glyphOf(head), url, control: toggle.id, list: toggle.controls, children });
      continue;
    }
    // Plain top-level item: Agent (button inside the Agent app, <a> on content pages).
    if (/id="motoai-menu-agent"/.test(li.inner)) {
      parsed.push({ kind: 'link', text: firstControlText(li.inner), url: '/agent/', glyph: glyphOf(li.inner) });
      continue;
    }
    parsed.push(parseChildLi(li));
  }
  return { parsed, chatExtras, controls, state, drawer, list };
}

/** drawerCore() → the same normalized, state-free shape the parser produces. */
function expectedCore() {
  const link = (item, glyph = null) => ({ kind: 'link', text: item.label, url: item.url, glyph });
  const categories = (hub) => {
    const cats = [];
    for (const ch of hub.children) {
      if (ch.level === 'category') cats.push({ id: ch.id, kind: 'category', text: ch.label, url: ch.url, topics: [] });
      else cats.at(-1).topics.push({ kind: 'topic', text: ch.label, url: ch.url, aria: `${ch.parent}: ${ch.label}` });
    }
    return cats.map(({ id, ...cat }) => ({
      ...cat,
      control: cat.topics.length ? `motoai-cat-${id}-btn` : null,
      list: cat.topics.length ? `motoai-cat-${id}` : null
    }));
  };
  return drawerCore().map((entry) => {
    if (entry.kind === 'group') {
      return {
        kind: 'group', id: entry.id, text: entry.label, glyph: SVG.groups[entry.id], url: entry.url ?? null,
        control: `motoai-group-${entry.id}-btn`, list: `motoai-group-${entry.id}`,
        children: entry.children.map((child) => {
          if (child.kind === 'hub') {
            return {
              kind: 'hub', text: child.label, glyph: SVG.hubs[child.id], url: child.url,
              control: `motoai-hub-${child.id}-btn`, list: `motoai-hub-${child.id}`, children: categories(child)
            };
          }
          if (child.kind === 'action') return { kind: 'action', text: child.label, action: child.action };
          if (child.kind === 'contact') return { kind: 'contact', text: child.label, ref: child.ref };
          return link(child, child.ref === 'search' ? SVG.search : null);
        })
      };
    }
    // The theme row keeps its emoji: theme.js owns that text at runtime.
    if (entry.kind === 'theme') return { kind: 'theme', text: `${entry.icon} ${entry.label}` };
    return link(entry, entry.url === navigation.home.url ? SVG.home : entry.url === navigation.agent.url ? SVG.agent : null);
  });
}

/** category URL → the hub (cluster) URL that lists it, from the one config. */
const CATEGORY_HUB = new Map(drawerCore().find((e) => e.id === 'cm').children
  .filter((c) => c.kind === 'hub')
  .flatMap((hub) => hub.children.filter((c) => c.level === 'category').map((c) => [c.url, hub.url])));

/** Every accordion control is wired to a list in its own branch, and its ARIA state/labels mirror that list. */
function assertAccordion({ controls, list }, page) {
  assert.equal(controls.length, (list.match(/class="motoai-toggle/g) ?? []).length, `${page}: every expand/collapse control parsed`);
  assert.equal(new Set(controls.map((c) => c.id)).size, controls.length, `${page}: control ids unique`);
  for (const c of controls) {
    assert.equal(c.id, `${c.controls}-btn`, `${page}: ${c.id} names its list`);
    assert.ok(c.list, `${page}: ${c.id} targets a list in its own branch`);
    assert.equal(c.list.level, c.id.startsWith('motoai-group-') ? 'group' : c.id.startsWith('motoai-hub-') ? 'hub' : 'topic', `${page}: ${c.id} targets the right level`);
    assert.equal(c.expanded, !c.list.hidden, `${page}: ${c.id} aria-expanded mirrors the hidden attribute`);
    assert.equal(c.name, c.rowText, `${page}: ${c.id} data-name is the row label`);
    assert.equal(c.label, (c.expanded ? labels.menuCollapse : labels.menuExpand).replace('{name}', c.name), `${page}: ${c.id} aria-label from the config template`);
  }
}

/**
 * Per-page state: aria-current marks only the page's own row, its category
 * and that category's hub; a collapsed group opens only around the current
 * page; hubs always open; a category's topics open only around the current
 * page. `own` = null for the Agent app (no current page).
 */
function assertPageState({ state }, page, own) {
  const cat = own && /^\/blog\/([a-z-]+)\//.exec(own)?.[1];
  const catUrl = cat && CATEGORY_HUB.has(`/blog/${cat}/`) ? `/blog/${cat}/` : null;
  const allowed = new Set(own ? [own, ...(catUrl ? [catUrl, CATEGORY_HUB.get(catUrl)] : [])] : []);
  const current = state.anchors.filter((a) => a.current).map((a) => a.href);
  for (const href of current) assert.ok(allowed.has(href), `${page}: aria-current only on its own branch (got ${href})`);
  if (own) {
    const ownRows = state.anchors.filter((a) => a.href === own);
    assert.ok(ownRows.length ? ownRows.every((a) => a.current) : catUrl && current.includes(catUrl),
      `${page}: every row linking to this page is current (an article marks its category)`);
    if (catUrl) assert.ok(current.includes(catUrl), `${page}: the category of the page is current`);
  }
  for (const g of drawerCore().filter((e) => e.kind === 'group')) {
    const got = state.groups.find((x) => x.id === g.id);
    assert.equal(got?.hidden, Boolean(g.collapsed) && !got?.holdsCurrent, `${page}: group ${g.id} open state (collapsed groups open only around the current page)`);
  }
  assert.equal(state.hubs.length, taxonomy.clusters.length, `${page}: one hub list per cluster`);
  for (const h of state.hubs) assert.equal(h.hidden, false, `${page}: hub ${h.id} list always open`);
  for (const c of state.categories) assert.equal(c.hidden, !c.holdsCurrent, `${page}: ${c.url} topics open only around the current page`);
}

// ---------- 1. Core menu: Agent app (/agent/) == config/navigation.json ----------

test('v79 core menu: agent/index.html sidebar matches drawerCore() exactly (order/labels/glyphs/links/accordion)', () => {
  const page = 'agent/index.html';
  const parse = parseDrawer(read(page), page);
  assert.deepEqual(parse.parsed, expectedCore(), 'agent/index.html core drawer == config/navigation.json');
  // Chat-only extras are the divider + Xóa chat, at the very END.
  assert.deepEqual(parse.chatExtras, ['divider', '🧹 Xóa chat'], 'chat-only utility = divider + Xóa chat, last');
  const lis = topLevelLis(parse.list);
  assert.match(lis.at(-2).attrs, /class="motoai-drawer-divider" role="separator"/, 'divider is the penultimate row');
  assert.match(lis.at(-1).inner, /^<button type="button" id="motoai-reset">/, 'Xóa chat is the last row');
  // In the app the actions/contacts are in-app controls (main.js), never page links.
  assert.ok(!parse.drawer.includes('data-contact-ref') && !parse.drawer.includes('?action='), 'no content-page links in the chat drawer');
  for (const id of CHAT_ONLY_IDS) {
    assert.equal((parse.drawer.match(new RegExp(`id="${id}"`, 'g')) ?? []).length, 1, `exactly one #${id}`);
  }
  assertAccordion(parse, page);
  assertPageState(parse, page, null);
});

test('v79 core menu: content-page sidebars match drawerCore() on every generated page and mark only their own branch', () => {
  const expected = expectedCore();
  for (const p of contentPages()) {
    const parse = parseDrawer(read(p), p);
    assert.deepEqual(parse.parsed, expected, `${p}: core drawer == config/navigation.json`);
    assert.deepEqual(parse.chatExtras, [], `${p}: no chat-only extras on content pages`);
    assert.ok(!/id="motoai-menu-/.test(parse.drawer), `${p}: actions/contacts are page links, no in-app ids`);
    assertAccordion(parse, p);
    assertPageState(parse, p, ownUrl(p));
  }
});

test('v63: "Xóa chat" and the chat divider never appear on content pages', () => {
  for (const p of contentPages()) {
    const html = read(p);
    const drawer = html.slice(html.indexOf('<nav class="motoai-drawer"'), html.indexOf('</nav>'));
    assert.ok(!drawer.includes('Xóa chat'), `${p}: no Xóa chat in the drawer`);
    assert.ok(!html.includes('motoai-drawer-divider'), `${p}: no chat divider`);
    assert.ok(!html.includes('id="motoai-reset"'), `${p}: no reset action`);
  }
});

// ---------- 2. Body classes + footer presence contract ----------

test('v76: /agent/ is the ChatGPT-style chat app — body.chat-home, NO footer; / is a content page', () => {
  const html = read('agent/index.html');
  assert.match(html, /<body class="chat-home">/);
  assert.equal((html.match(/<footer/g) ?? []).length, 0, 'the Agent app never gains a footer');
  assert.ok(!html.includes('class="site-header"'), 'the Agent app keeps its own app header');
  assert.ok(html.includes('class="motoai-app"'), 'the Agent app keeps the app shell');
  const home = read('index.html');
  assert.match(home, /<body class="content-page">/, '/ is a normal website page');
  assert.ok(!home.includes('class="motoai-app"') && !home.includes('chat-home'), '/ is never the full-screen chat');
});

test('v63: every content page is body.content-page with exactly ONE site-header and ONE blog-footer', () => {
  for (const p of contentPages()) {
    const html = read(p);
    assert.match(html, /<body class="content-page">/, `${p}: content-page body`);
    assert.equal((html.match(/<header class="site-header">/g) ?? []).length, 1, `${p}: exactly one site-header`);
    assert.equal((html.match(/<footer class="blog-footer">/g) ?? []).length, 1, `${p}: exactly one blog-footer`);
  }
});

// ---------- 3. Footer content: groups from config + verified business bottom bar ----------

test('v63 footer: MotoAI + 3 parent hubs + Dịch Vụ + Pháp Lý (shown uppercase), no "24/7", verified bottom bar', () => {
  const groupLabel = (id) => drawerCore().find((e) => e.kind === 'group' && e.id === id).label;
  const business = JSON.parse(read('data/business/business.json'));
  for (const p of contentPages()) {
    const html = read(p);
    const footer = html.slice(html.indexOf('<footer class="blog-footer">'), html.indexOf('</footer>'));
    // v77: titles come from the brand + drawer groups; CSS renders them uppercase.
    assert.ok(footer.includes(`blog-footer-title">${esc(BLOG_UI.site.shortName)}<`), `${p}: MotoAI column`);
    for (const c of taxonomy.clusters) {
      assert.ok(footer.includes(`blog-footer-title">${esc(c.name)}<`), `${p}: hub column ${c.name}`);
    }
    assert.ok(footer.includes(`blog-footer-title">${esc(groupLabel('dv'))}<`), `${p}: Dịch Vụ column`);
    assert.ok(footer.includes(`blog-footer-title">${esc(groupLabel('pl'))}<`), `${p}: Pháp Lý column`);
    assert.ok(footer.includes('⚡ Hỏi Agent'), `${p}: Ask Agent CTA`);
    assert.ok(footer.includes('Hỗ trợ Agent'), `${p}: brand block subtitle`);
    // Never claim 24/7 support — hours are verified business.json facts.
    assert.ok(!footer.includes('24/7'), `${p}: no 24/7 claim`);
    assert.ok(!/24\s*\/\s*7|hỗ trợ 24/i.test(footer), `${p}: no 24/7 variant`);
    // Bottom bar: verified address + hours (business.json is the only truth).
    assert.ok(footer.includes(business.address.full), `${p}: verified address in the bottom bar`);
    assert.ok(footer.includes(business.hours.display), `${p}: verified hours in the bottom bar`);
    assert.ok(footer.includes('mỗi ngày'), `${p}: daily hours phrasing`);
    assert.ok(footer.includes('blog-footer-bottom'), `${p}: bottom bar present`);
  }
  // Labels keep their source casing (Dịch Vụ, Pháp Lý); the shared label trait shows them uppercase.
  const traits = /([^{}]*\.blog-footer-title[^{}]*)\{([^}]*)\}/.exec(read('assets/css/src/blog.css'));
  assert.ok(traits && /text-transform:\s*uppercase/.test(traits[2]), 'footer titles render uppercase');
});

// ---------- 4. No duplicate IDs anywhere ----------

test('v63: no duplicate id attributes on any page (Agent app + content pages)', () => {
  for (const p of ['agent/index.html', ...contentPages()]) {
    const html = read(p);
    const seen = new Set();
    for (const m of html.matchAll(/\bid="([^"]+)"/g)) {
      assert.ok(!seen.has(m[1]), `${p}: duplicate id "${m[1]}"`);
      seen.add(m[1]);
    }
  }
});

// ---------- 5. No broken internal links (header + drawer + footer) ----------

/** Map a site URL to the repo file that must exist on disk. */
function urlToFile(url) {
  const path = url.split('#')[0].split('?')[0].replace(/^\//, '');
  return path === '' ? 'index.html' : `${path.replace(/\/$/, '')}/index.html`;
}

test('v63: every internal header/drawer/footer link resolves to a real page (no broken links, no orphans)', () => {
  for (const p of ['agent/index.html', ...contentPages()]) {
    const html = read(p);
    const chrome = [
      html.slice(html.indexOf('<header'), html.indexOf('</header>') + 1),
      html.slice(html.indexOf('<nav class="motoai-drawer"'), html.indexOf('</nav>', html.indexOf('<nav class="motoai-drawer"'))),
      html.slice(html.indexOf('<footer'), html.indexOf('</footer>') + 1)
    ].join('\n');
    for (const m of chrome.matchAll(/href="(\/[^"]*)"/g)) {
      const file = urlToFile(m[1]);
      assert.ok(existsSync(join(ROOT, file)), `${p}: link ${m[1]} -> missing file ${file}`);
    }
  }
});

// ---------- 6. URL/canonical stability ----------

test('v63: canonical URL of every page is unchanged (SITE + own path, trailing slash)', () => {
  const SITE = 'https://chatbot.thuexemaynguyentu.com/';
  const all = ['agent/index.html', ...contentPages()];
  for (const p of all) {
    const html = read(p);
    const canonical = /rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    const expected = p === 'index.html' ? SITE : SITE + p.replace(/index\.html$/, '');
    assert.equal(canonical, expected, `${p}: canonical unchanged`);
  }
  // The sitemap keeps exactly the same URL set as the generated pages.
  const sitemap = read('sitemap.xml');
  for (const loc of [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
    const file = urlToFile(loc.replace(SITE, '/'));
    assert.ok(existsSync(join(ROOT, file)), `sitemap loc ${loc} -> missing file ${file}`);
  }
});

// ---------- 7. Drawer behaviour parity (shared runtime contract) ----------

/** Innermost CSS rules as {selector, body} (rules nested in @media resolve to the inner rule). */
const cssRules = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ selector: m[1].trim(), body: m[2] }));
const fixedBodyRules = (css) => cssRules(css).filter((r) => /\bbody\b/.test(r.selector) && /position:\s*fixed/.test(r.body)).map((r) => r.selector);

test('v79: drawer runtime — the scroll lock is SCOPED (html.drawer-lock only while the overlay is open, released with the exact offset, never in the Agent app), one JS contract per surface', () => {
  const shell = read('assets/js/app-shell.js');
  const main = read('assets/js/main.js');
  const drawer = read('assets/js/drawer.js');
  const css = read('assets/css/style.css');
  const blogCss = read('assets/css/src/blog.css');
  for (const js of [shell, main, drawer]) {
    assert.ok(!/document\.body\.style\.overflow/.test(js), 'no body overflow lock');
    assert.ok(!/classList\.(add|remove|toggle)\('(lock|no-scroll)/.test(js), 'no legacy scroll-lock class');
    assert.ok(!/body\.classList\.(add|remove|toggle)\('drawer-lock'/.test(js), 'the lock class never lands on <body>');
  }
  // Only drawer.js touches the page scroll, through ONE helper that is symmetric
  // (pin + remember the offset on open, unpin + restore it on close) and skips
  // the Agent app, whose shell is already position: fixed.
  for (const js of [shell, main]) assert.ok(!js.includes('drawer-lock') && !js.includes('scrollTo('), 'only drawer.js locks/unlocks the page');
  const lockFn = /const lock = \(on\) => \{([\s\S]*?)\n  \};/.exec(drawer)?.[1];
  assert.ok(lockFn, 'one lock(on) helper');
  assert.match(lockFn, /^\s*if \(body\.classList\.contains\('chat-home'\)\) return;/, 'the Agent app is never locked');
  assert.match(lockFn, /if \(on\) \{\s*scrollY = globalThis\.scrollY \|\| 0;\s*body\.style\.top = `-\$\{scrollY\}px`;\s*root\.classList\.add\('drawer-lock'\);\s*\}/, 'open: remember the offset, pin the document');
  assert.match(lockFn, /else \{\s*root\.classList\.remove\('drawer-lock'\);\s*body\.style\.top = '';\s*globalThis\.scrollTo\(0, scrollY\);\s*\}/, 'close: unpin, clear the offset, restore the exact scroll position');
  assert.equal((drawer.match(/drawer-lock/g) ?? []).length, 2, 'the class is added in one place and removed in one place');
  assert.equal((drawer.match(/\block\(/g) ?? []).length, 1, 'lock() is called from exactly one place');
  assert.match(drawer, /function setOverlay\(state, focus = true\) \{\s*if \(state === open\) return;\s*open = state;\s*drawer\.classList\.toggle\('is-open', state\);\s*backdrop\.classList\.toggle\('is-open', state\);\s*body\.classList\.toggle\('drawer-open', state\);\s*lock\(state\);/, 'the lock follows the overlay state and nothing else');
  assert.match(drawer, /if \(sidebarMode\(\)\) \{\s*setOverlay\(false, false\);/, 'growing into the desktop column closes the overlay (and releases the lock)');
  assert.ok(drawer.includes("globalThis.matchMedia?.(SIDEBAR_MQ)") && drawer.includes("const SIDEBAR_MQ = '(min-width: 1200px)';"), 'desktop column from 1200px');
  // CSS: the pin exists ONLY under html.drawer-lock; the document itself scrolls as a document.
  assert.match(blogCss, /^html\.drawer-lock body\.content-page \{ position: fixed; left: 0; right: 0; width: 100%; overflow-y: hidden; \}$/m, 'the page stays put under the open panel');
  assert.deepEqual(fixedBodyRules(blogCss), ['html.drawer-lock body.content-page'], 'the scoped lock is the ONLY rule that pins <body>');
  assert.deepEqual(fixedBodyRules(css), [], 'style.css never pins <body> (the Agent app is fixed through .motoai-app)');
  assert.ok(!css.includes('drawer-lock'), 'the lock rule lives with the content pages only');
  const base = cssRules(blogCss).filter((r) => r.selector === 'body.content-page');
  assert.ok(base.some((r) => /position: static;/.test(r.body) && /overflow-y: visible;/.test(r.body)), 'body.content-page scrolls as a document');
  assert.ok(!base.some((r) => /position:\s*(fixed|absolute)/.test(r.body)), 'body.content-page is never pinned on its own');
  assert.match(blogCss, /^\[hidden\] \{ display: none !important; \}$/m, 'collapsed accordion lists take no space');
  // Focus, keyboard and the independent accordions (one implementation).
  // Focus moves without scrolling (preventScroll): the sticky ☰ is already in view.
  assert.ok(drawer.includes("if (focus) (state ? close ?? drawer.querySelector('a, button') : menu)?.focus({ preventScroll: true });"), 'focus moves to ✕ on open and back to ☰ on close');
  assert.ok(drawer.includes("if (sidebarMode()) { setSidebar(false); menu?.focus({ preventScroll: true }); } else setOverlay(false);"), 'collapsing the desktop column with ✕ hands focus back to ☰');
  assert.ok(drawer.includes("if (event.key === 'Escape') { event.preventDefault(); setOverlay(false); return; }"), 'Escape closes the drawer');
  assert.ok(drawer.includes("if (event.key !== 'Tab') return;") && drawer.includes('drawer.contains(doc.activeElement)'), 'Tab is trapped inside the open panel');
  assert.ok(drawer.includes("querySelectorAll('.motoai-toggle')") && drawer.includes('list.hidden = !expanded') &&
    drawer.includes("btn.setAttribute('aria-expanded', expanded ? 'true' : 'false')"), 'each control flips aria-expanded + the hidden attribute of its list');
  assert.ok(drawer.includes("drawer.dataset[expanded ? 'collapse' : 'expand']") && drawer.includes("tpl.replace('{name}', btn.dataset.name)"), 'labels rebuilt from the nav templates + data-name');
  assert.ok(!drawer.includes('closeGroups'), 'independent accordions — no one-open rule');
  assert.ok(drawer.includes("localStorage.setItem(KEY, visible ? 'open' : 'closed')") && drawer.includes("const KEY = 'motoai-sidebar';") &&
    drawer.includes("root.setAttribute('data-motoai-sidebar', 'closed')"), 'desktop: the collapsed column persists');
  for (const p of ['index.html', 'blog/index.html', 'blog/thue-xe/index.html', 'privacy/index.html']) {
    assert.ok(read(p).includes("if(localStorage.getItem('motoai-sidebar')==='closed'){d.setAttribute('data-motoai-sidebar','closed');}"), `${p}: saved sidebar state applied before first paint`);
  }
  // One accordion/overlay contract, ONE implementation: both surfaces import drawer.js (v79).
  for (const js of [shell, main]) {
    assert.match(js, /import \{ createDrawer \} from '\.\/drawer\.js\?v=79';/, 'shared drawer controller, one cache-busted version');
    assert.match(js, /^\s*createDrawer\(\);/m, 'the shell mounts the shared controller');
    assert.ok(!js.includes('closeGroups') && !js.includes('motoai-toggle') && !js.includes('is-open'), 'no second copy of the accordion / overlay');
  }
  assert.ok(!shell.includes('is-typing') && !main.includes('app-tabbar'), 'the retired tab-bar runtime is gone');
});
