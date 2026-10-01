#!/usr/bin/env node
/**
 * Factory push selection — derive the EXACT article scope of a publish run.
 *
 * Used by .github/workflows/blog-factory-publish.yml. Deterministic, no AI:
 *   node tools/factory-select.mjs --files <path>    # changed files of the push (one per line)
 *   node tools/factory-select.mjs --ids BA-0002,BA-0003   # explicit ids (workflow_dispatch)
 *   node tools/factory-select.mjs --backlog        # manual backlog scan (no push files)
 *
 * Output (machine readable, sed-friendly):
 *   mode=new|repair|backlog|skip
 *   proceed=true|false
 *   ids=BA-0002,BA-0003            # full scope, deterministic priority order
 *   claim_ids=...                  # rows the workflow must prepare (PLANNED/WRITING + backlog)
 *   qa_ids=...                     # rows needing scoped QA after prepare (claim_ids + QA/REVIEW/REPAIR)
 *   ready_ids=...                  # rows already PASS (publish without re-QA)
 *   reason=...                     # skip/refuse explanation
 *   id=<first scope id>            # legacy single-id field kept for compatibility
 *   mode=refuse ... -> contract violation (exit 1)
 *
 * v66 TWO-ARTICLE MICRO BATCH (docs/CONTINUOUS-WRITER.md): the writer pushes a
 * micro chunk of 2 articles (1 allowed at a corpus boundary); the workflow
 * ceiling is 50 changed bodies per push, mirroring /vanchinh. Every id maps
 * uniquely to matrix + manifest; PUBLISHED edits never auto-rewrite;
 * unfinished repair/resume rows take priority over new PLANNED work.
 *
 * Selection rules (deterministic, matrix is truth):
 *   NEW:     pushed bodies on PLANNED/WRITING rows -> claim (auto-claim via
 *            prepare-chunk). Pushed QA/REVIEW/REPAIR rows -> scoped QA re-run.
 *            Pushed PASS rows -> ready (publish without re-QA).
 *   REPAIR:  no new bodies pushed, but pushed/known rows are in
 *            QA/REVIEW/REPAIR/PASS -> process EXACTLY those; never claim PLANNED.
 *   BACKLOG: PLANNED rows whose body + valid manifest draft already exist on
 *            disk (an earlier workflow died) are discovered deterministically —
 *            no re-push needed to retrigger them.
 *   PENDING: rows NOT in this push that are still unfinished (QA/REVIEW/
 *            REPAIR/PASS with a valid draft) always win before new work.
 *   SKIP:    nothing actionable (PUBLISHED-only edit, tooling-only push).
 *
 * Refuse rules (writer push violations):
 *   - more than 50 changed article bodies in one push (workflow ceiling);
 *   - a body file whose slug has no matrix row (unknown article);
 *   - duplicate slug/path in the push; duplicate article_id in the manifest;
 *   - a pushed body without a matching manifest draft entry;
 *   - a manifest entry that does not match the matrix slug/body path;
 *   - a body file missing on disk;
 *   - run state (docs/state/**) pushed by the writer;
 *   - published.json changed without a new article body;
 *   - FAIL/BLOCKED rows pushed (needs human review);
 *   - PUBLISHED rows are never rewritten automatically (skip, manual rebuild).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMatrix, MATRIX, MANIFEST } from './blog-factory.mjs';

const ROOT = process.env.MOTOAI_FACTORY_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)), '..');

const BODY_RE = /^data\/blog\/articles\/([^/]+)\.body\.html$/;
/** Rows the factory may (re-)drive automatically. */
const ACTIONABLE = new Set(['PLANNED', 'WRITING', 'QA', 'REVIEW', 'REPAIR', 'PASS']);
/** Workflow ceiling per push, mirroring /vanchinh (writer canonical chunk = 2). */
export const MAX_PUSH_BODIES = 50;

function emit(mode, { ids = [], claim = [], qa = [], ready = [], reason = '' } = {}) {
  const list = (xs) => xs.join(',');
  console.log(`mode=${mode}`);
  console.log(`proceed=${mode !== 'skip' && mode !== 'refuse' ? 'true' : 'false'}`);
  console.log(`ids=${list(ids)}`);
  console.log(`claim_ids=${list(claim)}`);
  console.log(`qa_ids=${list(qa)}`);
  console.log(`ready_ids=${list(ready)}`);
  console.log(`id=${ids[0] ?? ''}`); // legacy field kept for older tooling
  if (reason) console.log(`reason=${reason}`);
  if (mode === 'refuse') process.exit(1);
}

