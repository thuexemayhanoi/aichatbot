/** Bounded content retry ledger. No AI, network, body editing or lock release. */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const DLQ_PATH = 'docs/state/factory-dead-letter.json';
export const MAX_CONTENT_CYCLES = 3;
export const RETRY_DELAY_MS = 30 * 60 * 1000;
export const emptyDlq = () => ({ schema_version: 1, articles: {}, handled_runs: [] });
export function readDlq(root) {
  const path = join(root, DLQ_PATH);
  const dlq = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : emptyDlq();
  if (dlq.schema_version !== 1 || !dlq.articles || !Array.isArray(dlq.handled_runs)) throw new Error('invalid dead-letter ledger');
  for (const [id, entry] of Object.entries(dlq.articles)) {
    if (!/^BA-\d{4}$/.test(id) || !Number.isInteger(entry.cycles) || entry.cycles < 1
      || !['RETRY_WAIT', 'RETRY_READY', 'DEAD_LETTER', 'RESOLVED'].includes(entry.status)) throw new Error(`invalid DLQ entry ${id}`);
  }
  return dlq;
}
export function saveDlq(root, dlq) {
  const path = join(root, DLQ_PATH); mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(dlq, null, 2) + '\n');
}
export function deferContent(assignments, dlq, evidence, rows, entries, now = Date.now()) {
  if (dlq.handled_runs.includes(evidence.run_id)) return false;
  if (evidence.status !== 'DEFERRED' || evidence.failure_kind !== 'CONTENT'
    || !/^\d+$/.test(evidence.run_id ?? '') || !/^[a-f0-9]{40}$/.test(evidence.code_sha ?? '')
    || !Array.isArray(evidence.ids) || !evidence.ids.includes(evidence.failed_id)) throw new Error('unverified content deferral');
  const batch = assignments.active, chunk = batch?.chunks.find((c) => c.seq === evidence.seq);
  if (batch?.batch_id !== evidence.batch || batch.status !== 'ACTIVE' || chunk?.status !== 'RESERVED'
    || JSON.stringify(chunk.ids) !== JSON.stringify(evidence.ids)) throw new Error('stale deferral assignment');
  for (const id of chunk.ids) {
    if (rows.filter((r) => r.article_id === id && r.status === 'PLANNED').length !== 1
      || entries.some((entry) => entry.article_id === id)) throw new Error(`cannot defer live/staged/unknown article ${id}`);
  }
  // Only the refused article spends a content cycle. Its untouched partner
  // becomes eligible for a later batch, rather than dying with a bad pair.
  for (const id of [evidence.failed_id]) {
    const previous = dlq.articles[id];
    const cycles = (previous?.cycles ?? 0) + 1;
    dlq.articles[id] = { article_id: id, status: cycles >= MAX_CONTENT_CYCLES ? 'DEAD_LETTER' : 'RETRY_WAIT',
      cycles, next_retry_at: new Date(now + RETRY_DELAY_MS * cycles).toISOString(),
      reason: String(evidence.reason ?? '').slice(0, 1500), failed_id: evidence.failed_id,
      evidence_runs: [...(previous?.evidence_runs ?? []), evidence.run_id], code_sha: evidence.code_sha };
  }
  chunk.status = 'FAILED';
  chunk.events.push({ state: 'CONTENT_DEFERRED', at: new Date(now).toISOString(), run_id: evidence.run_id, reason: 'bounded retry / dead-letter queue; no article published' });
  if (batch.chunks.every((c) => ['PUBLISHED', 'FAILED', 'FACTORY_FAILED'].includes(c.status))) batch.status = 'COMPLETED';
  dlq.handled_runs.push(evidence.run_id);
  return true;
}
export function promoteRetries(dlq, rows, now = Date.now(), verifiedIds = new Set()) {
  let changed = false;
  for (const [id, entry] of Object.entries(dlq.articles)) {
    const row = rows.find((r) => r.article_id === id);
    if (row?.status === 'PUBLISHED' && verifiedIds.has(id) && entry.status !== 'RESOLVED') { entry.status = 'RESOLVED'; changed = true; }
    else if (['PLANNED', 'REPAIR'].includes(row?.status) && entry.status === 'RETRY_WAIT' && Date.parse(entry.next_retry_at) <= now) { entry.status = 'RETRY_READY'; changed = true; }
  }
  return changed;
}

/** Scoped factory QA evidence, never a license to edit the draft. */
export function deferStaged(dlq, evidence, rows, entries, now = Date.now()) {
  if (dlq.handled_runs.includes(evidence.run_id)) return false;
  if (evidence.kind !== 'CONTENT_QA' || !/^\d+$/.test(evidence.run_id ?? '')
    || !/^[a-f0-9]{40}$/.test(evidence.code_sha ?? '') || !Array.isArray(evidence.fail_ids)
    || !evidence.fail_ids.length || new Set(evidence.fail_ids).size !== evidence.fail_ids.length) throw new Error('unverified scoped QA evidence');
  for (const id of evidence.fail_ids) {
    const matches = rows.filter((r) => r.article_id === id && r.status === 'REPAIR');
    if (matches.length !== 1 || entries.filter((e) => e.article_id === id && e.slug === matches[0].slug).length !== 1) throw new Error(`stale scoped QA evidence ${id}`);
  }
  for (const id of evidence.fail_ids) {
    const old = dlq.articles[id], cycles = (old?.cycles ?? 0) + 1;
    dlq.articles[id] = { article_id: id, stage: 'QA', cycles,
      status: cycles >= MAX_CONTENT_CYCLES ? 'DEAD_LETTER' : 'RETRY_WAIT',
      next_retry_at: new Date(now + RETRY_DELAY_MS * cycles).toISOString(),
      reason: 'Scoped production QA refused the staged draft; source retained unchanged.',
      evidence_runs: [...(old?.evidence_runs ?? []), evidence.run_id], code_sha: evidence.code_sha };
  }
  dlq.handled_runs.push(evidence.run_id);
  return true;
}
