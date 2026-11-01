/**
 * v70 SEO body review — the separate review process for PUBLISHED bodies
 * (AGENTS.md): structured patches only, existing prose preserved, no new
 * numbers/English/claims, link targets verified, QA logged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewArticle, REVIEW_LOG, loadLegalFacts, legalFactProblems, registeredSources } from '../../tools/seo-body-review.mjs';
import { taxonomy } from '../../tools/taxonomy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MANIFEST = JSON.parse(read('data/blog/published.json')).articles;
const urlOf = (a) => `/blog/${taxonomy.categories[a.category].dir}/${a.slug}/`;
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// Corpus-independent fixtures: a short article, and a target it does not link yet.
const SHORT = MANIFEST.find((a) => strip(read(a.body)).split(' ').length < 1800 && /<p>[^<]{60,}<\/p>/.test(read(a.body)));
const OTHER = MANIFEST.find((a) => a.article_id !== SHORT.article_id && !read(SHORT.body).includes(urlOf(a)));
const HAS_FAQ = (a) => /<h2[^>]*>[^<]*(câu hỏi|hỏi đáp|faq|thắc mắc)/i.test(read(a.body));

test('review gate rejects new numbers, English, markup, forbidden claims, bad links and a second FAQ', () => {
  const r = reviewArticle({
    id: SHORT.article_id,
    intro: 'Thuê xe giá rẻ nhất chỉ 123456789 đồng cho weekend <b>ngay</b>.',
    links: [{ anchor: 'không tồn tại trong bài', href: urlOf(OTHER) }, { anchor: 'hai từ', href: '/blog/app/khong-co-bai-nay/' },
      { anchor: 'hai từ', href: urlOf(SHORT) }],
    faq: [{ q: 'Một?', a: 'Một.' }, { q: 'Hai?', a: 'Hai.' }, { q: 'Ba', a: 'Ba.' }]
  });
  const all = r.problems.join('\n');
  for (const needle of ['number "123456789"', 'English tokens weekend', 'forbidden claim "rẻ nhất"', 'markup is not allowed',
    'not found as plain text', 'not a published article URL', 'self link']) {
    assert.ok(all.includes(needle), `expected rejection: ${needle}\n${all}`);
  }
  assert.ok(all.includes(HAS_FAQ(SHORT) ? 'already has a FAQ section' : 'must be a question'), all);
});

test('a valid patch only adds: prose preserved, link wrapped inside a paragraph, intro first', () => {
  const body = read(SHORT.body);
  const plain = [...body.matchAll(/<p>([^<]{60,})<\/p>/g)][0][1];
  const anchor = plain.split(/\s+/).slice(2, 5).join(' ');
  const intro = 'Bài viết tóm tắt các bước chuẩn bị và những lưu ý chính trước khi thuê xe máy, kèm cách hỏi cửa hàng cho rõ.';
  const r = reviewArticle({ id: SHORT.article_id, links: [{ anchor, href: urlOf(OTHER) }], intro });
  assert.deepEqual(r.problems, []);
  assert.ok(r.after > r.before, 'words only grow');
  assert.ok(r.html.startsWith(`<p>${intro}</p>`), 'direct answer becomes the first paragraph');
  assert.ok(r.html.includes(`<a href="${urlOf(OTHER)}">${anchor}</a>`), 'link wraps the existing phrase');
  for (const m of body.matchAll(/<p>([\s\S]*?)<\/p>/g)) assert.ok(strip(r.html).includes(strip(m[1]).trim()), 'original paragraph kept');
});

test('applied reviews are logged and rendered: dateModified + visible update date, no internal notes left', () => {
  assert.ok(existsSync(join(ROOT, REVIEW_LOG)));
  const log = JSON.parse(read(REVIEW_LOG)).reviews;
  assert.ok(Object.keys(log).length >= 2, 'pillar reviews logged');
  for (const [id, rev] of Object.entries(log)) {
    const a = MANIFEST.find((x) => x.article_id === id);
    assert.ok(a, `${id}: logged review belongs to a manifest article`);
    // `removed` = words of leaked internal notes deleted on purpose.
    assert.ok(rev.words[1] >= rev.words[0] - (rev.removed ?? 0) && rev.qa[1] >= rev.qa[0] && rev.qa[1] >= 70, `${id}: words/QA never regress`);
    const html = read(`blog/${taxonomy.categories[a.category].dir}/${a.slug}/index.html`);
    const art = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((o) => o['@type'] === 'Article');
    assert.equal(art.dateModified, rev.reviewed, `${id}: Article dateModified = review date`);
    // Same-day publish + review shows no separate update date.
    if (rev.reviewed > a.published_date) assert.ok(html.includes(`cập nhật ${rev.reviewed}`), `${id}: byline shows the update`);
  }
  for (const a of MANIFEST) assert.ok(!/pilot \(fixture\)|chuẩn sản xuất/i.test(read(a.body)), `${a.article_id}: internal production note removed`);
});

test('body hygiene: no leaked editor notes, foreign-script glitches or English legal-gate labels', () => {
  for (const a of MANIFEST) {
    const body = read(a.body);
    assert.ok(!/[\u0400-\u04ff\u4e00-\u9fff\u0e00-\u0e7f]/.test(body), `${a.article_id}: Cyrillic/CJK/Thai characters in a Vietnamese body`);
    assert.ok(!/\bHmm\b|\btypo\b|\blebih\b/.test(body), `${a.article_id}: leaked editor note or foreign word`);
    assert.ok(!/\b(CLAIM|SUBJECT|CONDITION|PRIMARY SOURCE)\b/.test(body) && !/\b(claim|subject|condition|primary source):/i.test(body), `${a.article_id}: legal-gate labels must be Vietnamese`);
  }
});

test('condense only shortens bodies above 2,000 words, with a shorter wording', () => {
  const plain = [...read(SHORT.body).matchAll(/<p>([^<]{60,})<\/p>/g)][0][1];
  const from = plain.split(/\s+/).slice(0, 8).join(' ');
  const r = reviewArticle({ id: SHORT.article_id, condense: [{ from, to: `${from} thêm` }] });
  const all = r.problems.join('\n');
  assert.ok(all.includes('only for bodies above 2000 words'), all);
  assert.ok(all.includes('"to" must be shorter than "from"'), all);
});

test('legal corrections: new numbers only from declared, verified legal facts', () => {
  const facts = loadLegalFacts();
  const ids = Object.keys(facts);
  assert.ok(ids.length >= 5, 'verified facts of Luật 36/2024/QH15 are recorded');
  for (const [id, f] of Object.entries(facts)) assert.deepEqual(legalFactProblems(id, f), [], id);
  const bad = legalFactProblems('x', { statement: 'Hạng A1 đến 999 cm³.', ref: 'Điều 57', quote: 'đến 125 cm3', source: 'https://example.vn/a', verified: '2026-10-14' });
  assert.ok(bad.some((p) => p.includes('"999"')), 'a statement number must be backed by the quote or reference');
  // A body without "125": the number is rejected unless the patch declares the fact that carries it.
  const art = MANIFEST.find((a) => !/\b125\b/.test(read(a.body)) && /<p>[^<]{60,}<\/p>/.test(read(a.body)) && strip(read(a.body)).split(' ').length < 1900);
  const plain = [...read(art.body).matchAll(/<p>([^<]{60,})<\/p>/g)][0][1];
  const from = plain.split(/\s+/).slice(0, 6).join(' ');
  const to = `${from} (hạng A1 đến 125 cm³ theo luật hiện hành)`;
  const fid = ids.find((k) => /\b125\b/.test(facts[k].statement) && /A1/.test(facts[k].statement));
  assert.ok(reviewArticle({ id: art.article_id, replace: [{ from, to }] }).problems.some((p) => p.includes('number "125"')));
  assert.deepEqual(reviewArticle({ id: art.article_id, facts: [fid], replace: [{ from, to }] }).problems, []);
  assert.ok(reviewArticle({ id: art.article_id, facts: ['khong-ton-tai'], replace: [{ from, to }] }).problems.some((p) => p.includes('khong-ton-tai')));
  // nth: only that occurrence of a repeated text changes; a missing occurrence is rejected.
  const twice = MANIFEST.find((a) => read(a.body).split('Nghị định 168/2024/NĐ-CP').length >= 3);
  const one = reviewArticle({ id: twice.article_id, replace: [{ from: 'Nghị định 168/2024/NĐ-CP', to: 'Nghị định này', nth: 2 }] });
  assert.deepEqual(one.problems, []);
  assert.equal(one.html.split('Nghị định này').length - 1, 1);
  assert.equal(one.html.split('Nghị định 168/2024/NĐ-CP').length, one.original.split('Nghị định 168/2024/NĐ-CP').length - 1);
  assert.ok(reviewArticle({ id: twice.article_id, replace: [{ from: 'Nghị định 168/2024/NĐ-CP', to: 'Nghị định này', nth: 999 }] }).problems.some((p) => p.includes('occurrence 999')));
  // Logged legal corrections name facts that exist.
  for (const [id, rev] of Object.entries(JSON.parse(read(REVIEW_LOG)).reviews)) for (const f of rev.facts ?? []) assert.ok(facts[f], `${id}: fact ${f} recorded`);
});

test('sources: an external link moves only to an official source the legal register records, prose untouched', () => {
  const official = [...registeredSources()];
  assert.ok(official.length >= 10, 'register and facts record full-text sources');
  // Corpus-independent: any article with an external link it does not already point at a registered source.
  const hrefs = (h) => [...h.matchAll(/<a\b[^>]*\bhref=(["'])(https?:\/\/.*?)\1/gi)].map((m) => m[2].replace(/&amp;/g, '&'));
  const art = MANIFEST.find((a) => hrefs(read(a.body)).some((u) => !official.includes(u)));
  const from = hrefs(read(art.body)).find((u) => !official.includes(u));
  const to = official.find((u) => !read(art.body).includes(u));
  const ok = reviewArticle({ id: art.article_id, sources: [{ from, to }] });
  assert.deepEqual(ok.problems, []);
  assert.ok(ok.html.includes(`href="${to.replace(/&/g, '&amp;')}"`), 'the link points at the registered source');
  assert.ok(!hrefs(ok.html).includes(from), 'every link to the old source moved');
  assert.equal(strip(ok.html), strip(ok.original), 'only the href changes, never the prose');
  const bad = reviewArticle({ id: art.article_id, sources: [{ from, to: 'https://example.com/khong-phai-nguon-chinh-thuc' }, { from: '/blog/an-toan/', to }, { from: 'https://khong-co-trong-bai.vn/x', to }, { from, to, nth: 99 }] });
  const all = bad.problems.join('\n');
  for (const needle of ['"to" is not a source recorded', '"from" must be an external', 'no link to https://khong-co-trong-bai.vn/x', '(occurrence 99)']) assert.ok(all.includes(needle), `expected rejection: ${needle}\n${all}`);
});

test('points: a key-point list goes under a named H2, only into bodies without any list', () => {
  const fixture = '<p>Mở bài nói về việc chuẩn bị giấy tờ, kiểm tra xe và hỏi rõ tiền cọc trước khi nhận xe máy thuê.</p>\n\n'
    + '<h2>Chuẩn bị trước khi nhận xe</h2>\n<p>Mang theo giấy tờ tùy thân, kiểm tra phanh, đèn, còi và chụp ảnh xe trước khi ký.</p>\n\n'
    + '<h2>Khi trả xe</h2>\n<p>Trả xe đúng giờ hẹn, đối chiếu ảnh lúc nhận và nhận lại tiền cọc.</p>\n';
  const items = ['Mang theo giấy tờ tùy thân khi nhận xe.', 'Kiểm tra phanh, đèn và còi trước khi ký.', 'Chụp ảnh xe để đối chiếu lúc trả.'];
  const ok = reviewArticle({ id: SHORT.article_id, points: { after_h2: 'Chuẩn bị trước khi nhận xe', lead: 'Ba việc cần làm:', items } },
    undefined, { original: fixture });
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.ops, ['points']);
  const list = '<p>Ba việc cần làm:</p>\n<ul>\n' + items.map((x) => `<li>${x}</li>`).join('\n') + '\n</ul>';
  assert.ok(ok.html.includes(list), ok.html);
  // The recap closes that section: after its paragraphs, right before the next H2; prose is kept.
  assert.ok(ok.html.indexOf('chụp ảnh xe trước khi ký.</p>') < ok.html.indexOf('<ul>'));
  assert.ok(ok.html.indexOf('<ul>') < ok.html.indexOf('<h2>Khi trả xe</h2>'));
  for (const m of fixture.matchAll(/<p>([\s\S]*?)<\/p>/g)) assert.ok(ok.html.includes(m[0]), 'original paragraph kept');

  const withList = `${fixture}<ul>\n<li>Đã có danh sách.</li>\n</ul>\n`;
  const r1 = reviewArticle({ id: SHORT.article_id, points: { after_h2: 'Khi trả xe', items } }, undefined, { original: withList });
  assert.ok(r1.problems.join('\n').includes('already has a list'), r1.problems.join('\n'));
  const r2 = reviewArticle({ id: SHORT.article_id, points: { after_h2: 'Không có mục này', items: [...items.slice(0, 2), 'Cọc 999 đồng.'] } },
    undefined, { original: fixture });
  const all = r2.problems.join('\n');
  for (const needle of ['number "999"', 'is not an H2 of this article']) assert.ok(all.includes(needle), all);
  const r3 = reviewArticle({ id: SHORT.article_id, points: { after_h2: 'Khi trả xe', items: items.slice(0, 2) } }, undefined, { original: fixture });
  assert.ok(r3.problems.join('\n').includes('3–6 items'), r3.problems.join('\n'));
});
