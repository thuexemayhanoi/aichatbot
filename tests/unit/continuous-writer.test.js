import { CONTENT_MIN_WORDS, CONTENT_MAX_WORDS } from '../../tools/writer-content-policy.mjs';
import { MIN_WORDS as QA_MIN_WORDS, MAX_WORDS as QA_MAX_WORDS } from '../../tools/article-qa.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  repoSandbox, factory, selectCli, installFixture, fixtureBody, fixtureBodyExact,
  readJson, writeJson, matrixRow, setStatus, REPO
} from '../helpers/factory-sandbox.mjs';

/**
 * v67 SIMPLE PRODUCTION MODE contract (docs/CONTINUOUS-WRITER.md) — SANDBOX ONLY.
 *
 * The writer's happy path is: write TWO article sources + their manifest
 * draft entries -> push. GitHub owns claim/QA/publish/verify:
 *   select --files -> recover-if-needed (NO lock) -> prepare-chunk (auto-claim)
 *   -> qa-chunk (independent PASS/FAIL) -> publish-chunk (ONE grouped build)
 * NEW / REPAIR / BACKLOG scopes are mutually exclusive (mirrors /vanchinh):
 * a NEW push processes EXACTLY the pushed ids and never mixes unrelated
 * pending/backlog rows.
 * Every test below drives that exact workflow sequence inside a sandbox.
 */

const BASE = {
  category: 'RENT',
  title: 'Thuê xe máy giá rẻ: cách chọn xe và ước tính chi phí',
  description: 'Cách chọn xe máy giá rẻ để thuê, ước tính chi phí theo ngày tuần tháng, tiền cọc và các khoản cần xác nhận trước khi nhận xe ở Long Biên Hà Nội.'
};
const BASE2 = {
  category: 'GUIDE',
  title: 'Thủ tục thuê xe máy đường dài: giấy tờ và checklist nhận xe',
  description: 'Checklist giấy tờ, bằng lái, đặt cọc và các bước nhận xe máy đường dài để hành trình an toàn và không phát sinh tranh chấp.'
};

const writeFileList = (name, files) => {
  writeFileSync(`/tmp/motoai-cw-${name}.txt`, files.join('\n') + '\n');
  return `/tmp/motoai-cw-${name}.txt`;
};

/** Distinct fixture bodies for a chunk: every block is prefixed so the
 *  no-cross-article-duplicate QA gate sees two independent articles. */
const bodyA = () => fixtureBody({ tag: 'Gói xe A' });
const bodyB = () => fixtureBody({ tag: 'Gói xe B' });

/** Install the canonical 2-article micro chunk (PLANNED rows + drafts). */
function installChunk(dir) {
  const a = installFixture(dir, { ...BASE, body: bodyA(), rowId: 'BA-0002', status: 'PLANNED' });
  const b = installFixture(dir, { ...BASE2, body: bodyB(), rowId: 'BA-0003', status: 'PLANNED' });
  return [a, b];
}

