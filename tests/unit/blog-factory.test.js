import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * v58 content factory production-loop contract — tested in a SANDBOX copy so
 * the real matrix is never touched:
 *   lock -> claim (<=10) -> finish-chunk -> checkpoint -> abandon-chunk
 *   no duplicate claim, no PLANNED regression, resumable chunks.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOL = join(ROOT, 'tools', 'blog-factory.mjs');

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'motoai-factory-'));
  cpSync(join(ROOT, 'data'), join(dir, 'data'), { recursive: true });
  cpSync(join(ROOT, 'docs', 'state'), join(dir, 'docs', 'state'), { recursive: true });
  cpSync(join(ROOT, 'reports'), join(dir, 'reports'), { recursive: true });
  return dir;
}

function run(dir, args, expectFail = false) {
  try {
    return execFileSync('node', [TOOL, ...args],
      { encoding: 'utf8', env: { ...process.env, MOTOAI_FACTORY_ROOT: dir } });
  } catch (e) {
    if (expectFail) return { fail: true, msg: String(e) };
    throw e;
  }
}

const readMatrix = (dir) =>
  readFileSync(join(dir, 'data/blog/content-matrix.csv'), 'utf8').trim().split('\n');

test('factory: lock is exclusive and unlock frees it', () => {
  const dir = sandbox();
  assert.match(run(dir, ['lock']), /lock created/);
  const fail = run(dir, ['lock'], true);
  assert.ok(fail.fail, 'second lock must fail');
  assert.match(run(dir, ['unlock']), /released/);
});

test('factory: claim refuses without the run lock, then takes at most 10 rows', () => {
  const dir = sandbox();
  const fail = run(dir, ['claim'], true);
  assert.ok(fail.fail, 'claim without lock must fail');
  run(dir, ['lock']);
  const out = run(dir, ['claim', '10']);
  assert.match(out, /^claimed 10:/);
  const claimed = readMatrix(dir).filter((l) => l.split(',')[3] === 'WRITING');
  assert.equal(claimed.length, 10);
  assert.equal(readMatrix(dir).length, 2001, 'matrix size never changes (header + 2000)');
});

test('factory: claim never exceeds MAX_CHUNK and never duplicates', () => {
  const dir = sandbox();
  run(dir, ['lock']);
  run(dir, ['claim', '10']);
  const out = run(dir, ['claim', '50']);
  assert.match(out, /^claimed 10:/, '50 is clamped to MAX_CHUNK');
  const writing = readMatrix(dir).filter((l) => l.split(',')[3] === 'WRITING');
  assert.equal(writing.length, 20, 'two chunks of 10 in flight');
  const ids = writing.map((l) => l.split(',')[0]);
  assert.equal(new Set(ids).size, 20, 'no duplicate article_id between chunks');
});

test('factory: finish-chunk moves WRITING -> QA and records the checkpoint', () => {
  const dir = sandbox();
  run(dir, ['lock']);
  const claimed = run(dir, ['claim', '10']).trim().match(/^claimed 10: (.+)$/)[1].split(', ');
  const out = run(dir, ['finish-chunk', claimed.join(',')]);
  assert.match(out, /^finished 10:/);
  const rows = readMatrix(dir);
  assert.equal(rows.filter((l) => l.split(',')[3] === 'QA').length, 10);
  assert.equal(rows.filter((l) => l.split(',')[3] === 'WRITING').length, 0);
  const cp = JSON.parse(readFileSync(join(dir, 'docs/state/blog-factory.checkpoint.json'), 'utf8'));
  assert.equal(cp.finished.length, 10);
  assert.equal(cp.claimed.length, 0);
});

test('factory: abandon-chunk returns unfinished rows to PLANNED (crash recovery)', () => {
  const dir = sandbox();
  run(dir, ['lock']);
  const claimed = run(dir, ['claim', '10']).trim().match(/^claimed 10: (.+)$/)[1].split(', ');
  run(dir, ['finish-chunk', claimed.slice(0, 3).join(',')]);
  const out = run(dir, ['abandon-chunk']);
  assert.match(out, /returned 7 rows to PLANNED/);
  const rows = readMatrix(dir);
  assert.equal(rows.filter((l) => l.split(',')[3] === 'PLANNED').length, 1995); // 1998 - 10 claimed + 7 returned
  assert.equal(rows.filter((l) => l.split(',')[3] === 'QA').length, 3);
  const dist = {};
  for (const l of rows.slice(1)) {
    const cat = l.split(',')[2];
    dist[cat] = (dist[cat] ?? 0) + 1;
  }
  assert.deepEqual(dist, { APP: 350, RENT: 400, EV: 300, GUIDE: 300, SAFE: 250, LOCAL: 400 },
    'abandon never breaks the category distribution');
});

test('factory: checkpoint command reports in-flight and finished rows', () => {
  const dir = sandbox();
  assert.match(run(dir, ['checkpoint']), /checkpoint: none/);
  run(dir, ['lock']);
  run(dir, ['claim', '5']);
  const out = run(dir, ['checkpoint']);
  assert.match(out, /in flight\): 5/);
  assert.match(out, /awaiting publish\): 0/);
});

test('factory: validate still passes on an untouched sandbox (2000 rows, 2 PUBLISHED)', () => {
  const dir = sandbox();
  assert.match(run(dir, ['validate']), /matrix OK/);
  const statuses = {};
  for (const l of readMatrix(dir).slice(1)) {
    const s = l.split(',')[3];
    statuses[s] = (statuses[s] ?? 0) + 1;
  }
  assert.equal(statuses.PUBLISHED, 2);
  assert.equal(statuses.PLANNED, 1998);
});

test('factory: status reports lock and state in the sandbox', () => {
  const dir = sandbox();
  const out = run(dir, ['status']);
  assert.match(out, /total: 2000/);
  assert.match(out, /PUBLISHED: 2/);
  assert.match(out, /lock: free/);
});

test('factory: the real repo matrix is never mutated by these tests', () => {
  const lines = readFileSync(join(ROOT, 'data/blog/content-matrix.csv'), 'utf8').trim().split('\n');
  assert.equal(lines.length - 1, 2000);
  const statuses = lines.slice(1).map((l) => l.split(',')[3]);
  assert.equal(statuses.filter((s) => s === 'PUBLISHED').length, 2);
  assert.equal(statuses.filter((s) => s === 'WRITING').length, 0);
});
