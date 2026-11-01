/**
 * Lô M4 (Master SEO 2026): subtopic hubs hold the articles that are really
 * about their topic. Matching keeps Vietnamese diacritics, matches whole
 * phrases only and ignores the category name the matrix echoes into
 * secondary_keywords. Retired hub URLs leave the site (404 for search
 * engines) and the 404 page forwards people to their replacement.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveSubtopic } from '../../tools/taxonomy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const sub = (cat, primary, title = primary, secondary = '') =>
  deriveSubtopic(cat, { primary_keyword: primary, working_title: title, secondary_keywords: secondary }).slug;

test('diacritics count: no match across different Vietnamese words', () => {
  assert.equal(sub('RENT', 'cho thuê xe máy thủ tục đơn giản'), 'thu-tuc', '"đơn giản" is not "giá"');
  assert.notEqual(sub('RENT', 'thuê xe máy cho gia đình'), 'gia-thue', '"gia đình" is not "giá"');
  assert.notEqual(sub('SAFE', 'mua bán xe máy giấy tờ'), 'thoi-tiet', '"mua bán" is not "mưa"');
  assert.equal(sub('SAFE', 'lái xe máy khi mưa lớn'), 'lai-xe');
  assert.equal(sub('SAFE', 'đi xe máy mùa mưa'), 'thoi-tiet');
  assert.notEqual(sub('RENT', 'kiểm tra xe trước khi nhận'), 'tra-xe', '"kiểm tra xe" is not "trả xe"');
  assert.notEqual(sub('EV', 'chính sách khuyến khích xe điện'), 'sac-pin', '"chính sách" is not "sạc"');
});

test('whole phrases only: weekend is not weekly, online is not a route', () => {
  assert.notEqual(sub('RENT', 'thuê xe máy cuối tuần'), 'thue-tuan', '"cuối tuần" is not a weekly rental');
  assert.equal(sub('RENT', 'thuê xe máy theo tuần'), 'thue-tuan');
  assert.notEqual(sub('LOCAL', 'thuê xe trực tuyến'), 'cung-duong', '"trực tuyến" is not "tuyến đường"');
  assert.notEqual(sub('LOCAL', 'hồ sơ thuê xe'), 'diem-tham-quan', '"hồ sơ" is not a lake');
  assert.equal(sub('LOCAL', 'đi xe máy quanh hồ tây'), 'diem-tham-quan');
});

test('the category name echoed in secondary_keywords never decides the subtopic', () => {
  assert.equal(sub('GUIDE', 'quy trình nhận xe máy thuê', 'Quy trình nhận xe máy thuê', 'Hướng dẫn / thủ tục; quy trình nhận xe máy thuê'), 'nhan-xe');
  assert.equal(sub('GUIDE', 'mẹo đi phố', 'Mẹo đi phố', 'Hướng dẫn / thủ tục; mẹo đi phố'), null, 'no topic → Tổng quan, not Thủ tục');
  assert.equal(sub('SAFE', 'kinh nghiệm đi xe máy an toàn', 'Kinh nghiệm đi xe máy an toàn', 'An toàn / pháp lý; kinh nghiệm đi xe máy an toàn'), null,
    'not Pháp luật by echo');
  assert.equal(sub('SAFE', 'tốc độ cho phép', 'Tốc độ cho phép', 'An toàn / pháp lý; tốc độ cho phép'), 'phap-luat', 'the topic itself still decides');
  assert.equal(sub('LOCAL', 'đi phố cổ bằng xe máy', 'Đi phố cổ bằng xe máy', 'Địa phương / du lịch; đi phố cổ bằng xe máy'), 'diem-tham-quan',
    '"địa phương" is not "phường"');
});

test('retired hub URLs: off the site, out of the sitemap, forwarded by the 404 page', () => {
  const cfg = JSON.parse(read('config/retired-urls.json'));
  const sitemap = read('sitemap.xml');
  const notFound = read('404.html');
  const map = JSON.parse(/var m=(\{[^;]*\});/.exec(notFound)[1]);
  let n = 0;
  for (const r of cfg.retired) {
    const [lo, hi] = r.pages ?? [0, 0];
    const froms = r.from.includes('{n}') ? Array.from({ length: hi - lo + 1 }, (_, i) => r.from.replace('{n}', String(lo + i))) : [r.from];
    assert.ok(r.reason && r.since && r.batch, `${r.from}: reason, date and batch recorded`);
    assert.ok(existsSync(join(ROOT, r.to, 'index.html')), `${r.to}: target page exists`);
    for (const from of froms) {
      n++;
      assert.ok(!existsSync(join(ROOT, from, 'index.html')), `${from}: no stale page left on the site`);
      assert.ok(!sitemap.includes(`<loc>https://chatbot.thuexemaynguyentu.com${from}</loc>`), `${from}: not in the sitemap`);
      assert.equal(map[from], r.to, `${from}: 404 page forwards to ${r.to}`);
    }
  }
  assert.equal(Object.keys(map).length, n, 'the 404 map is exactly the retired list');
});
