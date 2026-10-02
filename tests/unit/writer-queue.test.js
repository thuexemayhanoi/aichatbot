import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WRITERS, MICRO_CHUNK, MAX_BATCH, chunkRoundRobin, validateBatch, nextBatchId,
  decidePublish, applyChunkTransition, chunkFileName, TERMINAL_CHUNK_STATES,
} from '../../tools/writer-queue.mjs';

/**
 * v68 PARALLEL WRITER MODE contract tests (docs/PARALLEL-WRITER.md).
 *
 * Covers the 17 mandatory spec tests plus two stress suites:
 *   - 100 scheduling rounds (plan) proving DUPLICATE_ASSIGNMENT = 0;
 *   - 100 lifecycle rounds (publisher FIFO) proving DOUBLE_PUBLISH = 0.
 *
 * Every CLI test runs against a THROWAWAY fixture root via
 * MOTOAI_FACTORY_ROOT — the production inventory is never mutated. One test
 * additionally dry-runs the real repo and proves nothing is written there.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOL = join(REPO, 'tools', 'writer-queue.mjs');
const HEADER = 'article_id,batch_id,category,status,primary_keyword,secondary_keywords,search_intent,working_title,slug,output_path,parent_hub,local_scope,requires_sources,source_policy,internal_link_targets,commercial_link_target,agent_retrieval,author,score,quality_status,repair_attempts,published_date,last_checked,notes';

// ---------------------------------------------------------------------------
// Fixture helpers (throwaway roots only)
// ---------------------------------------------------------------------------

function fixtureRoot({ planned = 60, drafts = [], bodySlugs = [], statuses = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'motoai-wq-'));
  mkdirSync(join(root, 'data/blog/articles'), { recursive: true });
  mkdirSync(join(root, 'docs/state'), { recursive: true });
  const lines = [HEADER];
  for (let i = 1; i <= planned; i++) {
    const id = `BA-${String(i).padStart(4, '0')}`;
    const status = statuses[id] ?? 'PLANNED';
    lines.push([id, 'B01', 'RENT', status, `tu khoa ${i}`, `phu ${i}`, 'informational',
      `Tieu de ${i}`, `bai-${i}`, `blog/bai-${i}/index.html`, 'blog/', '', 'no',
      'no-external', 'blog/; /', 'none', 'no', 'MotoAI Editorial', '', '', '0', '', '', ''].join(','));
  }
  writeFileSync(join(root, 'data/blog/content-matrix.csv'), lines.join('\n') + '\n');
  writeFileSync(join(root, 'data/blog/published.json'),
    JSON.stringify({ $schema: 'motoai/blog-published@1', articles: drafts }, null, 2) + '\n');
  for (const slug of bodySlugs) {
    writeFileSync(join(root, `data/blog/articles/${slug}.body.html`), `<p>body ${slug}</p>`);
  }
  return root;
}

function fixtureRows(root) {
  const lines = readFileSync(join(root, 'data/blog/content-matrix.csv'), 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  const rows = {};
  for (const l of lines.slice(1)) {
    const cells = l.split(',');
    const row = {};
    head.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    rows[row.article_id] = row;
  }
  return rows;
}

function runCli(root, args, { expectFail = false } = {}) {
  try {
    return execFileSync('node', [TOOL, ...args], {
      encoding: 'utf8',
      env: { ...process.env, MOTOAI_FACTORY_ROOT: root },
    });
  } catch (e) {
    if (expectFail) return { fail: true, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    throw new Error(`unexpected tool failure: ${args.join(' ')}\n${e.stdout ?? ''}${e.stderr ?? ''}`);
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

/** A fresh writer clone: matrix + manifest + assignment file, no bodies. */
function cloneForWriter(main) {
  const w = mkdtempSync(join(tmpdir(), 'motoai-wq-writer-'));
  mkdirSync(join(w, 'data/blog/articles'), { recursive: true });
  mkdirSync(join(w, 'docs/state'), { recursive: true });
  copyFileSync(join(main, 'data/blog/content-matrix.csv'), join(w, 'data/blog/content-matrix.csv'));
  copyFileSync(join(main, 'data/blog/published.json'), join(w, 'data/blog/published.json'));
  copyFileSync(join(main, 'docs/state/writer-assignments.json'), join(w, 'docs/state/writer-assignments.json'));
  return w;
}

/** Drive one writer chunk to READY_TO_PUSH inside its own tree (real commands). */
function readyChunkInTree(tree, batch, seq) {
  const a = assignmentsOf(tree);
  const chunk = a.active.chunks.find((c) => c.seq === Number(seq));
  const writer = chunk.writer;
  runCli(tree, ['begin', writer, batch, String(seq)]);
  const rows = fixtureRows(tree);
  for (const id of chunk.ids) {
    writeFileSync(join(tree, `data/blog/articles/${rows[id].slug}.body.html`), `<p>body ${id}</p>`);
  }
  const draftsPath = join(tree, `drafts-${seq}.json`);
  writeFileSync(draftsPath, JSON.stringify(chunk.ids.map((id) => ({
    article_id: id,
    category: rows[id].category,
    slug: rows[id].slug,
    title: `Tieu de bai ${id}`,
    description: `Mo ta chi tiet cho bai ${id} ve thue xe may gia re tai Ha Noi.`,
    published_date: '2026-10-02',
    author: 'MotoAI Editorial',
    pilot: false,
    body: `data/blog/articles/${rows[id].slug}.body.html`,
    knowledge_chunks: [],
  }))));
  runCli(tree, ['ready', writer, batch, String(seq), '--drafts', draftsPath]);
  return { writer, chunk };
}

