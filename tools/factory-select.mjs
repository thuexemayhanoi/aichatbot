#!/usr/bin/env node
/**
 * Factory push selection — detect the EXACT article of this publish cycle.
 *
 * Used by .github/workflows/blog-factory-publish.yml. Deterministic, no AI:
 *   node tools/factory-select.mjs --files <path>   # changed files of the push (one per line)
 *   node tools/factory-select.mjs --id BA-0002     # explicit id (workflow_dispatch)
 *
 * Output (machine readable):
 *   mode=publish id=BA-0002 claim=yes qa=yes  -> auto-claim + scoped QA + publish
 *   mode=skip   id=  reason=…                 -> nothing to do (exit 0)
 *   mode=refuse id=  reason=…                 -> contract violation (exit 1)
 *
 * v65 CONTINUOUS-READY contract (docs/CONTINUOUS-WRITER.md): the writer only
 * pushes an article source + its manifest draft entry — GitHub owns the state
 * transitions. A push containing EXACTLY ONE valid new article source maps to
 * exactly one publish id, even when the matrix row is still PLANNED (the
 * workflow auto-claims it via `blog-factory.mjs prepare`).
 *
 * Refuse rules (writer push violations):
 *   - more than one article body in one push (1 article / cycle);
 *   - a body file whose slug has no matrix row (unknown article);
 *   - a body without a matching manifest draft entry;
 *   - duplicate article_id entries in the manifest;
 *   - a draft for ANOTHER unfinished article still pending (resume it first);
 *   - run state (docs/state/**) pushed by the writer;
 *   - published.json changed without a new article body;
 *   - PUBLISHED rows are never rewritten automatically (skip, manual rebuild);
 *   - remote state always wins over stale writer state.
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

function emit(mode, id, extra = {}) {
  console.log(`mode=${mode}`);
  console.log(`id=${id ?? ''}`);
  if (extra.claim !== undefined) console.log(`claim=${extra.claim ? 'yes' : 'no'}`);
  if (extra.qa !== undefined) console.log(`qa=${extra.qa ? 'yes' : 'no'}`);
  if (extra.reason) console.log(`reason=${extra.reason}`);
  if (mode === 'refuse') process.exit(1);
}

/** Shared candidate validation: matrix row + manifest draft entry + no
 *  other unfinished draft (resume-first rule of the continuous contract). */
function validateCandidate(row) {
  const rows = parseMatrix();
  const byId = new Map(rows.map((r) => [r.article_id, r]));

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const seen = new Set();
  for (const a of manifest.articles) {
    if (seen.has(a.article_id)) {
      return emit('refuse', '', { reason: `duplicate manifest entry for ${a.article_id}` });
    }
    seen.add(a.article_id);
  }
  const entry = manifest.articles.find((a) => a.article_id === row.article_id);
  if (!entry) {
    return emit('refuse', row.article_id, {
      reason: `${row.article_id} has a pushed body but no manifest draft entry in data/blog/published.json`,
    });
  }
  if (entry.slug !== row.slug || entry.body !== `data/blog/articles/${row.slug}.body.html`) {
    return emit('refuse', row.article_id, { reason: `manifest entry of ${row.article_id} does not match the matrix slug/body path` });
  }
  const bodyPath = join(ROOT, entry.body);
  if (!existsSync(bodyPath)) {
    return emit('refuse', row.article_id, { reason: `body file missing on disk: ${entry.body}` });
  }

  // Resume-first: another still-unpublished draft means the previous cycle
  // is unfinished — it must be completed before a new article is accepted.
  const otherDrafts = manifest.articles
    .filter((a) => a.article_id !== row.article_id)
    .filter((a) => byId.get(a.article_id)?.status !== 'PUBLISHED');
  if (otherDrafts.length > 0) {
    return emit('refuse', row.article_id, {
      reason: `unfinished draft(s) pending, resume them first: ${otherDrafts.map((a) => a.article_id).join(', ')}`,
    });
  }

  const claim = ['PLANNED', 'WRITING'].includes(row.status);
  const qa = row.status !== 'PASS';
  emit('publish', row.article_id, { claim, qa });
}

function selectFromFiles(fileListPath) {
  const files = readFileSync(fileListPath, 'utf8').split('\n')
    .map((l) => l.trim()).filter(Boolean);

  // Run state must never travel with a writer push.
  const stateFiles = files.filter((f) => f.startsWith('docs/state/'));
  if (stateFiles.length > 0) {
    return emit('refuse', '', { reason: `writer must never push run state: ${stateFiles.join(', ')}` });
  }

  const bodies = files.filter((f) => BODY_RE.test(f));
  if (bodies.length === 0) {
    if (files.includes('data/blog/published.json')) {
      return emit('refuse', '', { reason: 'published.json changed without a new article body' });
    }
    return emit('skip', '', { reason: 'no article body files in this push' });
  }
  if (bodies.length > 1) {
    return emit('refuse', '', {
      reason: `micro loop allows EXACTLY 1 article per cycle, got ${bodies.length}: ${bodies.join(', ')}`,
    });
  }

  const slug = bodies[0].match(BODY_RE)[1];
  const row = parseMatrix().find((r) => r.slug === slug);
  if (!row) return emit('refuse', '', { reason: `unknown article file (no matrix row): ${bodies[0]}` });
  if (row.status === 'PUBLISHED') {
    // Remote state wins: a PUBLISHED article is never rewritten automatically.
    return emit('skip', row.article_id, { reason: `${row.article_id} already PUBLISHED — manual rebuild only` });
  }
  if (!ACTIONABLE.has(row.status)) {
    return emit('refuse', row.article_id, { reason: `${row.article_id} is ${row.status} — needs human review` });
  }
  validateCandidate(row);
}

function selectById(id) {
  const row = parseMatrix().find((r) => r.article_id === id);
  if (!row) return emit('refuse', '', { reason: `unknown matrix id ${id}` });
  if (row.status === 'PUBLISHED') {
    return emit('skip', id, { reason: `${id} already PUBLISHED` });
  }
  if (!ACTIONABLE.has(row.status)) {
    return emit('refuse', id, { reason: `${id} is ${row.status} — needs human review` });
  }
  validateCandidate(row);
}

const [flag, value] = process.argv.slice(2);
if (flag === '--files' && value) selectFromFiles(value);
else if (flag === '--id' && value) selectById(value);
else {
  console.error('usage: factory-select.mjs --files <changed-file-list> | --id <BA-id>');
  process.exit(2);
}