test('chunk: 2 PLANNED bodies + 2 manifest entries -> select both -> prepare-chunk -> qa-chunk -> ONE grouped publish', () => {
  const dir = repoSandbox();
  const [a, b] = installChunk(dir);
  const slugA = matrixRow(dir, a).slug;
  const slugB = matrixRow(dir, b).slug;
  const out = selectCli(dir, ['--files', writeFileList('happy2', [
    `data/blog/articles/${slugA}.body.html`, `data/blog/articles/${slugB}.body.html`,
    'data/blog/published.json'
  ])]);
  assert.match(out, /mode=new/);
  assert.match(out, /proceed=true/);
  assert.match(out, /claim_ids=BA-0002,BA-0003/);
  assert.match(out, /qa_ids=BA-0002,BA-0003/);

  // Workflow sequence, exactly as blog-factory-publish.yml runs it.
  // v67: NO lock — the run is serialized by the workflow concurrency group.
  assert.match(factory(dir, ['prepare-chunk', 'BA-0002,BA-0003']), /prepare-chunk: 2 row\(s\) at QA-or-later/);
  assert.match(factory(dir, ['prepare-chunk', 'BA-0002,BA-0003']), /already at QA/); // idempotent
  assert.equal(matrixRow(dir, a).status, 'QA');
  assert.equal(matrixRow(dir, b).status, 'QA');

  const qaOut = factory(dir, ['qa-chunk', 'BA-0002,BA-0003']);
  assert.match(qaOut, /QA PASS BA-0002/);
  assert.match(qaOut, /QA PASS BA-0003/);
  assert.match(qaOut, /pass_ids=BA-0002,BA-0003/);
  assert.match(qaOut, /fail_ids=$/m);
  assert.equal(matrixRow(dir, a).status, 'PASS');
  assert.equal(matrixRow(dir, b).status, 'PASS');

  const pub = factory(dir, ['publish-chunk', 'BA-0002,BA-0003']);
  assert.match(pub, /published BA-0002 -> /);
  assert.match(pub, /published BA-0003 -> /);
  assert.match(pub, /build_calls=1/, 'ONE grouped build for the whole chunk, not two');
  assert.match(factory(dir, ['validate']), /matrix OK/);

  for (const id of [a, b]) {
    const row = matrixRow(dir, id);
    assert.equal(row.status, 'PUBLISHED');
    assert.ok(existsSync(join(dir, row.output_path)), 'article page built');
    assert.ok(readFileSync(join(dir, 'sitemap.xml'), 'utf8').includes(row.output_path.replace(/index\.html$/, '')));
  }
  assert.ok(!existsSync(join(dir, 'docs/state/blog-factory.transaction.json')), 'txn cleared');
  assert.ok(!existsSync(join(dir, 'docs/state/blog-factory.lock')), 'happy path creates no lock');
  const cp = readJson(dir, 'docs/state/blog-factory.checkpoint.json');
  assert.deepEqual(cp.claimed, []);
  assert.deepEqual(cp.finished, []);
});

test('chunk: one PASS + one REPAIR -> publish ONLY the PASS id; the failed one stays for repair', () => {
  const dir = repoSandbox();
  const good = installFixture(dir, { ...BASE, body: bodyA(), rowId: 'BA-0002', status: 'QA' });
  const bad = installFixture(dir, {
    ...BASE2, body: fixtureBody({ tag: 'Gói xe B' }) + '\n<p>Gọi ngay số 0987 654 321 để biết thêm chi tiết.</p>', rowId: 'BA-0003', status: 'QA'
  }); // invented phone -> critical gate -> score 0 -> QA FAIL
  const qaOut = factory(dir, ['qa-chunk', `${good},${bad}`]);
  assert.match(qaOut, /pass_ids=BA-0002/);
  assert.match(qaOut, /fail_ids=BA-0003/);
  assert.equal(matrixRow(dir, good).status, 'PASS');
  assert.equal(matrixRow(dir, bad).status, 'REPAIR');
  assert.equal(matrixRow(dir, bad).repair_attempts, '1');
  assert.equal(matrixRow(dir, bad).score, '0');

  const pub = factory(dir, ['publish-chunk', good]);
  assert.match(pub, /build_calls=1/);
  assert.equal(matrixRow(dir, good).status, 'PUBLISHED');
  assert.equal(matrixRow(dir, bad).status, 'REPAIR', 'one bad article never corrupts the good one');
  assert.ok(existsSync(join(dir, matrixRow(dir, good).output_path)));
  assert.ok(!existsSync(join(dir, matrixRow(dir, bad).output_path)), 'nothing published from a failed QA');
});

test('chunk: publish-chunk refuses a non-PASS id and writes no transaction marker', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'QA' });
  const out = factory(dir, ['publish-chunk', id], true);
  assert.ok(out.fail);
  assert.match(out.out || out.msg, /only PASS may publish/);
  assert.ok(!existsSync(join(dir, 'docs/state/blog-factory.transaction.json')), 'refusal happens before the marker');
});

