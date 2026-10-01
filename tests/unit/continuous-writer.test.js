import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  repoSandbox, factory, selectCli, installFixture, fixtureBody, fixtureBodyExact,
  readJson, writeJson, matrixRow, setStatus, REPO
} from '../helpers/factory-sandbox.mjs';

/**
 * v65 CONTINUOUS-READY contract (docs/CONTINUOUS-WRITER.md) — SANDBOX ONLY.
 *
 * The writer's happy path is: write exactly ONE article source + its
 * manifest draft entry -> push. GitHub owns claim/QA/publish/verify:
 *   select --files -> lock -> prepare (auto-claim) -> qa -> publish
 * Every test below drives that exact workflow sequence inside a sandbox.
 */

const BASE = {
  category: 'RENT',
  title: 'Thuê xe máy giá rẻ: cách chọn xe và ước tính chi phí',
  description: 'Cách chọn xe máy giá rẻ để thuê, ước tính chi phí theo ngày tuần tháng, tiền cọc và các khoản cần xác nhận trước khi nhận xe ở Long Biên Hà Nội.'
};

const writeFileList = (name, files) => {
  writeFileSync(`/tmp/motoai-cw-${name}.txt`, files.join('\n') + '\n');
  return `/tmp/motoai-cw-${name}.txt`;
};

test('continuous: PLANNED + exactly 1 valid draft push -> auto select -> auto claim -> QA -> publish -> verify', () => {
  const dir = repoSandbox();
  // Writer push simulation: body + manifest draft entry, matrix row still PLANNED.
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'PLANNED' });
  const slug = matrixRow(dir, id).slug;
  const out = selectCli(dir, ['--files', writeFileList('happy', [
    `data/blog/articles/${slug}.body.html`, 'data/blog/published.json'
  ])]);
  assert.match(out, /mode=publish/);
  assert.match(out, new RegExp(`id=${id}`));
  assert.match(out, /claim=yes/);
  assert.match(out, /qa=yes/);

  // Workflow sequence, exactly as blog-factory-publish.yml runs it.
  factory(dir, ['lock']);
  assert.match(factory(dir, ['prepare', id]), new RegExp(`claimed 1: ${id}`));
  assert.match(factory(dir, ['prepare', id]), /already at QA/); // idempotent
  assert.equal(matrixRow(dir, id).status, 'QA');
  assert.match(factory(dir, ['qa', id]), /QA PASS/);
  assert.equal(matrixRow(dir, id).status, 'PASS');
  assert.match(factory(dir, ['publish', id]), new RegExp(`published ${id}`));
  assert.match(factory(dir, ['validate']), /matrix OK/);
  factory(dir, ['unlock']); // workflow: Clean lock + assert no txn marker

  const row = matrixRow(dir, id);
  assert.equal(row.status, 'PUBLISHED');
  assert.ok(existsSync(join(dir, row.output_path)), 'article page built');
  assert.ok(readFileSync(join(dir, 'sitemap.xml'), 'utf8').includes(row.output_path.replace(/index\.html$/, '')));
  assert.ok(!existsSync(join(dir, 'docs/state/blog-factory.transaction.json')), 'txn cleared');
  assert.ok(!existsSync(join(dir, 'docs/state/blog-factory.lock')), 'lock released');
});

test('continuous: duplicate article_id in the manifest is REFUSED', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'PLANNED' });
  const manifest = readJson(dir, 'data/blog/published.json');
  manifest.articles.push(manifest.articles.find((a) => a.article_id === id));
  writeJson(dir, 'data/blog/published.json', manifest);
  const slug = matrixRow(dir, id).slug;
  const out = selectCli(dir, ['--files', writeFileList('dup', [`data/blog/articles/${slug}.body.html`])], true);
  assert.ok(out.fail);
  assert.match(out.out, /mode=refuse/);
  assert.match(out.out, /duplicate manifest entry/);
});

test('continuous: unknown slug (body file with no matrix row) is REFUSED', () => {
  const dir = repoSandbox();
  writeFileSync(join(dir, 'data/blog/articles/khong-ton-tai-trong-ma-tran.body.html'), fixtureBody());
  const out = selectCli(dir, ['--files', writeFileList('unknown',
    ['data/blog/articles/khong-ton-tai-trong-ma-tran.body.html'])], true);
  assert.ok(out.fail);
  assert.match(out.out, /mode=refuse/);
  assert.match(out.out, /unknown article file/);
});

