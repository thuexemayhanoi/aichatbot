import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawerCore, navigation, taxonomy, blogHome, categoryNav } from '../../tools/taxonomy.mjs';
import { siteNav, assetVersion } from '../../tools/app-shell.mjs';
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
    `<nav class="site-nav" aria-label="Chuyên mục"> <a href="${navigation.home.url}">${navigation.home.label}</a> `), 'only difference: the Trang Chủ entry');
  // Layout-only differences, all in the shared stylesheet: its own row on a real
  // desktop (wide, tall, mouse/trackpad — the Agent page loads no dropdown script,
  // so touch screens and landscape phones keep the finger-sized drawer with the
  // same links), hidden in the embed widget.
  const css = read('assets/css/style.css');
  assert.match(css, /\.motoai-header \.site-nav \{ display: none; \}\s*@media \(min-width: 900px\) and \(min-height: 600px\) and \(hover: hover\) and \(pointer: fine\) \{\s*\.motoai-header \{ grid-template-areas: "nav nav nav nav"[^}]*\}\s*\.motoai-header \.site-nav \{ display: flex;/,
    'hidden by default; own row above the title only on pointer desktops');
  assert.equal((css.match(/\.motoai-header \.site-nav \{ display: flex;/g) ?? []).length, 1, 'shown in exactly one place');
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
  const groups = drawerCore();
  const top = groups.filter((e) => e.kind === 'link').map((e) => e.label);
  assert.deepEqual(top, [navigation.home.label, navigation.agent.label], 'Trang Chủ + Agent Hỗ Trợ first');
  const ids = groups.filter((e) => e.kind === 'group').map((e) => e.label);
  assert.deepEqual(ids, ['Trang Web', 'Cẩm nang', 'Dịch Vụ', 'Pháp Lý']);
  for (const p of ['index.html', 'blog/index.html', 'blog/thue-xe/index.html', 'gia-thue/index.html', AGENT,
    'blog/thue-xe/thue-xe-may-gia-re/index.html']) {
    const html = read(p);
    const drawer = html.slice(html.indexOf('<nav class="motoai-drawer"'), html.indexOf('</nav>', html.indexOf('<nav class="motoai-drawer"')));
    for (const label of [navigation.home.label, navigation.agent.label, ...ids]) {
      assert.ok(drawer.includes(` ${label}`), `${p}: drawer has "${label}"`);
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
    const visible = [...trail.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [SITE + m[1], unesc(m[2])]);
    const schema = JSON.parse(ld).map((i) => [i.item, i.name]);
    assert.deepEqual(schema.slice(0, visible.length), visible, `${p}: BreadcrumbList = visible breadcrumb`);
  }
  assert.ok(checked > 2000, 'articles, hubs and Pages carry the breadcrumb');
  assert.ok(withSchema > 2000, 'articles and hubs carry the BreadcrumbList schema');
});

test('one source per label: blog home, categories and Pháp Lý come from their registries', () => {
  const blog = blogHome();
  const group = navigation.drawer.groups.find((g) => g.id === 'cm');
  assert.deepEqual(blog, { label: group.label, url: group.url }, 'Cẩm nang = the drawer group, with its url');
  assert.equal(drawerCore().find((e) => e.id === 'cm').label, blog.label, 'drawer shows the same label');
  const html = read('blog/thue-xe/thue-xe-may-gia-re/index.html');
  assert.ok(desktopNav(html).includes(`href="${blog.url}">${blog.label}</a>`), 'header links the blog home with the same label');
  assert.ok(footer(html).includes(`href="${blog.url}">${blog.label}</a>`), 'footer links the blog home with the same label');
  assert.ok(html.includes(`<a href="${blog.url}">${blog.label}</a> ›`), 'breadcrumb uses the same label');
  for (const c of navigation.categories) {
    const nav = categoryNav(c.id);
    assert.equal(nav.label, taxonomy.categories[c.id].label, `${c.id}: label from taxonomy.json`);
    assert.equal(nav.url, `/blog/${taxonomy.categories[c.id].dir}/`, `${c.id}: url from taxonomy.json`);
  }
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
  assert.match(sw, /request\.mode === 'navigate'[\s\S]{0,500}event\.respondWith\(\s*fetch\(request\)/, 'pages are network-first, so a deploy is never hidden behind an old cache');
});
