#!/usr/bin/env node
/**
 * Factory push selection — detect the EXACT article of this publish cycle.
 *
 * Used by .github/workflows/blog-factory-publish.yml. Deterministic, no AI:
 *   node tools/factory-select.mjs --files <path>   # changed article body files (one per line)
 *   node tools/factory-select.mjs --id BA-0002     # explicit id (workflow_dispatch)
 *
 * Output (machine readable):
 *   mode=publish id=BA-0002    -> run scoped QA + publish for EXACTLY this article
 *   mode=skip   id=  reason=…  -> nothing to do (exit 0)
 *   mode=refuse id=  reason=…  -> contract violation (exit 1)
 *
 * Micro-loop contract (v64): exactly ONE article per cycle. A push touching
 * more than one article body REFUSES — the writer must cycle one article at
 * a time. PUBLISHED-row body edits are a shell rebuild / repair, not a
 * publish: skip (republish of published articles is a separate manual task).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMatrix } from './blog-factory.mjs';

const ROOT = process.env.MOTOAI_FACTORY_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)), '..');

const QA_STATUSES = new Set(['QA', 'PASS', 'REVIEW', 'REPAIR']);

function emit(mode, id, reason) {
  console.log(`mode=${mode}`);
  console.log(`id=${id ?? ''}`);
  if (reason) console.log(`reason=${reason}`);
  if (mode === 'refuse') process.exit(1);
}

function selectFromFiles(fileListPath) {
  const files = readFileSync(fileListPath, 'utf8').split('\n')
    .map((l) => l.trim()).filter(Boolean)
    .filter((f) => /^data\/blog\/articles\/[^/]+\.body\.html$/.test(f));
  if (files.length === 0) return emit('skip', '', 'no article body files in this push');
  const rows = parseMatrix();
  const candidates = [];
  const problems = [];
  for (const f of files) {
    const slug = f.split('/').pop().replace(/\.body\.html$/, '');
    const row = rows.find((r) => r.slug === slug);
    if (!row) { problems.push(`unknown article file (no matrix row): ${f}`); continue; }
    if (row.status === 'PUBLISHED') continue; // shell rebuild / repair of a published article
    if (QA_STATUSES.has(row.status)) candidates.push(row.article_id);
    else problems.push(`${row.article_id} is ${row.status} — run "claim ${row.article_id}" + "finish ${row.article_id}" first`);
  }
  if (candidates.length === 0) {
    if (problems.length > 0) return emit('refuse', '', problems.join('; '));
    return emit('skip', '', 'no QA/PASS article in this push');
  }
  const unique = [...new Set(candidates)];
  if (unique.length > 1) {
    return emit('refuse', '', `micro loop allows EXACTLY 1 article per cycle, got ${unique.length}: ${unique.join(', ')}`);
  }
  emit('publish', unique[0]);
}

function selectById(id) {
  const rows = parseMatrix();
  const row = rows.find((r) => r.article_id === id);
  if (!row) return emit('refuse', '', `unknown matrix id ${id}`);
  if (row.status === 'PUBLISHED') return emit('skip', id, `${id} already PUBLISHED`);
  if (!QA_STATUSES.has(row.status)) {
    return emit('refuse', '', `${id} is ${row.status} — run "claim ${id}" + "finish ${id}" first`);
  }
  emit('publish', id);
}

const [flag, value] = process.argv.slice(2);
if (flag === '--files' && value) selectFromFiles(value);
else if (flag === '--id' && value) selectById(value);
else {
  console.error('usage: factory-select.mjs --files <changed-file-list> | --id <BA-id>');
  process.exit(2);
}