test('chunk: duplicate id inside a chunk command is REFUSED', () => {
  const dir = repoSandbox();
  const out = factory(dir, ['prepare-chunk', 'BA-0002,BA-0002'], true);
  assert.ok(out.fail);
  assert.match(out.msg, /duplicate article id in chunk/);
});

test('chunk: crash mid grouped publish keeps the marker; resume recovers the EXACT same ids', () => {
  const dir = repoSandbox();
  const [a, b] = installChunk(dir);
  factory(dir, ['prepare-chunk', 'BA-0002,BA-0003']);
  factory(dir, ['qa-chunk', 'BA-0002,BA-0003']);
  factory(dir, ['publish-chunk', 'BA-0002,BA-0003']);
  assert.equal(matrixRow(dir, a).status, 'PUBLISHED');
  assert.equal(matrixRow(dir, b).status, 'PUBLISHED');

  // Crash: chunk marker present, both built pages lost.
  writeFileSync(join(dir, 'docs/state/blog-factory.transaction.json'),
    JSON.stringify({ article_ids: [a, b], phase: 'write', started: '2026-09-30T00:00:00.000Z' }, null, 2));
  rmSync(join(dir, matrixRow(dir, a).output_path));
  rmSync(join(dir, matrixRow(dir, b).output_path));

  // The workflow recovery step: resume BEFORE any new work.
  const out = factory(dir, ['resume']);
  assert.match(out, /resumed BA-0002, BA-0003 OK/);
  assert.match(out, /build_calls=1/, 'resume also rebuilds exactly once');
  assert.ok(existsSync(join(dir, matrixRow(dir, a).output_path)), 'resume rebuilt the exact article');
  assert.ok(existsSync(join(dir, matrixRow(dir, b).output_path)));
  assert.ok(!existsSync(join(dir, 'docs/state/blog-factory.transaction.json')));
  assert.equal(matrixRow(dir, a).status, 'PUBLISHED');
  assert.equal(matrixRow(dir, b).status, 'PUBLISHED');
});

test('chunk: resume re-drives a PASS row that crashed before the matrix write', () => {
  const dir = repoSandbox();
  const [a, b] = installChunk(dir);
  factory(dir, ['prepare-chunk', 'BA-0002,BA-0003']);
  factory(dir, ['qa-chunk', 'BA-0002,BA-0003']);
  // Crash between marker write and the matrix write: rows still PASS.
  writeFileSync(join(dir, 'docs/state/blog-factory.transaction.json'),
    JSON.stringify({ article_ids: [a, b], phase: 'write', started: '2026-09-30T00:00:00.000Z' }, null, 2));
  assert.equal(matrixRow(dir, a).status, 'PASS');

  assert.match(factory(dir, ['resume']), /resumed BA-0002, BA-0003 OK/);
  assert.equal(matrixRow(dir, a).status, 'PUBLISHED');
  assert.equal(matrixRow(dir, b).status, 'PUBLISHED');
  assert.ok(!existsSync(join(dir, 'docs/state/blog-factory.transaction.json')));
});

test('chunk: legacy single-id marker still resumes (backward compatibility)', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'QA' });
  factory(dir, ['qa', id]);
  factory(dir, ['publish', id]);
  writeFileSync(join(dir, 'docs/state/blog-factory.transaction.json'),
    JSON.stringify({ article_id: id, phase: 'write', started: '2026-09-30T00:00:00.000Z' }, null, 2));
  rmSync(join(dir, matrixRow(dir, id).output_path));
  assert.match(factory(dir, ['resume']), new RegExp(`resumed ${id} OK`));
  assert.ok(existsSync(join(dir, matrixRow(dir, id).output_path)));
  assert.equal(matrixRow(dir, id).status, 'PUBLISHED');
});

