import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { minifyCss, assertMinifiable, CSS_SOURCE, CSS_OUTPUT } from '../../tools/css-build.mjs';
import { taxonomy } from '../../tools/taxonomy.mjs';
import { assetVersion } from '../../tools/app-shell.mjs';
import { BLOG_UI, feature, contactBand, renderSlot, categoryAction, icon } from '../../tools/blog-components.mjs';
import { publishedManifestArticles } from '../helpers/factory-sandbox.mjs';

/**
 * v72 single-source contract: one token block for every color, one config
 * for identity/flags/CTA/slots, content-hashed assets — so editing ONE
 * place re-skins or re-wires all generated pages on the next build.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SOURCE = read(CSS_SOURCE);
const CATEGORY_IDS = ['APP', 'RENT', 'EV', 'GUIDE', 'SAFE', 'LOCAL'];

test('colors live only in the token blocks of the stylesheet source', () => {
  const outsideTokens = SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/:root\s*\{[^}]*\}/, '')
    .replace(/html\[data-motoai-theme="dark"\]\s*\{[^}]*\}/, '');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(outsideTokens), 'no hex color outside the token blocks');
  assert.ok(!/\b(?:rgba?|hsla?)\((?!var\()/i.test(outsideTokens), 'no raw rgb()/hsl() outside the token blocks');
  for (const token of ['--paper', '--ink', '--signal', '--panel', '--font', '--ease']) {
    assert.match(SOURCE, new RegExp(`:root\\s*\\{[^}]*${token}:`), `token ${token} defined in :root`);
  }
});

test('served stylesheet is the fresh minified build of the source', () => {
  const served = read(CSS_OUTPUT);
  assert.ok(served.startsWith('/* generated from '), 'served file is marked as generated');
  assert.ok(served.endsWith(minifyCss(SOURCE)), 'assets/css/blog.css is stale: run node tools/build-blog.mjs');
});

test('minifier keeps every space that carries meaning', () => {
  assert.equal(minifyCss('a :hover { color: red; }'), 'a :hover{color:red}\n');
  assert.equal(minifyCss('.x { width: calc(100% - 2 * var(--g)); }'), '.x{width:calc(100% - 2 * var(--g))}\n');
  assert.equal(minifyCss('.a > .b , .c { margin: 0.5em 10.5px; }'), '.a > .b,.c{margin:.5em 10.5px}\n');
  assert.equal(minifyCss('/* note */ .d::before { content: ""; }'), '.d::before{content:""}\n');
  assert.throws(() => assertMinifiable('.e::before { content: "a; b"; }'), /string/, 'strings with ; , { } are refused, never mangled');
});

test('every content page links stylesheets and scripts by current content hash', () => {
  const pages = ['blog/index.html', 'blog/thue-xe/index.html', 'privacy/index.html', 'gia-thue/index.html',
    ...publishedManifestArticles(ROOT).slice(0, 3).map((a) => `blog/${taxonomy.categories[a.category].dir}/${a.slug}/index.html`)];
  for (const p of pages) {
    const html = read(p);
    for (const file of ['assets/css/style.css', 'assets/css/blog.css', 'assets/js/app-shell.js']) {
      assert.ok(html.includes(`${file}?v=${assetVersion(file)}"`), `${p}: ${file} carries its current content hash`);
    }
  }
});

test('self-hosted Vietnamese webfont: subset files, license, swap, metric fallback', () => {
  for (const w of [400, 600, 800]) {
    assert.ok(existsSync(join(ROOT, `assets/fonts/bvp-${w}.woff2`)), `bvp-${w}.woff2 present`);
    assert.match(SOURCE, new RegExp(`url\\(/assets/fonts/bvp-${w}\\.woff2\\)`), `@font-face ${w} root-absolute url`);
  }
  assert.match(read('assets/fonts/OFL.txt'), /SIL Open Font License/, 'OFL license shipped with the font');
  assert.equal((SOURCE.match(/font-display:\s*swap/g) ?? []).length, 3, 'text never invisible while fonts load');
  assert.match(SOURCE, /font-family:\s*"BVP Fallback"[^}]*size-adjust/, 'metric-matched fallback (no layout shift on swap)');
});

test('sticky header + TOC: body never becomes a scroll container', () => {
  assert.match(SOURCE, /body\.content-page\s*\{[^}]*overflow-x:\s*clip/, 'overflow-x: clip (hidden would force overflow-y:auto)');
  assert.match(SOURCE, /@media \(min-width: 1100px\)[\s\S]*?\.blog-toc-desktop\s*\{[^}]*position:\s*sticky/, 'desktop TOC rail is sticky');
});

test('motion: scroll-linked, opt-out flag, reduced motion kills every animation', () => {
  assert.match(SOURCE, /@supports \(animation-timeline: view\(\)\)/, 'reveal only where scroll timelines exist');
  assert.match(SOURCE, /\[data-motion="on"\]/, 'motion keyed to the config flag');
  assert.match(SOURCE, /prefers-reduced-motion: reduce\)\s*\{[^}]*animation:\s*none !important/, 'reduced motion: no animation');
  const html = read('blog/index.html');
  assert.match(html, new RegExp(`<html lang="vi" data-motion="${feature('motion') ? 'on' : 'off'}">`), 'flag rendered on <html>');
  assert.ok(!/class="blog-screen-title"[^>]*style=/.test(html), 'the H1 (LCP) is never animated inline');
});

