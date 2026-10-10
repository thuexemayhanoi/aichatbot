/** Deterministic FIX stage: canonical anchors in UNPUBLISHED drafts only. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInternalAnchors, sanitizeDraftAnchors, createSiteIo } from './site-audit.mjs';
import { matrixRows } from './factory-verification.mjs';

const ROOT = process.env.MOTOAI_FACTORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
export function fixDraftLinks(root, ids) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some((id) => !/^BA-\d{4}$/.test(id))) throw new Error('invalid FIX scope');
  const rows = matrixRows(readFileSync(join(root, 'data/blog/content-matrix.csv'), 'utf8'));
  const entries = JSON.parse(readFileSync(join(root, 'data/blog/published.json'), 'utf8')).articles;
  const io = createSiteIo(root), changes = [];
  // Validate the entire scope before making any change.
  for (const id of ids) {
    const matches = rows.filter((r) => r.article_id === id);
    if (matches.length !== 1 || !['PLANNED', 'WRITING', 'QA', 'REPAIR', 'PASS'].includes(matches[0].status)) throw new Error(`FIX refuses live/unknown/blocked article ${id}`);
    const row = matches[0], drafts = entries.filter((e) => e.article_id === id);
    if (drafts.length !== 1 || drafts[0].slug !== row.slug || drafts[0].body !== `data/blog/articles/${row.slug}.body.html` || !io.exists(drafts[0].body)) throw new Error(`FIX source mismatch ${id}`);
    const path = drafts[0].body, before = io.read(path);
    const normalized = normalizeInternalAnchors(before, row.output_path, io.exists);
    const after = sanitizeDraftAnchors(normalized, row.output_path, io.exists,
      { legalGate: row.source_policy === 'legal-gate' });
    if (after !== before) changes.push({ path, after });
  }
  for (const { path, after } of changes) writeFileSync(join(root, path), after);
  return changes.map((c) => c.path);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { console.log('FIX canonical anchors:', JSON.stringify(fixDraftLinks(ROOT, (process.argv[2] ?? '').split(',').filter(Boolean)))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