test('continuous: another unfinished draft pending is REFUSED — resume it first', () => {
  const dir = repoSandbox();
  installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'QA' }); // unfinished draft #1
  const second = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0003', status: 'QA' }); // new push target
  const slug = matrixRow(dir, second).slug;
  const out = selectCli(dir, ['--files', writeFileList('dangling', [`data/blog/articles/${slug}.body.html`])], true);
  assert.ok(out.fail);
  assert.match(out.out, /mode=refuse/);
  assert.match(out.out, /resume them first/);
  assert.match(out.out, /BA-0002/);
});

test('continuous: pushing run state (docs/state/**) is REFUSED', () => {
  const dir = repoSandbox();
  const out = selectCli(dir, ['--files', writeFileList('state', ['docs/state/blog-factory.lock'])], true);
  assert.ok(out.fail);
  assert.match(out.out, /mode=refuse/);
  assert.match(out.out, /never push run state/);
});

test('continuous: published.json without a new article body is REFUSED', () => {
  const dir = repoSandbox();
  const out = selectCli(dir, ['--files', writeFileList('manifestonly', ['data/blog/published.json'])], true);
  assert.ok(out.fail);
  assert.match(out.out, /mode=refuse/);
  assert.match(out.out, /without a new article body/);
});

test('continuous: stale writer state loses — remote main (PUBLISHED) wins, no rewrite', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'QA' });
  factory(dir, ['lock']);
  factory(dir, ['qa', id]);
  factory(dir, ['publish', id]);
  factory(dir, ['unlock']);
  assert.equal(matrixRow(dir, id).status, 'PUBLISHED');
  // A stale writer re-pushes the same body: the workflow must SKIP it.
  const slug = matrixRow(dir, id).slug;
  const out = selectCli(dir, ['--files', writeFileList('stale', [`data/blog/articles/${slug}.body.html`])]);
  assert.match(out, /mode=skip/);
  assert.match(out, /already PUBLISHED/);
});

test('continuous: a sub-1.500-word draft fails scoped QA -> REVIEW (no publish)', () => {
  const dir = repoSandbox();
  const short = fixtureBody({ paragraphs: 0 });
  const id = installFixture(dir, { ...BASE, body: short, rowId: 'BA-0002', status: 'PLANNED' });
  factory(dir, ['lock']);
  factory(dir, ['prepare', id]);
  assert.equal(matrixRow(dir, id).status, 'QA');
  const out = factory(dir, ['qa', id], true);
  assert.ok(out.fail, 'short draft must fail QA');
  const row = matrixRow(dir, id);
  assert.equal(row.status, 'REVIEW');
  assert.equal(row.repair_attempts, '1');
  assert.equal(row.quality_status, 'FAIL');
  assert.ok(!existsSync(join(dir, row.output_path)), 'nothing published from a failed QA');
});

test('continuous: publish never truncates — a 2.500-word article keeps its full body', () => {
  const dir = repoSandbox();
  const body = fixtureBodyExact(dir, 2500);
  const id = installFixture(dir, { ...BASE, body, rowId: 'BA-0002', status: 'QA' });
  const bodyPath = join(dir, 'data/blog/articles', `${matrixRow(dir, id).slug}.body.html`);
  const before = readFileSync(bodyPath, 'utf8');
  factory(dir, ['lock']);
  factory(dir, ['qa', id]);
  factory(dir, ['publish', id]);
  assert.equal(readFileSync(bodyPath, 'utf8'), before, 'body source byte-identical after publish');
  const page = readFileSync(join(dir, matrixRow(dir, id).output_path), 'utf8');
  const lastPara = before.trim().split('\n').pop();
  assert.ok(page.includes(lastPara), 'built page contains the final paragraph (no mid-article truncation)');
  assert.equal(matrixRow(dir, id).status, 'PUBLISHED');
});

test('continuous: prepare refuses without the lock / on terminal rows', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'PLANNED' });
  const noLock = factory(dir, ['prepare', id], true);
  assert.ok(noLock.fail, 'prepare requires the run lock');
  factory(dir, ['lock']);
  setStatus(dir, id, 'FAIL');
  const refused = factory(dir, ['prepare', id], true);
  assert.ok(refused.fail, 'FAIL rows need human review, not auto-prepare');
  assert.match(refused.msg, /FAIL/);
  const published = factory(dir, ['prepare', 'BA-0001'], true); // pilot is PUBLISHED
  assert.ok(published.fail, 'PUBLISHED rows are never re-prepared');
  factory(dir, ['unlock']);
});

