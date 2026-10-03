import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  repoSandbox, qaCli, installFixture, fixtureBody, fixtureBodyExact, countWords,
  readJson, writeJson, readMatrix, firstPlanned
} from '../helpers/factory-sandbox.mjs';

/**
 * Minimal production QA (v69) — score gate for EXACTLY ONE article.
 *
 *   score 70–100  -> PASS (never edited again just to raise the score)
 *   score  < 70   -> FAIL -> REPAIR (no REVIEW, no EXCELLENT band)
 *   critical gate -> score 0
 *   warning       -> -5 points, never blocks publish
 *
 * Every case runs in a full repo sandbox; the real matrix and the
 * PUBLISHED pilots are never touched.
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

/** Rewrite one CSV cell of one matrix row (sandbox only). */
function setCell(dir, id, column, value) {
  const lines = readMatrix(dir);
  const header = lines[0].split(',');
  const idx = header.indexOf(column);
  if (idx < 0) throw new Error(`no column ${column}`);
  const out = lines.map((l) => {
    if (!l.startsWith(id + ',')) return l;
    const cells = l.split(',');
    cells[idx] = value;
    return cells.join(',');
  });
  writeFileSync(join(dir, 'data/blog/content-matrix.csv'), out.join('\n') + '\n');
}

// ---------- happy path ----------

test('qa: valid fixture article scores 100 (PASS, zero warnings)', () => {
  const dir = repoSandbox();
  const id = install(dir);
  const out = qaCli(dir, [id]);
  assert.match(out, new RegExp(`QA PASS ${id} score=100 warnings=0`));
  for (const line of out.trim().split('\n').filter((l) => /^(PASS|FAIL|WARN)/.test(l))) {
    assert.match(line, /^PASS/, line);
  }
});

// ---------- length: <300 critical, 1.500–4.000 guideline warning ----------

test('qa: ~450-word draft — body-words WARN only, score 95, still PASSES', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody({ paragraphs: 3 }) });
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+body-words/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: length guideline — exactly 1.499 words WARNs (thin content) but PASSES', () => {
  const dir = repoSandbox();
  const body = fixtureBodyExact(dir, 1499);
  assert.equal(countWords(dir, body), 1499);
  const id = install(dir, { body });
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+body-words/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: length guideline — exactly 1.500 words scores 100', () => {
  const dir = repoSandbox();
  const body = fixtureBodyExact(dir, 1500);
  assert.equal(countWords(dir, body), 1500);
  const id = install(dir, { body });
  assert.match(qaCli(dir, [id]), new RegExp(`QA PASS ${id} score=100 warnings=0`));
});

test('qa: length guideline — exactly 2.500 words scores 100 (no 2.000 ceiling)', () => {
  const dir = repoSandbox();
  const body = fixtureBodyExact(dir, 2500);
  assert.equal(countWords(dir, body), 2500);
  const id = install(dir, { body });
  assert.match(qaCli(dir, [id]), new RegExp(`QA PASS ${id} score=100 warnings=0`));
});

test('qa: length guideline — exactly 4.000 words scores 100 (deep topic is fine)', () => {
  const dir = repoSandbox();
  const body = fixtureBodyExact(dir, 4000);
  assert.equal(countWords(dir, body), 4000);
  const id = install(dir, { body });
  assert.match(qaCli(dir, [id]), new RegExp(`QA PASS ${id} score=100 warnings=0`));
});

test('qa: length guideline — 4.001 words WARNs (writer trims, tool never truncates)', () => {
  const dir = repoSandbox();
  const body = fixtureBodyExact(dir, 4001);
  assert.equal(countWords(dir, body), 4001);
  const id = install(dir, { body });
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+body-words/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
  // No truncation anywhere: the body file still holds every word after QA.
  const row = readJson(dir, 'data/blog/published.json').articles.find((a) => a.article_id === id);
  const after = readFileSync(join(dir, row.body), 'utf8');
  assert.equal(countWords(dir, after), 4001, 'QA must never cut the body');
});