test('chunk: single-article push still works (corpus-boundary chunk size 1)', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'PLANNED' });
  const slug = matrixRow(dir, id).slug;
  const out = selectCli(dir, ['--files', writeFileList('single', [
    `data/blog/articles/${slug}.body.html`, 'data/blog/published.json'
  ])]);
  assert.match(out, /mode=new/);
  assert.match(out, /claim_ids=BA-0002/);
  assert.match(out, /qa_ids=BA-0002/);
  factory(dir, ['prepare-chunk', id]);
  factory(dir, ['qa-chunk', id]);
  assert.match(factory(dir, ['publish-chunk', id]), /build_calls=1/);
  assert.equal(matrixRow(dir, id).status, 'PUBLISHED');
});

test('chunk: NEW push processes EXACTLY the pushed ids — unrelated pending rows are NOT mixed (v67, /vanchinh)', () => {
  const dir = repoSandbox();
  // An unfinished row NOT part of the push (QA with a valid draft on disk).
  installFixture(dir, { ...BASE, body: bodyA(), rowId: 'BA-0002', status: 'QA' });
  // The writer pushes exactly one new article (BA-0003).
  const second = installFixture(dir, { ...BASE2, body: bodyB(), rowId: 'BA-0003', status: 'PLANNED' });
  const slug = matrixRow(dir, second).slug;
  const out = selectCli(dir, ['--files', writeFileList('exact-new', [
    `data/blog/articles/${slug}.body.html`, 'data/blog/published.json'
  ])]);
  assert.match(out, /mode=new/);
  assert.match(out, /ids=BA-0003/, 'scope = exactly the pushed ids');
  assert.ok(!out.includes('BA-0002'), 'unrelated pending rows never join a NEW run');
  assert.match(out, /claim_ids=BA-0003/);
  assert.match(out, /qa_ids=BA-0003/);
  // The grouped run completes exactly the pushed pair — the pending row stays untouched.
  factory(dir, ['prepare-chunk', 'BA-0003']);
  factory(dir, ['qa-chunk', 'BA-0003']);
  const pub = factory(dir, ['publish-chunk', 'BA-0003']);
  assert.match(pub, /build_calls=1/);
  assert.equal(matrixRow(dir, 'BA-0003').status, 'PUBLISHED');
  assert.equal(matrixRow(dir, 'BA-0002').status, 'QA', 'pending row waits for its own repair push / backlog scan');
});

test('chunk: repair rows pushed TOGETHER with new rows ride along in the same run (they are part of the push)', () => {
  const dir = repoSandbox();
  const repair = installFixture(dir, { ...BASE, body: bodyA(), rowId: 'BA-0002', status: 'REPAIR' });
  const fresh = installFixture(dir, { ...BASE2, body: bodyB(), rowId: 'BA-0003', status: 'PLANNED' });
  const slugs = [matrixRow(dir, repair).slug, matrixRow(dir, fresh).slug];
  const out = selectCli(dir, ['--files', writeFileList('new-plus-repair', [
    `data/blog/articles/${slugs[0]}.body.html`,
    `data/blog/articles/${slugs[1]}.body.html`,
    'data/blog/published.json'
  ])]);
  assert.match(out, /mode=new/);
  assert.match(out, /claim_ids=BA-0003/);
  assert.match(out, /qa_ids=BA-0002,BA-0003/);
  factory(dir, ['prepare-chunk', 'BA-0003']);
  factory(dir, ['qa-chunk', 'BA-0002,BA-0003']);
  const pub = factory(dir, ['publish-chunk', 'BA-0002,BA-0003']);
  assert.match(pub, /build_calls=1/);
  assert.equal(matrixRow(dir, 'BA-0002').status, 'PUBLISHED');
  assert.equal(matrixRow(dir, 'BA-0003').status, 'PUBLISHED');
});

