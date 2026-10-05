import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * v71 RECONCILE contract — repair-ledger synchronization.
 *
 * Chunks 7/8 of WRITER-BATCH-0001 were marked FACTORY_FAILED when their
 * original factory runs died, but their articles were later published by
 * the REPAIR/BACKLOG pipeline (matrix PUBLISHED + manifest entry + live
 * body). The ledger must catch up with reality WITHOUT rewriting history:
 *
 *   - a FACTORY_FAILED/FAILED chunk whose EVERY id carries full publish
 *     evidence flips to PUBLISHED with an appended RECONCILED_PUBLISHED
 *     event; the original FACTORY_FAILED event stays in history;
 *   - anything ambiguous (non-PUBLISHED row, duplicate/missing manifest
 *     entries, missing body) leaves the chunk untouched (fail-closed)
 *     and reports inconsistent ids;
 *   - PUBLISHED and RESERVED chunks are never touched; the command is
 *     idempotent; batch flips to COMPLETED only when all chunks terminal.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOL = join(REPO, 'tools', 'writer-queue.mjs');
const HEADER = 'article_id,batch_id,category,status,primary_keyword,secondary_keywords,search_intent,working_title,slug,output_path,parent_hub,local_scope,requires_sources,source_policy,internal_link_targets,commercial_link_target,agent_retrieval,author,score,quality_status,repair_attempts,published_date,last_checked,notes';

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'motoai-wq-rc-'));
  mkdirSync(join(root, 'data/blog/articles'), { recursive: true });
  mkdirSync(join(root, 'docs/state'), { recursive: true });
  const lines = [HEADER];
  for (let i = 1; i <= 60; i++) {
    const id = 'BA-' + String(i).padStart(4, '0');
    lines.push([id, 'B01', 'RENT', 'PLANNED', 'tu khoa ' + i, 'phu ' + i, 'informational',
      'Tieu de ' + i, 'bai-' + i, 'blog/bai-' + i + '/index.html', 'blog/', '', 'no',
      'no-external', 'blog/; /', 'none', 'no', 'MotoAI Editorial', '', '', '0', '', '', ''].join(','));
  }
  writeFileSync(join(root, 'data/blog/content-matrix.csv'), lines.join('\n') + '\n');
  writeFileSync(join(root, 'data/blog/published.json'),
    JSON.stringify({ $schema: 'motoai/blog-published@1', articles: [] }, null, 2) + '\n');
  return root;
}