/** Extracted writer-branch view for the publisher (--work): merged
 *  writer-work dirs + the bodies of the readied chunks. */
function branchView(trees) {
  const view = mkdtempSync(join(tmpdir(), 'motoai-wq-view-'));
  for (const tree of trees) {
    const ww = join(tree, 'writer-work');
    if (!existsSync(ww)) continue;
    cpDir(ww, join(view, 'writer-work'));
    for (const f of readdirSync(join(tree, 'data/blog/articles'))) {
      mkdirSync(join(view, 'data/blog/articles'), { recursive: true });
      copyFileSync(join(tree, 'data/blog/articles', f), join(view, 'data/blog/articles', f));
    }
  }
  return view;
}

function cpDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory()) cpDir(join(src, entry.name), join(dest, entry.name));
    else copyFileSync(join(src, entry.name), join(dest, entry.name));
  }
}

function setStatusInMatrix(root, ids, status) {
  const lines = readFileSync(join(root, 'data/blog/content-matrix.csv'), 'utf8').trim().split('\n');
  const out = lines.map((l, i) => {
    if (i === 0) return l;
    const cells = l.split(',');
    return ids.includes(cells[0]) ? cells.map((c, j) => (j === 3 ? status : c)).join(',') : l;
  });
  writeFileSync(join(root, 'data/blog/content-matrix.csv'), out.join('\n') + '\n');
}

// ---------------------------------------------------------------------------
// §1/§2/§16 coordinator: reserve, split, round-robin, uniqueness
// ---------------------------------------------------------------------------

test('coordinator reserves exactly 50 unique ids, round-robin A=9/B=8/C=8 chunks (18/16/16)', () => {
  const root = fixtureRoot({ planned: 60 });
  const out = parseOut(runCli(root, ['plan', '--limit', '50']));
  assert.equal(out.created, 'true');
  assert.equal(out.total, '50');
  assert.equal(out.chunks, '25');
  assert.equal(out.writer_A_ids, '18');
  assert.equal(out.writer_B_ids, '16');
  assert.equal(out.writer_C_ids, '16');

  const b = assignmentsOf(root).active;
  assert.equal(b.batch_id, 'WRITER-BATCH-0001');
  assert.equal(b.status, 'ACTIVE');
  const all = b.chunks.flatMap((c) => c.ids);
  assert.equal(all.length, 50); // not 49, not 51
  assert.equal(new Set(all).size, 50); // UNIQUE(article_id) = TRUE
  for (const w of WRITERS.slice(1).concat(WRITERS.slice(0, 1))) void w;
  // writers never share ids
  const byWriter = WRITERS.map((w) => b.chunks.filter((c) => c.writer === w).flatMap((c) => c.ids));
  for (let i = 0; i < byWriter.length; i++) {
    for (let j = i + 1; j < byWriter.length; j++) {
      assert.deepEqual(byWriter[i].filter((id) => byWriter[j].includes(id)), [],
        `writers ${WRITERS[i]} and ${WRITERS[j]} share ids`);
    }
  }
  // micro chunk = 2 everywhere (50 ids = 25 chunks, no boundary chunk needed)
  assert.ok(b.chunks.every((c) => c.ids.length === MICRO_CHUNK));
  assert.ok(validateBatch(b).ok);
});

test('round-robin is deterministic: chunk 01->A, 02->B, 03->C, 04->A; same input -> same plan', () => {
  const ids = Array.from({ length: 50 }, (_, i) => `BA-${String(i + 1).padStart(4, '0')}`);
  const chunks = chunkRoundRobin(ids);
  assert.deepEqual(chunks.slice(0, 4).map((c) => c.writer), ['writer_A', 'writer_B', 'writer_C', 'writer_A']);
  assert.deepEqual(chunks[0].ids, ['BA-0001', 'BA-0002']);
  assert.deepEqual(chunks[24].ids, ['BA-0049', 'BA-0050']);

  const r1 = fixtureRoot({ planned: 50 });
  const r2 = fixtureRoot({ planned: 50 });
  runCli(r1, ['plan', '--limit', '50', '--base-sha', 'deadbeef']);
  runCli(r2, ['plan', '--limit', '50', '--base-sha', 'deadbeef']);
  const b1 = assignmentsOf(r1).active;
  const b2 = assignmentsOf(r2).active;
  delete b1.created_at; delete b2.created_at; // timestamps are the only allowed difference
  assert.deepEqual(b1, b2);

  // odd boundary: 7 ids -> 4 chunks, last chunk has exactly 1 id (allowed at the boundary)
  const odd = chunkRoundRobin(ids.slice(0, 7));
  assert.deepEqual(odd.map((c) => c.ids.length), [2, 2, 2, 1]);
  assert.ok(validateBatch({
    batch_id: 'WRITER-BATCH-0009', status: 'ACTIVE', total: 7,
    chunks: odd.map((c) => ({ ...c, status: 'RESERVED' })),
  }).ok);
  // size-1 mid-batch is invalid (only the corpus boundary may have 1)
  const midOne = odd.map((c) => ({ ...c, status: 'RESERVED' }));
  midOne[1].ids = ['BA-0004'];
  assert.equal(validateBatch({ batch_id: 'WRITER-BATCH-0009', status: 'ACTIVE', total: 6, chunks: midOne }).ok, false);
});

