import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(ROOT, '404.html'), 'utf8');

test('404.html works at any depth: every link and asset is root-absolute', () => {
  const urls = [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(urls.length > 20, 'shell links are present');
  for (const u of urls) assert.match(u, /^(\/|#|https?:|mailto:|tel:)/, u);
  assert.match(html, /href="\/assets\/css\/style\.css\?v=/);
});

test('404.html is the site shell but not a page to index', () => {
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(html, /rel="canonical"|property="og:url"/);
  assert.match(html, /class="site-header"/);
  assert.match(html, /id="motoai-drawer"/);
  assert.match(html, /data-motoai-screen="not-found"/);
  for (const href of ['/', '/agent/', '/blog/', '/gia-thue/', '/lien-he/']) assert.ok(html.includes(`<a href="${href}">`), href);
  assert.doesNotMatch(html, /\{\{/, 'business facts are resolved');
  assert.doesNotMatch(readFileSync(join(ROOT, 'sitemap.xml'), 'utf8'), /404/);
});
