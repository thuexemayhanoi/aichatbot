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
 *   qa_ids=...                     # rows needing scoped QA after prepare (claim_ids + QA/REPAIR)
 *   ready_ids=...                  # rows already PASS (publish without re-QA)
 *   reason=...                     # skip/refuse explanation
 *   id=<first scope id>            # legacy single-id field kept for compatibility
 *   mode=refuse ... -> contract violation (exit 1)
 *
 * v67 SIMPLE PRODUCTION MODE (docs/CONTINUOUS-WRITER.md, mirrors /vanchinh):
 * the writer pushes a micro chunk of 2 articles (1 allowed at a corpus
 * boundary); the workflow ceiling is 50 changed bodies per push. NEW /
 * REPAIR / BACKLOG are MUTUALLY EXCLUSIVE scopes — a run never mixes them.
 * Every id maps uniquely to matrix + manifest; PUBLISHED edits never
 * auto-rewrite.
 *
 * Selection rules (deterministic, matrix is truth):
 *   NEW:     pushed bodies on PLANNED/WRITING rows -> claim EXACTLY those
 *            (auto-claim via prepare-chunk). Pushed QA/REPAIR rows in
 *            the SAME push -> scoped QA re-run (they are part of the push).
 *            Pushed PASS rows -> ready (publish without re-QA). Unrelated
 *            pending/backlog rows are NEVER mixed into a NEW run.
 *   REPAIR:  no new bodies pushed, but pushed rows are in
 *            QA/REPAIR/PASS -> process EXACTLY those; never claim PLANNED.
 *   BACKLOG: only when NO article bodies were pushed (--backlog scan or a
 *            push without article files): unfinished rows with a valid draft
 *            (QA/REPAIR/PASS) first, then PLANNED rows whose body +
 *            manifest draft already exist on disk (an earlier workflow died).
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
import { readDlq } from './factory-dlq.mjs';

const ROOT = process.env.MOTOAI_FACTORY_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)), '..');

const BODY_RE = /^data\/blog\/articles\/([^/]+)\.body\.html$/;
/**
 * Rows the factory may (re-)drive automatically.
 * v69: the REVIEW state is retired — a legacy REVIEW row is treated as
 * REPAIR via statusOf() and migrated one-way by blog-factory qa/prepare.
 */
const statusOf = (row) => (row.status === 'REVIEW' ? 'REPAIR' : row.status);
const ACTIONABLE = new Set(['PLANNED', 'WRITING', 'QA', 'REPAIR', 'PASS']);
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
  const deferred = readDlq(ROOT).articles[row.article_id];
  if (deferred && !['RETRY_READY', 'RESOLVED'].includes(deferred.status)) {
    if (!refuse) return null;
    return emit('refuse', { ids: [row.article_id], reason: `bounded QA retry deferred: ${deferred.status}` });
  }
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

/** Classify a scope of rows into claim / qa / ready lists (scope order kept). */
function classify(scopeRows) {
  const claim = [];
  const qa = [];
  const ready = [];
  for (const row of scopeRows) {
    if (['PLANNED', 'WRITING'].includes(row.status)) {
      claim.push(row.article_id); // prepare-chunk: PLANNED/WRITING -> QA, then scoped QA
    }
    if (['PLANNED', 'WRITING', 'QA', 'REPAIR'].includes(statusOf(row))) {
      qa.push(row.article_id); // claimed rows become QA after prepare-chunk
    } else if (statusOf(row) === 'PASS') {
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

/** Unfinished rows NOT part of a push (backlog scan only, /vanchinh style):
 *  recovery net for a dead earlier run. QA/REPAIR/PASS rows with a
 *  valid draft are pending (repair-first); a PLANNED row with a body + valid
 *  draft on disk is backlog (an earlier workflow died before claiming it) —
 *  both are re-triggered without rewriting or re-pushing the article. */
function discoverPending(rows, manifest, pushedIds) {
  const pending = [];
  const backlog = [];
  for (const row of rows) {
    if (pushedIds.has(row.article_id)) continue;
    if (row.status === 'PUBLISHED') continue;
    if (!ACTIONABLE.has(statusOf(row))) continue; // FAIL/BLOCKED need a human
    if (!validDraft(row, manifest, { refuse: false })) continue;
    if (row.status === 'PLANNED') backlog.push(row);
    else pending.push(row); // WRITING/QA/REPAIR/PASS — resume/repair first
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
    if (!ACTIONABLE.has(statusOf(row))) {
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

  // SIMPLE PRODUCTION MODE (v67, mirrors /vanchinh): NEW / REPAIR are derived
  // from THIS push only — mutually exclusive, never mixed with unrelated
  // pending/backlog rows. Unfinished rows NOT in the push are picked up by a
  // repair push (body edit) or the --backlog scan, never auto-mixed here.
  const idSort = (a, b) => a.article_id.localeCompare(b.article_id);
  const newRows = pushed.filter((r) => ['PLANNED', 'WRITING'].includes(r.status)).sort(idSort);
  const repairRows = pushed.filter((r) => ['QA', 'REPAIR'].includes(statusOf(r))).sort(idSort);
  const readyRows = pushed.filter((r) => r.status === 'PASS').sort(idSort);
  if (newRows.length > 0) {
    // NEW: claim EXACTLY the pushed PLANNED/WRITING rows. Pushed repair rows
    // ride along (same push, /vanchinh semantics); pushed PASS rows publish
    // without re-QA. Nothing outside the push is ever claimed or re-QA'd.
    // Scope is sorted by article_id so the printed ids are deterministic.
    emit('new', classify([...newRows, ...repairRows, ...readyRows].sort(idSort)));
  } else {
    // REPAIR: re-QA exactly the pushed QA/REPAIR rows; pushed PASS rows
    // publish without re-QA. NEVER claims fresh PLANNED rows.
    emit('repair', classify([...repairRows, ...readyRows].sort(idSort)));
  }
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
    if (!ACTIONABLE.has(statusOf(row))) {
      return emit('refuse', { ids: [id], reason: `${id} is ${statusOf(row)} — needs human review` });
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
