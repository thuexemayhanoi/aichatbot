import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawerCore, navigation, taxonomy, blogHome, categoryNav } from '../../tools/taxonomy.mjs';
import { siteNav, assetVersion } from '../../tools/app-shell.mjs';
import { icon } from '../../tools/blog-components.mjs';
import { STATIC_DIRS, SITE_PAGES } from '../../tools/site-pages.mjs';

/**
 * v77 GLOBAL NAVIGATION SYNC: one source (config/navigation.json +
 * config/site-pages.json + data/blog/taxonomy.json, resolved by drawerCore)
 * → one desktop-menu component (siteNav), one drawer renderer, one footer
 * resolver and one breadcrumb root, on EVERY page group: homepage, blog,
 * hubs, categories, subtopics, 2.000+ articles, static Pages and the Agent
 * app. These tests compare the generated menus across all those groups.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const CONTENT_PAGES = ['index.html', ...walk('blog').filter((p) => p.endsWith('index.html')), ...STATIC_DIRS.map((d) => `${d}/index.html`)];
const AGENT = 'agent/index.html';

/** Page-independent shape of a menu: drop the "you are here" state. */
const normalize = (html) => html.replace(/ aria-current="page"| data-active="1"/g, '').replace(/\s+/g, ' ').trim();
const desktopNav = (html) => /<nav class="site-nav" aria-label="Chuyên mục">[\s\S]*?<\/nav>/.exec(html)?.[0];
const footer = (html) => html.slice(html.indexOf('<footer class="blog-footer">'), html.indexOf('</footer>'));
/** Style rules of a stylesheet with the @media prelude(s) they sit in (comments stripped). */
function cssRules(css) {
  const out = [];
  const stack = [];
  let start = 0;
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (let k = 0; k < src.length; k++) {
    if (src[k] === '{') { stack.push(src.slice(start, k).split(';').pop().trim()); start = k + 1; }
    else if (src[k] === '}') {
      const head = stack.pop();
      if (head && !head.startsWith('@')) out.push({ media: stack.filter((h) => h.startsWith('@media')).join(' and '), selectors: head.split(',').map((s) => s.trim()), body: src.slice(start, k) });
      start = k + 1;
    }
  }
  return out;
}
// v79: the horizontal menu starts at 1200px, where the desktop sidebar column does.
const NAV_MEDIA = '@media (min-width: 1200px)';
const AGENT_NAV_MEDIA = `${NAV_MEDIA} and (min-height: 600px) and (hover: hover) and (pointer: fine)`;

test('every page group renders the SAME desktop menu (homepage, blog, hubs, subtopics, articles, Pages)', () => {
  assert.ok(CONTENT_PAGES.length > 2000, 'all generated content pages are checked');
  const reference = normalize(siteNav());
  for (const p of CONTENT_PAGES) {
    const nav = desktopNav(read(p));
    assert.ok(nav, `${p}: desktop menu present`);
    assert.equal(normalize(nav), reference, `${p}: desktop menu == siteNav() (one component, one source)`);
  }
});