test('duplicate article id in the manifest -> FAIL CLOSED (validate exits 1)', () => {
  const root = fixtureRoot({ planned: 10 });
  runCli(root, ['plan', '--limit', '6']);
  const a = assignmentsOf(root);
  // corrupt: chunk 2 steals chunk 1's second id -> duplicate across writers
  a.active.chunks[1].ids[1] = a.active.chunks[0].ids[1];
  writeFileSync(join(root, 'docs/state/writer-assignments.json'), JSON.stringify(a, null, 2) + '\n');
  const res = runCli(root, ['validate'], { expectFail: true });
  assert.ok(res.fail, 'duplicate manifest must fail closed');
  assert.match(res.out, /DUPLICATE/);
  // the pure guard agrees
  assert.equal(validateBatch(a.active).ok, false);
  assert.ok(validateBatch(a.active).errors.some((e) => e.includes('DUPLICATE')));
});

test('restart coordinator while a batch is ACTIVE -> never re-reserve (manifest untouched)', () => {
  const root = fixtureRoot({ planned: 20 });
  runCli(root, ['plan', '--limit', '10']);
  const before = readFileSync(join(root, 'docs/state/writer-assignments.json'), 'utf8');
  const out = parseOut(runCli(root, ['plan', '--limit', '10']));
  assert.equal(out.created, 'false');
  assert.match(out.reason, /never re-reserve/);
  assert.equal(readFileSync(join(root, 'docs/state/writer-assignments.json'), 'utf8'), before);
});

