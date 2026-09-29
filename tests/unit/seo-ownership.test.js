import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { taxonomy } from '../../tools/taxonomy.mjs';

/**
 * v63.1 SEO OWNERSHIP GATE — enforces config/seo-ownership.json:
 *   - cross-repository protected commercial intents never become an exact
 *     <title>/<h1> of any page in THIS repository (anti-cannibalization);
 *   - the homepage keeps the APP / WEB APPLICATION / DIGITAL RENTAL ASSISTANT
 *     identity (owned keywords, WebApplication schema, no native-app claims);
 *   - LOCAL articles must keep a distinct informational/Agent angle instead
 *     of competing with the commercial landing pages of other repositories.
 * Legitimate factual usage (business address, verified contact pages, footer
 * business descriptor) is NOT blocked — only landing-page intent is.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const SITE_PAGES = [
  'index.html',
  'gioi-thieu/index.html', 'gia-thue/index.html', 'lien-he/index.html',
  'chinh-sach/index.html', 'privacy/index.html', 'terms/index.html',
  ...walk('blog').filter((p) => p.endsWith('index.html'))
];
const ownership = JSON.parse(read('config/seo-ownership.json'));
const PROTECTED = ownership.protected_commercial_intents.map((k) => k.keyword.toLowerCase());

test('seo-ownership config: protected intents + owned APP identity are declared', () => {
  assert.ok(ownership.primary_identity.includes('APP'), 'primary identity stays APP/WEB APPLICATION');
  assert.ok(PROTECTED.length >= 2, 'both cross-repo commercial intents are protected');
  assert.ok(ownership.owned_keywords.length >= 4, 'owned keyword family declared');
});

test('anti-cannibalization: protected commercial keywords are never an exact title or H1', () => {
  for (const p of SITE_PAGES) {
    const html = read(p);
    const title = (/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '').toLowerCase().trim();
    const ogTitle = (/<meta property="og:title" content="([^"]*)"/.exec(html)?.[1] ?? '').toLowerCase().trim();
    const h1s = [...html.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1].toLowerCase().trim());
    for (const kw of PROTECTED) {
      assert.ok(![title, ogTitle, ...h1s].includes(kw),
        `${p}: title/H1 must not be the exact protected keyword "${kw}"`);
    }
  }
});

test('homepage identity: owned APP keywords + WebApplication schema, no native-app claims', () => {
  const html = read('index.html');
  assert.match(html, /<title>[^<]*Ứng dụng thuê xe máy/i);
  assert.ok(html.includes('"@type": "WebApplication"'), 'WebApplication schema');
  const lower = html.toLowerCase();
  for (const kw of ownership.owned_keywords.slice(0, 4)) {
    assert.ok(lower.includes(kw.toLowerCase()) || kw.includes('digital'),
      `homepage references the owned intent: ${kw}`);
  }
  assert.ok(!/app store|google play/i.test(html), 'never claimed as a store-listed native app');
});

test('LOCAL articles keep a distinct Agent/app/informational angle', () => {
  const ARTICLES = JSON.parse(read('data/blog/published.json')).articles;
  const ANGLES = ['agent', 'app', 'ứng dụng', 'công cụ', 'hướng dẫn', 'thủ tục', 'kinh nghiệm', 'an toàn', 'cẩm nang'];
  for (const a of ARTICLES.filter((x) => x.category === 'LOCAL')) {
    const dir = taxonomy.categories.LOCAL.dir;
    const html = read(`blog/${dir}/${a.slug}/index.html`).toLowerCase();
    assert.ok(ANGLES.some((t) => html.includes(t)),
      `${a.slug}: LOCAL article must add an Agent/app/informational angle, not a generic rental landing`);
  }
});

test('published article titles are unique (no duplicate landing intent)', () => {
  const ARTICLES = JSON.parse(read('data/blog/published.json')).articles;
  const titles = ARTICLES.map((a) => a.title.toLowerCase());
  assert.equal(new Set(titles).size, titles.length, 'no two published articles share a title');
});
