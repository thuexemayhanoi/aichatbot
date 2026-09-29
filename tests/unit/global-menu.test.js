import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { drawerCore, taxonomy } from '../../tools/taxonomy.mjs';

/**
 * v63 GLOBAL MENU + FOOTER REGRESSION SPEC.
 *
 * config/navigation.json (via tools/taxonomy.mjs drawerCore()) is the
 * single source of truth for the CORE drawer. The chat homepage
 * (index.html — hand-written static shell) and every generated content
 * page (tools/app-shell.mjs) must expose the SAME order / labels / icons /
 * links / accordion structure. The chat homepage may append chat-only
 * extras (divider + 🧹 Xóa chat); content pages may not.
 *
 * These tests exist precisely so the two surfaces can never drift again
 * (the root page cannot render from the Node config at runtime).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;');

const STATIC_DIRS = ['privacy', 'terms', 'gioi-thieu', 'chinh-sach', 'lien-he', 'gia-thue'];
const CLUSTER_DIRS = taxonomy.clusters.map((c) => c.dir);
const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);

function contentPages() {
  return [
    'blog/index.html',
    ...CLUSTER_DIRS.map((c) => `blog/${c}/index.html`),
    ...walk('blog').filter((p) => p.endsWith('index.html') && /^blog[\\/](app|thue-xe|xe-dien|huong-dan|an-toan|dia-phuong)[\\/]/.test(p)),
    ...STATIC_DIRS.map((d) => `${d}/index.html`)
  ];
}

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

/** Chat-home ids that carry no href — resolve them to config semantics. */
const CHAT_ACTION_IDS = { 'motoai-menu-address': 'address', 'motoai-menu-contact': 'contact' };
const CHAT_CONTACT_IDS = { 'motoai-menu-call': 'call', 'motoai-menu-whatsapp': 'whatsapp', 'motoai-menu-map': 'map' };

/** Normalize one child li (inside a group) to a comparable entry. */
function parseChildLi({ attrs, inner }) {
  const text = firstControlText(inner);
  const id = firstControlAttr(inner, 'id');
  const href = firstControlAttr(inner, 'href');
  const contactRef = firstControlAttr(inner, 'data-contact-ref');
  const actionMatch = href && /^\/aichatbot\/\?action=([a-z]+)$/.exec(href);
  if (contactRef) return { kind: 'contact', text, ref: contactRef };
  if (actionMatch) return { kind: 'action', text, action: actionMatch[1] };
  if (id && CHAT_ACTION_IDS[id]) return { kind: 'action', text, action: CHAT_ACTION_IDS[id] };
  if (id && CHAT_CONTACT_IDS[id]) return { kind: 'contact', text, ref: CHAT_CONTACT_IDS[id] };
  return { kind: 'link', text, url: href };
}

/** Parse a whole drawer nav into the normalized CORE sequence. */
function parseDrawer(html) {
  const start = html.indexOf('<nav class="motoai-drawer"');
  assert.ok(start >= 0, 'drawer nav present');
  const drawer = html.slice(start, html.indexOf('</nav>', start));
  const parsed = [];
  const chatExtras = [];
  for (const li of topLevelLis(drawer)) {
    if (/class="motoai-drawer-divider"/.test(li.attrs)) { chatExtras.push('divider'); continue; }
    if (/id="motoai-reset"/.test(li.inner)) { chatExtras.push(decode(li.inner)); continue; }
    if (/motoai-drawer-theme/.test(li.inner)) {
      parsed.push({ kind: 'theme', text: firstControlText(li.inner).replace(/: Auto$/, '') });
      continue;
    }
    if (/class="motoai-group"/.test(li.attrs)) {
      const btn = /class="motoai-group-btn"[^>]*>([\s\S]*?)<span/.exec(li.inner);
      const children = topLevelLis(li.inner).map((child) => {
        if (/class="motoai-hub"/.test(child.attrs)) {
          return {
            kind: 'hub',
            text: decode(/class="motoai-hub-link"[^>]*>([\s\S]*?)<\/a>/.exec(child.inner)[1]),
            url: firstControlAttr(child.inner, 'href'),
            children: topLevelLis(child.inner).map(parseChildLi)
          };
        }
        return parseChildLi(child);
      });
      parsed.push({ kind: 'group', text: decode(btn?.[1] ?? ''), children });
      continue;
    }
    // Plain top-level item: Agent (button on chat home, <a> on content pages).
    if (/id="motoai-menu-agent"/.test(li.inner)) {
      parsed.push({ kind: 'link', text: firstControlText(li.inner), url: '/aichatbot/' });
      continue;
    }
    parsed.push(parseChildLi(li));
  }
  return { parsed, chatExtras };
}

/** drawerCore() → the same normalized shape the parser produces. */
function expectedCore() {
  return drawerCore().map((entry) => {
    if (entry.kind === 'group') {
      return {
        kind: 'group',
        text: `${entry.icon} ${entry.label}`,
        children: entry.children.map((child) => {
          if (child.kind === 'hub') {
            return {
              kind: 'hub',
              text: `${child.icon} ${child.label}`,
              url: child.url,
              children: child.children.map((ch) => ({ kind: 'link', text: `${ch.icon} ${ch.label}`, url: ch.url }))
            };
          }
          if (child.kind === 'action') return { kind: 'action', text: `${child.icon} ${child.label}`, action: child.action };
          if (child.kind === 'contact') return { kind: 'contact', text: `${child.icon} ${child.label}`, ref: child.ref };
          return { kind: 'link', text: `${child.icon} ${child.label}`, url: child.url };
        })
      };
    }
    if (entry.kind === 'theme') return { kind: 'theme', text: `${entry.icon} ${entry.label}` };
    return { kind: 'link', text: `${entry.icon} ${entry.label}`, url: entry.url };
  });
}