// ---------- critical gates (score 0, publish blocked) ----------

test('qa: critical body-exists — empty body file', () => {
  const dir = repoSandbox();
  const id = install(dir);
  const row = readJson(dir, 'data/blog/published.json').articles.find((a) => a.article_id === id);
  writeFileSync(join(dir, row.body), '');
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+body-exists/);
  assert.match(out.out, new RegExp(`QA FAIL ${id} score=0: critical: body-exists`));
});

test('qa: critical body-substantial — a stub body is a truncated article', () => {
  const dir = repoSandbox();
  const stub = '<h2>Giới thiệu nhanh</h2>\n<p>Bài này đang được biên tập viên hoàn thiện phần nội dung chính cho bạn đọc.</p>';
  assert.ok(countWords(dir, stub) < 300);
  const id = install(dir, { body: stub });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+body-substantial/);
  assert.match(out.out, new RegExp(`QA FAIL ${id} score=0: critical: body-substantial`));
});

test('qa: critical unique-article-id — duplicate matrix row for the same id', () => {
  const dir = repoSandbox();
  const id = install(dir);
  const lines = readMatrix(dir);
  const dup = lines.find((l) => l.startsWith(id + ','));
  writeFileSync(join(dir, 'data/blog/content-matrix.csv'), [...lines, dup].join('\n') + '\n');
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+unique-article-id/);
  assert.match(out.out, /QA FAIL .*score=0: critical:/);
});

test('qa: critical unique-slug — another row (BA-9999) with the same slug', () => {
  const dir = repoSandbox();
  const id = install(dir);
  const lines = readMatrix(dir);
  const clone = lines.find((l) => l.startsWith(id + ',')).split(',');
  clone[0] = 'BA-9999';
  writeFileSync(join(dir, 'data/blog/content-matrix.csv'), [...lines, clone.join(',')].join('\n') + '\n');
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+unique-slug/);
  assert.match(out.out, /QA FAIL .*score=0: critical:/);
});

test('qa: critical html-render-safe — an unclosed <p> breaks the page', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Đoạn văn này mở thẻ p mà không bao giờ được đóng lại trong bài.' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+html-render-safe/);
  assert.match(out.out, /QA FAIL .*score=0: critical:/);
});

test('qa: critical html-render-safe — embedded <script> is never allowed', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<script>alert("xss")</script>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+html-render-safe/);
  assert.match(out.out, /QA FAIL .*score=0: critical:/);
});

test('qa: critical fact-resolution — unknown {{ business.* }} placeholder', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Liên hệ {{ business.nonexistent.field }} ngay.</p>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+fact-resolution/);
  assert.match(out.out, /QA FAIL .*score=0: critical:/);
});

test('qa: critical verified-phones-only — invented phone number', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Người viết bịa số 0987 654 321 làm ví dụ cho bài kiểm thử.</p>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+verified-phones-only/);
  assert.match(out.out, /QA FAIL .*score=0: critical:/);
});

test('qa: critical verified-deposits-only — invented deposit amount', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Tiền cọc chỉ cần 500.000đ cho dòng xe số nhỏ.</p>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+verified-deposits-only/);
  assert.match(out.out, /QA FAIL .*score=0: critical:/);
});

test('qa: critical internal-links-resolve — link to a non-existent page', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Xem <a href="/aichatbot/blog/khong-ton-tai/">trang không tồn tại</a>.</p>' });
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+internal-links-resolve/);
  assert.match(out.out, /QA FAIL .*score=0: critical:/);
});

test('qa: critical id-slug-path — manifest entry pointing at another slug', () => {
  const dir = repoSandbox();
  const id = install(dir);
  const manifest = readJson(dir, 'data/blog/published.json');
  manifest.articles.find((a) => a.article_id === id).slug = 'sai-slug';
  writeJson(dir, 'data/blog/published.json', manifest);
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+id-slug-path/);
  assert.match(out.out, /QA FAIL .*score=0: critical:/);
});