test('chunk: pending rows are recovered by the --backlog scan, never by a NEW push', () => {
  const dir = repoSandbox();
  installFixture(dir, { ...BASE, body: bodyA(), rowId: 'BA-0002', status: 'QA' }); // pending draft
  installFixture(dir, { ...BASE2, body: bodyB(), rowId: 'BA-0003', status: 'PLANNED' }); // backlog row
  const out = selectCli(dir, ['--backlog']);
  assert.match(out, /mode=repair/, 'pending rows first — they are the recovery net');
  assert.match(out, /ids=BA-0002,BA-0003/);
  assert.match(out, /claim_ids=BA-0003/);
  assert.match(out, /qa_ids=BA-0002,BA-0003/);
  factory(dir, ['prepare-chunk', 'BA-0003']);
  factory(dir, ['qa-chunk', 'BA-0002,BA-0003']);
  const pub = factory(dir, ['publish-chunk', 'BA-0002,BA-0003']);
  assert.match(pub, /build_calls=1/);
  assert.equal(matrixRow(dir, 'BA-0002').status, 'PUBLISHED');
  assert.equal(matrixRow(dir, 'BA-0003').status, 'PUBLISHED');
});

test('chunk: BACKLOG discovery — PLANNED rows with existing bodies+drafts are found without a new push', () => {
  const dir = repoSandbox();
  // An earlier workflow died: bodies + manifest drafts committed, matrix still PLANNED.
  installFixture(dir, { ...BASE, body: bodyA(), rowId: 'BA-0002', status: 'PLANNED' });
  installFixture(dir, { ...BASE2, body: bodyB(), rowId: 'BA-0003', status: 'PLANNED' });

  // A push without article files falls through to the deterministic backlog scan.
  const out = selectCli(dir, ['--files', writeFileList('backlog', ['README.md'])]);
  assert.match(out, /mode=backlog/);
  assert.match(out, /claim_ids=BA-0002,BA-0003/);
  assert.match(out, /qa_ids=BA-0002,BA-0003/);

  // The manual scan path (workflow_dispatch without ids) finds the same backlog.
  const out2 = selectCli(dir, ['--backlog']);
  assert.match(out2, /mode=backlog/);
  assert.match(out2, /claim_ids=BA-0002,BA-0003/);

  // And the factory completes the backlog without any re-push of the articles.
  factory(dir, ['prepare-chunk', 'BA-0002,BA-0003']);
  factory(dir, ['qa-chunk', 'BA-0002,BA-0003']);
  factory(dir, ['publish-chunk', 'BA-0002,BA-0003']);
  assert.equal(matrixRow(dir, 'BA-0002').status, 'PUBLISHED');
  assert.equal(matrixRow(dir, 'BA-0003').status, 'PUBLISHED');
});

test('chunk: repair push (QA row body edit) is mode=repair and NEVER claims fresh PLANNED rows', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'REPAIR' });
  // BA-0003 stays a clean PLANNED row: no body, no draft — never claimable.
  const slug = matrixRow(dir, id).slug;
  const out = selectCli(dir, ['--files', writeFileList('repair', [
    `data/blog/articles/${slug}.body.html`
  ])]);
  assert.match(out, /mode=repair/);
  assert.match(out, /claim_ids=$/m, 'repair push never claims PLANNED rows');
  assert.match(out, /qa_ids=BA-0002/);
  assert.ok(!out.includes('BA-0003'), 'untouched PLANNED rows stay out of the scope');
});

test('chunk: more than 50 changed bodies is REFUSED (workflow ceiling)', () => {
  const dir = repoSandbox();
  const files = [];
  const ids = [...Array(53).keys()].map((i) => i + 2).filter((i) => i !== 4).slice(0, 52); // skip pilot BA-0004
  for (const i of ids) { // 52 fixture bodies -> over the ceiling
    const id = `BA-${String(i).padStart(4, '0')}`;
    installFixture(dir, { ...BASE, body: fixtureBody({ paragraphs: 1, tag: `Gói ${id}` }), rowId: id, status: 'PLANNED' });
    files.push(`data/blog/articles/${matrixRow(dir, id).slug}.body.html`);
  }
  const out = selectCli(dir, ['--files', writeFileList('over50', files)], true);
  assert.ok(out.fail);
  assert.match(out.out, /mode=refuse/);
  assert.match(out.out, /workflow ceiling is 50/);
});

