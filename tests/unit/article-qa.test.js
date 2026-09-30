import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  repoSandbox, qaCli, installFixture, fixtureBody, readJson, writeJson, firstPlanned
} from '../helpers/factory-sandbox.mjs';

/**
 * Scoped article QA (v64) — deterministic PASS/FAIL for EXACTLY ONE
 * article. Every case runs in a full repo sandbox; the real matrix and
 * the two PUBLISHED pilots are never touched.
 *
 * Base fixture: a valid 1.600–2.000-word draft for the first PLANNED row
 * of a category. Each failure case mutates exactly one thing.
 */

const BASE = {
  category: 'RENT',
  title: 'Thuê xe máy giá rẻ: cách chọn xe và ước tính chi phí',
  description: 'Cách chọn xe máy giá rẻ để thuê, ước tính chi phí theo ngày tuần tháng, tiền cọc và các khoản cần xác nhận trước khi nhận xe ở Long Biên Hà Nội.'
};

function install(dir, { body, title, description, category } = {}) {
  return installFixture(dir, {
    category: category ?? BASE.category,
    title: title ?? BASE.title,
    description: description ?? BASE.description,
    body: body ?? fixtureBody()
  });
}

test('qa: valid fixture article PASSES every scoped check', () => {
  const dir = repoSandbox();
  const id = install(dir);
  const out = qaCli(dir, [id]);
  assert.match(out, /QA PASS/);
  for (const line of out.trim().split('\n').filter((l) => /^(PASS|FAIL)/.test(l))) {
    assert.match(line, /^PASS/, line);
  }
});

test('qa: FAIL body-words — a 300-word draft is rejected', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody({ paragraphs: 3 }) });
  const out = qaCli(dir, [id], true);
  assert.ok(out.fail);
  assert.match(out.out, /FAIL\s+body-words/);
});

test('qa: FAIL body-exists — missing body file', () => {
  const dir = repoSandbox();
  const id = install(dir);
  const row = readJson(dir, 'data/blog/published.json').articles.find((a) => a.article_id === id);
  writeFileSync(join(dir, row.body), '');
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+body-exists/);
});

test('qa: FAIL fact-resolution — unknown {{ business.* }} placeholder', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Liên hệ {{ business.nonexistent.field }} ngay.</p>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+fact-resolution/);
});

test('qa: FAIL no-duplicate-paragraphs — repeated paragraph inside the article', () => {
  const dir = repoSandbox();
  const para = '<p>Khoản này lặp lại nguyên văn trong bài viết để kiểm tra bộ phát hiện đoạn trùng lặp nội bộ của công cụ QA.</p>';
  const id = install(dir, { body: fixtureBody() + '\n' + para + '\n' + para });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+no-duplicate-paragraphs/);
});

test('qa: FAIL no-duplicate-sentences — identical sentence repeated (spun content)', () => {
  const dir = repoSandbox();
  const sentence = 'Câu này bị lặp nguyên văn nhiều lần trong hai đoạn khác nhau để mô phỏng nội dung spun cần bị từ chối.';
  const id = install(dir, { body: fixtureBody() + `\n<p>${sentence} Ghi chú thêm một.</p>\n<p>${sentence} Ghi chú thêm hai.</p>` });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+no-duplicate-sentences/);
});

test('qa: FAIL no-cross-article-duplicate — paragraph copied from a published article', () => {
  const dir = repoSandbox();
  const pilot = readFileSync(join(dir, 'data/blog/articles/app-thue-xe-may-la-gi.body.html'), 'utf8');
  const stolen = pilot.match(/<p>([^<]{60,})<\/p>/)[1];
  const id = install(dir, { body: fixtureBody() + `\n<p>${stolen}</p>` });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+no-cross-article-duplicate/);
});

test('qa: FAIL no-filler — placeholder markers', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Phần này TBD, đang cập nhật sau.</p>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+no-filler/);
});

test('qa: FAIL body-structure — an H1 inside the body', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<h1>Tiêu đề H1 thứ hai không hợp lệ</h1>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+body-structure/);
});

test('qa: FAIL verified-phones-only — invented phone number', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Người viết bịa số 0987 654 321 làm ví dụ cho bài kiểm thử.</p>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+verified-phones-only/);
});

test('qa: FAIL verified-deposits-only — invented deposit amount', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Tiền cọc chỉ cần 500.000đ cho dòng xe số nhỏ.</p>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+verified-deposits-only/);
});

test('qa: FAIL seo-ownership — protected commercial keyword as the exact title', () => {
  const dir = repoSandbox();
  const id = install(dir, { title: 'Thuê xe máy Hà Nội' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+seo-ownership/);
});

test('qa: FAIL seo-ownership — "quận X" doorway title', () => {
  const dir = repoSandbox();
  const id = install(dir, { title: 'App thuê xe máy quận Hoàn Kiếm cho khách du lịch' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+seo-ownership/);
});

test('qa: FAIL seo-ownership — native store listing claim', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Ứng dụng có mặt trên app store và google play.</p>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+seo-ownership/);
});

test('qa: FAIL title-meta-valid — description too short', () => {
  const dir = repoSandbox();
  const id = install(dir, { description: 'Quá ngắn.' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+title-meta-valid/);
});

test('qa: FAIL safe-legal-gate — SAFE article without a gov.vn primary source', () => {
  const dir = repoSandbox();
  const id = install(dir, { category: 'SAFE' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+safe-legal-gate/);
});

test('qa: SAFE article with legal gate passes', () => {
  const dir = repoSandbox();
  const body = fixtureBody() + '\n<p>Nguồn chính: <a href="https://vbpl.vn/Pages/Home.aspx">cổng văn bản chính phủ</a>.</p>';
  const id = install(dir, { category: 'SAFE', body });
  const out = qaCli(dir, [id]);
  assert.match(out, /QA PASS/);
});

test('qa: FAIL no-external-links — external link under source_policy=no-external', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Tham khảo <a href="https://example.com/xa-hoi">bài báo ngoài</a>.</p>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+no-external-links/);
});

test('qa: FAIL retrieval-consistency — agent_retrieval=yes but no knowledge chunks', () => {
  const dir = repoSandbox();
  const id = install(dir);
  const manifest = readJson(dir, 'data/blog/published.json');
  manifest.articles.find((a) => a.article_id === id).knowledge_chunks = [];
  writeJson(dir, 'data/blog/published.json', manifest);
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+retrieval-consistency/);
});

test('qa: FAIL internal-links-resolve — link to a non-existent page', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Xem <a href="/aichatbot/blog/khong-ton-tai/">trang không tồn tại</a>.</p>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+internal-links-resolve/);
});

test('qa: FAIL id-slug-path — manifest entry pointing at another slug', () => {
  const dir = repoSandbox();
  const id = install(dir);
  const manifest = readJson(dir, 'data/blog/published.json');
  manifest.articles.find((a) => a.article_id === id).slug = 'sai-slug';
  writeJson(dir, 'data/blog/published.json', manifest);
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+id-slug-path/);
});

test('qa: fixture articles only exist in sandboxes — the real repo has no draft bodies', () => {
  const dir = repoSandbox();
  const planned = firstPlanned(dir, null);
  assert.equal(planned.status, 'PLANNED');
  assert.throws(() => readFileSync(join(dir, `data/blog/articles/${planned.slug}.body.html`), 'utf8'),
    'a PLANNED row must not have a body file committed');
});
