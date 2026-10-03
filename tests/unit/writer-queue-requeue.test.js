import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * v68 §6G contract tests (docs/PARALLEL-WRITER.md §6G).
 *
 * The publisher run 37044896012 pushed chunk #1 of WRITER-BATCH-0001 to main
 * and then died with HTTP 403 "Resource not accessible by integration" at
 * the factory dispatch — leaving a crash window: matrix rows still PLANNED,
 * both bodies and both manifest drafts already on main, chunk still RESERVED.
 * These tests prove the recovery contract cannot regress:
 *
 *   - select-publish classifies that state instead of re-staging blindly;
 *   - requeue recovers it idempotently from the writer branch;
 *   - anything ambiguous (duplicate entry, torn push, diverged main, mixed
 *     states, non-READY chunk, terminal chunk) fails closed;
 *   - the publisher workflow carries actions: write (the permission whose
 *     absence caused the 403) and the requeue wiring end to end.
 *
 * The fixture harness intentionally mirrors tests/unit/writer-queue.test.js
 * so both suites stay independently runnable. Every CLI run uses a throwaway
 * MOTOAI_FACTORY_ROOT; production is never mutated.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOL = join(REPO, 'tools', 'writer-queue.mjs');
const PUBLISHER_YML = join(REPO, '.github', 'workflows', 'writer-publisher.yml');
const HEADER = 'article_id,batch_id,category,status,primary_keyword,secondary_keywords,search_intent,working_title,slug,output_path,parent_hub,local_scope,requires_sources,source_policy,internal_link_targets,commercial_link_target,agent_retrieval,author,score,quality_status,repair_attempts,published_date,last_checked,notes';

