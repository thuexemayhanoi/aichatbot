#!/usr/bin/env node
/**
 * Blog content factory — resumable, transactional publish pipeline.
 *
 * v64 LIGHTWEIGHT MICRO LOOP: production contract = 1 ARTICLE / CYCLE.
 * (v58 chunk contract `claim <=10` is retired.)
 *
 * State machine per article (data/blog/content-matrix.csv `status`):
 *   PLANNED -> WRITING -> QA -> PASS -> PUBLISHED
 *   (+ REVIEW / REPAIR (max 3) / FAIL / BLOCKED)
 * Only PASS articles may publish. Writing is NEVER automatic here;
 * writing happens in explicit writer runs (see docs/BLOG-FACTORY.md).
 *
 * Commands:
 *   node tools/blog-factory.mjs status
 *   node tools/blog-factory.mjs validate
 *   node tools/blog-factory.mjs lock            (create run lock)
 *   node tools/blog-factory.mjs unlock
 *   node tools/blog-factory.mjs claim [BA-id]   (EXACTLY 1 article: next PLANNED, or the given id)
 *   node tools/blog-factory.mjs finish <BA-id>  (WRITING -> QA; finish-chunk alias kept)
 *   node tools/blog-factory.mjs qa <BA-id>      (scoped deterministic QA: PASS or REVIEW/BLOCKED)
 *   node tools/blog-factory.mjs publish <BA-id> (single-article transaction)
 *   node tools/blog-factory.mjs resume          (recover an interrupted publish)
 *   node tools/blog-factory.mjs abandon-chunk   (crash recovery: WRITING -> PLANNED)
 *   node tools/blog-factory.mjs checkpoint
 *
 * Transaction semantics: marker -> write -> verify consistency -> clear marker.
 * Never depends on chat/session memory; state lives in the repo files only.
 * QA is deterministic PASS/FAIL (tools/article-qa.mjs) — this repo has no
 * article-level numeric score, so none is invented here.
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build-blog.mjs';
import { SITE } from './app-shell.mjs';
import { scopedQa } from './article-qa.mjs';

const ROOT = process.env.MOTOAI_FACTORY_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)), '..');
export const MATRIX = join(ROOT, 'data/blog/content-matrix.csv');
export const MANIFEST = join(ROOT, 'data/blog/published.json');
const LOCK = join(ROOT, 'docs/state/blog-factory.lock');
const TX = join(ROOT, 'docs/state/blog-factory.transaction.json');
const REPORT = join(ROOT, 'reports/blog-factory-run.md');
const CHECKPOINT = join(ROOT, 'docs/state/blog-factory.checkpoint.json');

const read = (p) => readFileSync(p, 'utf8');
const write = (p, s) => writeFileSync(p, s, 'utf8');

/** Parse the matrix CSV into row objects (schema and order untouched). */
export function parseMatrix() {
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

/** Checkpoint helpers (operational state only; the matrix is the source of truth). */
function loadCheckpoint() {
  return existsSync(CHECKPOINT) ? JSON.parse(read(CHECKPOINT)) : { claimed: [], finished: [] };
}

function saveCheckpoint(cp) {
  cp.updated = new Date().toISOString();
  write(CHECKPOINT, JSON.stringify(cp, null, 2) + '\n');
}

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
    // v64 page-level verify: self-canonical + Article/BreadcrumbList schema + one H1.
    const page = okPage ? read(pagePath) : '';
    const expectedUrl = SITE + row.output_path.replace(/index\.html$/, '');
    const canonical = (page.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '';
    const okCanonical = canonical === expectedUrl;
    const okSchema = /"@type":\s*"Article"/.test(page) && /"@type":\s*"BreadcrumbList"/.test(page);
    const okH1 = (page.match(/<h1\b/g) || []).length === 1;
    if (!(okPage && okMatrix && okSitemap && okCanonical && okSchema && okH1)) {
      throw new Error(`verify failed: page=${okPage} matrix=${okMatrix} sitemap=${okSitemap} canonical=${okCanonical} schema=${okSchema} h1=${okH1}`);
    }
    txClear();
    const cp = loadCheckpoint();
    cp.finished = (cp.finished ?? []).filter((x) => x !== id);
    cp.claimed = (cp.claimed ?? []).filter((x) => x !== id);
    saveCheckpoint(cp);
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
    const cp = loadCheckpoint();
    cp.finished = (cp.finished ?? []).filter((x) => x !== tx.article_id);
    cp.claimed = (cp.claimed ?? []).filter((x) => x !== tx.article_id);
    saveCheckpoint(cp);
    report(`RESUMED ${tx.article_id} — rebuild verified, marker cleared`);
    console.log(`resumed ${tx.article_id} OK`);
  } else {
    console.error('resume verify failed — marker retained');
    process.exit(1);
  }
  void now;
}