test('the Agent app shows the same desktop menu (+ Trang Chủ, since its brand mark is not a home link)', () => {
  const html = read(AGENT);
  const header = html.slice(html.indexOf('<header class="motoai-header">'), html.indexOf('</header>'));
  const nav = desktopNav(header);
  assert.ok(nav, 'desktop menu inside the Agent header (not before the chat app)');
  assert.equal(normalize(nav), normalize(siteNav({ home: true })));
  assert.equal(normalize(nav), normalize(siteNav()).replace('<nav class="site-nav" aria-label="Chuyên mục"> ',
    `<nav class="site-nav" aria-label="Chuyên mục"> <a href="${navigation.home.url}">${icon(navigation.svg_icons.home, 'site-nav-icon')}${navigation.home.label}</a> `), 'only difference: the Trang Chủ entry');
  // v79 header order: ☰ Danh mục first, then mark + title, status, the desktop menu, the actions.
  const order = ['<button type="button" class="motoai-menu" id="motoai-menu-btn"', '<div class="motoai-header-text">',
    '<span class="motoai-status"', '<nav class="site-nav" aria-label="Chuyên mục">', '<div class="motoai-header-actions">'].map((s) => header.indexOf(s));
  assert.ok(order.every((at, k) => at > -1 && (k === 0 || at > order[k - 1])), 'Agent header: ☰ Danh mục, title, status, desktop menu, actions');
  assert.match(header, /^<header class="motoai-header">\s*<button type="button" class="motoai-menu" id="motoai-menu-btn"/, '☰ Danh mục opens the Agent header');
  // Layout-only differences, all in the shared stylesheet: its own row on a real
  // desktop (>= 1200px like the content-page menu, tall, mouse/trackpad — the Agent
  // page loads no dropdown script, so touch screens and landscape phones keep the
  // finger-sized sidebar with the same links), hidden in the embed widget.
  const css = read('assets/css/style.css');
  assert.match(css, /\.motoai-header \.site-nav \{ display: none; \}\s*@media \(min-width: 1200px\) and \(min-height: 600px\) and \(hover: hover\) and \(pointer: fine\) \{\s*body:not\(\[data-motoai-embed="1"\]\) \.motoai-header \{ grid-template-areas: "nav nav nav nav nav" "menu mark title status actions" "menu mark sub status actions"; \}\s*\.motoai-header \.site-nav \{ display: flex; grid-area: nav;/,
    'hidden by default; own full-width row above the ☰ / title row only on pointer desktops');
  // Every rule that can show the nav element (a selector ending in .site-nav with a
  // non-none display) is either the generic content-page rule — which the more
  // specific .motoai-header rule above hides on the Agent page — or the ONE
  // Agent rule inside the pointer-desktop query. No !important anywhere. The
  // content-page desktop layout (assets/css/src/blog.css) never shows it either.
  const sheets = { 'assets/css/style.css': css, 'assets/css/src/blog.css': read('assets/css/src/blog.css') };
  const shows = Object.entries(sheets).flatMap(([file, src]) => cssRules(src).map((r) => ({ ...r, file })))
    .filter((r) => /display:\s*(?!none)[\w-]/.test(r.body) && r.selectors.some((s) => /\.site-nav$/.test(s)));
  assert.ok(shows.length > 0, 'parsed the desktop menu rules');
  for (const r of shows) {
    assert.ok(!/!important/.test(r.body), `no !important on a menu display rule: ${r.selectors.join(', ')}`);
    for (const s of r.selectors.filter((sel) => /\.site-nav$/.test(sel))) {
      const ok = r.file === 'assets/css/style.css' &&
        ((s === '.site-nav' && r.media === NAV_MEDIA) || (s === '.motoai-header .site-nav' && r.media === AGENT_NAV_MEDIA));
      assert.ok(ok, `unexpected rule shows the menu: "${s}" in "${r.media || 'no media'}" (${r.file})`);
    }
  }
  assert.equal(shows.filter((r) => r.selectors.includes('.site-nav')).length, 1, 'the content-page menu is shown in exactly one place');
  assert.equal(shows.filter((r) => r.selectors.includes('.motoai-header .site-nav')).length, 1, 'the Agent menu is shown in exactly one place');
  const agentGrid = cssRules(css).filter((r) => /grid-template-areas:\s*"nav/.test(r.body));
  assert.deepEqual(agentGrid.map((r) => [r.selectors.join(', '), r.media]), [['body:not([data-motoai-embed="1"]) .motoai-header', AGENT_NAV_MEDIA]],
    'the menu row exists only where the menu shows (never an empty row in the embed widget)');
  assert.match(css, /body\[data-motoai-embed="1"\] \.motoai-header \.site-nav \{ display: none; \}/, 'never inside the embed widget');
});

test('desktop menu covers the Pages, every parent hub, category and live subtopic — labels 2–3 words', () => {
  const core = drawerCore();
  const nav = siteNav();
  const pages = core.find((e) => e.id === 'pages');
  const hubs = core.find((e) => e.id === 'cm').children.filter((c) => c.kind === 'hub');
  for (const entry of [...pages.children, ...hubs, ...hubs.flatMap((h) => h.children)]) {
    assert.ok(nav.includes(`href="${entry.url}"`), `${entry.label} (${entry.url}) in the desktop menu`);
    const words = entry.label.trim().split(/\s+/).length;
    assert.ok(words >= 2 && words <= 3, `"${entry.label}": 2–3 word label`);
  }
  assert.equal(hubs.length, taxonomy.clusters.length, 'all parent hubs');
});

test('drawer: all six groups on every page group, including the Agent app', () => {
  const core = drawerCore();
  const top = core.filter((e) => e.kind === 'link').map((e) => e.label);
  assert.deepEqual(top, [navigation.home.label, navigation.agent.label], 'Trang Chủ + Hỏi Agent first');
  const groups = core.filter((e) => e.kind === 'group');
  const ids = groups.map((e) => e.label);
  assert.deepEqual(ids, ['Cẩm nang', 'Trang Web', 'Pháp Lý', 'Dịch Vụ']);
  // v79 rows: an inline SVG glyph from the shared set + the label in its own
  // <span>; the config emoji are no longer drawn in the sidebar.
  const svg = navigation.svg_icons;
  const glyph = (name) => icon(name, 'motoai-nav-icon');
  for (const p of ['index.html', 'blog/index.html', 'blog/thue-xe/index.html', 'gia-thue/index.html', AGENT,
    'blog/thue-xe/thue-xe-may-gia-re/index.html']) {
    const html = read(p);
    const start = html.indexOf('<nav class="motoai-drawer"');
    assert.ok(start > -1, `${p}: sidebar present`);
    const drawer = normalize(html.slice(start, html.indexOf('</nav>', start)));
    const agentInner = `${glyph(svg.agent)}<span>${navigation.agent.label}</span>`;
    const rows = [
      [navigation.home.label, `<li><a href="${navigation.home.url}">${glyph(svg.home)}<span>${navigation.home.label}</span></a></li>`],
      // In the Agent app the Agent row is the in-app toggle; elsewhere a link to /agent/.
      [navigation.agent.label, p === AGENT ? `<li><button type="button" id="motoai-menu-agent">${agentInner}</button></li>`
        : `<li><a href="${navigation.agent.url}">${agentInner}</a></li>`],
      ...groups.map((g) => [g.label, `<li class="motoai-group" data-group="${g.id}"> <div class="motoai-row motoai-group-head">` +
        (g.url ? `<a class="motoai-group-link" href="${g.url}">` : '<span class="motoai-group-title">') +
        `${glyph(svg.groups[g.id])}<span>${g.label}</span>${g.url ? '</a>' : '</span>'}` +
        `<button type="button" class="motoai-toggle motoai-group-btn" id="motoai-group-${g.id}-btn"`])
    ];
    const at = rows.map(([label, markup]) => {
      const i = drawer.indexOf(markup);
      assert.ok(i > -1, `${p}: drawer has "${label}"`);
      return i;
    });
    assert.deepEqual([...at].sort((a, b) => a - b), at, `${p}: Trang Chủ, Hỏi Agent, then the groups in config order`);
    for (const e of [navigation.home, navigation.agent, ...groups]) {
      assert.ok(!drawer.includes(e.icon), `${p}: "${e.label}" uses its SVG glyph, not the emoji ${e.icon}`);
    }
  }
});

test('footer: identical on every content page and built only from referenced drawer entries', () => {
  const reference = normalize(footer(read('index.html')));
  for (const p of CONTENT_PAGES) assert.equal(normalize(footer(read(p))), reference, `${p}: shared footer`);
  for (const label of [navigation.home.label, navigation.agent.label, ...drawerCore().find((e) => e.id === 'pages').children.map((c) => c.label)]) {
    assert.ok(reference.includes(`>${label}</a>`), `footer links "${label}"`);
  }
  assert.ok(!read(AGENT).includes('class="blog-footer"'), 'the Agent app keeps the full-screen chat (no footer)');
});

test('breadcrumbs start at the navigation home entry on every page that has one', () => {
  let checked = 0;
  let withSchema = 0;
  let nonBlogSchema = 0;
  const SITE = 'https://chatbot.thuexemaynguyentu.com';
  const unesc = (s) => s.replace(/&amp;/g, '&');
  for (const p of CONTENT_PAGES) {
    const html = read(p);
    const trail = /<nav class="blog-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1];
    if (!trail) continue;
    checked++;
    assert.ok(trail.startsWith(`<a href="${navigation.home.url}">${navigation.home.label}</a>`), `${p}: breadcrumb root`);
    // The BreadcrumbList schema is built from the same crumbs: same names, same targets.
    const ld = /"@type":"BreadcrumbList","itemListElement":(\[[\s\S]*?\])\}/.exec(html)?.[1];
    if (!ld) continue;
    withSchema++;
    if (!p.startsWith('blog/')) nonBlogSchema++;
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)[1];
    const current = /<span>([^<]*)<\/span>\s*$/.exec(trail)?.[1];
    assert.ok(current, `${p}: the trail ends with the current page`);
    const visible = [...[...trail.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [SITE + m[1], unesc(m[2])]), [canonical, unesc(current)]];
    const schema = JSON.parse(ld).map((i) => [i.item, i.name]);
    assert.deepEqual(schema, visible, `${p}: BreadcrumbList = visible breadcrumb (every crumb, last = this page)`);
  }
  assert.ok(checked > 2000, 'articles, hubs and Pages carry the breadcrumb');
  assert.equal(withSchema - nonBlogSchema, CONTENT_PAGES.filter((p) => p.startsWith('blog/')).length, 'the blog home and every hub, category, subtopic and article page carry the BreadcrumbList schema');
});

test('one source per label: blog home, categories and Pháp Lý come from their registries', () => {
  const blog = blogHome();
  const group = navigation.drawer.groups.find((g) => g.id === 'cm');
  assert.deepEqual(blog, { label: group.label, url: group.url }, 'Cẩm nang = the drawer group, with its url');
  assert.equal(drawerCore().find((e) => e.id === 'cm').label, blog.label, 'drawer shows the same label');
  const html = read('blog/thue-xe/thue-xe-may-gia-re/index.html');
  assert.ok(desktopNav(html).includes(`href="${blog.url}">${icon(navigation.svg_icons.blog, 'site-nav-icon')}${blog.label}</a>`), 'header links the blog home with the same label');
  assert.ok(footer(html).includes(`href="${blog.url}">${blog.label}</a>`), 'footer links the blog home with the same label');
  assert.ok(html.includes(`<a href="${blog.url}">${blog.label}</a> ›`), 'breadcrumb uses the same label');
  for (const c of navigation.categories) {
    const nav = categoryNav(c.id);
    assert.equal(nav.label, taxonomy.categories[c.id].label, `${c.id}: label from taxonomy.json`);
    assert.equal(nav.url, `/blog/${taxonomy.categories[c.id].dir}/`, `${c.id}: url from taxonomy.json`);
  }
  // The blog home URL is a generated page whose canonical is that URL.
  assert.match(read(`${blog.url.replace(/^\//, '')}index.html`), new RegExp(`<link rel="canonical" href="https://chatbot\\.thuexemaynguyentu\\.com${blog.url}"`), 'the blog home URL is the page the builder writes');
  const search = drawerCore().find((e) => e.id === 'cm').children.find((c) => c.kind === 'link');
  assert.equal(search.url, blog.url, 'Tìm Bài links the same blog home (no second URL key)');
  const legal = SITE_PAGES.filter((p) => p.group === 'legal').map((p) => `/${p.dir}/`);
  assert.deepEqual(drawerCore().find((e) => e.id === 'pl').children.map((c) => c.url), legal, 'Pháp Lý = registry pages with group "legal", same order');
  const web = SITE_PAGES.filter((p) => p.group !== 'legal').map((p) => `/${p.dir}/`);
  assert.deepEqual(drawerCore().find((e) => e.id === 'pages').children.map((c) => c.url), web, 'Trang Web = the other registry pages');
});

test('no stale UI: every page and the service worker reference the current content-hashed assets', () => {
  const v = assetVersion('assets/css/style.css');
  for (const p of [...CONTENT_PAGES, AGENT]) {
    const html = read(p);
    assert.ok(html.includes(`assets/css/style.css?v=${v}"`), `${p}: links the current style.css`);
    for (const [, file, ver] of html.matchAll(/(assets\/(?:css|js)\/[\w.-]+\.(?:css|js))\?v=(\d+)/g)) {
      assert.equal(ver, assetVersion(file), `${p}: ${file} carries its current content hash`);
    }
  }
  const sw = read('service-worker.js');
  assert.ok(sw.includes(`'./assets/css/style.css?v=${v}'`), 'offline shell precaches the current style.css');
  const precached = [...sw.matchAll(/(assets\/(?:css|js)\/[\w.-]+\.(?:css|js))\?v=(\d+)/g)];
  assert.ok(precached.length >= 2, 'style.css and main.js are precached with a version');
  for (const [, file, ver] of precached) assert.equal(ver, assetVersion(file), `service worker: ${file} carries its current content hash`);
  assert.match(sw, /request\.mode === 'navigate'[\s\S]{0,500}event\.respondWith\(\s*fetch\(request\)/, 'pages are network-first, so a deploy is never hidden behind an old cache');
});