// ---------------------------------------------------------------------------
// Fixture helpers (throwaway roots only)
// ---------------------------------------------------------------------------

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'motoai-wq-rq-'));
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
    if (expectFail) return { fail: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
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

function cloneForWriter(main) {
  const w = mkdtempSync(join(tmpdir(), 'motoai-wq-rqw-'));
  mkdirSync(join(w, 'data/blog/articles'), { recursive: true });
  mkdirSync(join(w, 'docs/state'), { recursive: true });
  copyFileSync(join(main, 'data/blog/content-matrix.csv'), join(w, 'data/blog/content-matrix.csv'));
  copyFileSync(join(main, 'data/blog/published.json'), join(w, 'data/blog/published.json'));
  copyFileSync(join(main, 'docs/state/writer-assignments.json'), join(w, 'docs/state/writer-assignments.json'));
  return w;
}

function readyChunkInTree(tree, batch, seq) {
  const a = assignmentsOf(tree);
  const chunk = a.active.chunks.find((c) => c.seq === Number(seq));
  const writer = chunk.writer;
  runCli(tree, ['begin', writer, batch, String(seq)]);
  const rows = fixtureRows(tree);
  for (const id of chunk.ids) {
    writeFileSync(join(tree, 'data/blog/articles/' + rows[id].slug + '.body.html'), '<p>body ' + id + '</p>');
  }
  const draftsPath = join(tree, 'drafts-' + seq + '.json');
  writeFileSync(draftsPath, JSON.stringify(chunk.ids.map((id) => ({
    article_id: id,
    category: rows[id].category,
    slug: rows[id].slug,
    title: 'Tieu de bai ' + id,
    description: 'Mo ta chi tiet cho bai ' + id + ' ve thue xe may gia re tai Ha Noi.',
    published_date: '2026-10-02',
    author: 'MotoAI Editorial',
    pilot: false,
    body: 'data/blog/articles/' + rows[id].slug + '.body.html',
    knowledge_chunks: [],
  }))));
  runCli(tree, ['ready', writer, batch, String(seq), '--drafts', draftsPath]);
  return { writer, chunk, draftsPath };
}

function branchView(trees) {
  const view = mkdtempSync(join(tmpdir(), 'motoai-wq-rqv-'));
  for (const tree of trees) {
    const ww = join(tree, 'writer-work');
    if (!existsSync(ww)) continue;
    cpDir(ww, join(view, 'writer-work'));
    mkdirSync(join(view, 'data/blog/articles'), { recursive: true });
    for (const f of readdirSync(join(tree, 'data/blog/articles'))) {
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

/** Simulate what the dead publisher run left behind: the 2 bodies and the 2
 *  manifest drafts are ALREADY on main, the matrix rows are still PLANNED,
 *  the chunk is still RESERVED (the 403 died before the factory dispatch). */
function applyCrashWindow(main, writerTree, draftsPath, seq) {
  const a = assignmentsOf(main);
  const chunk = a.active.chunks.find((c) => c.seq === Number(seq));
  const rows = fixtureRows(main);
  for (const id of chunk.ids) {
    copyFileSync(join(writerTree, 'data/blog/articles/' + rows[id].slug + '.body.html'),
      join(main, 'data/blog/articles/' + rows[id].slug + '.body.html'));
  }
  const manifest = JSON.parse(readFileSync(join(main, 'data/blog/published.json'), 'utf8'));
  manifest.articles.push(...JSON.parse(readFileSync(draftsPath, 'utf8')));
  writeFileSync(join(main, 'data/blog/published.json'), JSON.stringify(manifest, null, 2) + '\n');
  return chunk;
}

/** A fresh batch with chunk 1 (writer_A) already sitting in the crash window. */
function crashFixture() {
  const root = fixtureRoot();
  const batch = parseOut(runCli(root, ['plan'])).batch_id;
  const w = cloneForWriter(root);
  const ready = readyChunkInTree(w, batch, 1);
  const chunk = applyCrashWindow(root, w, ready.draftsPath, 1);
  const view = branchView([w]);
  return { root, batch, w, ready, view, chunk };
}

// ---------------------------------------------------------------------------
// A. Static contract: the publisher can dispatch the factory (the 403 fix)
// ---------------------------------------------------------------------------

test('A1: publisher declares contents:write AND actions:write', () => {
  const y = readFileSync(PUBLISHER_YML, 'utf8');
  const i = y.indexOf('permissions:');
  assert.ok(i >= 0, 'publisher YAML must declare a permissions block');
  const block = y.slice(i, i + 400);
  assert.match(block, /contents:\s*write/);
  // The 403 fix: 'gh workflow run' / 'gh run list' / 'gh run watch' on
  // blog-factory-publish.yml need actions:write (run 37044896012).
  assert.match(block, /actions:\s*write/);
});

test('A2: the factory dispatch is workflow_dispatch with explicit article_ids', () => {
  const y = readFileSync(PUBLISHER_YML, 'utf8');
  const dispatches = y.split('gh workflow run blog-factory-publish.yml --ref main -f article_ids=').length - 1;
  assert.ok(dispatches >= 2, 'the factory step AND the factory-requeue recovery must both dispatch with article_ids, got ' + dispatches);
  assert.ok(y.includes('--event workflow_dispatch'), 'the publisher must watch the dispatched factory run');
});

test('A3: requeue is wired through the whole publisher pipeline', () => {
  const y = readFileSync(PUBLISHER_YML, 'utf8');
  const wired = y.split("steps.select.outputs.action == 'requeue'").length - 1;
  assert.ok(wired >= 4, 'wait/push/factory/complete/fail must all accept action=requeue, got ' + wired);
  const stopIdx = y.indexOf('Stop when nothing is publishable');
  assert.ok(stopIdx >= 0, 'the stop step exists');
  const stop = y.slice(stopIdx, stopIdx + 260);
  assert.ok(stop.includes("!= 'requeue'"), 'the stop step must NOT stop a requeue');
  assert.ok(y.includes('steps.select.outputs.mode'), 'select must export the mode output');
  assert.ok(y.includes('MODE: ${{ steps.select.outputs.mode }}'), 'the factory step receives the mode (complete-only short-circuit)');
  assert.ok(y.includes('node tools/writer-queue.mjs requeue'), 'the push step runs requeue instead of stage on action=requeue');
});

test('A4: the engine exposes the requeue CLI command', () => {
  const src = readFileSync(TOOL, 'utf8');
  assert.match(src, /function cmdRequeue\(args\)/);
  assert.match(src, /case 'requeue': cmdRequeue\(args\); break;/);
  assert.match(src, /requeue <batch> <seq> --work <dir>/);
  const usage = execFileSync('node', [TOOL], { encoding: 'utf8' });
  assert.match(usage, /requeue/);
});

// ---------------------------------------------------------------------------
// B. Crash-window classification + fail-closed recovery
// ---------------------------------------------------------------------------

test('B1: select-publish detects the crash window instead of re-staging', () => {
  const f = crashFixture();
  const sel = parseOut(runCli(f.root, ['select-publish', '--work', f.view]));
  assert.equal(sel.action, 'requeue');
  assert.equal(sel.mode, 'restore');
  assert.equal(sel.batch, f.batch);
  assert.equal(sel.seq, '1');
  assert.equal(sel.writer, 'writer_A');
  assert.equal(sel.ids, 'BA-0001,BA-0002');
});

test('B2: requeue restores only what is missing and is idempotent', () => {
  const f = crashFixture();
  const body1 = join(f.root, 'data/blog/articles/bai-1.body.html');

  // 1) one body lost on main -> restored exactly once
  rmSync(body1);
  let rq = parseOut(runCli(f.root, ['requeue', f.batch, '1', '--work', f.view]));
  assert.equal(rq.restored_bodies, '1');
  assert.equal(rq.restored_drafts, '0');
  assert.equal(rq.mode, 'restore');
  assert.equal(rq.dispatch_needed, 'yes');
  assert.ok(existsSync(body1), 'the body must be restored from the writer branch');

  // 2) re-running restores nothing more
  rq = parseOut(runCli(f.root, ['requeue', f.batch, '1', '--work', f.view]));
  assert.equal(rq.restored_bodies, '0');
  assert.equal(rq.restored_drafts, '0');
  assert.equal(rq.verified_bodies, '2');
  assert.equal(rq.verified_drafts, '2');

  // 3) one draft entry + its body lost on main -> both restored
  const manifest = JSON.parse(readFileSync(join(f.root, 'data/blog/published.json'), 'utf8'));
  manifest.articles = manifest.articles.filter((a) => a.article_id !== 'BA-0001');
  writeFileSync(join(f.root, 'data/blog/published.json'), JSON.stringify(manifest, null, 2) + '\n');
  rmSync(body1);
  rq = parseOut(runCli(f.root, ['requeue', f.batch, '1', '--work', f.view]));
  assert.equal(rq.restored_bodies, '1');
  assert.equal(rq.restored_drafts, '1');

  // 4) and again: nothing left to do
  rq = parseOut(runCli(f.root, ['requeue', f.batch, '1', '--work', f.view]));
  assert.equal(rq.restored_bodies, '0');
  assert.equal(rq.restored_drafts, '0');
  assert.equal(rq.verified_drafts, '2');
});

test('B3: a duplicate manifest entry fails closed (never a second publish)', () => {
  const f = crashFixture();
  const manifest = JSON.parse(readFileSync(join(f.root, 'data/blog/published.json'), 'utf8'));
  manifest.articles.push(JSON.parse(JSON.stringify(manifest.articles.find((a) => a.article_id === 'BA-0001'))));
  writeFileSync(join(f.root, 'data/blog/published.json'), JSON.stringify(manifest, null, 2) + '\n');
  const rq = runCli(f.root, ['requeue', f.batch, '1', '--work', f.view], { expectFail: true });
  assert.ok(rq.fail, 'requeue must refuse a duplicate entry');
  assert.match(rq.out, /duplicate, fail closed/);
  const sel = runCli(f.root, ['select-publish', '--work', f.view], { expectFail: true });
  assert.ok(sel.fail, 'select-publish must refuse a duplicate entry too');
});

test('B4: all-PUBLISHED chunk requeues as complete-only (no dispatch)', () => {
  const f = crashFixture();
  setStatusInMatrix(f.root, ['BA-0001', 'BA-0002'], 'PUBLISHED');
  const sel = parseOut(runCli(f.root, ['select-publish', '--work', f.view]));
  assert.equal(sel.action, 'requeue');
  assert.equal(sel.mode, 'complete-only');
  const rq = parseOut(runCli(f.root, ['requeue', f.batch, '1', '--work', f.view]));
  assert.equal(rq.mode, 'complete-only');
  assert.equal(rq.restored_bodies, '0');
  assert.equal(rq.restored_drafts, '0');
  assert.equal(rq.dispatch_needed, 'no');
});

test('B5: mixed matrix states fail closed at selection time', () => {
  const f = crashFixture();
  setStatusInMatrix(f.root, ['BA-0001'], 'PUBLISHED');
  const sel = runCli(f.root, ['select-publish', '--work', f.view], { expectFail: true });
  assert.ok(sel.fail);
  assert.match(sel.out, /inconsistent crash-window state/);
});

test('B6: a body on main that diverged from the writer branch fails closed', () => {
  const f = crashFixture();
  writeFileSync(join(f.root, 'data/blog/articles/bai-1.body.html'), '<p>diverged on main</p>');
  const sel = parseOut(runCli(f.root, ['select-publish', '--work', f.view]));
  assert.equal(sel.action, 'requeue'); // classification still points at the crash window
  const rq = runCli(f.root, ['requeue', f.batch, '1', '--work', f.view], { expectFail: true });
  assert.ok(rq.fail, 'requeue must never overwrite diverged content');
  assert.match(rq.out, /differs from the writer branch/);
});

test('B7: strict FIFO still blocks a later chunk when chunk 1 is not ready', () => {
  const root = fixtureRoot();
  const batch = parseOut(runCli(root, ['plan'])).batch_id;
  const wB = cloneForWriter(root);
  readyChunkInTree(wB, batch, 2); // writer_B readies chunk 2 first
  const view = branchView([wB]);
  const sel = parseOut(runCli(root, ['select-publish', '--work', view]));
  assert.equal(sel.action, 'wait'); // chunk 1 not started -> never publish ahead
});

test('B8: stage refuses the crash window (the old path would double-push)', () => {
  const f = crashFixture();
  const st = runCli(f.root, ['stage', f.batch, '1', '--work', f.view], { expectFail: true });
  assert.ok(st.fail, 'stage must refuse a chunk whose bodies are already on main');
  assert.match(st.out, /body already exists/);
});

test('B9: requeue refuses a chunk file that is not READY_TO_PUSH', () => {
  const root = fixtureRoot();
  const batch = parseOut(runCli(root, ['plan'])).batch_id;
  const w = cloneForWriter(root);
  runCli(w, ['begin', 'writer_A', batch, '1']); // WRITING, no bodies, no ready
  const view = branchView([w]);
  const rq = runCli(root, ['requeue', batch, '1', '--work', view], { expectFail: true });
  assert.ok(rq.fail);
  assert.match(rq.out, /expected READY_TO_PUSH/);
});

test('B10: requeue refuses a terminal (PUBLISHED) manifest chunk', () => {
  const f = crashFixture();
  setStatusInMatrix(f.root, ['BA-0001', 'BA-0002'], 'PUBLISHED');
  runCli(f.root, ['complete', f.batch, '1']);
  const a = assignmentsOf(f.root);
  assert.equal(a.active.chunks.find((c) => c.seq === 1).status, 'PUBLISHED');
  const rq = runCli(f.root, ['requeue', f.batch, '1', '--work', f.view], { expectFail: true });
  assert.ok(rq.fail);
  assert.match(rq.out, /requeue only recovers a RESERVED chunk/);
});

test('B11: full §6G lifecycle: requeue -> factory success -> complete -> next chunk publishes', () => {
  const f = crashFixture();
  const sel = parseOut(runCli(f.root, ['select-publish', '--work', f.view]));
  assert.equal(sel.action, 'requeue');
  const rq = parseOut(runCli(f.root, ['requeue', f.batch, '1', '--work', f.view]));
  assert.equal(rq.dispatch_needed, 'yes');

  // the factory runs and flips the matrix rows
  setStatusInMatrix(f.root, ['BA-0001', 'BA-0002'], 'PUBLISHED');
  const done = parseOut(runCli(f.root, ['complete', f.batch, '1']));
  assert.equal(done.action, 'complete');
  const a = assignmentsOf(f.root);
  assert.equal(a.active.chunks.find((c) => c.seq === 1).status, 'PUBLISHED');

  // writer_B readies chunk 2 -> the pipeline continues as a NORMAL publish
  const wB = cloneForWriter(f.root);
  readyChunkInTree(wB, f.batch, 2);
  const view2 = branchView([f.w, wB]);
  const sel2 = parseOut(runCli(f.root, ['select-publish', '--work', view2]));
  assert.equal(sel2.action, 'publish');
  assert.equal(sel2.mode, 'first-publish');
  assert.equal(sel2.seq, '2');
  assert.equal(sel2.ids, 'BA-0003,BA-0004');
});

test('B12: the writer branch is the restore authority (missing writer body fails closed)', () => {
  const f = crashFixture();
  rmSync(join(f.view, 'data/blog/articles/bai-1.body.html'));
  const rq = runCli(f.root, ['requeue', f.batch, '1', '--work', f.view], { expectFail: true });
  assert.ok(rq.fail);
  assert.match(rq.out, /body missing on the writer branch/);
});