test('chunk: duplicate article_id in the manifest is REFUSED', () => {
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

test('chunk: unknown slug (body file with no matrix row) is REFUSED', () => {
  const dir = repoSandbox();
  writeFileSync(join(dir, 'data/blog/articles/khong-ton-tai-trong-ma-tran.body.html'), fixtureBody());
  const out = selectCli(dir, ['--files', writeFileList('unknown',
    ['data/blog/articles/khong-ton-tai-trong-ma-tran.body.html'])], true);
  assert.ok(out.fail);
  assert.match(out.out, /mode=refuse/);
  assert.match(out.out, /unknown article file/);
});

test('chunk: duplicate body path in one push is REFUSED', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'PLANNED' });
  const slug = matrixRow(dir, id).slug;
  const out = selectCli(dir, ['--files', writeFileList('dupsame', [
    `data/blog/articles/${slug}.body.html`, `data/blog/articles/${slug}.body.html`
  ])], true);
  assert.ok(out.fail);
  assert.match(out.out, /mode=refuse/);
  assert.match(out.out, /duplicate body path/);
});

test('chunk: FAIL/BLOCKED rows in a push are REFUSED (human review)', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'FAIL' });
  const slug = matrixRow(dir, id).slug;
  const out = selectCli(dir, ['--files', writeFileList('failrow', [
    `data/blog/articles/${slug}.body.html`
  ])], true);
  assert.ok(out.fail);
  assert.match(out.out, /mode=refuse/);
  assert.match(out.out, /needs human review/);
});

test('chunk: pushing run state (docs/state/**) is REFUSED', () => {
  const dir = repoSandbox();
  const out = selectCli(dir, ['--files', writeFileList('state', ['docs/state/blog-factory.lock'])], true);
  assert.ok(out.fail);
  assert.match(out.out, /mode=refuse/);
  assert.match(out.out, /never push run state/);
});

test('chunk: published.json without a new article body is REFUSED', () => {
  const dir = repoSandbox();
  const out = selectCli(dir, ['--files', writeFileList('manifestonly', ['data/blog/published.json'])], true);
  assert.ok(out.fail);
  assert.match(out.out, /mode=refuse/);
  assert.match(out.out, /without a new article body/);
});

test('chunk: stale writer state loses — remote main (PUBLISHED) wins, no rewrite', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'QA' });
  factory(dir, ['qa-chunk', id]);
  factory(dir, ['publish-chunk', id]);
  assert.equal(matrixRow(dir, id).status, 'PUBLISHED');
  const slug = matrixRow(dir, id).slug;
  const out = selectCli(dir, ['--files', writeFileList('stale', [`data/blog/articles/${slug}.body.html`])]);
  assert.match(out, /mode=skip/);
  assert.match(out, /already PUBLISHED/);
});

test('chunk: a sub-800-word draft only WARNs — QA PASS with score 95 (v69 guideline, publish allowed)', () => {
  const dir = repoSandbox();
  const shortish = fixtureBody({ paragraphs: 3 }); // ~450 words: >=300 (not a stub), <800 (guideline)
  const id = installFixture(dir, { ...BASE, body: shortish, rowId: 'BA-0002', status: 'QA' });
  const out = factory(dir, ['qa-chunk', id]);
  assert.match(out, /pass_ids=BA-0002/);
  assert.ok(!/fail_ids=BA-0002/.test(out));
  const row = matrixRow(dir, id);
  assert.equal(row.status, 'PASS');
  assert.equal(row.score, '95');
  assert.equal(row.quality_status, 'PASS');
});

test('chunk: a legacy REVIEW row is migrated one-way to REPAIR before QA (v69)', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'QA' });
  setStatus(dir, id, 'REVIEW'); // pre-v69 legacy state
  const out = factory(dir, ['qa', id]);
  assert.match(out, /migrate BA-0002 REVIEW -> REPAIR/);
  assert.equal(matrixRow(dir, id).status, 'PASS');
});

test('chunk: qa-chunk skips an already-PASS row without re-running QA', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'PASS' });
  const out = factory(dir, ['qa-chunk', id]);
  assert.match(out, /skip: BA-0002 already PASS/);
  assert.match(out, /pass_ids=BA-0002/);
  assert.equal(matrixRow(dir, id).status, 'PASS');
});