/** Manifest integrity: duplicate article_id entries are a hard refuse. */
function loadManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const seen = new Set();
  for (const a of manifest.articles) {
    if (seen.has(a.article_id)) {
      emit('refuse', { reason: `duplicate manifest entry for ${a.article_id}` });
    }
    seen.add(a.article_id);
  }
  return manifest;
}

/** A row is publishable-in-principle when its manifest draft is valid and the
 *  body exists on disk. Refuses on any mismatch (contract violation). */
function validDraft(row, manifest, { refuse = true } = {}) {
  const entry = manifest.articles.find((a) => a.article_id === row.article_id);
  if (!entry) {
    if (!refuse) return null;
    return emit('refuse', {
      ids: [row.article_id],
      reason: `${row.article_id} has a pushed body but no manifest draft entry in data/blog/published.json`,
    });
  }
  if (entry.slug !== row.slug || entry.body !== `data/blog/articles/${row.slug}.body.html`) {
    if (!refuse) return null;
    return emit('refuse', {
      ids: [row.article_id],
      reason: `manifest entry of ${row.article_id} does not match the matrix slug/body path`,
    });
  }
  if (!existsSync(join(ROOT, entry.body))) {
    if (!refuse) return null;
    return emit('refuse', {
      ids: [row.article_id],
      reason: `body file missing on disk: ${entry.body}`,
    });
  }
  return entry;
}

/** Classify a scope of rows into claim / qa / ready lists (scope order kept:
 *  resume/repair rows first, then pushed, then backlog). */
function classify(scopeRows) {
  const claim = [];
  const qa = [];
  const ready = [];
  for (const row of scopeRows) {
    if (['PLANNED', 'WRITING'].includes(row.status)) {
      claim.push(row.article_id); // prepare-chunk: PLANNED/WRITING -> QA, then scoped QA
    }
    if (['PLANNED', 'WRITING', 'QA', 'REVIEW', 'REPAIR'].includes(row.status)) {
      qa.push(row.article_id); // claimed rows become QA after prepare-chunk
    } else if (row.status === 'PASS') {
      ready.push(row.article_id);
    }
  }
  return {
    ids: scopeRows.map((r) => r.article_id),
    claim,
    qa,
    ready,
  };
}

/** Unfinished rows NOT part of the push: resume/repair priority + backlog
 *  discovery. A PLANNED row with a body + valid draft on disk is backlog (an
 *  earlier workflow died before claiming it) — it must be re-triggered
 *  without rewriting or re-pushing the article. */
function discoverPending(rows, manifest, pushedIds) {
  const pending = [];
  const backlog = [];
  for (const row of rows) {
    if (pushedIds.has(row.article_id)) continue;
    if (row.status === 'PUBLISHED') continue;
    if (!ACTIONABLE.has(row.status)) continue; // FAIL/BLOCKED need a human
    if (!validDraft(row, manifest, { refuse: false })) continue;
    if (row.status === 'PLANNED') backlog.push(row);
    else pending.push(row); // WRITING/QA/REVIEW/REPAIR/PASS — resume/repair first
  }
  return { pending, backlog };
}

