#!/usr/bin/env node
/**
 * v68 PARALLEL WRITER MODE — central reservation queue (docs/PARALLEL-WRITER.md).
 *
 * Contract (upgrade over the v67 single sequential writer):
 *
 *   - ONLY the coordinator (`plan`) may claim article ids. It reserves at
 *     most MAX_BATCH PLANNED ids of a fresh matrix in ONE deterministic
 *     batch, splits them into MICRO_CHUNK (2-article) chunks and assigns
 *     the chunks round-robin to 3 writers. The resulting manifest
 *     (docs/state/writer-assignments.json) is the SINGLE SOURCE OF TRUTH.
 *   - Writers NEVER pick "next PLANNED" themselves and NEVER push main.
 *     Each writer works its own queue (`next`/`begin`/`ready`/`abort`) and
 *     pushes bodies + its chunk file to its own branch
 *     `writer/<batch>/<A|B|C>` (never matrix/manifest/run state).
 *   - ONE serialized publisher (`select-publish`/`stage`/`verify-push`/
 *     `complete`/`fail`) moves READY_TO_PUSH chunks to main, strictly FIFO
 *     by chunk sequence, exactly ONE 2-article chunk at a time, with
 *     fresh-main verification before every push.
 *
 * Durable state is split (crash-safe, §8 docs/PARALLEL-WRITER.md):
 *   - central manifest: chunk RESERVED -> PUBLISHED | FAILED |
 *     FACTORY_FAILED (+ events). Written only by coordinator/publisher.
 *   - writer chunk file (writer-work/<batch>/<A|B|C>/chunk-NN.json):
 *     WRITING -> LOCAL_QA_PASS -> READY_TO_PUSH (+ WRITING_FAILED,
 *     LOCAL_QA_FAILED, ABORTED). Lives ONLY on writer branches, never main.
 *
 * A duplicate article id anywhere in the assignment manifest FAILS CLOSED:
 * validateBatch refuses the batch and no writer runs on it.
 *
 * Commands (all output machine readable, key=value):
 *   node tools/writer-queue.mjs plan [--limit N] [--dry-run] [--base-sha X]
 *   node tools/writer-queue.mjs status
 *   node tools/writer-queue.mjs validate
 *   node tools/writer-queue.mjs next <writer_A|writer_B|writer_C>
 *   node tools/writer-queue.mjs begin <writer> <batch> <seq>
 *   node tools/writer-queue.mjs ready <writer> <batch> <seq> --drafts <file.json>
 *   node tools/writer-queue.mjs abort <writer> <batch> <seq> [--reason X]
 *   node tools/writer-queue.mjs select-publish [--work <dir>]
 *   node tools/writer-queue.mjs stage <batch> <seq> --work <dir>
 *   node tools/writer-queue.mjs verify-push <batch> <seq> --work <dir>
 *   node tools/writer-queue.mjs complete <batch> <seq>
 *   node tools/writer-queue.mjs fail <batch> <seq> --state failed|factory-failed|push-failed [--reason X]
 *   node tools/writer-queue.mjs requeue <batch> <seq> --work <dir>   (§6G crash-window recovery)
 *
 * `--work <dir>` points at an extracted view of the writer branches (the
 * directory that CONTAINS writer-work/); the publisher workflow builds it
 * with `git archive` over all writer/* branches so the global FIFO sees
 * every writer's chunk files.
 *
 * Tests: tests/unit/writer-queue.test.js (contract + concurrency stress).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMatrix, MATRIX, MANIFEST } from './blog-factory.mjs';

const ROOT = process.env.MOTOAI_FACTORY_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)), '..');

export const WRITERS = ['writer_A', 'writer_B', 'writer_C'];
export const MICRO_CHUNK = 2;
export const MAX_BATCH = 50;
export const ASSIGNMENTS = join(ROOT, 'docs/state/writer-assignments.json');
export const FILE_SCHEMA = 'motoai/writer-assignments@1';
export const CHUNK_SCHEMA = 'motoai/writer-chunk@1';
export const ID_RE = /^BA-\d{4}$/;
/** Central (manifest) chunk states. PUSHING/PUSHED/FACTORY_PROCESSING are
 *  in-run events recorded in chunk.events by `complete`, never extra commits. */
export const CENTRAL_CHUNK_STATES = ['RESERVED', 'PUBLISHED', 'FAILED', 'FACTORY_FAILED'];
export const TERMINAL_CHUNK_STATES = new Set(['PUBLISHED', 'FAILED', 'FACTORY_FAILED']);
/** Writer-side chunk file states. */
export const WRITER_FILE_STATES = ['WRITING', 'LOCAL_QA_PASS', 'READY_TO_PUSH', 'WRITING_FAILED', 'LOCAL_QA_FAILED', 'ABORTED'];
const FINISHED_WRITING = new Set(['LOCAL_QA_PASS', 'READY_TO_PUSH']);

const now = () => new Date().toISOString();
const die = (msg) => { console.error(`ERROR: ${msg}`); process.exit(1); };
const emit = (obj) => { for (const [k, v] of Object.entries(obj)) console.log(`${k}=${v}`); };

const BOOL_FLAGS = new Set(['--dry-run']);
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a] = BOOL_FLAGS.has(a) ? true : (argv[++i] ?? '');
    else out._.push(a);
  }
  return out;
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
function writeJson(p, v) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export function writerShort(writer) {
  if (!WRITERS.includes(writer)) die(`unknown writer: ${writer} (expected one of ${WRITERS.join(', ')})`);
  return writer.slice(-1); // writer_A -> A
}

export function chunkFileName(seq) {
  return `chunk-${String(seq).padStart(2, '0')}.json`;
}

/** Relative dir of a writer's chunk files: writer-work/<batch>/<A|B|C>. */
export function workDirFor(batchId, writer) {
  return join('writer-work', batchId, writerShort(writer));
}