/**
 * v64 micro loop claim — EXACTLY ONE article per cycle (lock required).
 * - no argument: take the first PLANNED row (matrix order)
 * - BA-id: take exactly that row (must still be PLANNED)
 * - numeric chunk sizes are refused: the chunk contract is retired.
 * Happy path invariant: at most ONE row is WRITING at any time.
 */
function claim(argId) {
  if (!existsSync(LOCK)) { console.error('refusing to claim without the run lock'); process.exit(1); }
  if (argId && /^\d+$/.test(argId)) {
    console.error('chunk claiming removed (v64): production is 1 article / cycle — pass a BA-id or omit the argument');
    process.exit(1);
  }
  const rows = parseMatrix();
  const inFlight = rows.find((r) => r.status === 'WRITING');
  if (inFlight) {
    console.error(`refuse: ${inFlight.article_id} is already WRITING — finish or abandon-chunk it first (1 article / cycle)`);
    process.exit(1);
  }
  let row;
  if (argId) {
    row = rows.find((r) => r.article_id === argId);
    if (!row) { console.error(`unknown matrix id ${argId}`); process.exit(1); }
    if (row.status !== 'PLANNED') { console.error(`refuse: ${argId} status is ${row.status} (only PLANNED may be claimed)`); process.exit(1); }
  } else {
    row = rows.find((r) => r.status === 'PLANNED');
    if (!row) { console.log('claim: nothing PLANNED available'); return; }
  }
  row.status = 'WRITING';
  saveMatrix(rows);
  const cp = loadCheckpoint();
  cp.claimed = [...new Set([...(cp.claimed ?? []), row.article_id])];
  saveCheckpoint(cp);
  report(`CLAIM 1: ${row.article_id}`);
  console.log(`claimed 1: ${row.article_id}`);
}

/** finish: WRITING -> QA for exactly one article (writer's job done). */
function finish(id) {
  if (!id || !/^BA-\d{4}$/.test(id)) { console.error('finish <BA-id>'); process.exit(1); }
  finishChunk(id);
}

/** finish-chunk: WRITING rows of the given ids -> QA (kept for compatibility;
 *  the micro loop passes exactly one id). */
function finishChunk(ids) {
  if (!ids || ids.length === 0) { console.error('finish-chunk <id,id,...>'); process.exit(1); }
  const want = new Set(ids.split(',').map((s) => s.trim()).filter(Boolean));
  const rows = parseMatrix();
  const done = [];
  for (const r of rows) {
    if (want.has(r.article_id) && r.status === 'WRITING') { r.status = 'QA'; done.push(r.article_id); }
  }
  if (done.length === 0) { console.error('no WRITING rows matched'); process.exit(1); }
  saveMatrix(rows);
  const cp = loadCheckpoint();
  cp.finished = [...new Set([...(cp.finished ?? []), ...done])];
  cp.claimed = (cp.claimed ?? []).filter((id2) => !done.includes(id2));
  saveCheckpoint(cp);
  report(`FINISH ${done.join(', ')}`);
  console.log(`finished ${done.length}: ${done.join(', ')}`);
}

/**
 * Scoped QA for exactly one article (deterministic PASS/FAIL — no numeric
 * article score exists in this repo, so none is invented).
 * PASS -> status PASS; failure -> REVIEW (repair_attempts++, BLOCKED after 3).
 */
