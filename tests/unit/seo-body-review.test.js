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
import { reviewArticle, REVIEW_LOG } from '../../tools/seo-body-review.mjs';
import { taxonomy } from '../../tools/taxonomy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MANIFEST = JSON.parse(read('data/blog/published.json')).articles;
const urlOf = (a) => `/blog/${taxonomy.categories[a.category].dir}/${a.slug}/`;
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// An article without a FAQ section is needed for the FAQ cases.
const NO_FAQ = MANIFEST.find((a) => !/<h2[^>]*>[^<]*(câu hỏi|hỏi đáp|faq|thắc mắc)/i.test(read(a.body)) && strip(read(a.body)).split(' ').length < 1800);
const OTHER = MANIFEST.find((a) => a.article_id !== NO_FAQ.article_id && !read(NO_FAQ.body).includes(urlOf(a)));

test('review gate rejects new numbers, English, markup, forbidden claims and bad links', () => {
  const r = reviewArticle({
    id: NO_FAQ.article_id,
    intro: 'Thuê xe giá rẻ nhất chỉ 123456789 đồng cho weekend.',
    faq: [{ q: 'Có <b>giao xe</b> không?', a: 'Có.' }, { q: 'Hỏi gì', a: 'Đáp.' }, { q: 'Ba?', a: 'Ba.' }],
    links: [{ anchor: 'không tồn tại trong bài', href: urlOf(OTHER) }, { anchor: 'hai từ', href: '/blog/app/khong-co-bai-nay/' },
      { anchor: 'hai từ', href: urlOf(NO_FAQ) }]
  });
  const all = r.problems.join('\n');
  for (const needle of ['number "123456789"', 'English tokens weekend', 'forbidden claim "rẻ nhất"', 'markup is not allowed',
    'must be a question', 'not found as plain text', 'not a published article URL', 'self link']) {
    assert.ok(all.includes(needle), `expected rejection: ${needle}\n${all}`);
  }
});

test('a valid patch only adds: prose preserved, link wrapped inside a paragraph, FAQ before the conclusion', () => {
  const body = read(NO_FAQ.body);
  const para = [...body.matchAll(/<p>([^<]{40,})<\/p>/g)][1] ?? [...body.matchAll(/<p>([^<]{40,})<\/p>/g)][0];
  const anchor = para[1].split(/\s+/).slice(2, 5).join(' ');
  const faq = [
    { q: 'Bài viết này giúp gì cho người thuê xe?', a: 'Bài tóm tắt các bước chuẩn bị và lưu ý chính trước khi thuê xe máy.' },
    { q: 'Nên hỏi cửa hàng điều gì trước khi đặt?', a: 'Nên hỏi giá tham khảo, mức đặt cọc theo loại xe và giờ nhận xe.' },
    { q: 'Có thể hỏi Agent trước khi gọi điện không?', a: 'Có, Agent trả lời từ dữ liệu cửa hàng để bạn chuẩn bị câu hỏi rõ ràng hơn.' }
  ];
  const r = reviewArticle({ id: NO_FAQ.article_id, links: [{ anchor, href: urlOf(OTHER) }], faq });
  assert.deepEqual(r.problems, []);
  assert.ok(r.after > r.before, 'words only grow');
  assert.ok(r.html.includes(`<a href="${urlOf(OTHER)}">${anchor}</a>`), 'link wraps the existing phrase');
  // Every original paragraph survives (with the link wrapped in).
  for (const m of body.matchAll(/<p>([\s\S]*?)<\/p>/g)) assert.ok(strip(r.html).includes(strip(m[1]).trim()), 'original paragraph kept');
  const faqAt = r.html.indexOf('<h2>Câu hỏi thường gặp</h2>');
  const end = [...r.html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].find((m) => /kết luận|lời kết|tóm lại|tổng kết/i.test(m[1]));
  assert.ok(faqAt > 0 && (!end || faqAt < end.index), 'FAQ sits before the conclusion');
  assert.equal((r.html.match(/<h3>/g) ?? []).length - (body.match(/<h3>/g) ?? []).length, 3);
});

test('applied reviews are logged and rendered: dateModified + visible update date, no internal notes left', () => {
  assert.ok(existsSync(join(ROOT, REVIEW_LOG)));
  const log = JSON.parse(read(REVIEW_LOG)).reviews;
  assert.ok(Object.keys(log).length >= 2, 'pillar reviews logged');
  for (const [id, rev] of Object.entries(log)) {
    const a = MANIFEST.find((x) => x.article_id === id);
    assert.ok(a, `${id}: logged review belongs to a manifest article`);
    assert.ok(rev.words[1] >= rev.words[0] && rev.qa[1] >= rev.qa[0] && rev.qa[1] >= 70, `${id}: words/QA never regress`);
    const html = read(`blog/${taxonomy.categories[a.category].dir}/${a.slug}/index.html`);
    const art = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((o) => o['@type'] === 'Article');
    assert.equal(art.dateModified, rev.reviewed, `${id}: Article dateModified = review date`);
    assert.ok(html.includes(`cập nhật ${rev.reviewed}`), `${id}: byline shows the update`);
  }
  for (const a of MANIFEST) assert.ok(!/pilot \(fixture\)|chuẩn sản xuất/i.test(read(a.body)), `${a.article_id}: internal production note removed`);
});

test('body hygiene: no leaked editor notes, foreign-script glitches or English legal-gate labels', () => {
  for (const a of MANIFEST) {
    const body = read(a.body);
    assert.ok(!/[\u0400-\u04ff\u4e00-\u9fff\u0e00-\u0e7f]/.test(body), `${a.article_id}: Cyrillic/CJK/Thai characters in a Vietnamese body`);
    assert.ok(!/\bHmm\b|\btypo\b|\blebih\b/.test(body), `${a.article_id}: leaked editor note or foreign word`);
    assert.ok(!/\b(CLAIM|SUBJECT|CONDITION|PRIMARY SOURCE)\b/.test(body), `${a.article_id}: legal-gate labels must be Vietnamese`);
  }
});
