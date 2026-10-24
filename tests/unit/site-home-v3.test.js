import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { SITE_HOME } from '../../tools/site-pages.mjs';
import { drawerCore, taxonomy, navigation } from '../../tools/taxonomy.mjs';
import { resolveFacts } from '../../tools/blog-components.mjs';
import { newestFirst } from '../../tools/build-blog.mjs';
import { publishedManifestArticles } from '../helpers/factory-sandbox.mjs';

/**
 * v76 Apple V3 homepage: `/` is a real website front page on the shared
 * content shell (header, drawer, footer, tokens). The full-screen chat moved
 * to /agent/. Every section is generated from existing sources —
 * config/site-pages.json (siteHome copy), config/navigation.json +
 * data/blog/taxonomy.json (guide), data/blog/published.json (featured +
 * latest) and data/business/business.json (shop facts) — never hand-written.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://chatbot.thuexemaynguyentu.com/';
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const html = read('index.html');
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
const business = JSON.parse(read('data/business/business.json'));
const fact = (s) => resolveFacts(s, business);
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const pageFile = (href) => join(ROOT, href.replace(/^\//, '').split(/[?#]/)[0], 'index.html');
const section = (label) => {
  const start = main.indexOf(`aria-label="${label}"`);
  assert.ok(start > -1, `section "${label}" present`);
  return main.slice(start, main.indexOf('</section>', start));
};
const cardHrefs = (fragment) => [...fragment.matchAll(/<a class="blog-card[^"]*" href="([^"]+)"/g)].map((m) => m[1]);
const articleHref = (a) => `/blog/${taxonomy.categories[a.category].dir}/${a.slug}/`;

test('/ is the full website homepage on the shared shell — never the full-screen chat', () => {
  assert.match(html, /<body class="content-page">/);
  assert.equal((html.match(/<header class="site-header">/g) ?? []).length, 1, 'shared site header');
  assert.equal((html.match(/<footer class="blog-footer">/g) ?? []).length, 1, 'shared site footer');
  for (const chat of ['class="motoai-app"', 'id="motoai-input"', 'motoai-dock', 'chat-home', 'id="motoai-messages"']) {
    assert.ok(!html.includes(chat), `no chat surface on /: ${chat}`);
  }
  assert.equal(/<title>([^<]*)<\/title>/.exec(html)[1], fact(SITE_HOME.title).replace(/&/g, '&amp;'));
  const h1s = [...html.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => unesc(m[1]));
  assert.deepEqual(h1s, [SITE_HOME.h1], 'exactly one H1, from config/site-pages.json');
  assert.ok(html.includes(`<link rel="canonical" href="${SITE}">`), 'homepage canonical stays the site root');
  assert.ok(html.includes(`<meta name="description" content="${fact(SITE_HOME.description)}">`), 'meta description from config');
});

test('sections render in the agreed order: hero, services, Agent, guide, featured, latest, shop, footer', () => {
  const order = ['class="v3-hero"', `aria-label="${SITE_HOME.services.title}"`, 'class="v3-agent"', `aria-label="${SITE_HOME.guide.title}"`,
    `aria-label="${SITE_HOME.featured.title}"`, `aria-label="${SITE_HOME.latest.title}"`, 'class="v3-shop"']
    .map((needle) => html.indexOf(needle));
  assert.ok(order.every((i) => i > -1), 'every section present');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'sections in order');
  assert.ok(order.at(-1) < html.indexOf('<footer class="blog-footer">'), 'footer closes the page');
});

test('hero: two CTAs — Hỏi Agent opens /agent/, Khám phá cẩm nang opens /blog/', () => {
  const hero = main.slice(main.indexOf('class="v3-hero"'), main.indexOf('</section>'));
  const ctas = [...hero.matchAll(/<a class="(v3-btn[^"]*)" href="([^"]+)"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g)].map((m) => [m[1], m[2], unesc(m[3])]);
  assert.deepEqual(ctas, [
    ['v3-btn v3-btn-primary', navigation.agent.url, SITE_HOME.ctaAgent],
    ['v3-btn', '/blog/', SITE_HOME.ctaGuide]
  ]);
  assert.equal(navigation.agent.url, '/agent/');
});

test('services come from config, in order, and every card opens a real page (no empty links)', () => {
  const s = section(SITE_HOME.services.title);
  const cards = [...s.matchAll(/<a class="v3-card v3-service" href="([^"]+)">[\s\S]*?<strong>([^<]+)<\/strong>\s*<span>([^<]+)<\/span>/g)]
    .map((m) => ({ href: m[1], label: unesc(m[2]), desc: unesc(m[3]) }));
  assert.deepEqual(cards.map((c) => [c.href, c.label]), SITE_HOME.services.items.map((i) => [i.href, i.label]));
  for (const c of cards) {
    assert.ok(c.href.startsWith('/') && !c.href.startsWith('//'), `${c.label}: internal link`);
    assert.ok(existsSync(pageFile(c.href)), `${c.label}: ${c.href} has a page`);
  }
  // No invented EV price: the electric service never states an amount.
  const ev = cards.find((c) => c.href === '/blog/xe-dien/');
  assert.ok(ev && !/\d[\d.]*\s?(đ|vnđ|k\b)/i.test(ev.desc), 'electric vehicles: no price on the homepage');
});

test('Agent section introduces the Agent and links to /agent/ — the chat itself stays off the homepage', () => {
  const a = main.slice(main.indexOf('class="v3-agent"'), main.indexOf('</section>', main.indexOf('class="v3-agent"')));
  for (const item of SITE_HOME.agent.can) assert.ok(a.includes(`<span>${item}</span>`), `capability listed: ${item}`);
  assert.ok(a.includes(`href="${navigation.agent.url}"`), 'opens the Agent app');
  assert.ok(a.includes(unesc(SITE_HOME.agent.cta)) || a.includes(SITE_HOME.agent.cta), 'CTA label from config');
  assert.ok(!/<(form|textarea|input)\b/.test(a), 'no chat composer embedded');
});

test('guide: every parent hub, category and live subtopic from the taxonomy — full names in headings', () => {
  const g = section(SITE_HOME.guide.title);
  const hubs = drawerCore().find((e) => e.id === 'cm').children.filter((x) => x.kind === 'hub');
  for (const c of taxonomy.clusters) {
    assert.ok(g.includes(`<h3><a href="/blog/${c.dir}/">${c.name.replace(/&/g, '&amp;')}</a></h3>`), `parent hub ${c.name} with its full name`);
  }
  const expected = hubs.flatMap((h) => h.children.map((ch) => ch.url)).sort();
  const listed = [...g.matchAll(/<a (?:class="v3-cat" )?href="(\/blog\/[^"]+)">/g)].map((m) => m[1]).filter((u) => !/^\/blog\/[^/]+\/$/.test(u) || expected.includes(u));
  const hubUrls = taxonomy.clusters.map((c) => `/blog/${c.dir}/`);
  assert.deepEqual(listed.filter((u) => !hubUrls.includes(u)).sort(), expected, 'categories + subtopics == navigation (no empty topic)');
  for (const u of listed) assert.ok(existsSync(pageFile(u)), `${u} exists`);
  const topics = hubs.reduce((n, h) => n + h.children.filter((c) => c.level === 'subtopic').length, 0);
  assert.ok(g.includes(SITE_HOME.guide.lead.replace('{clusters}', taxonomy.clusters.length).replace('{cats}', navigation.categories.length).replace('{topics}', topics)), 'counts computed from data');
});

test('featured + latest are real PUBLISHED articles; latest is the newest N automatically', () => {
  const published = publishedManifestArticles(ROOT);
  const byHref = new Map(published.map((a) => [articleHref(a), a]));
  const featured = cardHrefs(section(SITE_HOME.featured.title));
  const latest = cardHrefs(section(SITE_HOME.latest.title));
  assert.ok(featured.length >= 1 && featured.length <= Object.keys(taxonomy.categories).length, 'one pillar per category at most');
  const cats = featured.map((h) => byHref.get(h)?.category);
  assert.ok(cats.every(Boolean), 'featured cards are published articles');
  assert.equal(new Set(cats).size, cats.length, 'no two featured cards from the same category');
  const expected = newestFirst(published.filter((a) => !featured.includes(articleHref(a))), SITE_HOME.latest.count).map(articleHref);
  assert.equal(latest.length, Math.min(SITE_HOME.latest.count, published.length - featured.length));
  assert.deepEqual(latest, expected, 'latest = newest published articles (manifest order), featured excluded');
  for (const h of [...featured, ...latest]) {
    const a = byHref.get(h);
    assert.ok(existsSync(pageFile(h)), `${h} built`);
    assert.ok(main.includes(`<h3>${a.title.replace(/&/g, '&amp;')}</h3>`), `${h}: SEO title shown unchanged`);
  }
  assert.ok(section(SITE_HOME.latest.title).includes('href="/blog/"'), '"Xem toàn bộ cẩm nang" link');
});

test('shop facts come only from business.json — no price, deposit or policy invented on /', () => {
  const s = main.slice(main.indexOf('class="v3-shop"'));
  assert.ok(s.includes(business.display_name), 'shop name');
  assert.ok(s.includes(`${business.address.full}, ${business.address.country}`), 'verified address');
  assert.ok(s.includes(business.hours.display), 'verified hours');
  assert.ok(s.includes(business.contact.phone_display), 'verified phone');
  for (const ref of ['call', 'whatsapp', 'map']) assert.ok(s.includes(`data-contact-ref="${ref}"`), `${ref} resolved at runtime from business.json`);
  assert.ok(!s.includes(business.contact.phone_uri) && !s.includes(business.contact.maps) && !s.includes(business.contact.whatsapp), 'no hard-coded contact URLs');
  // Article cards quote their own (reviewed) descriptions; everything the homepage itself says has no amount.
  const own = main.replace(/<a class="blog-card[\s\S]*?<\/a>/g, '');
  assert.ok(!/\d{1,3}(?:\.\d{3})+\s?đ/.test(own), 'no price amounts in the homepage copy');
  assert.ok(!/không (cần )?(đặt )?cọc/i.test(main), 'never advertises renting without a deposit');
});

test('schema: WebSite + Organization + WebPage; the WebApplication is declared once, on /agent/', () => {
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.deepEqual(ld.map((o) => o['@type']).sort(), ['Organization', 'WebPage', 'WebSite'].sort());
  const page = ld.find((o) => o['@type'] === 'WebPage');
  assert.equal(page.url, SITE);
  assert.equal(page.mainEntity['@id'], `${SITE}agent/#app`);
  const agent = read('agent/index.html');
  assert.ok(agent.includes(`"@id": "${SITE}agent/#app"`), 'the referenced WebApplication exists on /agent/');
  assert.ok(agent.includes(`<link rel="canonical" href="${SITE}agent/">`), 'Agent app canonical');
  assert.ok(!ld.some((o) => o['@type'] === 'FAQPage'), 'no FAQPage without a visible FAQ on /');
});

test('legacy chat links on / (?ask, ?action, ?embed, ?source, ?lang) forward to /agent/ with query + hash', () => {
  const script = /<script>(\/\* v76: the chat app moved to [\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(script, 'compat script present');
  assert.ok(html.indexOf(script) < html.indexOf('</head>'), 'runs in <head>, before the page paints');
  const run = (search, hash = '') => {
    let to = null;
    vm.runInNewContext(script, { location: { search, hash, replace: (u) => { to = u; } } });
    return to;
  };
  assert.equal(run('?ask=gi%C3%A1%20thu%C3%AA', '#x'), '/agent/?ask=gi%C3%A1%20thu%C3%AA#x');
  assert.equal(run('?action=address'), '/agent/?action=address');
  assert.equal(run('?embed=1&lang=en&theme=dark&source=partner'), '/agent/?embed=1&lang=en&theme=dark&source=partner');
  assert.equal(run('?source=pwa'), '/agent/?source=pwa');
  assert.equal(run('?lang=en'), '/agent/?lang=en');
  assert.equal(run(''), null, 'a plain visit stays on the homepage');
  assert.equal(run('?utm_source=zalo&utm_medium=social'), null, 'campaign tags are not chat links');
});

test('every page header offers "Hỏi Agent" → /agent/; sitemap lists / and /agent/ once', () => {
  for (const p of ['index.html', 'blog/index.html', 'gia-thue/index.html', 'lien-he/index.html']) {
    assert.match(read(p), /<a class="site-agent-cta" href="\/agent\/" aria-label="Hỏi Agent">/, `${p}: header CTA`);
  }
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const u of [SITE, `${SITE}agent/`, `${SITE}blog/`]) assert.equal(locs.filter((l) => l === u).length, 1, `sitemap lists ${u} once`);
});

test('V3 styles: tokens only, hover only on fine pointers, reduced motion respected', () => {
  const src = read('assets/css/src/blog.css');
  const v3 = src.slice(src.indexOf('/* ==================== v76 Site homepage'));
  assert.ok(v3.length > 0 && v3.includes('.v3-hero'), 'V3 block present in the one CSS source');
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v3.replace(/\/\*[\s\S]*?\*\//g, '')), 'no raw colors: V2 tokens only');
  const pointerOnly = /@media \(hover: hover\) and \(pointer: fine\)[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g;
  assert.ok(!/:hover/.test(v3.replace(/\/\*[\s\S]*?\*\//g, '').replace(pointerOnly, '')), 'hover styles only under (hover: hover) and (pointer: fine)');
  assert.match(v3, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transform:\s*none/, 'no hover/press motion with reduced motion');
});

test('Agent deep links: ?action= runs once state exists (no TDZ crash), ?ask= only prefills the composer', () => {
  const main = read('assets/js/main.js');
  const deepLinks = main.indexOf("const action = entry.get('action');");
  const busyDecl = main.indexOf('let busy = false;');
  assert.ok(deepLinks > -1 && busyDecl > -1, 'deep-link block + busy state present');
  // The deep-link block calls submit() synchronously; submit() reads `busy`.
  // Declaring it later threw "Cannot access 'busy' before initialization".
  assert.ok(busyDecl < deepLinks, '`busy` is declared before ?action= calls submit()');
  assert.equal((main.match(/let busy\b/g) ?? []).length, 1, 'one busy declaration');
  const askBranch = /if \(askTopic\) \{([\s\S]*?)\} else if/.exec(main)[1];
  assert.ok(!/submit\(/.test(askBranch), '?ask= prefills, the customer decides to send');
});

test('header menu = Pages + parent hubs + categories/subtopics, from the same config as the drawer', () => {
  const pages = drawerCore().find((e) => e.kind === 'group' && e.id === 'pages');
  const hubs = drawerCore().find((e) => e.id === 'cm').children.filter((x) => x.kind === 'hub');
  for (const p of ['index.html', 'blog/index.html', 'gioi-thieu/index.html', 'blog/thue-xe/index.html']) {
    const nav = /<nav class="site-nav"[^>]*>([\s\S]*?)<\/nav>/.exec(read(p))[1];
    // Pages dropdown: labels + links exactly as config/navigation.json + site-pages registry.
    const drop = nav.slice(nav.indexOf(`>${pages.label}<`));
    assert.ok(nav.includes(`<button type="button" class="site-nav-parent" aria-haspopup="true" aria-expanded="false">${pages.label}`), `${p}: Pages dropdown`);
    assert.deepEqual([...drop.matchAll(/<a class="site-nav-category" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]),
      pages.children.map((c) => [c.url, c.label]), `${p}: Pages == drawer "pages" group`);
    for (const h of hubs) {
      assert.ok(nav.includes(`href="${h.url}" aria-haspopup="true"`), `${p}: parent hub ${h.label}`);
      for (const ch of h.children) assert.ok(nav.includes(`href="${ch.url}"`), `${p}: ${ch.label} in the ${h.label} dropdown`);
    }
    for (const label of [pages.label, ...pages.children.map((c) => c.label), ...hubs.map((h) => h.label)]) {
      const words = label.trim().split(/\s+/).length;
      assert.ok(words >= 2 && words <= 3, `${label}: nav labels are 2–3 words`);
    }
  }
  assert.match(read('gioi-thieu/index.html'), /<div class="site-nav-item" data-active="1">\s*<button[^>]*>Trang Web/, 'current Page marks its dropdown active');
  assert.ok(!/<div class="site-nav-item" data-active="1">\s*<button/.test(read('index.html')), 'no Page dropdown active on /');
});