function qa(id, now) {
  if (!id || !/^BA-\d{4}$/.test(id)) { console.error('qa <BA-id>'); process.exit(1); }
  const rows = parseMatrix();
  const row = rows.find((r) => r.article_id === id);
  if (!row) { console.error(`unknown matrix id ${id}`); process.exit(1); }
  if (!['QA', 'REVIEW', 'REPAIR'].includes(row.status)) {
    console.error(`refuse: ${id} status is ${row.status} (qa runs on QA/REVIEW/REPAIR rows)`);
    process.exit(1);
  }
  const result = scopedQa(id);
  for (const c of result.checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : ` — ${c.detail}`}`);
  }
  if (result.pass) {
    setRowStatus(id, 'PASS', { quality_status: 'PASS', last_checked: now });
    report(`QA PASS ${id}`);
    console.log(`QA PASS ${id} — ready to publish`);
  } else {
    const attempts = Number(row.repair_attempts || 0) + 1;
    if (attempts > 3) {
      setRowStatus(id, 'BLOCKED', { quality_status: 'FAIL', repair_attempts: attempts, last_checked: now });
      report(`QA FAIL ${id} -> BLOCKED (repair overflow)`);
      console.error(`QA FAIL ${id} -> BLOCKED (repair overflow): ${result.failures.join(', ')}`);
    } else {
      setRowStatus(id, 'REVIEW', { quality_status: 'FAIL', repair_attempts: attempts, last_checked: now });
      report(`QA FAIL ${id} -> REVIEW (attempt ${attempts})`);
      console.error(`QA FAIL ${id} -> REVIEW (attempt ${attempts}): ${result.failures.join(', ')}`);
    }
    process.exit(1);
  }
}

/**
 * v65 continuous-ready prepare — the state transitions the writer no longer
 * performs by hand. Idempotent, lock required, driven by the publish
 * workflow after factory-select picks the exact article:
 *   PLANNED -> claim exact id -> finish -> QA
 *   WRITING -> finish -> QA
 *   QA/REVIEW/REPAIR/PASS -> no-op (resume/QA/publish continue from there)
 * Any other status refuses (human review).
 */
function prepare(id) {
  if (!id || !/^BA-\d{4}$/.test(id)) { console.error('prepare <BA-id>'); process.exit(1); }
  if (!existsSync(LOCK)) { console.error('refusing to prepare without the run lock'); process.exit(1); }
  const row = parseMatrix().find((r) => r.article_id === id);
  if (!row) { console.error(`unknown matrix id ${id}`); process.exit(1); }
  if (row.status === 'PLANNED') {
    claim(id);
    finish(id);
  } else if (row.status === 'WRITING') {
    finish(id);
  } else if (['QA', 'REVIEW', 'REPAIR', 'PASS'].includes(row.status)) {
    console.log(`prepare: ${id} already at ${row.status}`);
  } else {
    console.error(`refuse: ${id} status is ${row.status} — needs human review`);
    process.exit(1);
  }
}

/** abandon-chunk: return still-WRITING rows to PLANNED after a crashed run. */
function abandonChunk(ids) {
  const want = ids ? new Set(ids.split(',').map((s) => s.trim()).filter(Boolean)) : null;
  const rows = parseMatrix();
  let returned = 0;
  for (const r of rows) {
    if (r.status !== 'WRITING') continue;
    if (want && !want.has(r.article_id)) continue;
    r.status = 'PLANNED';
    returned++;
  }
  if (returned === 0) { console.log('abandon-chunk: nothing to return'); return; }
  saveMatrix(rows);
  const cp = loadCheckpoint();
  cp.claimed = [];
  saveCheckpoint(cp);
  report(`ABANDON returned ${returned} row(s) to PLANNED`);
  console.log(`returned ${returned} row(s) to PLANNED`);
}

function showCheckpoint() {
  if (!existsSync(CHECKPOINT)) { console.log('checkpoint: none'); return; }
  const cp = JSON.parse(read(CHECKPOINT));
  console.log(`checkpoint updated ${cp.updated ?? '?'}`);
  console.log(`  claimed (in flight): ${(cp.claimed ?? []).length}`);
  console.log(`  finished (awaiting publish): ${(cp.finished ?? []).length}`);
}

/** Serialize the parsed matrix back to CSV (schema and order untouched). */
function saveMatrix(rows) {
  const header = read(MATRIX).trim().split('\n')[0];
  const cols = header.split(',');
  write(MATRIX, [header, ...rows.map((r) => cols.map((c) => r[c] ?? '').join(','))].join('\n') + '\n');
}

const isCli = typeof process !== 'undefined' && process.argv && process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isCli) {
  const [cmd, arg] = process.argv.slice(2);
  const now = new Date().toISOString().slice(0, 10);
  switch (cmd) {
    case 'status': status(); break;
    case 'validate': validate(); break;
    case 'lock': lock(now); break;
    case 'unlock': unlock(); break;
    case 'publish': publish(arg, now); break;
    case 'resume': resume(now); break;
    case 'claim': claim(arg); break;
    case 'finish': finish(arg); break;
    case 'finish-chunk': finishChunk(arg); break;
    case 'qa': qa(arg, now); break;
    case 'prepare': prepare(arg); break;
    case 'abandon-chunk': abandonChunk(arg); break;
    case 'checkpoint': showCheckpoint(); break;
    default:
      console.log('usage: blog-factory.mjs status | validate | lock | unlock | claim [BA-id] | finish <BA-id> | prepare <BA-id> | qa <BA-id> | publish <BA-id> | resume | abandon-chunk [ids|all] | checkpoint');
  }
}