test('two coordinators racing -> exactly one reserves (atomic exclusive create)', async () => {
  const root = fixtureRoot({ planned: 30 });
  const proc = () => new Promise((resolve) => {
    const p = spawn('node', [TOOL, 'plan', '--limit', '10'], {
      env: { ...process.env, MOTOAI_FACTORY_ROOT: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', () => resolve(parseOut(out)));
  });
  const [r1, r2] = await Promise.all([proc(), proc()]);
  const created = [r1, r2].filter((r) => r.created === 'true').length;
  assert.equal(created, 1, `exactly one coordinator must win (got ${created})`);
  const a = assignmentsOf(root);
  assert.equal(a.active.total, 10);
  assert.ok(validateBatch(a.active).ok);
});

test('selection never mixes drafts/backlog/repair rows into a NEW batch', () => {
  const root = fixtureRoot({
    planned: 20,
    // BA-0007 has an unprocessed manifest draft (pending — REPAIR pipeline)
    drafts: [{
      article_id: 'BA-0007', category: 'RENT', slug: 'bai-7',
      title: 'Bai 7', description: 'Mo ta bai 7.', published_date: '2026-10-02',
      author: 'MotoAI Editorial', pilot: false, body: 'data/blog/articles/bai-7.body.html',
      knowledge_chunks: [],
    }],
    // BA-0009 has a body on disk but no draft (dead workflow — BACKLOG)
    bodySlugs: ['bai-9'],
    // BA-0011 is mid-review (REPAIR scope)
    statuses: { 'BA-0011': 'REVIEW', 'BA-0012': 'QA', 'BA-0013': 'PUBLISHED' },
  });
  const out = parseOut(runCli(root, ['plan', '--limit', '20']));
  assert.equal(out.created, 'true');
  const ids = assignmentsOf(root).active.chunks.flatMap((c) => c.ids);
  for (const banned of ['BA-0007', 'BA-0009', 'BA-0011', 'BA-0012', 'BA-0013']) {
    assert.ok(!ids.includes(banned), `${banned} must never enter a NEW batch`);
  }
  assert.equal(ids.length, 15); // 20 - 5 excluded
  assert.deepEqual(ids.slice(0, 2), ['BA-0001', 'BA-0002']); // deterministic matrix order
});

// ---------------------------------------------------------------------------
// §4 writers: own queue only
// ---------------------------------------------------------------------------

test('next returns each writer its own disjoint queue in seq order', () => {
  const root = fixtureRoot({ planned: 12 });
  runCli(root, ['plan', '--limit', '12']);
  const queues = {};
  for (const w of WRITERS) {
    const out = parseOut(runCli(root, ['next', w]));
    assert.equal(out.action, 'chunk');
    assert.equal(out.writer, w);
    queues[w] = out.ids.split(',');
  }
  const all = Object.values(queues).flat();
  assert.equal(all.length, 3 * MICRO_CHUNK);
  assert.equal(new Set(all).size, all.length); // writer A/B/C never receive the same id
});

test('writer cannot begin a chunk owned by another writer (or unknown batch/seq)', () => {
  const root = fixtureRoot({ planned: 12 });
  runCli(root, ['plan', '--limit', '12']);
  const b = assignmentsOf(root).active;
  const aChunk = b.chunks.find((c) => c.writer === 'writer_A');
  // writer_B tries to begin writer_A's chunk -> refused
  assert.ok(runCli(root, ['begin', 'writer_B', b.batch_id, String(aChunk.seq)], { expectFail: true }).fail);
  // unknown batch -> refused (assignment is the single source of truth)
  assert.ok(runCli(root, ['begin', 'writer_A', 'WRITER-BATCH-9999', '1'], { expectFail: true }).fail);
  // unknown seq -> refused
  assert.ok(runCli(root, ['begin', 'writer_A', b.batch_id, '99'], { expectFail: true }).fail);
  // the rightful writer succeeds
  const ok = parseOut(runCli(root, ['begin', 'writer_A', b.batch_id, String(aChunk.seq)]));
  assert.equal(ok.status, 'WRITING');
});

test('begin is crash-resume safe: same writer, same ids, no duplicate chunk file', () => {
  const root = fixtureRoot({ planned: 12 });
  runCli(root, ['plan', '--limit', '6']);
  const b = assignmentsOf(root).active;
  const seq = b.chunks.find((c) => c.writer === 'writer_A').seq;
  const first = parseOut(runCli(root, ['begin', 'writer_A', b.batch_id, String(seq)]));
  assert.equal(first.resumed, 'false');
  const again = parseOut(runCli(root, ['begin', 'writer_A', b.batch_id, String(seq)]));
  assert.equal(again.resumed, 'true');
  // exactly one chunk file, ids unchanged
  const file = join(root, 'writer-work', b.batch_id, 'A', chunkFileName(seq));
  const rec = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(rec.status, 'WRITING');
  assert.deepEqual(rec.ids, b.chunks[seq - 1].ids);
});

test('ready enforces the local QA gate: bad drafts refused, good drafts -> READY_TO_PUSH', () => {
  const root = fixtureRoot({ planned: 12 });
  runCli(root, ['plan', '--limit', '6']);
  const b = assignmentsOf(root).active;
  const chunk = b.chunks.find((c) => c.writer === 'writer_A');
  runCli(root, ['begin', 'writer_A', b.batch_id, String(chunk.seq)]);
  const rows = fixtureRows(root);
  for (const id of chunk.ids) {
    writeFileSync(join(root, `data/blog/articles/${rows[id].slug}.body.html`), `<p>body ${id}</p>`);
  }
  const mkDrafts = (ids) => {
    const path = join(root, 'd.json');
    writeFileSync(path, JSON.stringify(ids.map((id) => ({
      article_id: id, category: rows[id]?.category ?? 'RENT', slug: rows[id]?.slug ?? `bai-${id}`,
      title: `Tieu ${id}`, description: `Mo ta ${id}.`, published_date: '2026-10-02',
      author: 'MotoAI Editorial', pilot: false,
      body: `data/blog/articles/${rows[id]?.slug ?? `bai-${id}`}.body.html`, knowledge_chunks: [],
    }))));
    return path;
  };

  // missing one id of the chunk -> refused
  writeFileSync(join(root, 'd.json'), JSON.stringify([{
    article_id: chunk.ids[0], slug: rows[chunk.ids[0]].slug, title: 'T', description: 'D',
    published_date: '2026-10-02', body: `data/blog/articles/${rows[chunk.ids[0]].slug}.body.html`,
  }]));
  assert.ok(runCli(root, ['ready', 'writer_A', b.batch_id, String(chunk.seq), '--drafts', join(root, 'd.json')], { expectFail: true }).fail);

  // a foreign id -> refused
  mkDrafts([chunk.ids[0], 'BA-9999']);
  assert.ok(runCli(root, ['ready', 'writer_A', b.batch_id, String(chunk.seq), '--drafts', join(root, 'd.json')], { expectFail: true }).fail);

  // wrong slug -> refused
  mkDrafts(chunk.ids);
  const bad = JSON.parse(readFileSync(join(root, 'd.json'), 'utf8'));
  bad[0].slug = 'sai-slug';
  writeFileSync(join(root, 'd.json'), JSON.stringify(bad));
  assert.ok(runCli(root, ['ready', 'writer_A', b.batch_id, String(chunk.seq), '--drafts', join(root, 'd.json')], { expectFail: true }).fail);

  // correct drafts -> WRITING -> LOCAL_QA_PASS -> READY_TO_PUSH
  mkDrafts(chunk.ids);
  const out = parseOut(runCli(root, ['ready', 'writer_A', b.batch_id, String(chunk.seq), '--drafts', join(root, 'd.json')]));
  assert.equal(out.status, 'READY_TO_PUSH');
  assert.equal(out.branch, `writer/${b.batch_id}/A`);
  const rec = JSON.parse(readFileSync(join(root, 'writer-work', b.batch_id, 'A', chunkFileName(chunk.seq)), 'utf8'));
  assert.equal(rec.status, 'READY_TO_PUSH');
  assert.deepEqual(rec.history.map((h) => h.to), ['LOCAL_QA_PASS', 'READY_TO_PUSH']);
  assert.equal(rec.drafts.length, MICRO_CHUNK);

  // re-ready is refused (finished chunks are publish-path only)
  assert.ok(runCli(root, ['ready', 'writer_A', b.batch_id, String(chunk.seq), '--drafts', join(root, 'd.json')], { expectFail: true }).fail);
  // begin after ready is refused too (no silent rewrite)
  assert.ok(runCli(root, ['begin', 'writer_A', b.batch_id, String(chunk.seq)], { expectFail: true }).fail);
});

// ---------------------------------------------------------------------------
// §5/§6 serialized publisher
// ---------------------------------------------------------------------------

function publishFixture({ planned = 12, limit = 12, readySeqs = [1, 2, 3] } = {}) {
  const main = fixtureRoot({ planned });
  runCli(main, ['plan', '--limit', String(limit)]);
  const batch = assignmentsOf(main).active.batch_id;
  const trees = {};
  for (const seq of readySeqs) {
    const a = assignmentsOf(main);
    const chunk = a.active.chunks.find((c) => c.seq === seq);
    const tree = trees[chunk.writer] ?? cloneForWriter(main);
    trees[chunk.writer] = tree;
    readyChunkInTree(tree, batch, seq);
  }
  const view = branchView(Object.values(trees));
  return { main, batch, view };
}

test('publisher only ever selects READY_TO_PUSH chunks (WRITING/unstarted blocks FIFO)', () => {
  const { main, batch, view } = publishFixture({ readySeqs: [1] });
  // make chunk 1 WRITING (not ready) -> publisher must wait, never touch chunk 2
  const a = assignmentsOf(main);
  const c1 = a.active.chunks[0];
  const tree = cloneForWriter(main);
  runCli(tree, ['begin', c1.writer, batch, String(c1.seq)]);
  const view2 = branchView([tree]);
  const wait = parseOut(runCli(main, ['select-publish', '--work', view2]));
  assert.equal(wait.action, 'wait');
  assert.match(wait.reason, /strict FIFO/);

  // with chunk 1 READY_TO_PUSH -> publish exactly chunk 1
  const sel = parseOut(runCli(main, ['select-publish', '--work', view]));
  assert.equal(sel.action, 'publish');
  assert.equal(sel.batch, batch);
  assert.equal(sel.seq, '1');
  assert.equal(sel.ids, c1.ids.join(','));
});

test('publisher returns exactly ONE chunk at a time (FIFO 01 -> 02 -> 03)', () => {
  const { main, batch, view } = publishFixture({ readySeqs: [1, 2, 3] });
  const s1 = parseOut(runCli(main, ['select-publish', '--work', view]));
  assert.deepEqual([s1.action, s1.seq], ['publish', '1']);
  // chunk 1 done (PUBLISHED) -> next selection is chunk 2, never a batch
  setStatusInMatrix(main, assignmentsOf(main).active.chunks[0].ids, 'PUBLISHED');
  runCli(main, ['complete', batch, '1']);
  const s2 = parseOut(runCli(main, ['select-publish', '--work', view]));
  assert.deepEqual([s2.action, s2.seq], ['publish', '2']);
  setStatusInMatrix(main, assignmentsOf(main).active.chunks[1].ids, 'PUBLISHED');
  runCli(main, ['complete', batch, '2']);
  const s3 = parseOut(runCli(main, ['select-publish', '--work', view]));
  assert.deepEqual([s3.action, s3.seq], ['publish', '3']);
});

test('strict FIFO: a FAILED chunk is terminal and skipped; ids are never reassigned', () => {
  const { main, batch, view } = publishFixture({ readySeqs: [1, 2] });
  // owner marks chunk 1 FAILED (recovery path)
  const out = parseOut(runCli(main, ['fail', batch, '1', '--state', 'failed', '--reason', 'test']));
  assert.equal(out.chunk_status, 'FAILED');
  // the publisher now proceeds to chunk 2 — but NEVER touches chunk 1's ids
  const sel = parseOut(runCli(main, ['select-publish', '--work', view]));
  assert.deepEqual([sel.action, sel.seq], ['publish', '2']);
  const ids2 = assignmentsOf(main).active.chunks[1].ids;
  assert.equal(sel.ids, ids2.join(','));
  // ids of the failed chunk stay reserved to their writer — no other writer gets them
  const a = assignmentsOf(main);
  for (const c of a.active.chunks.slice(1)) {
    assert.ok(!c.ids.some((id) => a.active.chunks[0].ids.includes(id)));
  }
});

test('stage merges exactly 2 bodies + 2 drafts and refuses any conflict', () => {
  const { main, batch, view } = publishFixture({ readySeqs: [1] });
  const a = assignmentsOf(main);
  const chunk = a.active.chunks[0];
  const out = parseOut(runCli(main, ['stage', batch, '1', '--work', view]));
  const staged = out.staged.split(',');
  assert.equal(staged.filter((p) => p.endsWith('.body.html')).length, MICRO_CHUNK);
  assert.ok(staged.includes('data/blog/published.json'));
  for (const p of staged) assert.ok(existsSync(join(main, p)), `staged file missing: ${p}`);
  const manifest = JSON.parse(readFileSync(join(main, 'data/blog/published.json'), 'utf8'));
  const ids = manifest.articles.map((x) => x.article_id);
  assert.deepEqual(ids, chunk.ids);

  // §6C: staging the same chunk twice -> the manifest entries already exist -> conflict refused
  const main2State = readFileSync(join(main, 'data/blog/published.json'), 'utf8');
  const dup = runCli(main, ['stage', batch, '1', '--work', view], { expectFail: true });
  assert.ok(dup.fail, 'double stage must refuse');
  assert.equal(readFileSync(join(main, 'data/blog/published.json'), 'utf8'), main2State);

  // a row already PUBLISHED -> stage refuses (fresh-main verification)
  const fresh = publishFixture({ readySeqs: [1] });
  setStatusInMatrix(fresh.main, assignmentsOf(fresh.main).active.chunks[0].ids, 'PUBLISHED');
  assert.ok(runCli(fresh.main, ['stage', fresh.batch, '1', '--work', fresh.view], { expectFail: true }).fail);

  // a row already QA (repair scope) -> stage refuses
  const fresh2 = publishFixture({ readySeqs: [1] });
  setStatusInMatrix(fresh2.main, assignmentsOf(fresh2.main).active.chunks[0].ids.slice(0, 1), 'QA');
  assert.ok(runCli(fresh2.main, ['stage', fresh2.batch, '1', '--work', fresh2.view], { expectFail: true }).fail);
});

test('verify-push is the fresh-main gate: refuses superseded batches, unready chunks, published rows', () => {
  const { main, batch, view } = publishFixture({ readySeqs: [1] });
  // happy path after stage
  runCli(main, ['stage', batch, '1', '--work', view]);
  const ok = parseOut(runCli(main, ['verify-push', batch, '1', '--work', view]));
  assert.equal(ok.proceed, 'true');

  // a row already PUBLISHED -> refuse (never re-publish)
  const fresh = publishFixture({ readySeqs: [1] });
  setStatusInMatrix(fresh.main, assignmentsOf(fresh.main).active.chunks[0].ids, 'PUBLISHED');
  assert.ok(runCli(fresh.main, ['verify-push', fresh.batch, '1', '--work', fresh.view], { expectFail: true }).fail);

  // chunk not readied on the branch view -> refuse
  const notReady = fixtureRoot({ planned: 6 });
  runCli(notReady, ['plan', '--limit', '6']);
  const nb = assignmentsOf(notReady).active.batch_id;
  const emptyView = mkdtempSync(join(tmpdir(), 'motoai-wq-view-'));
  assert.ok(runCli(notReady, ['verify-push', nb, '1', '--work', emptyView], { expectFail: true }).fail);

  // superseded (COMPLETED) batch -> refuse
  const done = publishFixture({ planned: 4, limit: 4, readySeqs: [1, 2] });
  runCli(done.main, ['stage', done.batch, '1', '--work', done.view]);
  setStatusInMatrix(done.main, assignmentsOf(done.main).active.chunks[0].ids, 'PUBLISHED');
  runCli(done.main, ['complete', done.batch, '1']);
  runCli(done.main, ['fail', done.batch, '2', '--state', 'failed']);
  assert.equal(assignmentsOf(done.main).active.status, 'COMPLETED');
  assert.ok(runCli(done.main, ['verify-push', done.batch, '2', '--work', done.view], { expectFail: true }).fail);
});

test('complete verifies the factory really published; published chunks never re-run', () => {
  const { main, batch } = publishFixture({ readySeqs: [1] });
  // factory NOT finished -> complete refuses, chunk stays RESERVED (retry-safe)
  const tooEarly = runCli(main, ['complete', batch, '1'], { expectFail: true });
  assert.ok(tooEarly.fail);
  assert.equal(assignmentsOf(main).active.chunks[0].status, 'RESERVED');

  // factory finished (matrix PUBLISHED) -> complete
  setStatusInMatrix(main, assignmentsOf(main).active.chunks[0].ids, 'PUBLISHED');
  const out = parseOut(runCli(main, ['complete', batch, '1']));
  assert.equal(out.already, 'false');
  assert.equal(assignmentsOf(main).active.chunks[0].status, 'PUBLISHED');

  // §6F: completing again is an idempotent no-op — a published chunk never re-runs
  const again = parseOut(runCli(main, ['complete', batch, '1']));
  assert.equal(again.already, 'true');
  assert.equal(assignmentsOf(main).active.chunks[0].status, 'PUBLISHED');
  // begin on a PUBLISHED chunk is refused
  assert.ok(runCli(main, ['begin', assignmentsOf(main).active.chunks[0].writer, batch, '1'], { expectFail: true }).fail);
});

test('batch lifecycle: all chunks terminal -> COMPLETED; the next plan reserves fresh ids', () => {
  const { main, batch } = publishFixture({ planned: 10, limit: 4, readySeqs: [1, 2] });
  setStatusInMatrix(main, assignmentsOf(main).active.chunks[0].ids, 'PUBLISHED');
  runCli(main, ['complete', batch, '1']);
  assert.equal(assignmentsOf(main).active.status, 'ACTIVE'); // chunk 2 still open
  runCli(main, ['fail', batch, '2', '--state', 'factory-failed', '--reason', 'qa fail']);
  const a = assignmentsOf(main);
  assert.equal(a.active.status, 'COMPLETED');

  // the factory-failed rows stay mid-pipeline (REVIEW) — never re-reserved,
  // exactly like REPAIR/BACKLOG rows: no mixing into the next NEW batch.
  setStatusInMatrix(main, a.active.chunks[1].ids, 'REVIEW');
  const out = parseOut(runCli(main, ['plan', '--limit', '2']));
  assert.equal(out.created, 'true');
  assert.equal(out.batch_id, 'WRITER-BATCH-0002');
  const ids2 = assignmentsOf(main).active.chunks.flatMap((c) => c.ids);
  const batch1Ids = a.active.chunks.flatMap((c) => c.ids);
  assert.deepEqual(ids2.filter((id) => batch1Ids.includes(id)), [], 'a new batch never re-reserves old ids');
  assert.deepEqual(ids2, ['BA-0005', 'BA-0006']);
  assert.equal(assignmentsOf(main).history.length, 1);
});

test('push-failed keeps the chunk RESERVED (retry-safe); factory-failed is terminal', () => {
  const { main, batch, view } = publishFixture({ readySeqs: [1] });
  const out = parseOut(runCli(main, ['fail', batch, '1', '--state', 'push-failed', '--reason', 'race']));
  assert.equal(out.chunk_status, 'RESERVED');
  assert.match(out.note, /retry-safe/);
  // the publisher can select the very same chunk again
  const sel = parseOut(runCli(main, ['select-publish', '--work', view]));
  assert.equal(sel.action, 'publish');
  assert.equal(sel.seq, '1');

  const f = parseOut(runCli(main, ['fail', batch, '1', '--state', 'factory-failed']));
  assert.equal(f.chunk_status, 'FACTORY_FAILED');
  // terminal: the publisher no longer selects it
  const after = parseOut(runCli(main, ['select-publish', '--work', view]));
  assert.equal(after.action, 'wait');
});

test('abort keeps the ids reserved to the SAME writer; next still offers them only to that writer', () => {
  const root = fixtureRoot({ planned: 6 });
  runCli(root, ['plan', '--limit', '2']);
  const b = assignmentsOf(root).active;
  const chunk = b.chunks[0];
  runCli(root, ['begin', chunk.writer, b.batch_id, '1']);
  runCli(root, ['abort', chunk.writer, b.batch_id, '1', '--reason', 'stuck']);
  const rec = JSON.parse(readFileSync(join(root, 'writer-work', b.batch_id, 'A', 'chunk-01.json'), 'utf8'));
  assert.equal(rec.status, 'ABORTED');
  // next for THIS writer still returns the chunk (resume); other writers never see it
  const mine = parseOut(runCli(root, ['next', chunk.writer]));
  assert.equal(mine.seq, '1');
  for (const other of WRITERS.filter((w) => w !== chunk.writer)) {
    const o = parseOut(runCli(root, ['next', other]));
    assert.notEqual(o.seq, '1');
  }
  // the same writer can re-begin the aborted chunk (ids unchanged, no duplicate)
  const re = parseOut(runCli(root, ['begin', chunk.writer, b.batch_id, '1']));
  assert.equal(re.resumed, 'true');
  assert.equal(re.status, 'WRITING');
});

// ---------------------------------------------------------------------------
// §11 stress: 100 scheduling rounds + 100 publisher lifecycle rounds
// ---------------------------------------------------------------------------

test('STRESS scheduling x100: DUPLICATE_ASSIGNMENT = 0 across every round', () => {
  let duplicateAssignments = 0;
  let badSplits = 0;
  // deterministic pseudo-random sizes (no Math.random flakiness)
  for (let round = 0; round < 100; round++) {
    const size = 1 + ((round * 7) % MAX_BATCH);
    const ids = Array.from({ length: size }, (_, i) => `BA-${String(i + 1).padStart(4, '0')}`);
    const chunks = chunkRoundRobin(ids).map((c) => ({ ...c, status: 'RESERVED' }));
    const batch = { batch_id: nextBatchId({ active: null, history: [] }), status: 'ACTIVE', total: size, chunks };
    const v = validateBatch(batch);
    if (!v.ok || v.uniqueIds !== size) duplicateAssignments++;
    const perWriter = WRITERS.map((w) => chunks.filter((c) => c.writer === w).flatMap((c) => c.ids));
    const seen = new Set();
    for (const list of perWriter) for (const id of list) {
      if (seen.has(id)) duplicateAssignments++;
      seen.add(id);
    }
    if (perWriter.some((l, i) => l.some((id) => perWriter[(i + 1) % 3].includes(id)))) badSplits++;
    // split invariant: A >= B >= C within one chunk of each other
    const counts = perWriter.map((l) => l.length);
    if (counts[0] - counts[2] > MICRO_CHUNK) badSplits++;
  }
  assert.equal(duplicateAssignments, 0, 'DUPLICATE_ASSIGNMENT must be 0 over 100 schedulings');
  assert.equal(badSplits, 0);
});

test('STRESS publisher lifecycle x100: DOUBLE_PUBLISH = 0, FIFO never publishes ahead', () => {
  let doublePublish = 0;
  let fifoViolations = 0;
  for (let round = 0; round < 100; round++) {
    const size = 2 + ((round * 3) % 12);
    const ids = Array.from({ length: size }, (_, i) => `BA-${String(i + 1).padStart(4, '0')}`);
    const chunks = chunkRoundRobin(ids).map((c) => ({ seq: c.seq, writer: c.writer, ids: c.ids, status: 'RESERVED', events: [] }));
    const bySeq = new Map(chunks.map((c) => [c.seq, c]));
    // writer files become READY in an adversarial (deterministic, rotating) order
    const fileStatus = new Map(chunks.map((c) => [c.seq, 'WRITING']));
    const readyOrder = chunks.map((c) => c.seq)
      .sort((x, y) => ((x * 13 + round) % 7) - ((y * 13 + round) % 7));
    const published = new Set();
    const assignments = { active: { batch_id: 'WRITER-BATCH-0001', status: 'ACTIVE', chunks } };
    const statusFor = (c) => fileStatus.get(c.seq) ?? null;
    const drain = () => {
      for (;;) { // the publisher publishes at most ONE chunk per decision, then re-decides
        const d = decidePublish(assignments, statusFor);
        if (d.action !== 'publish') return;
        if (published.has(d.seq)) { doublePublish++; return; }
        for (const c of chunks) { // strict FIFO: every lower seq must already be terminal
          if (c.seq >= d.seq) break;
          if (!TERMINAL_CHUNK_STATES.has(c.status)) fifoViolations++;
        }
        bySeq.get(d.seq).status = 'PUBLISHED';
        published.add(d.seq);
      }
    };
    for (const seq of readyOrder) {
      fileStatus.set(seq, 'READY_TO_PUSH');
      drain();
    }
    drain(); // a final decision pass once every chunk is READY
    for (const c of chunks) {
      if (!published.has(c.seq)) doublePublish++; // every readied chunk must be published exactly once
    }
  }
  assert.equal(doublePublish, 0, 'DOUBLE_PUBLISH must be 0 over 100 lifecycles');
  assert.equal(fifoViolations, 0, 'publisher must never publish ahead of a lower sequence');
});

// ---------------------------------------------------------------------------
// §12/§17 dry-run never touches production
// ---------------------------------------------------------------------------

test('dry-run against the REAL repo: nothing written, production inventory unchanged', () => {
  const hash = (p) => existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : null;
  const before = {
    matrix: hash(join(REPO, 'data/blog/content-matrix.csv')),
    manifest: hash(join(REPO, 'data/blog/published.json')),
    assignments: hash(join(REPO, 'docs/state/writer-assignments.json')),
  };
  const out = parseOut(runCli(REPO, ['plan', '--dry-run', '--limit', '50']));
  assert.equal(out.created, 'false');
  assert.equal(out.dry_run, 'true');
  assert.equal(hash(join(REPO, 'data/blog/content-matrix.csv')), before.matrix);
  assert.equal(hash(join(REPO, 'data/blog/published.json')), before.manifest);
  assert.equal(hash(join(REPO, 'docs/state/writer-assignments.json')), before.assignments);
  assert.ok(!existsSync(join(REPO, 'writer-work')), 'dry-run must not create writer-work');
  // the dry-run still plans a real batch shape: unique ids, micro chunk 2
  assert.ok(Number(out.total) > 0 && Number(out.total) <= MAX_BATCH);
  assert.ok(out.batch_id.startsWith('WRITER-BATCH-'));
});

// ---------------------------------------------------------------------------
// pure helpers: batch id sequence, guarded transitions
// ---------------------------------------------------------------------------

test('nextBatchId is monotonic across active + history batches', () => {
  assert.equal(nextBatchId({ active: null, history: [] }), 'WRITER-BATCH-0001');
  assert.equal(nextBatchId({ active: { batch_id: 'WRITER-BATCH-0003' }, history: [{ batch_id: 'WRITER-BATCH-0002' }] }), 'WRITER-BATCH-0004');
  assert.equal(nextBatchId({ active: null, history: [{ batch_id: 'WRITER-BATCH-0007' }] }), 'WRITER-BATCH-0008');
});

test('applyChunkTransition only allows legal state machine moves', () => {
  const rec = { status: 'WRITING', history: [] };
  assert.equal(applyChunkTransition(rec, ['WRITING'], 'LOCAL_QA_PASS').ok, true);
  assert.equal(applyChunkTransition(rec, ['RESERVED'], 'LOCAL_QA_PASS').ok, false); // illegal
  const stepped = applyChunkTransition(rec, ['WRITING'], 'LOCAL_QA_PASS').next;
  assert.equal(applyChunkTransition(stepped, ['LOCAL_QA_PASS'], 'READY_TO_PUSH').ok, true);
  assert.equal(applyChunkTransition(stepped, ['WRITING'], 'READY_TO_PUSH').ok, false);
  assert.equal(rec.status, 'WRITING', 'pure transition must not mutate the input');
});