function runCli(root, args, { expectFail = false } = {}) {
  try {
    return execFileSync('node', [TOOL, ...args], {
      encoding: 'utf8',
      env: { ...process.env, MOTOAI_FACTORY_ROOT: root },
    });
  } catch (e) {
    if (expectFail) return { fail: true, code: e.status, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
    throw new Error('unexpected tool failure: ' + args.join(' ') + '\n' + String(e.stdout ?? '') + String(e.stderr ?? ''));
  }
}

const parseOut = (s) => Object.fromEntries(
  String(s).trim().split('\n').filter((l) => l.includes('=') && /^[A-Za-z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const assignmentsOf = (root) => JSON.parse(readFileSync(join(root, 'docs/state/writer-assignments.json'), 'utf8'));
const manifestOf = (root) => JSON.parse(readFileSync(join(root, 'data/blog/published.json'), 'utf8'));

function setRowStatus(root, id, status) {
  const lines = readFileSync(join(root, 'data/blog/content-matrix.csv'), 'utf8').trim().split('\n');
  const out = lines.map((l, i) => {
    if (i === 0) return l;
    const c = l.split(',');
    if (c[0] === id) c[3] = status;
    return c.join(',');
  });
  writeFileSync(join(root, 'data/blog/content-matrix.csv'), out.join('\n') + '\n');
}

function addManifestEntry(root, id, slug) {
  const m = manifestOf(root);
  m.articles.push({
    article_id: id, category: 'RENT', slug,
    title: 'Tieu de ' + id, description: 'Mo ta chi tiet cho bai ' + id + ' ve thue xe may.',
    published_date: '2026-10-04', author: 'MotoAI Editorial',
    body: 'data/blog/articles/' + slug + '.body.html', knowledge_chunks: [],
  });
  writeFileSync(join(root, 'data/blog/published.json'), JSON.stringify(m, null, 2) + '\n');
}

/** Build a batch manifest with terminal/failed chunks mirroring production. */
function seedBatch(root, { chunkStatus = 'FACTORY_FAILED', ids = ['BA-0001', 'BA-0002'] } = {}) {
  const manifest = {
    $schema: 'motoai/writer-assignments@1',
    active: {
      batch_id: 'B01', status: 'ACTIVE',
      chunks: [
        { seq: 1, writer: 'writer_A', ids: ['BA-0003', 'BA-0004'], status: 'PUBLISHED', events: [{ state: 'PUBLISHED', at: '2026-10-01T00:00:00.000Z' }] },
        { seq: 7, writer: 'writer_A', ids, status: chunkStatus, events: [{ state: chunkStatus, at: '2026-10-03T07:15:02.809Z', reason: 'factory run 37105692009 failed' }] },
        { seq: 8, writer: 'writer_B', ids: ['BA-0005', 'BA-0006'], status: chunkStatus, events: [{ state: chunkStatus, at: '2026-10-04T06:51:55.065Z', reason: 'factory run 37184027887 failed' }] },
      ],
    },
    history: [],
  };
  writeFileSync(join(root, 'docs/state/writer-assignments.json'), JSON.stringify(manifest, null, 2) + '\n');
}

/** Simulate the repair pipeline having published the ids OUTSIDE the
 *  original factory run: matrix PUBLISHED + manifest entry + body on disk. */
function simulateRepairPublish(root, ids) {
  const lines = readFileSync(join(root, 'data/blog/content-matrix.csv'), 'utf8').trim().split('\n');
  const byId = new Map(lines.slice(1).map((l) => [l.split(',')[0], l.split(',')]));
  for (const id of ids) {
    const slug = byId.get(id)[8];
    setRowStatus(root, id, 'PUBLISHED');
    addManifestEntry(root, id, slug);
    writeFileSync(join(root, 'data/blog/articles/' + slug + '.body.html'), '<p>body ' + id + '</p>');
  }
}

test('reconcile flips a factory-failed chunk to PUBLISHED when every id carries publish evidence, preserving history', () => {
  const root = fixtureRoot();
  seedBatch(root);
  simulateRepairPublish(root, ['BA-0001', 'BA-0002']); // chunk 7 repaired
  // Chunk 8 ids stay PLANNED: it must NOT be reconciled.
  const out = parseOut(runCli(root, ['reconcile']));
  assert.equal(out.reconciled, '7');
  assert.ok(out.inconsistent.includes('8'), 'chunk 8 reported inconsistent (not published)');
  const a = assignmentsOf(root);
  const c7 = a.active.chunks.find((c) => c.seq === 7);
  const c8 = a.active.chunks.find((c) => c.seq === 8);
  assert.equal(c7.status, 'PUBLISHED');
  assert.equal(c8.status, 'FACTORY_FAILED', 'no evidence — untouched');
  // History preserved: the original failure event is still there.
  const states = c7.events.map((e) => e.state);
  assert.ok(states.includes('FACTORY_FAILED'), 'original failure event preserved');
  assert.ok(states.includes('RECONCILED_PUBLISHED'), 'reconciliation event appended');
  assert.equal(states.indexOf('FACTORY_FAILED') < states.indexOf('RECONCILED_PUBLISHED'), true);
  // Batch flips to COMPLETED: FACTORY_FAILED is terminal, so after chunk 7 is
  // reconciled every chunk of the fixture is terminal.
  assert.equal(a.active.status, 'COMPLETED');
});

test('reconcile completes the batch once every failed chunk has evidence (chunk 8 repaired too)', () => {
  const root = fixtureRoot();
  seedBatch(root);
  simulateRepairPublish(root, ['BA-0001', 'BA-0002', 'BA-0005', 'BA-0006']);
  const out = parseOut(runCli(root, ['reconcile']));
  assert.equal(out.reconciled, '7,8');
  assert.equal(out.inconsistent, 'none');
  assert.equal(out.batch_status, 'COMPLETED');
  const a = assignmentsOf(root);
  assert.ok(a.active.chunks.every((c) => c.status === 'PUBLISHED'));
});

test('reconcile is idempotent: a second run reports nothing to do and never duplicates events', () => {
  const root = fixtureRoot();
  seedBatch(root);
  simulateRepairPublish(root, ['BA-0001', 'BA-0002']);
  runCli(root, ['reconcile']);
  const out2 = parseOut(runCli(root, ['reconcile']));
  assert.equal(out2.reconciled, 'none');
  const a = assignmentsOf(root);
  const c7 = a.active.chunks.find((c) => c.seq === 7);
  assert.equal(c7.status, 'PUBLISHED');
  assert.equal(c7.events.filter((e) => e.state === 'RECONCILED_PUBLISHED').length, 1,
    'no duplicate reconciliation events');
});

test('reconcile fails closed on ambiguous evidence: duplicate manifest entries leave the chunk untouched', () => {
  const root = fixtureRoot();
  seedBatch(root);
  simulateRepairPublish(root, ['BA-0001', 'BA-0002']);
  // Duplicate the manifest entry for BA-0001 — torn state.
  addManifestEntry(root, 'BA-0001', 'bai-1');
  const out = parseOut(runCli(root, ['reconcile']));
  assert.equal(out.reconciled, 'none');
  assert.ok(out.inconsistent.includes('BA-0001'), 'duplicate entry reported');
  const a = assignmentsOf(root);
  assert.equal(a.active.chunks.find((c) => c.seq === 7).status, 'FACTORY_FAILED',
    'ambiguous chunk stays FACTORY_FAILED');
});

test('reconcile fails closed when a body file is missing even though the matrix says PUBLISHED', () => {
  const root = fixtureRoot();
  seedBatch(root);
  simulateRepairPublish(root, ['BA-0001', 'BA-0002']);
  rmSync(join(root, 'data/blog/articles/bai-2.body.html'));
  const out = parseOut(runCli(root, ['reconcile']));
  assert.equal(out.reconciled, 'none');
  assert.ok(out.inconsistent.includes('BA-0002'), 'missing body reported');
  const a = assignmentsOf(root);
  assert.equal(a.active.chunks.find((c) => c.seq === 7).status, 'FACTORY_FAILED');
});

test('reconcile --seq targets exactly one chunk and never touches others', () => {
  const root = fixtureRoot();
  seedBatch(root);
  simulateRepairPublish(root, ['BA-0001', 'BA-0002', 'BA-0005', 'BA-0006']);
  const out = parseOut(runCli(root, ['reconcile', '--seq', '7']));
  assert.equal(out.reconciled, '7');
  const a = assignmentsOf(root);
  assert.equal(a.active.chunks.find((c) => c.seq === 8).status, 'FACTORY_FAILED',
    'out-of-scope chunk untouched even with evidence');
});

test('reconcile never touches RESERVED chunks (publisher flow owns them)', () => {
  const root = fixtureRoot();
  seedBatch(root);
  // Chunk 8 becomes RESERVED (still in the publisher flow) with its ids published.
  const a = assignmentsOf(root);
  a.active.chunks.find((c) => c.seq === 8).status = 'RESERVED';
  writeFileSync(join(root, 'docs/state/writer-assignments.json'), JSON.stringify(a, null, 2) + '\n');
  simulateRepairPublish(root, ['BA-0001', 'BA-0002']);
  const out = parseOut(runCli(root, ['reconcile']));
  assert.equal(out.reconciled, '7');
  const a2 = assignmentsOf(root);
  assert.equal(a2.active.chunks.find((c) => c.seq === 8).status, 'RESERVED',
    'RESERVED chunk untouched by reconcile');
});
