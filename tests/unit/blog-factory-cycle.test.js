import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  repoSandbox, factory, selectCli, installFixture, fixtureBody, readJson, readMatrix, matrixRow, REPO
} from '../helpers/factory-sandbox.mjs';

/**
 * v64 micro production cycle — SANDBOX ONLY (full repo copy):
 *   claim 1 -> finish 1 -> scoped QA -> publish transaction (build + verify)
 *   -> checkpoint -> crash/resume -> second run picks the NEXT PLANNED
 *   -> no duplicates -> the real production matrix is never mutated.
 */

const BASE = {
  category: 'RENT',
  title: 'Thuê xe máy giá rẻ: cách chọn xe và ước tính chi phí',
  description: 'Cách chọn xe máy giá rẻ để thuê, ước tính chi phí theo ngày tuần tháng, tiền cọc và các khoản cần xác nhận trước khi nhận xe ở Long Biên Hà Nội.'
};

test('cycle: claim 1 -> finish 1 -> scoped QA PASS -> publish transaction -> verify', () => {
  const dir = repoSandbox();
  // claim exactly one
  factory(dir, ['lock']);
  assert.match(factory(dir, ['claim']), /claimed 1: BA-0002/);
  // writer produces the draft (sandbox only), then finish -> QA
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'WRITING' });
  assert.equal(id, 'BA-0002');
  assert.match(factory(dir, ['finish', id]), /finished 1/);
  assert.equal(matrixRow(dir, id).status, 'QA');
  // scoped QA -> PASS
  assert.match(factory(dir, ['qa', id]), /QA PASS/);
  assert.equal(matrixRow(dir, id).status, 'PASS');
  // publish transaction: build + verify + clear marker + clean checkpoint
  assert.match(factory(dir, ['publish', id]), new RegExp(`published ${id}`));
  const row = matrixRow(dir, id);
  assert.equal(row.status, 'PUBLISHED');
  assert.equal(row.published_date, '2026-09-30');
  assert.ok(existsSync(join(dir, row.output_path)), 'article page built');
  assert.ok(readFileSync(join(dir, 'sitemap.xml'), 'utf8').includes(row.output_path.replace(/index\.html$/, '')),
    'sitemap contains the new URL');
  assert.ok(!existsSync(join(dir, 'docs/state/blog-factory.transaction.json')), 'txn marker cleared');
  const cp = readJson(dir, 'docs/state/blog-factory.checkpoint.json');
  assert.deepEqual(cp.claimed, []);
  assert.deepEqual(cp.finished, []);
  assert.match(factory(dir, ['validate']), /matrix OK/);
});

test('cycle: crash mid-publish keeps the marker; resume rebuilds and clears it', () => {
  const dir = repoSandbox();
  factory(dir, ['lock']);
  factory(dir, ['claim']);
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'WRITING' });
  factory(dir, ['finish', id]);
  factory(dir, ['qa', id]);
  factory(dir, ['publish', id]);

  // Simulate a crash AFTER the matrix write but BEFORE the commit:
  // the transaction marker is present and the built page is gone.
  writeFileSync(join(dir, 'docs/state/blog-factory.transaction.json'),
    JSON.stringify({ article_id: id, phase: 'write', started: '2026-09-30T00:00:00.000Z' }, null, 2));
  rmSync(join(dir, matrixRow(dir, id).output_path));

  assert.match(factory(dir, ['resume']), new RegExp(`resumed ${id} OK`));
  assert.ok(existsSync(join(dir, matrixRow(dir, id).output_path)), 'resume rebuilt the page');
  assert.ok(!existsSync(join(dir, 'docs/state/blog-factory.transaction.json')), 'marker cleared after resume');
  assert.equal(matrixRow(dir, id).status, 'PUBLISHED');
});

test('cycle: second run claims the NEXT PLANNED article — never a duplicate', () => {
  const dir = repoSandbox();
  factory(dir, ['lock']);
  factory(dir, ['claim']);
  const first = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'WRITING' });
  factory(dir, ['finish', first]);
  factory(dir, ['qa', first]);
  factory(dir, ['publish', first]);
  factory(dir, ['unlock']);

  // a new cycle: lock -> claim must pick BA-0003 (next PLANNED), not BA-0002
  factory(dir, ['lock']);
  assert.match(factory(dir, ['claim']), /claimed 1: BA-0003/);
  const writing = readMatrix(dir).filter((l) => l.split(',')[3] === 'WRITING');
  assert.equal(writing.length, 1);
  assert.ok(writing[0].startsWith('BA-0003,'), 'claimed the next PLANNED row');
  assert.equal(matrixRow(dir, first).status, 'PUBLISHED', 'already published row untouched');

  const published = readMatrix(dir).filter((l) => l.split(',')[3] === 'PUBLISHED').length;
  assert.equal(published, 3, 'two pilots + one fixture article');
});