/** Deterministic round-robin: chunk 01 -> A, 02 -> B, 03 -> C, 04 -> A, ...
 *  Chunk size is always MICRO_CHUNK (1 allowed only at the very end). */
export function chunkRoundRobin(ids) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += MICRO_CHUNK) {
    chunks.push({
      seq: chunks.length + 1,
      writer: WRITERS[chunks.length % WRITERS.length],
      ids: ids.slice(i, i + MICRO_CHUNK),
    });
  }
  return chunks;
}

/** HARD GUARD (§1): a batch is valid only when every article id appears in
 *  EXACTLY one chunk of exactly one writer. Any duplicate fails closed. */
export function validateBatch(batch) {
  const errors = [];
  if (!batch || typeof batch !== 'object') return { ok: false, errors: ['batch missing'], uniqueIds: 0 };
  if (!/^WRITER-BATCH-\d{4}$/.test(batch.batch_id ?? '')) errors.push(`bad batch_id: ${batch.batch_id}`);
  if (!['ACTIVE', 'COMPLETED'].includes(batch.status)) errors.push(`bad batch status: ${batch.status}`);
  if (!Array.isArray(batch.chunks) || batch.chunks.length === 0) errors.push('no chunks');
  const seen = new Map();
  (batch.chunks ?? []).forEach((chunk, i) => {
    if (chunk.seq !== i + 1) errors.push(`chunk seq ${chunk.seq} != ${i + 1} (sequence must be contiguous from 1)`);
    if (!WRITERS.includes(chunk.writer)) errors.push(`chunk ${chunk.seq}: unknown writer ${chunk.writer}`);
    if (!Array.isArray(chunk.ids)) { errors.push(`chunk ${chunk.seq}: ids missing`); return; }
    if (chunk.ids.length < 1 || chunk.ids.length > MICRO_CHUNK) errors.push(`chunk ${chunk.seq}: ${chunk.ids.length} ids (micro chunk = ${MICRO_CHUNK})`);
    if (chunk.ids.length === 1 && i !== batch.chunks.length - 1) errors.push(`chunk ${chunk.seq}: size 1 is allowed only at the corpus boundary`);
    for (const id of chunk.ids) {
      if (!ID_RE.test(id)) errors.push(`chunk ${chunk.seq}: bad article id ${id}`);
      if (seen.has(id)) errors.push(`DUPLICATE article id ${id} in chunk ${seen.get(id)} and chunk ${chunk.seq} — FAIL CLOSED`);
      else seen.set(id, chunk.seq);
    }
    if (!CENTRAL_CHUNK_STATES.includes(chunk.status)) errors.push(`chunk ${chunk.seq}: bad central status ${chunk.status}`);
  });
  if (batch.total !== undefined && batch.total !== seen.size) errors.push(`total ${batch.total} != ${seen.size} unique ids`);
  return { ok: errors.length === 0, errors, uniqueIds: seen.size };
}

/** Candidate selection for a NEW batch: PLANNED rows in deterministic matrix
 *  order. Rows that already have a manifest draft (pending/repair) or a body
 *  on disk (backlog) are NEVER mixed into a NEW batch — they keep their own
 *  REPAIR/BACKLOG pipeline (§9, v67 SIMPLE PRODUCTION MODE untouched). */
export function selectCandidateIds(rows, publishedManifest, root, limit = MAX_BATCH) {
  const drafted = new Set((publishedManifest?.articles ?? []).map((a) => a.article_id));
  const out = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    if (row.status !== 'PLANNED') continue;
    if (drafted.has(row.article_id)) continue; // pending draft — repair pipeline
    if (existsSync(join(root, 'data/blog/articles', `${row.slug}.body.html`))) continue; // backlog
    out.push(row.article_id);
  }
  return out;
}