function selectFromFiles(fileListPath) {
  const files = readFileSync(fileListPath, 'utf8').split('\n')
    .map((l) => l.trim()).filter(Boolean);

  // Run state must never travel with a writer push.
  const stateFiles = files.filter((f) => f.startsWith('docs/state/'));
  if (stateFiles.length > 0) {
    return emit('refuse', { reason: `writer must never push run state: ${stateFiles.join(', ')}` });
  }

  const bodies = files.filter((f) => BODY_RE.test(f));
  const manifest = loadManifest();
  const rows = parseMatrix();

  if (bodies.length === 0) {
    if (files.includes('data/blog/published.json')) {
      return emit('refuse', { reason: 'published.json changed without a new article body' });
    }
    // No article bodies in this push: deterministic backlog scan.
    const { pending, backlog } = discoverPending(rows, manifest, new Set());
    if (pending.length + backlog.length === 0) {
      return emit('skip', { reason: 'no article body files in this push and no backlog' });
    }
    const scope = [...pending, ...backlog].slice(0, MAX_PUSH_BODIES);
    const out = classify(scope);
    return emit(pending.length > 0 ? 'repair' : 'backlog', { ...out, reason: pending.length > 0 ? 'resume pending drafts before new work' : 'backlog: PLANNED rows with unprocessed drafts on disk' });
  }

  if (bodies.length > MAX_PUSH_BODIES) {
    return emit('refuse', {
      reason: `push touches ${bodies.length} article bodies; workflow ceiling is ${MAX_PUSH_BODIES} (canonical writer chunk = 2) — split the push deterministically`,
    });
  }

  // Map every changed body to exactly one matrix row.
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const seenPaths = new Set();
  const pushed = [];
  const publishedEdits = [];
  const refused = [];
  for (const body of bodies) {
    const slug = body.match(BODY_RE)[1];
    if (seenPaths.has(slug)) {
      return emit('refuse', { reason: `duplicate body path in the push: ${body}` });
    }
    seenPaths.add(slug);
    const row = bySlug.get(slug);
    if (!row) {
      return emit('refuse', { reason: `unknown article file (no matrix row): ${body}` });
    }
    if (row.status === 'PUBLISHED') {
      // Remote state wins: a PUBLISHED article is never rewritten automatically.
      publishedEdits.push(row);
      continue;
    }
    if (!ACTIONABLE.has(row.status)) {
      refused.push(row);
      continue;
    }
    validDraft(row, manifest); // refuses on any manifest/body mismatch
    pushed.push(row);
  }
  if (refused.length > 0) {
    return emit('refuse', {
      ids: refused.map((r) => r.article_id),
      reason: `${refused.map((r) => `${r.article_id} is ${r.status}`).join('; ')} — needs human review`,
    });
  }
  if (pushed.length === 0) {
    return emit('skip', {
      ids: publishedEdits.map((r) => r.article_id),
      reason: `${publishedEdits.map((r) => r.article_id).join(', ')} already PUBLISHED — manual rebuild only`,
    });
  }

  // Resume/repair priority: unfinished rows NOT in this push are processed
  // in the same run, BEFORE the newly pushed articles.
  const pushedIds = new Set(pushed.map((r) => r.article_id));
  const { pending, backlog } = discoverPending(rows, manifest, pushedIds);

  // Priority order = trim order: resume/repair rows win, then the pushed
  // articles (the trigger), then backlog. Anything beyond the ceiling stays
  // discoverable by the next run's pending/backlog scan.
  const scope = [...pending, ...pushed, ...backlog].slice(0, MAX_PUSH_BODIES);
  const isNew = pushed.some((r) => ['PLANNED', 'WRITING'].includes(r.status));
  const out = classify(scope);
  const mode = isNew ? 'new'
    : pushed.some((r) => ['QA', 'REVIEW', 'REPAIR', 'PASS'].includes(r.status)) ? 'repair'
      : 'backlog';
  emit(mode, out);
}

function selectByIds(rawIds) {
  const wanted = [...new Set(rawIds.split(',').map((s) => s.trim()).filter(Boolean))];
  const manifest = loadManifest();
  const rows = parseMatrix();
  const scope = [];
  for (const id of wanted) {
    const row = rows.find((r) => r.article_id === id);
    if (!row) return emit('refuse', { reason: `unknown matrix id ${id}` });
    if (row.status === 'PUBLISHED') {
      return emit('skip', { ids: [id], reason: `${id} already PUBLISHED — manual rebuild only` });
    }
    if (!ACTIONABLE.has(row.status)) {
      return emit('refuse', { ids: [id], reason: `${id} is ${row.status} — needs human review` });
    }
    validDraft(row, manifest);
    scope.push(row);
  }
  const out = classify(scope);
  emit(scope.some((r) => ['PLANNED', 'WRITING'].includes(r.status)) ? 'new' : 'repair', out);
}

const [flag, value] = process.argv.slice(2);
if (flag === '--files' && value) selectFromFiles(value);
else if (flag === '--ids' && value) selectByIds(value);
else if (flag === '--id' && value) selectByIds(value); // legacy alias
else if (flag === '--backlog') {
  // Manual scan: same deterministic path as a push with no article bodies.
  const manifest = loadManifest();
  const rows = parseMatrix();
  const { pending, backlog } = discoverPending(rows, manifest, new Set());
  if (pending.length + backlog.length === 0) {
    emit('skip', { reason: 'no pending drafts and no backlog' });
  } else {
    const scope = [...pending, ...backlog].slice(0, MAX_PUSH_BODIES);
    const out = classify(scope);
    emit(pending.length > 0 ? 'repair' : 'backlog', { ...out, reason: 'manual scan' });
  }
} else {
  console.error('usage: factory-select.mjs --files <changed-file-list> | --ids <BA-id,...> | --id <BA-id> | --backlog');
  process.exit(2);
}