test('select: push detection — exactly 1 article file maps to exactly 1 publish id', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody() });
  writeFileSync('/tmp/motoai-select-one.txt',
    `data/blog/articles/${matrixRow(dir, id).slug}.body.html\n`);
  const out = selectCli(dir, ['--files', '/tmp/motoai-select-one.txt']);
  assert.match(out, /mode=publish/);
  assert.match(out, new RegExp(`id=${id}`));
});

test('select: push touching two article files is REFUSED (1 article / cycle)', () => {
  const dir = repoSandbox();
  const id1 = installFixture(dir, { ...BASE, body: fixtureBody() });
  const second = installFixture(dir, {
    category: 'GUIDE',
    title: 'Thủ tục thuê xe máy đường dài: giấy tờ và checklist nhận xe',
    description: 'Checklist giấy tờ, bằng lái, đặt cọc và các bước nhận xe máy đường dài để hành trình an toàn và không phát sinh tranh chấp.',
    body: fixtureBody()
  });
  const slugs = [matrixRow(dir, id1).slug, matrixRow(dir, second).slug];
  writeFileSync('/tmp/motoai-select-two.txt',
    slugs.map((s) => `data/blog/articles/${s}.body.html`).join('\n') + '\n');
  const out = selectCli(dir, ['--files', '/tmp/motoai-select-two.txt'], true);
  assert.ok(out.fail, 'more than one article per push must refuse');
  assert.match(out.out, /mode=refuse/);
  assert.match(out.out, /EXACTLY 1 article per cycle/);
});

test('select: non-article pushes and published-row edits skip cleanly', () => {
  const dir = repoSandbox();
  writeFileSync('/tmp/motoai-select-none.txt', 'README.md\nsrc/js/app.js\n');
  assert.match(selectCli(dir, ['--files', '/tmp/motoai-select-none.txt']), /mode=skip/);
  // PUBLISHED-row edit (shell rebuild) -> skip, never re-publish
  writeFileSync('/tmp/motoai-select-pilot.txt', 'data/blog/articles/app-thue-xe-may-la-gi.body.html\n');
  const out = selectCli(dir, ['--files', '/tmp/motoai-select-pilot.txt']);
  assert.match(out, /mode=skip/);
});

test('select: PLANNED/WRITING rows with a pushed file are refused (claim+finish first)', () => {
  const dir = repoSandbox();
  const row = matrixRow(dir, 'BA-0002');
  writeFileSync(join(dir, 'data/blog/articles', `${row.slug}.body.html`), fixtureBody());
  writeFileSync('/tmp/motoai-select-planned.txt', `data/blog/articles/${row.slug}.body.html\n`);
  const out = selectCli(dir, ['--files', '/tmp/motoai-select-planned.txt'], true);
  assert.ok(out.fail);
  assert.match(out.out, /claim BA-0002/);
});

test('select: explicit --id validates the row state', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody() });
  assert.match(selectCli(dir, ['--id', id]), new RegExp(`mode=publish\\nid=${id}`));
  const refuse = selectCli(dir, ['--id', 'BA-9999'], true);
  assert.ok(refuse.fail, 'unknown id refuses');
  const skip = selectCli(dir, ['--id', 'BA-0001']);
  assert.match(skip, /mode=skip/, 'PUBLISHED row skips instead of republishing');
});

test('cycle: the real repo is untouched by every sandbox cycle', () => {
  const lines = readFileSync(join(REPO, 'data/blog/content-matrix.csv'), 'utf8').trim().split('\n');
  const rows = lines.slice(1).map((l) => l.split(','));
  const by = {};
  for (const c of rows) by[c[3]] = (by[c[3]] ?? 0) + 1;
  assert.equal(rows.length, 2000, 'matrix size never changes');
  assert.ok((by.PUBLISHED ?? 0) >= 2, 'pilots stay published');
  assert.equal(by.WRITING ?? 0, 0, 'claim is local-only, never committed');
  // v64.2: production advances (PUBLISHED grows, writer drafts sit in QA),
  // so exact status counts are impossible — assert the invariants instead.
  const manifest = JSON.parse(readFileSync(join(REPO, 'data/blog/published.json'), 'utf8'));
  const manifestIds = new Set(manifest.articles.map((a) => a.article_id));
  for (const c of rows) {
    if (c[3] === 'PUBLISHED') assert.ok(manifestIds.has(c[0]), `PUBLISHED ${c[0]} missing from manifest`);
  }
  assert.ok(!existsSync(join(REPO, 'docs/state/blog-factory.lock')));
  assert.ok(!existsSync(join(REPO, 'docs/state/blog-factory.transaction.json')));
});
