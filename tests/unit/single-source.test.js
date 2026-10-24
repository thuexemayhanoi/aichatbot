import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRICING, BLOG_UI, priceFact, resolveFacts, emptyNote, t } from '../../tools/blog-components.mjs';
import { bindFacts } from '../../tools/fact-bind.mjs';
import { renderHome, renderLlms, HOME_TEMPLATE, LLMS_TEMPLATE } from '../../tools/home-page.mjs';
import { EMBED_TOKENS } from '../../tools/css-build.mjs';

/**
 * v75 "sửa 1 chỗ → toàn site đồng bộ": shop facts live in business.json,
 * rental rates in pricing.json, colors in the blog TOKENS, UI copy in
 * config/blog-ui.json — articles, homepage, llms.txt, the Agent's blog
 * answers and the embed launcher all read them at build time.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const business = JSON.parse(read('data/business/business.json'));
const vision = PRICING.vehicles.find((v) => v.id === 'honda-vision');

test('price placeholders resolve only from verified pricing.json', () => {
  assert.equal(resolveFacts('{{ price.honda-vision.month.min }}', business), vision.rates.month.min.toLocaleString('vi-VN') + 'đ');
  const lowest = Math.min(...PRICING.vehicles.map((v) => v.rates.day.min).filter(Number.isFinite));
  assert.equal(priceFact(PRICING, 'from.day'), lowest, 'price.from.<unit> = lowest verified rate');
  assert.equal(resolveFacts('{{ price.from.day | raw }}', business), String(lowest));
  // A vehicle without a published rate never gets an invented price.
  assert.throws(() => resolveFacts('{{ price.electric-bike.day.min }}', business), /unresolved price fact/);
  assert.throws(() => resolveFacts('{{ price.honda-vision.year.min }}', business), /unresolved price fact/);
  assert.throws(() => resolveFacts('{{ business.contact.phone | shout }}', business), /unknown fact filter/);
  assert.equal(resolveFacts('{{ business.contact.phone_uri | tel }}', business), business.contact.phone_uri.replace(/^tel:/, ''));
  assert.equal(resolveFacts('{{ business.contact.phone_display | intl }}', business), business.contact.phone_display.replace(/^0/, '+84 '));
});

test('fact binding: literals become placeholders that render the SAME text', () => {
  const d = business.policies.deposit;
  const v = (n) => n.toLocaleString('vi-VN') + 'đ';
  const html = `<p>Gọi ${business.contact.phone} hoặc ${business.contact.phone_display}, cửa hàng ở ${business.address.full}, mở cửa ${business.hours.open} đến ${business.hours.close}. Cọc ${v(d.min)}–${v(d.max)}.</p>`
    + `<p>Honda Vision: ${v(vision.rates.day.min)}/ngày, ${v(vision.rates.month.min)}–${v(vision.rates.month.max)}/tháng.</p>`
    + `<p>Khoảng ${v(vision.rates.day.min)}/ngày cho Honda Vision.</p>`
    + `<a href="tel:${business.contact.phone}" title="${business.address.full}">x</a>`;
  const out = bindFacts(html, business);
  assert.equal(resolveFacts(out.html, business), resolveFacts(html, business), 'render-identical');
  for (const p of ['business.contact.phone }}', 'business.contact.phone_display', 'business.address.full', 'business.hours.open',
    'business.policies.deposit.min', 'price.honda-vision.day.min', 'price.honda-vision.month.max']) {
    assert.ok(out.html.includes(p), `bound ${p}`);
  }
  assert.ok(out.html.includes(`href="tel:${business.contact.phone}" title="${business.address.full}"`), 'attributes are never touched');
  assert.equal(bindFacts(out.html, business).bound, 0, 'idempotent: a second run binds nothing');
});

test('fact binding never guesses a price: other vehicles, totals and new sentences stay literal', () => {
  const v = (n) => n.toLocaleString('vi-VN') + 'đ';
  const wave = PRICING.vehicles.find((x) => x.id === 'honda-wave');
  const cases = [
    `<p>Honda Vision rất êm. Xe số ${v(wave.rates.day.min)}/ngày.</p>`,          // sentence end + category word
    `<p>Hai chiếc Vision là ${v(vision.rates.day.min * 2)}/ngày.</p>`,          // a total is not a rate
    `<p>Xe máy điện khoảng ${v(vision.rates.day.min)}/ngày.</p>`,               // unpriced vehicle
    `<p>Honda Vision</p><p>${v(vision.rates.day.min)}/ngày</p>`                 // another block
  ];
  for (const html of cases) {
    const res = bindFacts(html, business);
    assert.ok(!res.html.includes('{{ price.'), `no price bound in: ${html}`);
  }
  assert.equal(bindFacts(cases[1], business).mismatches.length, 1, 'attributed mismatch is reported for the owner');
});

test('homepage and llms.txt are generated from their templates (no drift, no literal facts)', () => {
  assert.equal(read('index.html'), renderHome(ROOT), `index.html is stale: edit ${HOME_TEMPLATE}, run node tools/build-blog.mjs`);
  assert.equal(read('llms.txt'), renderLlms(ROOT), `llms.txt is stale: edit ${LLMS_TEMPLATE}, run node tools/build-blog.mjs`);
  for (const file of [HOME_TEMPLATE, LLMS_TEMPLATE]) {
    const src = read(file);
    assert.equal(bindFacts(src, business).bound, 0, `${file}: shop facts must be placeholders`);
    for (const literal of [business.contact.phone, business.contact.phone_display, business.address.street, business.hours.display]) {
      assert.ok(!src.includes(literal), `${file} hard-codes "${literal}"`);
    }
  }
  assert.ok(!/\{\{/.test(read('index.html')) && !/\{\{/.test(read('llms.txt')), 'every placeholder resolved');
});

test('homepage FAQPage schema says exactly what the visible FAQ says', () => {
  const html = read('index.html');
  const visible = [...html.matchAll(/<summary>([^<]+)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)]
    .map(([, q, a]) => [q.trim(), a.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()]);
  const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((s) => s['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, visible.length, 'one schema question per visible question');
  for (const [i, q] of faq.mainEntity.entries()) {
    assert.equal(q.name, visible[i][0]);
    assert.ok(visible[i][1].startsWith(q.acceptedAnswer.text), `answer ${i + 1} matches the visible text`);
  }
  const app = ld.find((s) => s['@type'] === 'WebApplication');
  assert.equal(app.offers.price, String(priceFact(PRICING, 'from.day')), 'offer price from pricing.json');
  assert.equal(app.author.telephone, business.contact.phone_uri.replace(/^tel:/, ''), 'telephone from business.json');
});

test('the Agent never shows a raw placeholder: blog knowledge chunks are resolved at build', () => {
  const idx = JSON.parse(read('data/blog/knowledge-index.json'));
  assert.ok(idx.chunks.length > 0);
  for (const c of idx.chunks) assert.ok(!/\{\{|\}\}/.test(c.text + c.title), `${c.id}: unresolved placeholder in a chat answer`);
});

test('embed launcher colors come from the design tokens', () => {
  const light = /:root\s*\{([^}]*)\}/.exec(read('assets/css/src/blog.css'))[1];
  const token = (n) => new RegExp(`${n}:\\s*(#[0-9a-f]+)`, 'i').exec(light)[1];
  assert.deepEqual(EMBED_TOKENS, ['--signal-ink', '--on-signal']);
  assert.ok(read('embed.js').includes(`background: '${token('--signal-ink')}', color: '${token('--on-signal')}', /*@tokens*/`));
});

test('generator UI copy comes from config/blog-ui.json labels', () => {
  const src = read('tools/build-blog.mjs');
  for (const key of ['hubsTitle', 'priceConfirm', 'emptyBlog', 'emptyHub']) {
    assert.ok(!src.includes(BLOG_UI.labels[key].replace(/\{\w+\}.*/, '')), `build-blog.mjs hard-codes the "${key}" label`);
  }
  assert.match(emptyNote('emptyHub', { scope: t('emptyScopeHub') }), /^<p class="blog-empty">[^<]+<a href="\/">Agent<\/a>[^<]+<\/p>$/);
  assert.ok(read('blog/index.html').includes(`aria-label="${BLOG_UI.labels.hubsTitle}"`));
});
