/**
 * Lô M2 (backlog B03): /gia-thue/ explains the owner table without inventing
 * numbers. Every VND figure anywhere on the page is a published pricing.json
 * rate/deposit (or the business.json deposit bounds pinned to them); periods
 * without a published rate stay "Liên hệ"; Q&A is plain HTML (no FAQPage).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceCompareSection, priceFaqSection } from '../../tools/build-blog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const pricing = JSON.parse(read('data/business/pricing.json'));
const business = JSON.parse(read('data/business/business.json'));
const vnd = (n) => `${n.toLocaleString('vi-VN')}đ`;
const main = (html) => html.slice(html.indexOf('<main'), html.indexOf('</main>'));

const published = new Set();
for (const v of pricing.vehicles) {
  for (const r of [...Object.values(v.rates), v.deposit]) {
    if (r?.min != null) published.add(vnd(r.min));
    if (r?.max != null) published.add(vnd(r.max));
  }
}
published.add(vnd(business.policies.deposit.min));
published.add(vnd(business.policies.deposit.max));

test('/gia-thue/ adds comparison, reading tips, Q&A and related reading below the table', () => {
  const html = main(read('gia-thue/index.html'));
  for (const h2 of ['Thuê theo ngày, tuần hay tháng', 'Đọc bảng giá trước khi đặt xe', 'Câu hỏi thường gặp về giá thuê xe máy', 'Đọc thêm về giá thuê']) {
    assert.ok(html.includes(`<h2>${h2}</h2>`), h2);
  }
  assert.ok(html.indexOf('price-table') < html.indexOf('Thuê theo ngày, tuần hay tháng'), 'the owner table stays first');
  assert.ok(html.includes(business.policies.delivery.note) && html.includes(business.policies.insurance.note), 'policy answers are business.json notes');
  const text = html.replace(/<(script|style|svg|nav)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  assert.ok(words >= 500, `main content ${words} words`);
});

test('every VND figure on /gia-thue/ is a published rate or deposit — nothing derived', () => {
  const html = main(read('gia-thue/index.html'));
  const figures = [...html.matchAll(/\d{1,3}(?:\.\d{3})+đ/g)].map((m) => m[0]);
  assert.ok(figures.length > 10);
  for (const f of figures) assert.ok(published.has(f), `derived or unpublished figure: ${f}`);
});

test('no FAQPage markup on the price page; related links resolve to built pages', () => {
  const html = read('gia-thue/index.html');
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    assert.doesNotMatch(m[1], /FAQPage/);
  }
  const related = html.slice(html.indexOf('<h2>Đọc thêm về giá thuê</h2>'));
  const hrefs = [...related.slice(0, related.indexOf('</section>')).matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 4);
  for (const h of hrefs) assert.ok(existsSync(join(ROOT, h, 'index.html')), `${h} exists`);
});

test('comparison never derives a price for an unpublished period', () => {
  const fake = {
    vehicles: [
      { id: 'a', name: 'Xe A', category: 'Xe số', order: 1, rates: { day: { min: 100000, max: 100000 }, week: { min: null, max: null }, month: { min: null, max: null } }, deposit: { min: null, max: null } },
      { id: 'b', name: 'Xe B', category: 'Xe B', order: 2, rates: { day: { min: null, max: null }, week: { min: null, max: null }, month: { min: null, max: null } }, deposit: { min: null, max: null } }
    ]
  };
  const html = priceCompareSection(fake);
  assert.match(html, /Xe A<\/strong> \(Xe số\): mới công bố giá ngày 100\.000đ; thuê theo tuần, theo tháng cần hỏi cửa hàng/);
  assert.match(html, /Xe B<\/strong>: chưa công bố giá tham khảo/);
  assert.equal([...html.matchAll(/\d{1,3}(?:\.\d{3})+đ/g)].length, 1, 'only the published day rate');
  const faq = priceFaqSection(fake, { policies: { deposit: { min: null, max: null }, delivery: { note: 'D' }, insurance: { note: 'I' } } });
  assert.match(faq, /Giá ngày tham khảo tại cửa hàng là 100\.000đ; xe B chưa công bố giá tham khảo\./);
  assert.doesNotMatch(faq, /Tiền cọc là bao nhiêu/, 'no deposit answer without published bounds');
});
