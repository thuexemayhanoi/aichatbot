import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  repoSandbox, factory, readMatrix, readJson, REPO
} from '../helpers/factory-sandbox.mjs';

/**
 * v64 micro production-loop contract — tested in a SANDBOX copy so the
 * real matrix is never touched:
 *   lock -> claim EXACTLY 1 -> finish 1 -> (scoped QA in article-qa.test.js)
 *   -> abandon for crash recovery, checkpoint, no duplicate WRITING.
 */

test('factory: lock is exclusive and unlock frees it', () => {
  const dir = repoSandbox();
  assert.match(factory(dir, ['lock']), /lock created/);
  const fail = factory(dir, ['lock'], true);
  assert.ok(fail.fail, 'second lock must fail');
  assert.match(factory(dir, ['unlock']), /released/);
});

test('factory: claim refuses without the run lock', () => {
  const dir = repoSandbox();
  const fail = factory(dir, ['claim'], true);
  assert.ok(fail.fail, 'claim without lock must fail');
});

test('factory: claim defaults to EXACTLY 1 row (1 article / cycle)', () => {
  const dir = repoSandbox();
  factory(dir, ['lock']);
  const out = factory(dir, ['claim']);
  assert.match(out, /^claimed 1: BA-0002/);
  const writing = readMatrix(dir).filter((l) => l.split(',')[3] === 'WRITING');
  assert.equal(writing.length, 1, 'exactly one row is WRITING');
  assert.equal(readMatrix(dir).length, 2001, 'matrix size never changes (header + 2000)');
});

test('factory: claim refuses while another article is WRITING (single-flight)', () => {
  const dir = repoSandbox();
  factory(dir, ['lock']);
  factory(dir, ['claim']);
  const fail = factory(dir, ['claim'], true);
  assert.ok(fail.fail, 'a second concurrent claim must fail');
  assert.match(fail.msg, /already WRITING/);
  assert.equal(readMatrix(dir).filter((l) => l.split(',')[3] === 'WRITING').length, 1);
});

test('factory: claim with an explicit BA-id claims exactly that row', () => {
  const dir = repoSandbox();
  factory(dir, ['lock']);
  const out = factory(dir, ['claim', 'BA-0005']);
  assert.match(out, /^claimed 1: BA-0005/);
  const writing = readMatrix(dir).filter((l) => l.split(',')[3] === 'WRITING');
  assert.equal(writing.length, 1);
  assert.ok(writing[0].startsWith('BA-0005,'));
});

test('factory: claim refuses non-PLANNED rows and unknown ids', () => {
  const dir = repoSandbox();
  factory(dir, ['lock']);
  const fail1 = factory(dir, ['claim', 'BA-0001'], true); // PUBLISHED
  assert.ok(fail1.fail, 'claiming a PUBLISHED row must fail');
  const fail2 = factory(dir, ['claim', 'BA-9999'], true);
  assert.ok(fail2.fail, 'claiming an unknown id must fail');
});

test('factory: numeric chunk sizes are refused (chunk contract retired)', () => {
  const dir = repoSandbox();
  factory(dir, ['lock']);
  const fail = factory(dir, ['claim', '10'], true);
  assert.ok(fail.fail, 'claim 10 must fail under the 1-article/cycle contract');
  assert.match(fail.msg, /1 article \/ cycle/);
  assert.equal(readMatrix(dir).filter((l) => l.split(',')[3] === 'WRITING').length, 0,
    'no row was mutated by the refused claim');
});

test('factory: finish moves the single WRITING row to QA and records the checkpoint', () => {
  const dir = repoSandbox();
  factory(dir, ['lock']);
  factory(dir, ['claim']);
  const out = factory(dir, ['finish', 'BA-0002']);
  assert.match(out, /^finished 1: BA-0002/);
  const rows = readMatrix(dir);
  assert.equal(rows.filter((l) => l.split(',')[3] === 'QA').length, 1);
  assert.equal(rows.filter((l) => l.split(',')[3] === 'WRITING').length, 0);
  const cp = readJson(dir, 'docs/state/blog-factory.checkpoint.json');
  assert.deepEqual(cp.finished, ['BA-0002']);
  assert.deepEqual(cp.claimed, []);
});