test('continuous: crash mid-publish keeps the marker; the next cycle resumes the EXACT article first', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'QA' });
  factory(dir, ['lock']);
  factory(dir, ['qa', id]);
  factory(dir, ['publish', id]);
  factory(dir, ['unlock']);

  // Crash: marker present, built page lost.
  writeFileSync(join(dir, 'docs/state/blog-factory.transaction.json'),
    JSON.stringify({ article_id: id, phase: 'write', started: '2026-09-30T00:00:00.000Z' }, null, 2));
  rmSync(join(dir, matrixRow(dir, id).output_path));

  // The workflow recovery step: resume BEFORE any new article.
  assert.match(factory(dir, ['resume']), new RegExp(`resumed ${id} OK`));
  assert.ok(existsSync(join(dir, matrixRow(dir, id).output_path)), 'resume rebuilt the exact article');
  assert.ok(!existsSync(join(dir, 'docs/state/blog-factory.transaction.json')));
  assert.equal(matrixRow(dir, id).status, 'PUBLISHED');
});

// ---------- pipeline contract: workflows + docs must match the code ----------

const read = (p) => readFileSync(join(REPO, p), 'utf8');

test('pipeline: article-only pushes skip heavy CI — ci.yml and distribution.yml paths-ignore', () => {
  for (const wf of ['.github/workflows/ci.yml', '.github/workflows/distribution.yml']) {
    const y = read(wf);
    assert.ok(y.includes('paths-ignore:'), `${wf} must skip article-only pushes`);
    for (const p of ['data/blog/articles/**', 'data/blog/published.json', 'data/blog/content-matrix.csv']) {
      assert.ok(y.includes(`'${p}'`), `${wf} ignores ${p}`);
    }
    // Engine/tool/workflow/test changes still trigger the FULL suite.
    for (const p of ['tools/', 'src/', 'tests/', '.github/', 'config/', 'assets/']) {
      assert.ok(!y.includes(`'${p}'`), `${wf} must NOT ignore engine path ${p}`);
    }
  }
});

test('pipeline: blog-factory-publish.yml triggers on the writer push and cannot recurse', () => {
  const y = read('.github/workflows/blog-factory-publish.yml');
  assert.ok(y.includes("'data/blog/articles/**'"), 'trigger includes article bodies');
  assert.ok(y.includes("'data/blog/published.json'"), 'trigger includes the manifest draft push');
  assert.match(y, /group: blog-factory-publish/, 'serialized: one production workflow at a time');
  assert.match(y, /cancel-in-progress: false/, 'queued runs are never cancelled mid-publish');
  assert.match(y, /factory-select\.mjs --files/, 'detect derives the exact article from the push');
  assert.match(y, /blog-factory\.mjs prepare/, 'workflow auto-claims (writer no longer claims by hand)');
  assert.match(y, /blog-factory\.mjs resume/, 'recovery runs before any new article');
  assert.match(y, /\[skip ci\]/, 'derived commit is marked skip-ci');
  // The derived commit must not touch the trigger paths (no recursive runs).
  const commitStep = y.split('Commit derived state')[1] ?? '';
  assert.ok(commitStep, 'derived commit step exists');
  assert.ok(!commitStep.includes('data/blog/articles'), 'derived commit never touches article bodies');
  assert.ok(!commitStep.includes('data/blog/published.json'), 'derived commit never touches the manifest');
  assert.ok(commitStep.includes('blog-factory.lock'), 'lock is explicitly unstaged');
});

test('pipeline: docs match code — CONTINUOUS-WRITER contract + no outdated wording', () => {
  const cw = read('docs/CONTINUOUS-WRITER.md');
  assert.ok(cw.includes('FETCH FRESH MAIN') && cw.includes('REPEAT'), 'canonical loop is documented');
  assert.ok(cw.includes('RECOVER') && cw.includes('RESUME'), 'recovery is part of the loop');
  assert.ok(cw.includes('1.500–4.000'), 'length rule is stated');
  assert.ok(cw.includes('Không được dừng vì') && cw.includes('Chỉ được dừng khi'), 'stop conditions are stated');
  const bf = read('docs/BLOG-FACTORY.md');
  assert.ok(!bf.includes('không tự chạy liên tục'), 'outdated non-continuous wording removed');
  assert.ok(bf.includes('continuous-ready'), 'factory is declared continuous-ready');
  assert.ok(bf.includes('prepare <BA-id>'), 'the auto-claim command is documented');
  const rules = read('docs/ARTICLE-RULES.md');
  assert.ok(rules.includes('1.500–4.000'), 'article rules keep the synced length gate');
  const qa = read('tools/article-qa.mjs');
  assert.ok(qa.includes('MIN_WORDS = 1500') && qa.includes('MAX_WORDS = 4000'), 'QA tool keeps the synced length gate');
});
