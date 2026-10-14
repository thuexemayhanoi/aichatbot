import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { taxonomy } from '../../tools/taxonomy.mjs';

/**
 * v67 premium theme contracts (docs/THEME_UPGRADE_MATRIX.md). Generated
 * output is checked on a representative page set: blog home, a cluster hub,
 * a category hub, a subtopic hub, an article and a legal page.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const manifest = JSON.parse(read('data/blog/published.json')).articles;
const first = manifest[0];
const firstDir = taxonomy.categories[first.category].dir;
const PAGES = [
  'blog/index.html',
  `blog/${taxonomy.clusters[0].dir}/index.html`,
  `blog/${firstDir}/index.html`,
  `blog/${firstDir}/${first.slug}/index.html`,
  'privacy/index.html',
  'gia-thue/index.html'
];

// ---------- Batch B: header, mega menu, drawer ----------

test('TH-010: skip link is the first body element and targets a focusable <main>', () => {
  for (const p of PAGES) {
    const html = read(p);
    assert.match(html, /<body[^>]*>\s*<a class="skip-link" href="#site-main">/, `${p}: skip link first`);
    assert.match(html, /<main class="site-main" id="site-main" tabindex="-1"/, `${p}: main is the skip target`);
  }
});

test('TH-010: business status lives in a reserved slot after the action group (no CLS)', () => {
  for (const p of PAGES) {
    const html = read(p);
    assert.ok(html.includes('<div class="site-status-slot"><span class="motoai-status" id="blog-business-status"'), `${p}: reserved status slot`);
  }
  const css = read('assets/css/blog.css');
  assert.match(css, /max-width:\s*767\.98px[\s\S]{0,700}\.site-status-slot\s*\{[^}]*height:\s*18px/, 'mobile slot has a fixed row height');
});

test('TH-011: each parent hub = crawlable link + disclosure button controlling a real panel', () => {
  for (const p of PAGES) {
    const html = read(p);
    assert.ok(!html.includes('aria-haspopup'), `${p}: no aria-haspopup on links`);
    for (const c of taxonomy.clusters) {
      const id = `site-mega-${c.id.toLowerCase()}`;
      assert.ok(html.includes(`aria-controls="${id}"`), `${p}: toggle controls ${id}`);
      assert.ok(html.includes(`id="${id}"`), `${p}: panel ${id} exists`);
    }
    const nav = html.slice(html.indexOf('<nav class="site-nav"'), html.indexOf('</nav>', html.indexOf('<nav class="site-nav"')));
    for (const m of nav.matchAll(/<a [^>]*href="(\/blog\/[^"]+)"/g)) {
      assert.ok(m[1].endsWith('/'), `${p}: menu link ${m[1]} is a directory URL`);
    }
  }
});

test('TH-011: mega menu links only point at pages that exist (no empty subtopics, stable picks)', () => {
  const html = read('blog/index.html');
  const nav = html.slice(html.indexOf('<nav class="site-nav"'), html.indexOf('</nav>'));
  for (const m of nav.matchAll(/href="\/(blog\/[^"]*)"/g)) {
    assert.doesNotThrow(() => read(`${m[1]}index.html`), `menu target ${m[1]} is generated`);
  }
  // Cornerstone picks = first published articles per category (append-only
  // manifest), so a new publish never rewrites every page's header.
  for (const id of Object.keys(taxonomy.categories)) {
    const a = manifest.find((x) => x.category === id);
    if (a) assert.ok(nav.includes(`/${a.slug}/"`), `cornerstone ${a.slug} in menu`);
  }
});

test('TH-011/012/013: app-shell.js wires Escape, outside click, aria sync and drawer focus', () => {
  const js = read('assets/js/app-shell.js');
  assert.ok(js.includes("key === 'Escape'"), 'Escape closes');
  assert.ok(js.includes("closest('.site-nav')"), 'outside click closes');
  assert.ok(js.includes("'aria-expanded'"), 'aria-expanded kept in sync');
  assert.ok(/\(open \? drawerClose : menuBtn\)\?\.focus\(\)/.test(js), 'focus into drawer on open, back to Menu on close');
  assert.ok(js.includes("e.key !== 'Tab'"), 'Tab wraps inside the open drawer');
  assert.ok(!js.includes('console.info'), 'no console diagnostics shipped');
});