test('factory: finish-chunk alias still works for backward compatibility', () => {
  const dir = repoSandbox();
  factory(dir, ['lock']);
  factory(dir, ['claim']);
  assert.match(factory(dir, ['finish-chunk', 'BA-0002']), /^finished 1: BA-0002/);
  assert.equal(readMatrix(dir).filter((l) => l.split(',')[3] === 'QA').length, 1);
});

test('factory: abandon returns the unfinished row to PLANNED (crash recovery)', () => {
  const dir = repoSandbox();
  factory(dir, ['lock']);
  factory(dir, ['claim']);
  const out = factory(dir, ['abandon-chunk']);
  assert.match(out, /returned 1 row/);
  const rows = readMatrix(dir);
  assert.equal(rows.filter((l) => l.split(',')[3] === 'PLANNED').length, 1998);
  assert.equal(rows.filter((l) => l.split(',')[3] === 'WRITING').length, 0);
  const dist = {};
  for (const l of rows.slice(1)) dist[l.split(',')[2]] = (dist[l.split(',')[2]] ?? 0) + 1;
  assert.deepEqual(dist, { APP: 350, RENT: 400, EV: 300, GUIDE: 300, SAFE: 250, LOCAL: 400 },
    'abandon never breaks the category distribution');
});

test('factory: checkpoint command reports in-flight and finished rows', () => {
  const dir = repoSandbox();
  assert.match(factory(dir, ['checkpoint']), /checkpoint: none/);
  factory(dir, ['lock']);
  factory(dir, ['claim']);
  const out = factory(dir, ['checkpoint']);
  assert.match(out, /in flight\): 1/);
  assert.match(out, /awaiting publish\): 0/);
});

test('factory: validate still passes on an untouched sandbox (2000 rows, pilots published)', () => {
  const dir = repoSandbox();
  assert.match(factory(dir, ['validate']), /matrix OK/);
  const statuses = {};
  for (const l of readMatrix(dir).slice(1)) {
    const s = l.split(',')[3];
    statuses[s] = (statuses[s] ?? 0) + 1;
  }
  assert.equal(statuses.PUBLISHED, 2);
  assert.equal(statuses.PLANNED, 1998);
});

test('factory: status reports lock and state in the sandbox', () => {
  const dir = repoSandbox();
  const out = factory(dir, ['status']);
  assert.match(out, /total: 2000/);
  assert.match(out, /PUBLISHED: 2/);
  assert.match(out, /lock: free/);
});

test('factory: the real repo matrix is never mutated by these tests', () => {
  const lines = readFileSync(join(REPO, 'data/blog/content-matrix.csv'), 'utf8').trim().split('\n');
  assert.equal(lines.length - 1, 2000);
  const statuses = lines.slice(1).map((l) => l.split(',')[3]);
  const manifest = JSON.parse(readFileSync(join(REPO, 'data/blog/published.json'), 'utf8'));
  // v64: PUBLISHED rows must all be in the manifest; the manifest may hold
  // in-flight drafts (QA/PASS) committed by a writer cycle — but never a
  // stray WRITING row (claim is local-only).
  const manifestIds = new Set(manifest.articles.map((a) => a.article_id));
  const publishedIds = lines.slice(1).filter((l) => l.split(',')[3] === 'PUBLISHED').map((l) => l.split(',')[0]);
  for (const id of publishedIds) assert.ok(manifestIds.has(id), `PUBLISHED ${id} missing from manifest`);
  assert.equal(statuses.filter((s) => s === 'WRITING').length, 0);
  assert.ok(!existsSync(join(REPO, 'docs/state/blog-factory.lock')), 'no lock left in the real repo');
  assert.ok(!existsSync(join(REPO, 'docs/state/blog-factory.transaction.json')), 'no txn left in the real repo');
});
