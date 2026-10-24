import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawerCore, taxonomy } from '../../tools/taxonomy.mjs';
import { SITE_PAGES } from '../../tools/site-pages.mjs';
import { renderDrawer } from '../../tools/menu-drawer.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const nav = drawerCore();
const groups = nav.filter((v) => v.kind === 'group');
const cm = groups.find((g) => g.id === 'cm');
const allLinks = nav.flatMap((v) => v.kind === 'group'
  ? v.children.flatMap((ch) => ch.kind === 'hub' ? [ch, ...ch.children] : [ch])
  : [v]).filter((v) => v.kind === 'link' || v.kind === 'hub');

test('complete navigation: every static Page + blog root is crawlable', () => {
  const hrefs = new Set(allLinks.map((x) => x.url));
  assert.ok(hrefs.has('/'), 'website homepage reachable');
  assert.ok(hrefs.has('/agent/'), 'Agent chat app reachable (v76: /agent/)');
  assert.ok(hrefs.has('/blog/'), 'blog home reachable');
  for (const page of SITE_PAGES) assert.ok(hrefs.has('/' + page.dir + '/'), 'missing Page ' + page.dir);
});

test('complete navigation: parent hubs, all categories, each live non-empty topic', () => {
  const hrefs = new Set(allLinks.map((x) => x.url));
  assert.ok(cm, 'Cẩm Nang exists');
  for (const cluster of taxonomy.clusters) {
    const url = '/blog/' + cluster.dir + '/';
    assert.ok(hrefs.has(url), 'missing parent ' + url);
  }
  for (const cat of Object.values(taxonomy.categories)) {
    const url = '/blog/' + cat.dir + '/';
    assert.ok(hrefs.has(url), 'missing category ' + url);
  }
  const sitemap = read('sitemap.xml');
  const liveSubtopics = Object.entries(taxonomy.subtopics).flatMap(([id, topics]) => {
    const dir = taxonomy.categories[id].dir;
    return topics.map((sub) => '/blog/' + dir + '/' + sub.slug + '/')
      .filter((url) => sitemap.includes('<loc>https://chatbot.thuexemaynguyentu.com' + url + '</loc>'));
  });
  const navTopicUrls = new Set(cm.children.flatMap((ch) => ch.kind === 'hub'
    ? ch.children.filter((kid) => kid.level === 'subtopic').map((kid) => kid.url) : []));
  assert.deepEqual([...navTopicUrls].sort(), [...new Set(liveSubtopics)].sort(),
    'only real published subtopic hubs are linked, no missing or empty hubs');
  for (const url of hrefs) {
    if (url.includes('?') || url.includes('#')) continue;
    const file = join(ROOT, url === '/' ? 'index.html' : url.slice(1) + 'index.html');
    assert.ok(existsSync(file), 'navigation link has no page: ' + url);
  }
});

test('compact navigation: all readable link labels are 2–3 Vietnamese words', () => {
  for (const entry of [...nav, ...groups.flatMap((g) => [g, ...g.children])]) {
    if (entry.label) {
      const words = entry.label.trim().split(/\s+/).length;
      assert.ok(words >= 2 && words <= 3, 'label must be 2–3 words: ' + entry.label);
    }
  }
  for (const hub of cm.children.filter((x) => x.kind === 'hub')) {
    for (const item of hub.children) {
      const words = item.label.trim().split(/\s+/).length;
      assert.ok(words >= 2 && words <= 3, 'topic label must be 2–3 words: ' + item.label);
    }
  }
});

test('Agent app and content renderers use identical canonical category/topic URLs', () => {
  const chat = renderDrawer({ mode: 'chat' });
  const content = renderDrawer({ mode: 'content' });
  assert.ok(read('agent/index.html').includes(chat), 'Agent app drawer generated from shared renderer');
  assert.ok(read('index.html').includes(content), 'homepage drawer generated from the shared content renderer');
  for (const link of allLinks) {
    // Inside the Agent app the Agent entry is a <button> that closes the drawer (it IS the current page).
    assert.ok(chat.includes('href="' + link.url + '"') || link.url === '/agent/',
      'Agent app missing ' + link.url);
    assert.ok(content.includes('href="' + link.url + '"'), 'content missing ' + link.url);
  }
  assert.ok(content.includes('motoai-subtopic'), 'three-level topic hierarchy styled in content');
  assert.ok(chat.includes('motoai-subtopic'), 'three-level topic hierarchy styled in app');
  assert.ok(chat.includes('id="motoai-group-dv-btn"'), 'existing contact dock action remains wired');
  assert.ok(chat.includes('id="motoai-menu-whatsapp"'), 'verified WhatsApp handler retained');
  assert.ok(!content.includes('motoai-reset'), 'content pages never get chat reset');
});

test('iPhone drawer scrolls in-place and desktop nested menu remains keyboard reachable', () => {
  const rootCss = read('assets/css/style.css');
  const blogCss = read('assets/css/src/blog.css');
  assert.match(rootCss, /\.motoai-drawer\s*\{[^}]*overflow-y:\s*auto/, 'scrollable drawer');
  assert.match(rootCss, /motoai-subtopic/, 'subtopic indent');
  assert.match(blogCss, /site-nav-subtopic/, 'desktop nested dropdown links');
  assert.match(blogCss, /max-height:\s*min\(72dvh,\s*610px\)/, 'dropdown bounded to viewport');
});
