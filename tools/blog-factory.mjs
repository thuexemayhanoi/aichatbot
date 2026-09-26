#!/usr/bin/env node
/**
 * Blog content factory — resumable, transactional publish pipeline.
 *
 * State machine per article (data/blog/content-matrix.csv `status`):
 *   PLANNED -> WRITING -> QA -> PASS -> PUBLISHED
 *   (+ REVIEW / REPAIR (max 3) / FAIL / BLOCKED)
 * Only PASS articles may publish. Mass writing is NEVER automatic here;
 * writing happens in scheduled runs (see docs/BLOG-FACTORY.md).
 *
 * Commands:
 *   node tools/blog-factory.mjs status
 *   node tools/blog-factory.mjs validate
 *   node tools/blog-factory.mjs lock            (create run lock)
 *   node tools/blog-factory.mjs unlock
 *   node tools/blog-factory.mjs publish <BA-id> (single-article transaction)
 *   node tools/blog-factory.mjs resume         (recover an interrupted publish)
 *
 * Transaction semantics: marker -> write -> verify consistency -> clear marker.
 * Never depends on chat/session memory; state lives in the repo files only.
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build-blog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MATRIX = join(ROOT, 'data/blog/content-matrix.csv');
const MANIFEST = join(ROOT, 'data/blog/published.json');
const LOCK = join(ROOT, 'docs/state/blog-factory.lock');
const TX = join(ROOT, 'docs/state/blog-factory.transaction.json');
const REPORT = join(ROOT, 'reports/blog-factory-run.md');

const read = (p) => readFileSync(p, 'utf8');
const write = (p, s) => writeFileSync(p, s, 'utf8');

function parseMatrix() {
  const lines = read(MATRIX).trim().split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    const row = {}; header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

function status() {
  const rows = parseMatrix();
  const by = {};
  for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
  console.log('total:', rows.length);
  for (const [k, v] of Object.entries(by)) console.log(`  ${k}: ${v}`);
  console.log('lock:', existsSync(LOCK) ? 'HELD (interrupted run?)' : 'free');
  console.log('transaction:', existsSync(TX) ? read(TX) : 'none');
}

function validate() {
  const rows = parseMatrix();
  const errs = [];
  const ids = new Set(); const slugs = new Set(); const paths = new Set();
  const dist = { APP: 0, RENT: 0, EV: 0, GUIDE: 0, SAFE: 0, LOCAL: 0 };
  for (const r of rows) {
    if (ids.has(r.article_id)) errs.push(`dup id ${r.article_id}`);
    if (slugs.has(r.slug)) errs.push(`dup slug ${r.slug}`);
    if (paths.has(r.output_path)) errs.push(`dup path ${r.output_path}`);
    ids.add(r.article_id); slugs.add(r.slug); paths.add(r.output_path);
    if (!(r.category in dist)) errs.push(`bad category ${r.category}`);
    else dist[r.category]++;
    if (r.category === 'SAFE' && r.source_policy !== 'legal-gate') errs.push(`SAFE without legal gate: ${r.article_id}`);
    if (Number(r.repair_attempts) > 3) errs.push(`repair overflow ${r.article_id}`);
  }
  const expected = { APP: 350, RENT: 400, EV: 300, GUIDE: 300, SAFE: 250, LOCAL: 400 };
  for (const k of Object.keys(expected)) if (dist[k] !== expected[k]) errs.push(`dist ${k}: ${dist[k]} != ${expected[k]}`);
  if (rows.length !== 2000) errs.push(`rows ${rows.length} != 2000`);
  if (errs.length > 0) { console.error('FAIL\n' + errs.join('\n')); process.exit(1); }
  console.log('matrix OK: 2000 rows, 40x50, distribution exact, unique ids/slugs/paths');
}

function lock(now) {
  if (existsSync(LOCK)) { console.error('lock already held:', read(LOCK)); process.exit(1); }
  write(LOCK, JSON.stringify({ held_at: now, pid: process.pid }, null, 2));
  console.log('lock created');
}

function unlock() {
  if (!existsSync(LOCK)) { console.log('no lock'); return; }
  rmSync(LOCK); console.log('lock released');
}

function setRowStatus(id, statusValue, extra = {}) {
  const lines = read(MATRIX).split('\n');
  const header = lines[0].split(',');
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    if (cells[0] !== id) continue;
    cells[3] = statusValue;
    for (const [col, val] of Object.entries(extra)) {
      const idx = header.indexOf(col);
      if (idx >= 0 && val !== undefined) cells[idx] = val;
    }
    lines[i] = cells.join(',');
  }
  write(MATRIX, lines.join('\n'));
}

function report(line) {
  const stamp = new Date().toISOString().slice(0, 10);
  const prev = existsSync(REPORT) ? read(REPORT) : '# Blog factory run log\n\n';
  write(REPORT, prev + `- ${stamp} ${line}\n`);
}

function txWrite(id) {
  write(TX, JSON.stringify({ article_id: id, phase: 'write', started: new Date().toISOString() }, null, 2));
}

function txPhase(phase) {
  const tx = JSON.parse(read(TX));
  tx.phase = phase;
  write(TX, JSON.stringify(tx, null, 2));
}

function txClear() { if (existsSync(TX)) rmSync(TX); }

/** Publish one article: marker -> write -> verify -> clear marker. */
function publish(id, now) {
  const manifest = JSON.parse(read(MANIFEST));
  const article = manifest.articles.find((a) => a.article_id === id);
  if (!article) { console.error(`article ${id} not in data/blog/published.json`); process.exit(1); }
  if (!existsSync(join(ROOT, article.body))) { console.error(`body partial missing: ${article.body}`); process.exit(1); }
  const rows = parseMatrix();
  const row = rows.find((r) => r.article_id === id);
  if (!row) { console.error(`unknown matrix id ${id}`); process.exit(1); }
  if (!['PASS', 'PUBLISHED'].includes(row.status)) {
    console.error(`refuse: ${id} status is ${row.status} (only PASS may publish)`);
    process.exit(1);
  }

  txWrite(id);
  try {
    setRowStatus(id, 'PUBLISHED', { published_date: article.published_date, last_checked: now });
    txPhase('build');
    build(); // regenerates pages, indexes, sitemap, matrix sync
    txPhase('verify');
    const pagePath = join(ROOT, row.output_path);
    const okPage = existsSync(pagePath);
    const fresh = parseMatrix().find((r) => r.article_id === id);
    const okMatrix = fresh.status === 'PUBLISHED';
    const sitemap = read(join(ROOT, 'sitemap.xml'));
    const okSitemap = sitemap.includes(row.output_path.replace(/index\.html$/, ''));
    if (!(okPage && okMatrix && okSitemap)) {
      throw new Error(`verify failed: page=${okPage} matrix=${okMatrix} sitemap=${okSitemap}`);
    }
    txClear();
    report(`PUBLISHED ${id} (${article.slug}) — page, matrix, indexes, sitemap consistent`);
    console.log(`published ${id} -> ${row.output_path}`);
  } catch (error) {
    // Marker stays on disk: `resume` rebuilds from the manifest (source of truth).
    console.error('transaction failed, marker retained for resume:', error.message);
    process.exit(1);
  }
}

/** Resume: rebuild everything from the manifest and clear a stale marker. */
function resume(now) {
  if (!existsSync(TX)) { console.log('no transaction marker — nothing to resume'); return; }
  const tx = JSON.parse(read(TX));
  build();
  const row = parseMatrix().find((r) => r.article_id === tx.article_id);
  if (row?.status === 'PUBLISHED' && existsSync(join(ROOT, row.output_path))) {
    txClear();
    report(`RESUMED ${tx.article_id} — rebuild verified, marker cleared`);
    console.log(`resumed ${tx.article_id} OK`);
  } else {
    console.error('resume verify failed — marker retained');
    process.exit(1);
  }
  void now;
}

const [cmd, arg] = process.argv.slice(2);
const now = new Date().toISOString().slice(0, 10);
switch (cmd) {
  case 'status': status(); break;
  case 'validate': validate(); break;
  case 'lock': lock(now); break;
  case 'unlock': unlock(); break;
  case 'publish': publish(arg, now); break;
  case 'resume': resume(now); break;
  default:
    console.log('usage: blog-factory.mjs status | validate | lock | unlock | publish <BA-id> | resume');
}
