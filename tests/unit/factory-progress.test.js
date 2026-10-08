import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoSandbox, readJson, REPO } from '../helpers/factory-sandbox.mjs';
import { buildProgress } from '../../tools/factory-progress.mjs';

/** factory-progress (ported from /vanchinh) — read-only snapshot contract. */

test('progress snapshot counts matrix truth and never mutates anything', () => {
  const dir = repoSandbox();
  const before = readFileSync(join(dir, 'data/blog/content-matrix.csv'), 'utf8');
  const out = execFileSync(
    'node', ['tools/factory-progress.mjs', '--stdout'], { cwd: dir, encoding: 'utf8' },
  );
  const p = JSON.parse(out);
  // Counts match the sandbox matrix.
  const lines = before.trim().split('\n').length - 1;
  assert.equal(p.matrix.rows, lines);
  assert.equal(p.matrix.published, p.matrix.by_status.PUBLISHED);
  assert.equal(p.matrix.rows,
    Object.values(p.matrix.by_status).reduce((a, b) => a + b, 0));
  // Deterministic: a second run produces identical output.
  const out2 = execFileSync(
    'node', ['tools/factory-progress.mjs', '--stdout'], { cwd: dir, encoding: 'utf8' },
  );
  assert.equal(JSON.parse(out2).matrix.published, p.matrix.published);
  // Read-only: the matrix file is byte-identical after both runs.
  assert.equal(readFileSync(join(dir, 'data/blog/content-matrix.csv'), 'utf8'), before);
});

test('progress report exposes the FIFO next chunk of the active writer batch', () => {
  const dir = repoSandbox();
  const manifest = readJson(dir, 'docs/state/writer-assignments.json');
  if (!manifest.active) return; // no active batch in this fixture: nothing to assert
  const out = execFileSync(
    'node', ['tools/factory-progress.mjs', '--stdout'], { cwd: dir, encoding: 'utf8' },
  );
  const p = JSON.parse(out);
  assert.ok(p.writer_batch);
  assert.equal(p.writer_batch.batch_id, manifest.active.batch_id);
  const terminal = new Set(['PUBLISHED', 'FAILED', 'FACTORY_FAILED']);
  const head = manifest.active.chunks
    .filter((c) => !terminal.has(c.status))
    .sort((a, b) => a.seq - b.seq)[0] ?? null;
  if (head) {
    assert.equal(p.writer_batch.next_chunk.seq, head.seq);
    assert.equal(p.writer_batch.next_chunk.writer, head.writer);
    assert.deepEqual(p.writer_batch.next_chunk.ids, head.ids);
  } else {
    assert.equal(p.writer_batch.next_chunk, null);
  }
});

test('default mode writes reports/factory-progress.json and --check verifies freshness', () => {
  const productionReportBefore = readFileSync(join(REPO, 'reports/factory-progress.json'), 'utf8');
  // Dedicated throwaway fixture: a sandbox copy would drag the PRODUCTION
  // report along, so the "report does not exist yet" case needs a clean tree.
  const dir = mkdtempSync(join(tmpdir(), 'motoai-progress-fx-'));
  cpSync(REPO, dir, { recursive: true, filter: (src) => !src.includes('/.git') });
  rmSync(join(dir, 'reports/factory-progress.json'), { force: true }); // fixture: never built before
  // 1. CREATE-NEW: the report does not exist; the tool writes it.
  assert.ok(!existsSync(join(dir, 'reports/factory-progress.json')));
  execFileSync('node', ['tools/factory-progress.mjs'], { cwd: dir });
  assert.ok(existsSync(join(dir, 'reports/factory-progress.json')));
  execFileSync('node', ['tools/factory-progress.mjs', '--check'], { cwd: dir }); // fresh: exit 0
  const created = JSON.parse(readFileSync(join(dir, 'reports/factory-progress.json'), 'utf8'));
  // 2. STALE DETECTION: a publish mutation makes the stored report stale.
  const lines = readFileSync(join(dir, 'data/blog/content-matrix.csv'), 'utf8');
  const flipped = lines.split('\n').map((l, i) =>
    (i > 0 && l.split(',')[3] === 'PLANNED')
      ? l.split(',').map((c, j) => (j === 3 ? 'PUBLISHED' : c)).join(',')
      : l,
  ).join('\n');
  writeFileSync(join(dir, 'data/blog/content-matrix.csv'), flipped);
  assert.throws(() =>
    execFileSync('node', ['tools/factory-progress.mjs', '--check'], { cwd: dir }),
    /stale/, '--check must fail closed on a stale report');
  // 3. UPDATE-EXISTING: re-running the tool refreshes the stored report.
  execFileSync('node', ['tools/factory-progress.mjs'], { cwd: dir });
  const updated = JSON.parse(readFileSync(join(dir, 'reports/factory-progress.json'), 'utf8'));
  assert.ok(updated.matrix.published > created.matrix.published, 'report updated with new truth');
  execFileSync('node', ['tools/factory-progress.mjs', '--check'], { cwd: dir }); // fresh again
  // Fixture isolation: the PRODUCTION report was never touched.
  assert.equal(readFileSync(join(REPO, 'reports/factory-progress.json'), 'utf8'), productionReportBefore);
});

test('buildProgress import works against the real repository (read-only)', () => {
  const p = buildProgress(new Date('2026-10-05T00:00:00.000Z'));
  assert.ok(p.matrix.rows >= 2000);
  assert.ok(p.matrix.published >= 2);
  assert.equal(p.throughput.last_published_date === null, p.matrix.published === 0);
});