test('chunk: publish never truncates — a 2.500-word article keeps its full body', () => {
  const dir = repoSandbox();
  const body = fixtureBodyExact(dir, 2500);
  const id = installFixture(dir, { ...BASE, body, rowId: 'BA-0002', status: 'QA' });
  const bodyPath = join(dir, 'data/blog/articles', `${matrixRow(dir, id).slug}.body.html`);
  const before = readFileSync(bodyPath, 'utf8');
  factory(dir, ['qa-chunk', id]);
  factory(dir, ['publish-chunk', id]);
  assert.equal(readFileSync(bodyPath, 'utf8'), before, 'body source byte-identical after publish');
  const page = readFileSync(join(dir, matrixRow(dir, id).output_path), 'utf8');
  const lastPara = before.trim().split('\n').pop();
  assert.ok(page.includes(lastPara), 'built page contains the final paragraph (no mid-article truncation)');
  assert.equal(matrixRow(dir, id).status, 'PUBLISHED');
});

test('chunk: prepare-chunk is lock-free (v67) but still refuses terminal rows', () => {
  const dir = repoSandbox();
  const id = installFixture(dir, { ...BASE, body: fixtureBody(), rowId: 'BA-0002', status: 'PLANNED' });
  // Simple Production Mode: the workflow path never takes a lock.
  assert.match(factory(dir, ['prepare-chunk', id]), /prepare-chunk: 1 row\(s\) at QA-or-later/);
  assert.equal(matrixRow(dir, id).status, 'QA');
  assert.ok(!existsSync(join(dir, 'docs/state/blog-factory.lock')), 'no lock created on the happy path');
  setStatus(dir, id, 'FAIL');
  const refused = factory(dir, ['prepare-chunk', id], true);
  assert.ok(refused.fail, 'FAIL rows need human review, not auto-prepare');
  assert.match(refused.msg, /FAIL/);
  const published = factory(dir, ['prepare-chunk', 'BA-0001'], true); // pilot is PUBLISHED
  assert.ok(published.fail, 'PUBLISHED rows are never re-prepared');
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

test('pipeline: blog-factory-publish.yml is the SIMPLE PRODUCTION MODE workflow and cannot recurse', () => {
  const y = read('.github/workflows/blog-factory-publish.yml');
  assert.ok(y.includes("'data/blog/articles/**'"), 'trigger includes article bodies');
  assert.ok(y.includes("'data/blog/published.json'"), 'trigger includes the manifest draft push');
  assert.match(y, /group: blog-factory-publish/, 'serialized: one production workflow at a time');
  assert.match(y, /cancel-in-progress: false/, 'queued runs are never cancelled mid-publish');
  assert.match(y, /factory-select\.mjs --files/, 'detect derives the exact scope from the push');
  // GitHub's YAML parser rejects unquoted scalars containing ": " — that broke
  // the whole workflow in v67 (invalid workflow file, 0 jobs). Guard every name.
  for (const line of y.split('\n')) {
    assert.ok(!/^\s*-\s*name: [^'"'].*\S: /.test(line), `unquoted YAML name with a colon breaks GitHub parsing: ${line.trim()}`);
    assert.ok(!/^\s*name: [^'"'].*\S: /.test(line), `unquoted YAML name with a colon breaks GitHub parsing: ${line.trim()}`);
  }
  assert.match(y, /blog-factory\.mjs prepare-chunk/, 'workflow auto-claims the chunk (writer no longer claims by hand)');
  assert.match(y, /blog-factory\.mjs qa-chunk/, 'workflow runs independent scoped QA per article');
  assert.match(y, /blog-factory\.mjs publish-chunk/, 'workflow runs ONE grouped transactional publish');
  assert.match(y, /blog-factory\.mjs validate/, 'light matrix smoke runs after publish');
  // Recovery is CONDITIONAL: resume only when a real txn marker exists.
  assert.match(y, /if \[ -f docs\/state\/blog-factory\.transaction\.json \]/, 'resume runs only when a real txn marker exists');
  // v67: no persistent workflow lock anywhere in the pipeline.
  assert.ok(!y.includes('blog-factory.mjs lock'), 'the workflow never takes a lock');
  // The workflow never waits on the Pages deploy.
  assert.ok(!y.includes('deploy-pages') && !y.includes('pages-build'), 'no Pages deploy/wait steps');
  assert.match(y, /\[skip ci\]/, 'derived commit is marked skip-ci');
  // The derived commit must not touch the trigger paths (no recursive runs)
  // and never stages run state.
  const commitStep = (y.split('Commit derived state')[1] ?? '').split('Assert clean')[0];
  assert.ok(commitStep, 'derived commit step exists');
  assert.ok(!commitStep.includes('data/blog/articles'), 'derived commit never touches article bodies');
  assert.ok(commitStep.includes('data/blog/published.json'), 'factory commits deterministic external-writer manifest registration');
  assert.ok(!commitStep.includes('blog-factory.lock'), 'derived commit never stages a lock');
  assert.ok(!commitStep.includes('blog-factory.transaction.json'), 'derived commit never stages the txn marker');
  // Assert-clean is the final gate of the canonical path.
  assert.match(y, /Assert clean state/, 'assert-clean step closes the pipeline');
});

test('pipeline: single external writer runbook replaces the retired Ollama/multi-agent loop', () => {
  const cw = read('docs/CONTINUOUS-WRITER.md');
  const agents = read('AGENTS.md');
  const external = read('docs/EXTERNAL-WRITER.md');
  assert.match(cw, /FETCH FRESH MAIN/);
  assert.match(cw, /REPAIR\/RESUME|RESUME unfinished/);
  assert.match(cw, /NEXT 2/);
  assert.match(cw, /2–10|1–10/);
  assert.match(agents, /MỘT AI bên ngoài/);
  assert.match(external, /Ollama/);
  assert.match(external, /published\.json/);
  assert.match(external, /factory-publish/);
  assert.doesNotMatch(cw, /Auto Writer chạy Ollama cục bộ trên GitHub Actions theo lịch/);
  const bf = read('docs/BLOG-FACTORY.md');
  assert.match(bf, /ACTIVE MODE \(2026-10-11\)/);
  const rules = read('docs/ARTICLE-RULES.md');
  const approvedRange = `${CONTENT_MIN_WORDS.toLocaleString('vi-VN')}–${CONTENT_MAX_WORDS.toLocaleString('vi-VN')}`;
  assert.ok(cw.includes(approvedRange), 'editorial word range remains documented');
  assert.ok(rules.includes(approvedRange), 'article rules keep synced length range');
  assert.equal(CONTENT_MIN_WORDS, 800);
  assert.equal(CONTENT_MAX_WORDS, 2000);
  assert.equal(QA_MIN_WORDS, CONTENT_MIN_WORDS);
  assert.equal(QA_MAX_WORDS, CONTENT_MAX_WORDS);
});

test('pipeline: the real repo is untouched by every sandbox chunk', () => {
  const lines = readFileSync(join(REPO, 'data/blog/content-matrix.csv'), 'utf8').trim().split('\n');
  const rows = lines.slice(1).map((l) => l.split(','));
  assert.equal(rows.length, 2000, 'matrix size never changes');
  const manifest = JSON.parse(readFileSync(join(REPO, 'data/blog/published.json'), 'utf8'));
  const manifestIds = new Set(manifest.articles.map((a) => a.article_id));
  for (const c of rows) {
    if (c[3] === 'PUBLISHED') assert.ok(manifestIds.has(c[0]), `PUBLISHED ${c[0]} missing from manifest`);
  }
  assert.equal(rows.filter((c) => c[3] === 'WRITING').length, 0, 'claim is local-only, never committed');
  assert.ok(!existsSync(join(REPO, 'docs/state/blog-factory.lock')));
  assert.ok(!existsSync(join(REPO, 'docs/state/blog-factory.transaction.json')));
});