test('qa: critical manifest-entry — broken published.json never renders', () => {
  const dir = repoSandbox();
  const id = install(dir);
  writeFileSync(join(dir, 'data/blog/published.json'), '{ "articles": [ broken json');
  const out = qaCli(dir, [id], true);
  assert.match(out.out, /FAIL\s+manifest-entry/);
  assert.match(out.out, /QA FAIL .*score=0: critical:/);
});

// ---------- single warnings (-5 each, publish continues) ----------

test('qa: WARN body-structure — an H1 inside the body still passes', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<h1>Tiêu đề H1 thứ hai không hợp lệ</h1>' });
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+body-structure/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: WARN no-filler — placeholder markers never block publish', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Phần này TBD, đang cập nhật sau.</p>' });
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+no-filler/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: WARN no-duplicate-paragraphs — two sentences sharing the first 80 chars', () => {
  const dir = repoSandbox();
  const head = 'Đoạn văn kiểm thử trùng lặp dùng chung tám mươi ký tự đầu tiên để hệ thống QA nhận diện đây là nội dung bị sao chép gần như nguyên văn';
  const id = install(dir, {
    body: fixtureBody() + `\n<p>${head} phiên bản một cho bài kiểm thử.</p>\n<p>${head} phiên bản hai cho bài kiểm thử.</p>`
  });
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+no-duplicate-paragraphs/);
  assert.ok(!/WARN\s+no-duplicate-sentences/.test(out), 'tails differ so sentences are distinct');
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: WARN no-duplicate-sentences — a short sentence repeated in two paragraphs', () => {
  const dir = repoSandbox();
  const s = 'Câu này lặp lại hai lần trong bài.'; // 34 chars: below the 40-char paragraph filter
  const id = install(dir, { body: fixtureBody() + `\n<p>${s}</p>\n<p>${s}</p>` });
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+no-duplicate-sentences/);
  assert.ok(!/WARN\s+no-duplicate-paragraphs/.test(out), 'below paragraph-key length');
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: WARN no-cross-article-duplicate — paragraph copied from a pilot still passes', () => {
  const dir = repoSandbox();
  const pilot = readFileSync(join(dir, 'data/blog/articles/app-thue-xe-may-la-gi.body.html'), 'utf8');
  const stolen = pilot.match(/<p>([^<]{60,})<\/p>/)[1];
  const id = install(dir, { body: fixtureBody() + `\n<p>${stolen}</p>` });
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+no-cross-article-duplicate/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: WARN no-cannibalization — a second row on the same keyword never blocks', () => {
  const dir = repoSandbox();
  const id = install(dir);
  const other = firstPlanned(dir, 'APP');
  const kw = readMatrix(dir).find((l) => l.startsWith(id + ',')).split(',')[4];
  setCell(dir, other.article_id, 'primary_keyword', kw);
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+no-cannibalization/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: WARN title-meta-valid — a too-short description never blocks', () => {
  const dir = repoSandbox();
  const id = install(dir, { description: 'Quá ngắn.' });
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+title-meta-valid/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: WARN seo-ownership — protected commercial keyword as the exact title', () => {
  const dir = repoSandbox();
  const id = install(dir, { title: 'Thuê xe máy Hà Nội' });
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+seo-ownership/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: WARN local-angle — a LOCAL row without local_scope never blocks', () => {
  const dir = repoSandbox();
  const id = install(dir, { category: 'LOCAL' });
  setCell(dir, id, 'local_scope', '');
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+local-angle/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: WARN safe-legal-gate — SAFE article without a gov.vn source still passes', () => {
  const dir = repoSandbox();
  const id = install(dir, { category: 'SAFE' });
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+safe-legal-gate/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: WARN no-external-links — an external link under no-external policy', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Tham khảo <a href="https://example.com/xa-hoi">bài báo ngoài</a>.</p>' });
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+no-external-links/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