test('blog-ui config: identity, boolean flags and a CTA action for every category', () => {
  assert.ok(BLOG_UI.site.name && BLOG_UI.site.shortName && BLOG_UI.site.tagline);
  for (const [k, v] of Object.entries(BLOG_UI.features)) assert.equal(typeof v, 'boolean', `features.${k}`);
  assert.equal(feature('not-configured'), true, 'a missing flag never hides UI');
  for (const id of CATEGORY_IDS) {
    const action = categoryAction(id);
    assert.ok(action.label && (action.href || action.contactRef), `${id}: contextual action`);
  }
  const html = read('blog/index.html');
  assert.ok(html.includes(`<meta property="og:site_name" content="${BLOG_UI.site.name.replace(/&/g, '&amp;')}">`), 'og:site_name from config');
  assert.ok(html.includes(`content="${BLOG_UI.site.themeColor.light}" media="(prefers-color-scheme: light)"`), 'theme-color from config');
});

test('contact band: one Ask Agent action, verified call, contextual action — no hard-coded contact URLs', () => {
  const business = JSON.parse(read('data/business/business.json'));
  const band = contactBand({ topic: 'Giá & cọc', category: 'RENT', business });
  assert.equal((band.match(/href="\/\?ask=/g) ?? []).length, 1, 'exactly one Ask Agent action');
  assert.ok(band.includes(`/?ask=${encodeURIComponent('Giá & cọc')}`), 'topic is URL-encoded');
  assert.ok(band.includes('data-contact-ref="call"'), 'call resolved at runtime from business.json');
  assert.ok(band.includes(business.contact.phone_display), 'call label shows the verified number');
  assert.ok(band.includes('href="/gia-thue/"'), 'RENT → price page');
  assert.ok(!band.includes(business.contact.phone_uri) && !band.includes(business.contact.maps), 'no hard-coded contact URLs');
  assert.ok(contactBand({ topic: 'x', category: 'LOCAL', business }).includes('data-contact-ref="map"'), 'LOCAL → directions');
});

test('slots: empty by default, category-filtered, price glance uses verified pricing only', () => {
  for (const name of Object.keys(BLOG_UI.slots)) assert.equal(renderSlot(name, { category: 'RENT' }), '', `${name} empty by default`);
  const pricing = JSON.parse(read('data/business/pricing.json'));
  const items = [{ type: 'price-glance', categories: ['RENT'] }, { type: 'notice', text: 'Xem chính sách', href: '/chinh-sach/' }];
  const rent = renderSlot('article.afterBody', { category: 'RENT', pricing }, items);
  const verifiedMin = Math.min(...pricing.vehicles.filter((v) => v.rates.day.min != null).map((v) => v.rates.day.min));
  assert.ok(rent.includes(`${verifiedMin.toLocaleString('vi-VN')}đ`), 'lowest verified day rate');
  assert.ok(rent.includes(pricing.disclaimer), 'pricing disclaimer travels with the number');
  assert.ok(rent.includes('href="/chinh-sach/"'), 'notice rendered');
  const ev = renderSlot('article.afterBody', { category: 'EV', pricing }, items);
  assert.ok(!ev.includes('slot-price'), 'category filter: no price glance outside RENT');
});

test('articles state the description once (standfirst summary, no duplicate dek)', () => {
  for (const a of publishedManifestArticles(ROOT).slice(0, 25)) {
    const html = read(`blog/${taxonomy.categories[a.category].dir}/${a.slug}/index.html`);
    const main = html.slice(html.indexOf('<main'), html.indexOf('<article'));
    assert.ok(main.includes('class="blog-summary"'), `${a.slug}: summary present`);
    assert.ok(!/<p class="blog-screen-lead">/.test(main), `${a.slug}: no duplicate dek above the summary`);
  }
});

test('icons are one inline SVG set (no emoji glyphs in the shell chrome)', () => {
  assert.match(icon('arrow'), /^<svg class="i i-arrow"[^>]*aria-hidden="true"/);
  assert.throws(() => icon('nope'), /unknown icon/);
  const html = read('blog/index.html');
  const header = html.slice(html.indexOf('<header class="site-header">'), html.indexOf('</header>'));
  assert.ok(!/\p{Extended_Pictographic}/u.test(header.replace(/<button[^>]*blog-theme-toggle[\s\S]*?<\/button>/, '')), 'header chrome uses SVG icons, not emoji');
});

test('shared rebuild + CI gates cover every generated surface', () => {
  const rebuild = read('.github/workflows/blog-shared-rebuild.yml');
  const ci = read('.github/workflows/ci.yml');
  for (const path of ['assets/css/src/**', 'tools/css-build.mjs', 'data/site/**']) {
    assert.ok(rebuild.includes(`'${path}'`), `shared rebuild triggers on ${path}`);
  }
  for (const dir of ['doi-tac', 'assets/css/blog.css']) {
    assert.ok(new RegExp(`git add[\\s\\S]*${dir.replace(/[./]/g, (c) => `\\${c}`)}`).test(rebuild), `rebuild commits ${dir}`);
    assert.ok(new RegExp(`git diff --exit-code[^\\n]*${dir.replace(/[./]/g, (c) => `\\${c}`)}`).test(ci), `CI determinism gate covers ${dir}`);
  }
  assert.ok(readdirSync(join(ROOT, 'doi-tac')).includes('index.html'));
});