// ---------- 1. Core menu: chat homepage == config/navigation.json ----------

test('v63 core menu: index.html drawer matches drawerCore() exactly (order/labels/icons/links/accordion)', () => {
  const html = read('index.html');
  const { parsed, chatExtras } = parseDrawer(html);
  assert.deepEqual(parsed, expectedCore(), 'index.html core drawer == config/navigation.json');
  // Chat-only extras are the divider + Xóa chat, at the very END.
  assert.deepEqual(chatExtras, ['divider', '🧹 Xóa chat'], 'chat-only utility = divider + Xóa chat, last');
});

test('v63 core menu: content-page drawers match drawerCore() on every generated page', () => {
  const expected = expectedCore();
  for (const p of contentPages()) {
    const { parsed, chatExtras } = parseDrawer(read(p));
    assert.deepEqual(parsed, expected, `${p}: core drawer == config/navigation.json`);
    assert.deepEqual(chatExtras, [], `${p}: no chat-only extras on content pages`);
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

test('v63: /aichatbot/ stays the ChatGPT-style chat homepage — body.chat-home, NO footer', () => {
  const html = read('index.html');
  assert.match(html, /<body class="chat-home">/);
  assert.equal((html.match(/<footer/g) ?? []).length, 0, 'chat homepage never gains a footer');
  assert.ok(!html.includes('class="site-header"'), 'chat homepage keeps its own app header');
  assert.ok(html.includes('class="motoai-app"'), 'chat homepage keeps the app shell');
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

test('v63 footer: MOTOAI + 3 parent hubs + DỊCH VỤ + PHÁP LÝ, no "24/7", verified bottom bar', () => {
  const business = JSON.parse(read('data/business/business.json'));
  for (const p of contentPages()) {
    const html = read(p);
    const footer = html.slice(html.indexOf('<footer class="blog-footer">'), html.indexOf('</footer>'));
    assert.ok(footer.includes('blog-footer-title">MOTOAI<'), `${p}: MOTOAI column`);
    for (const c of taxonomy.clusters) {
      assert.ok(footer.includes(`blog-footer-title">${esc(c.name)}<`), `${p}: hub column ${c.name}`);
    }
    assert.ok(footer.includes('blog-footer-title">DỊCH VỤ<'), `${p}: DỊCH VỤ column`);
    assert.ok(footer.includes('blog-footer-title">PHÁP LÝ<'), `${p}: PHÁP LÝ column`);
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
});

// ---------- 4. No duplicate IDs anywhere ----------

test('v63: no duplicate id attributes on any page (chat home + content pages)', () => {
  for (const p of ['index.html', ...contentPages()]) {
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
  const path = url.split('#')[0].split('?')[0].replace(/^\/aichatbot\//, '');
  return path === '' ? 'index.html' : `${path.replace(/\/$/, '')}/index.html`;
}

test('v63: every internal header/drawer/footer link resolves to a real page (no broken links, no orphans)', () => {
  for (const p of ['index.html', ...contentPages()]) {
    const html = read(p);
    const chrome = [
      html.slice(html.indexOf('<header'), html.indexOf('</header>') + 1),
      html.slice(html.indexOf('<nav class="motoai-drawer"'), html.indexOf('</nav>', html.indexOf('<nav class="motoai-drawer"'))),
      html.slice(html.indexOf('<footer'), html.indexOf('</footer>') + 1)
    ].join('\n');
    for (const m of chrome.matchAll(/href="(\/aichatbot\/[^"]*)"/g)) {
      const file = urlToFile(m[1]);
      assert.ok(existsSync(join(ROOT, file)), `${p}: link ${m[1]} -> missing file ${file}`);
    }
  }
});

// ---------- 6. URL/canonical stability ----------

test('v63: canonical URL of every page is unchanged (SITE + own path, trailing slash)', () => {
  const SITE = 'https://thuexemayhanoi.github.io/aichatbot/';
  const all = ['index.html', ...contentPages()];
  for (const p of all) {
    const html = read(p);
    const canonical = /rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    const expected = p === 'index.html' ? SITE : SITE + p.replace(/index\.html$/, '');
    assert.equal(canonical, expected, `${p}: canonical unchanged`);
  }
  // The sitemap keeps exactly the same URL set as the generated pages.
  const sitemap = read('sitemap.xml');
  for (const loc of [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
    const file = urlToFile(loc.replace(SITE, '/aichatbot/'));
    assert.ok(existsSync(join(ROOT, file)), `sitemap loc ${loc} -> missing file ${file}`);
  }
});

// ---------- 7. Drawer behaviour parity (shared runtime contract) ----------

test('v63: drawer runtime stays scroll-safe — no body scroll lock, single JS contract per surface', () => {
  const shell = read('assets/js/app-shell.js');
  const main = read('assets/js/main.js');
  for (const js of [shell, main]) {
    assert.ok(!/document\.body\.style\.overflow/.test(js), 'no body scroll lock');
    assert.ok(!/classList\.(add|remove)\('(lock|no-scroll)/.test(js), 'no scroll-lock class');
  }
  // One accordion contract: both surfaces close other groups + honor Escape.
  for (const js of [shell, main]) {
    assert.ok(js.includes('closeGroups'), 'one-open accordion');
    assert.ok(js.includes("key === 'Escape'"), 'Escape closes the drawer');
  }
});