test('qa: WARN retrieval-consistency — agent_retrieval=yes without knowledge chunks', () => {
  const dir = repoSandbox();
  const id = install(dir);
  const manifest = readJson(dir, 'data/blog/published.json');
  manifest.articles.find((a) => a.article_id === id).knowledge_chunks = [];
  writeJson(dir, 'data/blog/published.json', manifest);
  const out = qaCli(dir, [id]);
  assert.match(out, /WARN\s+retrieval-consistency/);
  assert.match(out, new RegExp(`QA PASS ${id} score=95 warnings=1`));
});

// ---------- score band: 70 PASS / 65 FAIL, no REVIEW in between ----------

test('qa: score boundary — exactly 70 PASSES (6 warnings, no REVIEW state)', () => {
  const dir = repoSandbox();
  const repeated = 'Đoạn lặp nguyên văn để kiểm thử mức điểm chính xác bảy mươi của bộ QA mới.'; // >40 chars: paragraph AND sentence key
  const body = fixtureBody({ paragraphs: 3 }) // body-words (450 < 1.500)
    + '\n<h1>Tiêu đề H1 thứ hai không hợp lệ</h1>' // body-structure
    + '\n<p>Phần này TBD, đang cập nhật sau.</p>' // no-filler
    + `\n<p>${repeated}</p>\n<p>${repeated}</p>`; // no-duplicate-paragraphs + no-duplicate-sentences
  const id = install(dir, { body, description: 'Quá ngắn.' }); // title-meta-valid
  const out = qaCli(dir, [id]);
  assert.match(out, new RegExp(`QA PASS ${id} score=70 warnings=6`));
});

test('qa: score boundary — 65 (7 warnings) FAILs into the repair queue', () => {
  const dir = repoSandbox();
  const repeated = 'Đoạn lặp nguyên văn để kiểm thử mức điểm chính xác bảy mươi của bộ QA mới.';
  const body = fixtureBody({ paragraphs: 3 })
    + '\n<h1>Tiêu đề H1 thứ hai không hợp lệ</h1>'
    + '\n<p>Phần này TBD, đang cập nhật sau.</p>'
    + `\n<p>${repeated}</p>\n<p>${repeated}</p>`
    + '\n<p>Tham khảo <a href="https://example.com/xa-hoi">bài báo ngoài</a>.</p>'; // no-external-links
  const id = install(dir, { body, description: 'Quá ngắn.' });
  const out = qaCli(dir, [id], true);
  assert.ok(out.fail);
  assert.match(out.out, new RegExp(`QA FAIL ${id} score=65: warnings: `));
  assert.match(out.out, /no-external-links/);
});

// ---------- sandbox hygiene ----------

test('qa: QA never mutates repo files, and the real repo has no draft bodies', () => {
  const dir = repoSandbox();
  const id = install(dir, { body: fixtureBody() + '\n<p>Bài rác này chứa số 0987 654 321 để buộc QA FAIL.</p>' });
  const snap = (p) => readFileSync(join(dir, p), 'utf8');
  const before = ['data/blog/content-matrix.csv', 'data/blog/published.json', 'reports/blog-factory-run.md']
    .map(snap);
  qaCli(dir, [id], true); // a FAILing article
  ['data/blog/content-matrix.csv', 'data/blog/published.json', 'reports/blog-factory-run.md']
    .forEach((p, i) => assert.equal(snap(p), before[i], `QA must never write ${p}`));
  const planned = firstPlanned(dir, null);
  assert.equal(planned.status, 'PLANNED');
  assert.throws(() => readFileSync(join(dir, `data/blog/articles/${planned.slug}.body.html`), 'utf8'),
    'a PLANNED row must not have a body file committed');
});