export function nextBatchId(assignments) {
  let max = 0;
  const scan = (id) => {
    const m = /^WRITER-BATCH-(\d{4})$/.exec(id ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  };
  scan(assignments?.active?.batch_id);
  for (const h of assignments?.history ?? []) scan(h.batch_id);
  return `WRITER-BATCH-${String(max + 1).padStart(4, '0')}`;
}

/** Serialized publisher decision — STRICT FIFO, exactly ONE chunk:
 *   PUBLISHED/FAILED/FACTORY_FAILED chunks are skipped (terminal);
 *   the first RESERVED chunk with a READY_TO_PUSH writer file is published;
 *   any earlier unfinished chunk BLOCKS the queue (never publish ahead). */
export function decidePublish(assignments, statusFor) {
  const active = assignments?.active;
  if (!active || active.status !== 'ACTIVE') return { action: 'none', reason: 'no ACTIVE batch' };
  for (const chunk of active.chunks) {
    if (chunk.status === 'PUBLISHED') continue;
    if (chunk.status === 'FAILED' || chunk.status === 'FACTORY_FAILED') continue; // terminal, skipped, never reassigned
    const ws = statusFor(chunk);
    if (ws === 'READY_TO_PUSH') {
      return { action: 'publish', batch: active.batch_id, seq: chunk.seq, writer: chunk.writer, ids: [...chunk.ids] };
    }
    return {
      action: 'wait',
      batch: active.batch_id,
      seq: chunk.seq,
      reason: `chunk ${chunk.seq} (writer ${chunk.writer}) is ${ws ?? 'not started'} — strict FIFO: never publish ahead of a lower sequence`,
    };
  }
  return { action: 'none', reason: 'no publishable chunk (every chunk is terminal)' };
}

/** Guarded state-machine transition (pure): only fromStates -> to is legal. */
export function applyChunkTransition(record, fromStates, to, meta = {}) {
  if (!record || typeof record !== 'object') return { ok: false, error: 'record missing' };
  if (!fromStates.includes(record.status)) {
    return { ok: false, error: `cannot move ${record.status} -> ${to} (allowed from: ${fromStates.join(', ')})` };
  }
  return {
    ok: true,
    next: {
      ...record,
      status: to,
      history: [...(record.history ?? []), {
        from: record.status,
        to,
        at: meta.at ?? new Date().toISOString(),
        ...(meta.reason ? { reason: meta.reason } : {}),
      }],
    },
  };
}

// ---------------------------------------------------------------------------
// Repo state helpers
// ---------------------------------------------------------------------------

const loadRows = () => parseMatrix();
const rowById = (rows, id) => rows.find((r) => r.article_id === id) ?? null;
const bodyPathOf = (row) => `data/blog/articles/${row.slug}.body.html`;

function loadAssignments() {
  return existsSync(ASSIGNMENTS)
    ? readJson(ASSIGNMENTS)
    : { $schema: FILE_SCHEMA, active: null, history: [] };
}

function saveAssignments(a) {
  a.$schema ??= FILE_SCHEMA;
  writeJson(ASSIGNMENTS, a);
}

function requireActiveBatch(assignments, batchId) {
  const b = assignments.active;
  if (!b || b.batch_id !== batchId) die(`unknown or superseded batch: ${batchId}`);
  if (b.status !== 'ACTIVE') die(`batch ${batchId} is ${b.status} — only an ACTIVE batch can be worked`);
  return b;
}

function findChunk(batch, seqRaw) {
  const seq = Number(seqRaw);
  const chunk = batch.chunks.find((c) => c.seq === seq);
  if (!chunk) die(`chunk seq ${seqRaw} not found in ${batch.batch_id}`);
  return chunk;
}

function chunkFileFor(workRoot, batchId, writer, seq) {
  return join(workRoot, workDirFor(batchId, writer), chunkFileName(seq));
}

/** The 2 manifest draft entries a writer produced must match the chunk and
 *  the matrix exactly — id set equality, slug/body path, schema fields. */
function validateDrafts(drafts, chunk, rows) {
  if (!Array.isArray(drafts)) die('drafts must be a JSON array');
  if (drafts.length !== chunk.ids.length) die(`chunk ${chunk.seq} expects exactly ${chunk.ids.length} drafts, got ${drafts.length}`);
  const idSet = new Set(chunk.ids);
  const seen = new Set();
  for (const d of drafts) {
    if (!idSet.has(d.article_id)) die(`draft ${d.article_id ?? '?'} is not part of chunk ${chunk.seq}`);
    if (seen.has(d.article_id)) die(`duplicate draft for ${d.article_id}`);
    seen.add(d.article_id);
    const row = rowById(rows, d.article_id);
    if (!row) die(`unknown matrix id ${d.article_id}`);
    if (d.slug !== row.slug) die(`draft slug of ${d.article_id} does not match the matrix`);
    if (d.body !== bodyPathOf(row)) die(`draft body path of ${d.article_id} does not match the matrix`);
    if (!d.title || !d.description) die(`draft ${d.article_id} needs title and description`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.published_date ?? '')) die(`draft ${d.article_id} needs published_date (YYYY-MM-DD)`);
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// Coordinator
// ---------------------------------------------------------------------------

function cmdPlan(args) {
  const limit = Math.max(1, Math.min(MAX_BATCH, Number(args['--limit'] ?? MAX_BATCH) || MAX_BATCH));
  const dryRun = Boolean(args['--dry-run']);
  const baseSha = args['--base-sha'] ?? '';

  const assignments = loadAssignments();
  if (assignments.active && assignments.active.status === 'ACTIVE') {
    // §8 crash/resume: a restart NEVER re-reserves an active batch.
    // §6G: the resume message stays machine-readable under --dry-run
    // (dry_run flag + a summary of the ACTIVE batch) so contract tests run
    // against the real repo while a batch is in progress.
    emit({
      created: 'false',
      ...(dryRun ? { dry_run: 'true' } : {}),
      reason: `active batch ${assignments.active.batch_id} still has unfinished chunks — resume it, never re-reserve`,
      batch_id: assignments.active.batch_id,
      total: String(assignments.active.chunks.reduce((n, c) => n + c.ids.length, 0)),
      chunks: String(assignments.active.chunks.length),
    });
    return;
  }

  const rows = loadRows();
  const published = existsSync(MANIFEST) ? readJson(MANIFEST) : { articles: [] };
  const activeIds = new Set(assignments.active?.chunks?.flatMap((c) => c.ids) ?? []);
  const ids = selectCandidateIds(rows, published, ROOT, limit).filter((id) => !activeIds.has(id));
  if (ids.length === 0) {
    emit({ created: 'false', reason: 'no eligible PLANNED ids (draft/backlog/review rows are never mixed into a NEW batch)' });
    return;
  }

  const batchId = nextBatchId(assignments);
  const batch = {
    batch_id: batchId,
    base_sha: baseSha,
    status: 'ACTIVE',
    created_at: now(),
    limit,
    total: ids.length,
    chunks: chunkRoundRobin(ids).map((c) => ({
      seq: c.seq, writer: c.writer, ids: c.ids, status: 'RESERVED', events: [],
    })),
  };

  // §1 invariant: UNIQUE(article_id across writer_A + writer_B + writer_C).
  // Any violation fails closed — no writer runs on the batch.
  const v = validateBatch(batch);
  if (!v.ok) {
    emit({ created: 'false', fail_closed: 'true' });
    v.errors.forEach((e) => console.error(`ERROR: ${e}`));
    process.exit(1);
  }

  const perWriter = Object.fromEntries(WRITERS.map((w) => [
    w, batch.chunks.filter((c) => c.writer === w).reduce((n, c) => n + c.ids.length, 0),
  ]));
  const summary = {
    batch_id: batchId,
    total: batch.total,
    chunks: batch.chunks.length,
    ...Object.fromEntries(Object.entries(perWriter).map(([w, n]) => [`${w}_ids`, n])),
  };

  if (dryRun) {
    // §12: dry-run must never touch the production inventory.
    emit({ created: 'false', dry_run: 'true', ...summary, note: 'plan only — nothing written' });
    return;
  }

  const previousActive = assignments.active; // completed batch being archived (or null)
  const history = [...(assignments.history ?? [])];
  if (previousActive) {
    history.push({
      batch_id: previousActive.batch_id,
      total: previousActive.total,
      published: previousActive.chunks.filter((c) => c.status === 'PUBLISHED').length,
      failed: previousActive.chunks.filter((c) => c.status === 'FAILED' || c.status === 'FACTORY_FAILED').length,
      completed_at: now(),
    });
  }
  const next = {
    $schema: FILE_SCHEMA,
    active: batch,
    history,
  };
  // Atomic exclusive create when the manifest does not exist yet: two racing
  // coordinators can never both reserve the FIRST batch. When the file exists
  // (a COMPLETED batch is being archived), re-read it: if another coordinator
  // already wrote a NEW batch we lose cleanly; only our own stale COMPLETED
  // file may be overwritten.
  const payload = JSON.stringify(next, null, 2) + '\n';
  try {
    writeFileSync(ASSIGNMENTS, payload, { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const current = loadAssignments();
    const currentId = current.active?.batch_id ?? null;
    const previousId = previousActive?.batch_id ?? null;
    if (currentId !== previousId) {
      emit({ created: 'false', reason: 'another coordinator created the batch first (atomic exclusive create) — nothing overwritten' });
      return;
    }
    writeFileSync(ASSIGNMENTS, payload);
  }
  emit({ created: 'true', ...summary, assignment_file: 'docs/state/writer-assignments.json' });
}

// ---------------------------------------------------------------------------
// Writers (own queue only — never pick ids themselves, never push main)
// ---------------------------------------------------------------------------

function cmdStatus() {
  const a = loadAssignments();
  if (!a.active) { emit({ active: 'none', history: String((a.history ?? []).length) }); return; }
  const b = a.active;
  emit({ active: b.batch_id, status: b.status, total: String(b.total), chunks: String(b.chunks.length) });
  for (const w of WRITERS) {
    const mine = b.chunks.filter((c) => c.writer === w);
    console.log(`${w}: ${mine.map((c) => `${c.seq}=[${c.ids.join(',')}] ${c.status}`).join(' | ')}`);
  }
}

function cmdValidate() {
  const a = loadAssignments();
  if (!a.active) { emit({ valid: 'true', active: 'none' }); return; }
  const v = validateBatch(a.active);
  if (!v.ok) {
    emit({ valid: 'false', fail_closed: 'true' });
    v.errors.forEach((e) => console.error(`ERROR: ${e}`));
    process.exit(1);
  }
  emit({ valid: 'true', batch_id: a.active.batch_id, unique_ids: String(v.uniqueIds) });
}

function cmdNext(args) {
  const [writer] = args._;
  if (!WRITERS.includes(writer)) die(`unknown writer: ${writer} (expected one of ${WRITERS.join(', ')})`);
  const a = loadAssignments();
  const b = a.active;
  if (!b || b.status !== 'ACTIVE') { emit({ action: 'none', reason: 'no ACTIVE batch' }); return; }
  for (const chunk of b.chunks) {
    if (chunk.writer !== writer || chunk.status !== 'RESERVED') continue;
    const file = chunkFileFor(ROOT, b.batch_id, writer, chunk.seq);
    if (existsSync(file) && FINISHED_WRITING.has(readJson(file).status)) continue; // done writing
    emit({
      action: 'chunk',
      batch_id: b.batch_id,
      seq: String(chunk.seq),
      writer,
      ids: chunk.ids.join(','),
      chunk_file: join(workDirFor(b.batch_id, writer), chunkFileName(chunk.seq)),
    });
    return;
  }
  emit({ action: 'none', reason: `no open RESERVED chunk left for ${writer}` });
}

function cmdBegin(args) {
  const [writer, batchId, seqRaw] = args._;
  const a = loadAssignments();
  const b = requireActiveBatch(a, batchId);
  const chunk = findChunk(b, seqRaw);
  if (chunk.writer !== writer) {
    die(`chunk ${chunk.seq} belongs to ${chunk.writer} — ${writer} may never write another writer's ids`);
  }
  if (chunk.status !== 'RESERVED') {
    die(`chunk ${chunk.seq} is ${chunk.status} — only a RESERVED chunk can be (re)started`);
  }
  const rows = loadRows();
  const file = chunkFileFor(ROOT, b.batch_id, writer, chunk.seq);
  let rec = existsSync(file) ? readJson(file) : null;
  if (rec && FINISHED_WRITING.has(rec.status)) {
    die(`chunk ${chunk.seq} is already ${rec.status} — publish path only, never rewritten`);
  }
  const common = {
    action: 'begin',
    batch_id: b.batch_id,
    seq: String(chunk.seq),
    writer,
    ids: chunk.ids.join(','),
    chunk_file: join(workDirFor(b.batch_id, writer), chunkFileName(chunk.seq)),
  };
  if (!rec) {
    rec = {
      $schema: CHUNK_SCHEMA,
      batch_id: b.batch_id,
      writer,
      seq: chunk.seq,
      ids: [...chunk.ids],
      body_paths: chunk.ids.map((id) => {
        const row = rowById(rows, id);
        if (!row) die(`matrix row missing for ${id}`);
        return bodyPathOf(row);
      }),
      status: 'WRITING',
      drafts: [],
      history: [],
    };
    writeJson(file, rec);
    emit({ ...common, resumed: 'false', status: rec.status });
    return;
  }
  if (rec.status === 'WRITING') { // crash/resume: same writer, same ids, no duplicate
    emit({ ...common, resumed: 'true', status: rec.status });
    return;
  }
  // WRITING_FAILED / LOCAL_QA_FAILED / ABORTED: the SAME writer resumes the
  // SAME ids — a failed chunk is never silently handed to another writer.
  const t = applyChunkTransition(rec, ['WRITING_FAILED', 'LOCAL_QA_FAILED', 'ABORTED'], 'WRITING', { reason: 'writer resume' });
  if (!t.ok) die(t.error);
  writeJson(file, t.next);
  emit({ ...common, resumed: 'true', status: t.next.status });
}

function cmdReady(args) {
  const [writer, batchId, seqRaw] = args._;
  const draftsPath = args['--drafts'];
  if (!draftsPath) die('ready requires --drafts <file.json> (the 2 manifest draft entries)');
  const a = loadAssignments();
  const b = requireActiveBatch(a, batchId);
  const chunk = findChunk(b, seqRaw);
  if (chunk.writer !== writer) die(`chunk ${chunk.seq} belongs to ${chunk.writer} — not ${writer}`);
  if (chunk.status !== 'RESERVED') die(`chunk ${chunk.seq} is ${chunk.status} — only a RESERVED chunk can be readied`);
  const file = chunkFileFor(ROOT, b.batch_id, writer, chunk.seq);
  if (!existsSync(file)) die('chunk file missing — run begin first');
  const rec = readJson(file);
  if (FINISHED_WRITING.has(rec.status)) die(`chunk ${chunk.seq} is already ${rec.status}`);

  // The writer just produced the bodies locally; they must exist in this tree.
  for (const p of rec.body_paths ?? []) {
    if (!existsSync(join(ROOT, p))) die(`body missing in the writer tree: ${p}`);
  }
  const drafts = validateDrafts(readJson(draftsPath), chunk, loadRows());

  // §6D pre-ready guards: the 2 ids are unique (manifest invariant), owned by
  // this writer only (chunk.writer checked above), drafts match the matrix.
  let t = applyChunkTransition(rec, ['WRITING'], 'LOCAL_QA_PASS', { reason: 'local scoped QA PASS' });
  if (!t.ok) die(t.error);
  t = applyChunkTransition(t.next, ['LOCAL_QA_PASS'], 'READY_TO_PUSH', {});
  if (!t.ok) die(t.error);
  t.next.drafts = drafts;
  writeJson(file, t.next);
  emit({
    action: 'ready',
    batch_id: b.batch_id,
    seq: String(chunk.seq),
    writer,
    ids: chunk.ids.join(','),
    status: 'READY_TO_PUSH',
    branch: `writer/${b.batch_id}/${writerShort(writer)}`,
    push_files: [...rec.body_paths, join(workDirFor(b.batch_id, writer), chunkFileName(chunk.seq))].join(','),
  });
}

function cmdAbort(args) {
  const [writer, batchId, seqRaw] = args._;
  const a = loadAssignments();
  const b = requireActiveBatch(a, batchId);
  const chunk = findChunk(b, seqRaw);
  if (chunk.writer !== writer) die(`chunk ${chunk.seq} belongs to ${chunk.writer} — not ${writer}`);
  const file = chunkFileFor(ROOT, b.batch_id, writer, chunk.seq);
  if (!existsSync(file)) die('chunk file missing — nothing to abort');
  const rec = readJson(file);
  const t = applyChunkTransition(rec, WRITER_FILE_STATES, 'ABORTED', { reason: args['--reason'] ?? 'writer abort' });
  if (!t.ok) die(t.error);
  writeJson(file, t.next);
  emit({
    action: 'abort',
    batch_id: b.batch_id,
    seq: String(chunk.seq),
    writer,
    status: 'ABORTED',
    note: 'ids stay reserved to this writer until the owner resolves the chunk (fail/skip) — never reassigned silently',
  });
}

// ---------------------------------------------------------------------------
// Serialized publisher
// ---------------------------------------------------------------------------

function workRootOf(args) {
  return args['--work'] || args['--from'] || ROOT;
}

function cmdSelectPublish(args) {
  const workRoot = workRootOf(args);
  const a = loadAssignments();
  const statusFor = (chunk) => {
    const f = chunkFileFor(workRoot, a.active?.batch_id, chunk.writer, chunk.seq);
    return existsSync(f) ? readJson(f).status : null;
  };
  const d = decidePublish(a, statusFor);
  if (d.action === 'publish') {
    // §6G crash-window audit: a previous publisher run may have already
    // pushed this chunk to main and died before/during the factory dispatch
    // (e.g. the HTTP 403 dispatch failure, run 37044896012). Such a chunk
    // must NEVER be re-staged blindly — classify its real state against
    // fresh main first and fail closed on anything ambiguous.
    const rows = loadRows();
    const manifest = existsSync(MANIFEST) ? readJson(MANIFEST) : { articles: [] };
    const states = d.ids.map((id) => {
      const row = rowById(rows, id);
      if (!row) die(`matrix row missing for ${id}`);
      return {
        id,
        matrixStatus: row.status,
        bodyOnMain: existsSync(join(ROOT, bodyPathOf(row))),
        entries: manifest.articles.filter((x) => x.article_id === id).length,
      };
    });
    if (states.every((s) => s.matrixStatus === 'PUBLISHED')) {
      // The factory already finished this chunk but the manifest completion
      // never ran — complete it without writing any content, no dispatch.
      emit({
        action: 'requeue', mode: 'complete-only',
        batch: d.batch, seq: String(d.seq), writer: d.writer, ids: d.ids.join(','),
        reason: 'factory already finished this chunk — complete the manifest, no content writes',
      });
      return;
    }
    if (states.every((s) => s.matrixStatus === 'PLANNED' && !s.bodyOnMain && s.entries === 0)) {
      // Clean first publish: nothing of this chunk is on main yet.
      emit({
        action: 'publish', mode: 'first-publish',
        batch: d.batch, seq: String(d.seq), writer: d.writer, ids: d.ids.join(','),
        reason: 'fresh chunk — nothing on main yet, normal stage/verify/publish path',
      });
      return;
    }
    if (states.every((s) => s.matrixStatus === 'PLANNED' && s.bodyOnMain && s.entries <= 1)) {
      // Crash window: the chunk is on main but the factory never ran.
      emit({
        action: 'requeue', mode: 'restore',
        batch: d.batch, seq: String(d.seq), writer: d.writer, ids: d.ids.join(','),
        reason: 'previous publisher run pushed this chunk but the factory never ran — verify/restore, then dispatch',
      });
      return;
    }
    die(`chunk ${d.batch}#${d.seq} is in an inconsistent crash-window state (`
      + states.map((s) => `${s.id}=${s.matrixStatus},body=${s.bodyOnMain ? 1 : 0},entries=${s.entries}`).join(' ')
      + ') — refusing to publish or requeue, fail closed');
  }
  emit({
    action: d.action,
    batch: d.batch ?? '',
    seq: d.seq !== undefined ? String(d.seq) : '',
    ...(d.reason ? { reason: d.reason } : {}),
  });
}

function cmdStage(args) {
  const [batchId, seqRaw] = args._;
  const workRoot = workRootOf(args);
  const a = loadAssignments();
  const b = a.active;
  if (!b || b.batch_id !== batchId) die(`unknown batch: ${batchId}`);
  if (b.status !== 'ACTIVE') die(`batch ${batchId} is ${b.status} — staging requires the ACTIVE assignment`);
  const chunk = findChunk(b, seqRaw);
  if (chunk.status !== 'RESERVED') die(`chunk ${chunk.seq} is ${chunk.status} — only a RESERVED chunk can be staged`);

  const file = chunkFileFor(workRoot, batchId, chunk.writer, chunk.seq);
  if (!existsSync(file)) die('chunk file not found in the writer-branch view — the writer has not readied this chunk');
  const rec = readJson(file);
  if (rec.status !== 'READY_TO_PUSH') die(`chunk file status is ${rec.status}, expected READY_TO_PUSH`);
  if (JSON.stringify(rec.ids) !== JSON.stringify(chunk.ids)) {
    die('chunk file ids do not match the central assignment — conflict, fail closed');
  }
  if (!Array.isArray(rec.drafts) || rec.drafts.length !== chunk.ids.length) die('chunk file carries no complete drafts');

  const rows = loadRows();
  const manifest = existsSync(MANIFEST) ? readJson(MANIFEST) : die('data/blog/published.json missing');
  validateDrafts(rec.drafts, chunk, rows); // refuses on any id/slug/body mismatch

  // §6C/§6E fresh-main guards: a staged id must still be a fresh PLANNED row
  // with NO existing manifest entry and NO existing body on main.
  for (const id of chunk.ids) {
    const row = rowById(rows, id);
    if (!row) die(`matrix row missing for ${id}`);
    if (row.status === 'PUBLISHED') die(`${id} is already PUBLISHED — double publish refused`);
    if (row.status !== 'PLANNED') die(`${id} is ${row.status} — repair rows belong to the REPAIR pipeline, never a NEW batch push`);
    if (manifest.articles.some((x) => x.article_id === id)) {
      die(`${id} already has a manifest entry outside this assignment — conflict, stop`);
    }
    if (existsSync(join(ROOT, bodyPathOf(row)))) die(`body already exists on main: ${bodyPathOf(row)} — conflict, stop`);
    if (!existsSync(join(workRoot, bodyPathOf(row)))) die(`body missing on the writer branch: ${bodyPathOf(row)}`);
  }

  for (const id of chunk.ids) {
    const path = bodyPathOf(rowById(rows, id));
    copyFileSync(join(workRoot, path), join(ROOT, path));
  }
  manifest.articles.push(...rec.drafts); // appended; existing entries untouched
  writeJson(MANIFEST, manifest);
  emit({
    action: 'stage',
    batch_id: batchId,
    seq: String(chunk.seq),
    writer: chunk.writer,
    ids: chunk.ids.join(','),
    staged: [...chunk.ids.map((id) => bodyPathOf(rowById(rows, id))), 'data/blog/published.json'].join(','),
  });
}

function cmdVerifyPush(args) {
  const [batchId, seqRaw] = args._;
  const workRoot = workRootOf(args);
  const a = loadAssignments();
  const b = a.active;
  if (!b || b.batch_id !== batchId || b.status !== 'ACTIVE') {
    die(`batch ${batchId} is not the ACTIVE assignment (superseded or missing) — push refused`);
  }
  const chunk = findChunk(b, seqRaw);
  if (chunk.status !== 'RESERVED') die(`chunk ${chunk.seq} is ${chunk.status} — push refused`);

  const file = chunkFileFor(workRoot, batchId, chunk.writer, chunk.seq);
  if (!existsSync(file)) die('chunk file missing in the writer-branch view');
  const rec = readJson(file);
  if (rec.status !== 'READY_TO_PUSH') die(`chunk file is ${rec.status}, expected READY_TO_PUSH — push refused`);
  if (JSON.stringify(rec.ids) !== JSON.stringify(chunk.ids)) die('id mismatch between chunk file and central assignment');

  const rows = loadRows();
  const manifest = existsSync(MANIFEST) ? readJson(MANIFEST) : die('data/blog/published.json missing');
  for (const id of chunk.ids) {
    const row = rowById(rows, id);
    if (!row) die(`matrix row missing for ${id}`);
    if (row.status === 'PUBLISHED') die(`${id} is already PUBLISHED on fresh main — never re-publish`);
    if (row.status !== 'PLANNED') die(`${id} is ${row.status} — not a fresh NEW push`);
    const entries = manifest.articles.filter((x) => x.article_id === id);
    if (entries.length !== 1) die(`${id} must have exactly one staged manifest entry (found ${entries.length})`);
    if (entries[0].slug !== row.slug || entries[0].body !== bodyPathOf(row)) {
      die(`staged manifest entry of ${id} does not match the matrix`);
    }
    if (!existsSync(join(ROOT, entries[0].body))) die(`staged body missing: ${entries[0].body}`);
  }
  emit({
    proceed: 'true',
    batch_id: batchId,
    seq: String(chunk.seq),
    writer: chunk.writer,
    ids: chunk.ids.join(','),
    note: 'fresh-main verified: ACTIVE batch, READY_TO_PUSH chunk, both ids still PLANNED with exactly one draft each',
  });
}

// ---------------------------------------------------------------------------
// §6G crash-window recovery (docs/PARALLEL-WRITER.md §6G)
// ---------------------------------------------------------------------------
function cmdRequeue(args) {
  const [batchId, seqRaw] = args._;
  const workRoot = workRootOf(args);
  const a = loadAssignments();
  const b = a.active;
  if (!b || b.batch_id !== batchId) die(`unknown batch: ${batchId}`);
  if (!['ACTIVE', 'COMPLETED'].includes(b.status)) die(`batch ${batchId} is ${b.status}`);
  const chunk = findChunk(b, seqRaw);
  if (chunk.status !== 'RESERVED') {
    die(`chunk ${chunk.seq} is ${chunk.status} — requeue only recovers a RESERVED chunk (PUBLISHED/FAILED are terminal)`);
  }
  const file = chunkFileFor(workRoot, batchId, chunk.writer, chunk.seq);
  if (!existsSync(file)) die('chunk file not found in the writer-branch view — requeue needs the writer branch as the restore authority');
  const rec = readJson(file);
  if (rec.status !== 'READY_TO_PUSH') die(`chunk file status is ${rec.status}, expected READY_TO_PUSH`);
  if (JSON.stringify(rec.ids) !== JSON.stringify(chunk.ids)) {
    die('chunk file ids do not match the central assignment — conflict, fail closed');
  }
  if (!Array.isArray(rec.drafts) || rec.drafts.length !== chunk.ids.length) die('chunk file carries no complete drafts');

  const rows = loadRows();
  const manifest = existsSync(MANIFEST) ? readJson(MANIFEST) : die('data/blog/published.json missing');
  validateDrafts(rec.drafts, chunk, rows); // refuses on any id/slug/body mismatch

  // Pass 1 — classify every id against fresh main. Anything ambiguous dies.
  const cls = chunk.ids.map((id) => {
    const row = rowById(rows, id);
    if (!row) die(`matrix row missing for ${id}`);
    const entries = manifest.articles.filter((x) => x.article_id === id);
    return {
      id, row, entries,
      bodyOnMain: existsSync(join(ROOT, bodyPathOf(row))),
      bodyOnWriter: existsSync(join(workRoot, bodyPathOf(row))),
      draft: rec.drafts.find((d) => d.article_id === id),
    };
  });
  for (const c of cls) {
    if (c.row.status === 'PUBLISHED') {
      if (c.entries.length !== 1) die(`${c.id} is PUBLISHED but has ${c.entries.length} manifest entries — inconsistent, fail closed`);
      if (!c.bodyOnMain) die(`${c.id} is PUBLISHED but its body is missing on main — inconsistent, fail closed`);
      continue;
    }
    if (c.row.status !== 'PLANNED') die(`${c.id} is ${c.row.status} — requeue only recovers PLANNED/PUBLISHED crash windows`);
    if (c.entries.length > 1) die(`${c.id} has ${c.entries.length} manifest entries — duplicate, fail closed`);
    if (c.entries.length === 1) {
      const e = c.entries[0];
      if (e.slug !== c.row.slug || e.body !== bodyPathOf(c.row)) {
        die(`manifest entry of ${c.id} does not match the matrix — fail closed`);
      }
      if (!c.bodyOnMain) die(`${c.id} has a staged manifest entry but no body on main — torn push, fail closed`);
    }
    if (c.entries.length === 0 && c.bodyOnMain) die(`${c.id} has a body on main but no manifest entry — torn push, fail closed`);
    if (!c.bodyOnWriter) die(`body missing on the writer branch: ${bodyPathOf(c.row)} — cannot verify/restore`);
  }

  // Pass 2 — verify everything that exists, restore exactly what is missing.
  // NEVER overwrite content that differs: the writer branch is the authority,
  // but a diverged main means a human must look first.
  let restoredBodies = 0;
  let restoredDrafts = 0;
  let verifiedBodies = 0;
  let verifiedDrafts = 0;
  for (const c of cls) {
    if (c.row.status === 'PUBLISHED') { verifiedBodies++; verifiedDrafts++; continue; }
    const mainBody = join(ROOT, bodyPathOf(c.row));
    if (c.bodyOnMain) {
      if (readFileSync(mainBody, 'utf8') !== readFileSync(join(workRoot, bodyPathOf(c.row)), 'utf8')) {
        die(`body of ${c.id} on main differs from the writer branch — main has diverged, fail closed`);
      }
      verifiedBodies++;
    } else {
      copyFileSync(join(workRoot, bodyPathOf(c.row)), mainBody);
      restoredBodies++;
    }
    if (c.entries.length === 0) {
      manifest.articles.push(c.draft); // the draft is already validated against the matrix
      restoredDrafts++;
    } else {
      const e = c.entries[0];
      if (e.title !== c.draft.title || e.description !== c.draft.description
        || (e.published_date ?? '') !== (c.draft.published_date ?? '')) {
        die(`staged manifest entry of ${c.id} differs from the writer draft — main has diverged, fail closed`);
      }
      verifiedDrafts++;
    }
  }
  if (restoredDrafts > 0) writeJson(MANIFEST, manifest);

  const allPublished = cls.every((c) => c.row.status === 'PUBLISHED');
  const completeOnly = allPublished && restoredBodies === 0 && restoredDrafts === 0;
  emit({
    action: 'requeue',
    mode: completeOnly ? 'complete-only' : 'restore',
    batch_id: batchId,
    seq: String(chunk.seq),
    writer: chunk.writer,
    ids: chunk.ids.join(','),
    restored_bodies: String(restoredBodies),
    restored_drafts: String(restoredDrafts),
    verified_bodies: String(verifiedBodies),
    verified_drafts: String(verifiedDrafts),
    dispatch_needed: completeOnly ? 'no' : 'yes',
    note: 'crash-window chunk verified/restored against the writer branch — factory dispatch required',
  });
}

function cmdComplete(args) {
  const [batchId, seqRaw] = args._;
  const a = loadAssignments();
  const b = a.active;
  if (!b || b.batch_id !== batchId) die(`unknown batch: ${batchId}`);
  if (!['ACTIVE', 'COMPLETED'].includes(b.status)) die(`batch ${batchId} is ${b.status}`);
  const chunk = findChunk(b, seqRaw);
  if (chunk.status === 'PUBLISHED') {
    // §6F: a published chunk never re-runs — idempotent no-op.
    emit({ action: 'complete', already: 'true', batch_id: batchId, seq: String(chunk.seq), status: 'PUBLISHED' });
    return;
  }
  if (chunk.status !== 'RESERVED') die(`chunk ${chunk.seq} is ${chunk.status} — only a RESERVED chunk can be marked PUBLISHED`);

  const rows = loadRows();
  for (const id of chunk.ids) {
    const row = rowById(rows, id);
    if (!row || row.status !== 'PUBLISHED') {
      die(`matrix row of ${id} is ${row?.status ?? 'missing'} — the factory has not finished this chunk (kept RESERVED, retry-safe)`);
    }
  }
  chunk.status = 'PUBLISHED';
  chunk.events.push(
    { state: 'PUSHED', at: now() },
    { state: 'FACTORY_PROCESSING', at: now() },
    { state: 'PUBLISHED', at: now() },
  );
  if (b.chunks.every((c) => TERMINAL_CHUNK_STATES.has(c.status))) b.status = 'COMPLETED';
  saveAssignments(a);
  emit({
    action: 'complete',
    already: 'false',
    batch_id: batchId,
    seq: String(chunk.seq),
    ids: chunk.ids.join(','),
    batch_status: b.status,
  });
}

function cmdFail(args) {
  const [batchId, seqRaw] = args._;
  const state = args['--state'] ?? 'failed';
  if (!['failed', 'factory-failed', 'push-failed'].includes(state)) die(`unknown fail state: ${state}`);
  const a = loadAssignments();
  const b = a.active;
  if (!b || b.batch_id !== batchId) die(`unknown batch: ${batchId}`);
  if (!['ACTIVE', 'COMPLETED'].includes(b.status)) die(`batch ${batchId} is ${b.status}`);
  const chunk = findChunk(b, seqRaw);
  if (chunk.status === 'PUBLISHED') die(`chunk ${chunk.seq} is already PUBLISHED — cannot fail`);
  const event = {
    state: state === 'push-failed' ? 'PUSH_FAILED' : state === 'factory-failed' ? 'FACTORY_FAILED' : 'FAILED',
    at: now(),
    ...(args['--reason'] ? { reason: args['--reason'] } : {}),
  };
  let note = 'terminal — ids stay untouched for the REPAIR/BACKLOG pipeline';
  if (state === 'push-failed') {
    chunk.events.push(event); // stays RESERVED: the publisher may safely retry
    note = 'chunk stays RESERVED — a push failure is retry-safe (guards prevent a double push)';
  } else {
    chunk.status = state === 'factory-failed' ? 'FACTORY_FAILED' : 'FAILED';
    chunk.events.push(event);
  }
  if (b.chunks.every((c) => TERMINAL_CHUNK_STATES.has(c.status))) b.status = 'COMPLETED';
  saveAssignments(a);
  emit({
    action: 'fail',
    state,
    batch_id: batchId,
    seq: String(chunk.seq),
    chunk_status: chunk.status,
    batch_status: b.status,
    note,
  });
}

// ---------------------------------------------------------------------------
// CLI entry (only when executed directly — importing the module for its pure
// helpers in tests must not run the command dispatch)
// ---------------------------------------------------------------------------

const USAGE = `usage: writer-queue.mjs <command> [args]
  plan [--limit N] [--dry-run] [--base-sha X]   coordinator: reserve one batch (max ${MAX_BATCH})
  status | validate                              manifest inspection (duplicate -> fail closed)
  next <writer_A|writer_B|writer_C>               next RESERVED chunk of THIS writer only
  begin <writer> <batch> <seq>                    RESERVED -> WRITING (resume-safe)
  ready <writer> <batch> <seq> --drafts F.json    WRITING -> LOCAL_QA_PASS -> READY_TO_PUSH
  abort <writer> <batch> <seq> [--reason X]       writer gives the chunk back (stays reserved)
  select-publish [--work <dir>]                   serialized publisher: next READY_TO_PUSH chunk (FIFO)
  stage <batch> <seq> --work <dir>                copy the 2 bodies + merge drafts into published.json
  verify-push <batch> <seq> --work <dir>          fresh-main verification before the push
  complete <batch> <seq>                          factory finished: mark the chunk PUBLISHED (idempotent)
  fail <batch> <seq> --state failed|factory-failed|push-failed
  requeue <batch> <seq> --work <dir>              §6G crash-window recovery (classify + restore, fail closed)`;

const isMain = process.argv[1]
  && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;

if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (cmd) {
    case 'plan': cmdPlan(args); break;
    case 'status': cmdStatus(); break;
    case 'validate': cmdValidate(); break;
    case 'next': cmdNext(args); break;
    case 'begin': cmdBegin(args); break;
    case 'ready': cmdReady(args); break;
    case 'abort': cmdAbort(args); break;
    case 'select-publish': cmdSelectPublish(args); break;
    case 'stage': cmdStage(args); break;
    case 'verify-push': cmdVerifyPush(args); break;
    case 'complete': cmdComplete(args); break;
    case 'fail': cmdFail(args); break;
    case 'requeue': cmdRequeue(args); break;
    default:
      console.error(USAGE);
      process.exit(cmd ? 1 : 0);
  }
}
