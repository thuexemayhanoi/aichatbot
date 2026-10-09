#!/usr/bin/env node
/**
 * factory-progress.mjs — progress / throughput snapshot (ported from the
 * /vanchinh factory design, adapted to the v68 parallel-writer schema:
 * content-matrix + docs/state/writer-assignments.json).
 *
 * READ-ONLY. Never mutates matrix, manifest or writer-work. Deterministic:
 * same repository state always produces the same JSON.
 *
 * Output (reports/factory-progress.json):
 *   {
 *     generated_at, matrix: { rows, by_status, by_category, published },
 *     writer_batch: { batch_id, status, chunk_states, next_chunk },
 *     throughput: { last_published_date, published_last_7_days }
 *   }
 *
 * `next_chunk` is the lowest-sequence non-terminal chunk of the active
 * writer batch (the FIFO head the publisher will consume next) with its
 * writer, sequence and article ids — the single "what runs next" answer.
 *
 * Usage:
 *   node tools/factory-progress.mjs            # write reports/factory-progress.json
 *   node tools/factory-progress.mjs --stdout   # print JSON, write nothing
 *   node tools/factory-progress.mjs --check     # exit 1 if the report is stale
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECEIPTS_PATH, unverifiedIds } from './factory-verification.mjs';

const ROOT = process.env.MOTOAI_FACTORY_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const MATRIX = join(ROOT, 'data/blog/content-matrix.csv');
const ASSIGNMENTS = join(ROOT, 'docs/state/writer-assignments.json');
const OUT = join(ROOT, 'reports/factory-progress.json');

const TERMINAL = new Set(['PUBLISHED', 'FAILED', 'FACTORY_FAILED']);

function parseCsv(path) {
  const text = readFileSync(path, 'utf8').trim();
  const lines = text.split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

function countBy(rows, key) {
  const c = {};
  for (const r of rows) c[r[key]] = (c[r[key]] ?? 0) + 1;
  return c;
}

export function buildProgress(now = new Date()) {
  const rows = parseCsv(MATRIX);
  const byStatus = countBy(rows, 'status');
  const byCategory = countBy(rows, 'category');
  const publishedRows = rows.filter((r) => r.status === 'PUBLISHED');
  const dates = publishedRows
    .map((r) => (r.published_date ?? '').trim())
    .filter(Boolean)
    .sort();
  const lastPublishedDate = dates.length ? dates[dates.length - 1] : null;
  const cutoff = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
    .toISOString().slice(0, 10);
  const last7 = dates.filter((d) => d >= cutoff).length;

  let writerBatch = null;
  if (existsSync(ASSIGNMENTS)) {
    const m = JSON.parse(readFileSync(ASSIGNMENTS, 'utf8'));
    const b = m.active;
    if (b) {
      const chunkStates = countBy(b.chunks, 'status');
      const head = b.chunks
        .filter((c) => !TERMINAL.has(c.status))
        .sort((x, y) => x.seq - y.seq)[0] ?? null;
      writerBatch = {
        batch_id: b.batch_id,
        status: b.status,
        chunk_states: chunkStates,
        next_chunk: head
          ? { seq: head.seq, writer: head.writer, status: head.status, ids: head.ids }
          : null,
      };
    }
  }

  return {
    generated_at: now.toISOString(),
    matrix: {
      rows: rows.length,
      by_status: byStatus,
      by_category: byCategory,
      published: publishedRows.length,
    },
    production: existsSync(join(ROOT, RECEIPTS_PATH))
      ? { verified: publishedRows.length - unverifiedIds(ROOT).length, awaiting_verification: unverifiedIds(ROOT).length }
      : { verified: null, awaiting_verification: publishedRows.length },
    writer_batch: writerBatch,
    throughput: {
      last_published_date: lastPublishedDate,
      published_last_7_days: last7,
    },
  };
}

function main() {
  const mode = process.argv[2] ?? '';
  const progress = buildProgress();
  const json = JSON.stringify(progress, null, 2) + '\n';
  if (mode === '--stdout') {
    process.stdout.write(json);
    return;
  }
  if (mode === '--check') {
    if (!existsSync(OUT)) { console.error('stale: reports/factory-progress.json missing'); process.exit(1); }
    const current = JSON.parse(readFileSync(OUT, 'utf8'));
    if (JSON.stringify(current.matrix) !== JSON.stringify(progress.matrix)
      || JSON.stringify(current.writer_batch) !== JSON.stringify(progress.writer_batch)) {
      console.error('stale: reports/factory-progress.json does not match repository state');
      process.exit(1);
    }
    console.log('progress report fresh');
    return;
  }
  writeFileSync(OUT, json);
  console.log(`wrote ${OUT} — published ${progress.matrix.published}/${progress.matrix.rows}`);
}

// Run only when invoked directly (tests import buildProgress).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
