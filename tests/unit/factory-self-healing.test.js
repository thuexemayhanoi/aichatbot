import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { SITE } from '../../src/config/site.js';
import { verifyPublications, saveReceipts, receiptValid, RECEIPTS_PATH, unverifiedIds } from '../../tools/factory-verification.mjs';
import { readPublicationBudget } from '../../tools/factory-target.mjs';
import { fixDraftLinks } from '../../tools/factory-fix.mjs';
import { emptyDlq, deferContent, deferStaged, promoteRetries, saveDlq, MAX_CONTENT_CYCLES, RETRY_DELAY_MS } from '../../tools/factory-dlq.mjs';
import { selectCandidateIds } from '../../tools/writer-queue.mjs';
import { activeProduction, decision, retryTechnicalRead, unobservedIntent } from '../../tools/factory-controller.mjs';
import { generateLongform } from '../../tools/auto-writer-longform.mjs';

const sha = 'a'.repeat(40);
const write = (root, path, value) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), value); };
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'factory-proof-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const row = { article_id: 'BA-0311', status: 'PUBLISHED', slug: 'draft-311', output_path: 'blog/draft-311/index.html' };
  const entry = { article_id: row.article_id, slug: row.slug, body: 'data/blog/articles/draft-311.body.html' };
  const body = '<p>Original article; never rewritten.</p>';
  write(root, 'data/blog/content-matrix.csv', 'article_id,status,slug,output_path\nBA-0311,PUBLISHED,draft-311,blog/draft-311/index.html\nBA-0312,PLANNED,draft-312,blog/draft-312/index.html\n');
  write(root, 'data/blog/published.json', JSON.stringify({ articles: [entry] }));
  write(root, entry.body, body);
  write(root, row.output_path, `<link rel="canonical" href="${SITE}blog/draft-311/"><main>${body}</main>`);
  write(root, 'sitemap.xml', `<urlset><url><loc>${SITE}blog/draft-311/</loc></url></urlset>`);
  const content = Object.fromEntries(['data/blog/published.json', 'data/blog/content-matrix.csv', 'sitemap.xml', row.output_path]
    .map((path) => [path.replace(/index\.html$/, ''), readFileSync(join(root, path), 'utf8')]));
  const fetchImpl = async (url) => ({ status: 200, url, text: async () => content[url.slice(SITE.length)] });
  return { root, row, entry, body, content, fetchImpl };
}

test('publication needs exact production page, canonical, unique manifest, matrix and both sitemaps', async (t) => {
  const f = fixture(t);
  const proof = await verifyPublications({ ...f, ids: ['BA-0311'], sha });
  assert.ok(receiptValid(proof['BA-0311'], f.row, f.entry, f.body));
  assert.equal(existsSync(join(f.root, RECEIPTS_PATH)), false, 'observing proof is read-only');
  saveReceipts(f.root, proof);
  assert.equal(readPublicationBudget(f.root).published, 1);
  assert.equal(readPublicationBudget(f.root).complete, false);
  assert.deepEqual(unverifiedIds(f.root), []);
  write(f.root, f.entry.body, f.body + '<p>Tampered.</p>');
  assert.equal(readPublicationBudget(f.root).published, 0, 'changed body invalidates publication evidence');
  assert.equal(readPublicationBudget(f.root).unverified, 1);
});

test('HTTP failures, wrong origin, stale pages and duplicate live evidence cannot create PUBLISHED', async (t) => {
  for (const kind of ['http', 'origin', 'page', 'manifest', 'matrix', 'sitemap', 'canonical']) {
    const f = fixture(t);
    const fetchImpl = async (url) => {
      let text = f.content[url.slice(SITE.length)];
      if (kind === 'page' && url.endsWith('/draft-311/')) text += 'stale';
      if (kind === 'manifest' && url.endsWith('/published.json')) text = JSON.stringify({ articles: [f.entry, f.entry] });
      if (kind === 'matrix' && url.endsWith('/content-matrix.csv')) text = text.replace('PUBLISHED', 'PASS');
      if (kind === 'sitemap' && url.endsWith('/sitemap.xml')) text += `<loc>${SITE}blog/draft-311/</loc>`;
      return { status: kind === 'http' ? 404 : 200, url: kind === 'origin' ? 'https://other.example/' : url, text: async () => text };
    };
    if (kind === 'canonical') write(f.root, f.row.output_path, '<p>No canonical.</p>');
    await assert.rejects(verifyPublications({ ...f, fetchImpl, ids: ['BA-0311'], sha }), undefined, kind);
    assert.equal(existsSync(join(f.root, RECEIPTS_PATH)), false);
  }
});

test('staged and duplicate IDs never count as production publications', async (t) => {
  const f = fixture(t);
  await assert.rejects(verifyPublications({ ...f, ids: ['BA-0312'], sha }), /evidence/);
  await assert.rejects(verifyPublications({ ...f, ids: ['BA-0311', 'BA-0311'], sha }), /ids/);
  saveReceipts(f.root, {});
  assert.equal(readPublicationBudget(f.root).published, 0);
  assert.equal(readPublicationBudget(f.root).unverified, 1);
});

test('FIX changes only known directory anchors of unpublished drafts and is idempotent', (t) => {
  const f = fixture(t);
  write(f.root, 'data/blog/content-matrix.csv', readFileSync(join(f.root, 'data/blog/content-matrix.csv'), 'utf8').replace('BA-0311,PUBLISHED', 'BA-0311,QA'));
  write(f.root, 'blog/an-toan/luat-giao-thong-duong-bo-co-ban-cho-du-khach/index.html', 'known page');
  write(f.root, 'blog/an-toan/nong-do-con-khi-lai-xe-cho-du-khach/index.html', 'known page');
  const path = '/blog/an-toan/luat-giao-thong-duong-bo-co-ban-cho-du-khach';
  const second = '/blog/an-toan/nong-do-con-khi-lai-xe-cho-du-khach';
  const untouched = `<a href="${path}?x=1">query</a><a href="${path}#part">hash</a><a href="/assets/icon.svg">file</a><img src="${path}"><a href="/unknown">unknown</a>`;
  write(f.root, f.entry.body, `<a href="${path}">one</a><a href='${second}'>two</a>${untouched}`);
  assert.deepEqual(fixDraftLinks(f.root, ['BA-0311']), [f.entry.body]);
  const fixed = readFileSync(join(f.root, f.entry.body), 'utf8');
  assert.ok(fixed.includes(`href="${path}/"`) && fixed.includes(`href='${second}/'`));
  assert.ok(fixed.endsWith(untouched));
  assert.deepEqual(fixDraftLinks(f.root, ['BA-0311']), []);
});

test('FIX refuses any live article or invalid scope before writing anything', (t) => {
  const f = fixture(t);
  assert.throws(() => fixDraftLinks(f.root, ['BA-0311']), /live/);
  assert.throws(() => fixDraftLinks(f.root, ['BA-9999', 'BA-0311']), /unknown/);
  assert.equal(readFileSync(join(f.root, f.entry.body), 'utf8'), f.body);
});

const fresh = () => ({ active: { batch_id: 'WRITER-BATCH-0014', status: 'ACTIVE', chunks: [
  { seq: 1, status: 'RESERVED', ids: ['BA-0317', 'BA-0318'], events: [] },
  { seq: 2, status: 'RESERVED', ids: ['BA-0319', 'BA-0320'], events: [] },
] } });
const rows = ['BA-0317', 'BA-0318', 'BA-0319', 'BA-0320'].map((article_id) => ({ article_id, status: 'PLANNED', slug: article_id }));
const evidence = (run) => ({ status: 'DEFERRED', failure_kind: 'CONTENT', run_id: String(run), code_sha: sha,
  batch: 'WRITER-BATCH-0014', seq: 1, ids: ['BA-0317', 'BA-0318'], failed_id: 'BA-0317', reason: 'QA refused unsupported facts' });

test('a refused article defers only itself, preserves its partner and releases the next chunk', () => {
  const assignments = fresh(), dlq = emptyDlq();
  assert.ok(deferContent(assignments, dlq, evidence(42), rows, [], 0));
  assert.equal(assignments.active.chunks[0].status, 'FAILED');
  assert.equal(assignments.active.chunks[1].status, 'RESERVED');
  assert.equal(assignments.active.status, 'ACTIVE');
  assert.equal(dlq.articles['BA-0317'].status, 'RETRY_WAIT');
  assert.equal(dlq.articles['BA-0318'], undefined);
  assert.equal(deferContent(assignments, dlq, evidence(42), rows, [], 0), false, 'run evidence consumed once');
});

test('three refused cycles enter dead letter; time and raw PUBLISHED cannot bypass proof', () => {
  const dlq = emptyDlq();
  for (let n = 1; n <= MAX_CONTENT_CYCLES; n++) {
    deferContent(fresh(), dlq, evidence(n), rows, [], n * RETRY_DELAY_MS);
    promoteRetries(dlq, rows, 1e12);
    assert.equal(dlq.articles['BA-0317'].status, n === MAX_CONTENT_CYCLES ? 'DEAD_LETTER' : 'RETRY_READY');
  }
  const published = rows.map((r) => ({ ...r, status: 'PUBLISHED' }));
  assert.equal(promoteRetries(dlq, published, 1e12), false);
  assert.ok(promoteRetries(dlq, published, 1e12, new Set(['BA-0317'])));
  assert.equal(dlq.articles['BA-0317'].status, 'RESOLVED');
});

test('stale reservations, staged/live partners and infrastructure errors cannot spend content cycles', () => {
  for (const bad of [{ ...evidence(1), seq: 2 }, { ...evidence(1), failure_kind: 'INFRA' }, { ...evidence(1), failed_id: 'BA-0001' }]) {
    const assignments = fresh(), dlq = emptyDlq(), before = JSON.stringify(assignments);
    assert.throws(() => deferContent(assignments, dlq, bad, rows, []));
    assert.equal(JSON.stringify(assignments), before);
    assert.deepEqual(dlq.articles, {});
  }
  assert.throws(() => deferContent(fresh(), emptyDlq(), evidence(1), rows, [{ article_id: 'BA-0318' }]), /staged/);
});

test('dead-letter and cooldown articles are skipped; other eligible IDs continue', (t) => {
  const { root } = fixture(t), dlq = emptyDlq();
  dlq.articles['BA-0317'] = { cycles: 3, status: 'DEAD_LETTER' };
  dlq.articles['BA-0318'] = { cycles: 1, status: 'RETRY_WAIT' };
  dlq.articles['BA-0319'] = { cycles: 1, status: 'RETRY_READY' };
  saveDlq(root, dlq);
  assert.deepEqual(selectCandidateIds(rows, { articles: [] }, root), ['BA-0319', 'BA-0320']);
});

test('scoped factory QA defers only REPAIR rows, never live content or its passing partner', () => {
  const dlq = emptyDlq(), entry = { article_id: 'BA-0317', slug: 'BA-0317' };
  const staged = rows.map((r) => ({ ...r, status: r.article_id === 'BA-0317' ? 'REPAIR' : 'PUBLISHED' }));
  const proof = { kind: 'CONTENT_QA', run_id: '44', code_sha: sha, fail_ids: ['BA-0317'] };
  deferStaged(dlq, proof, staged, [entry], 0);
  assert.equal(dlq.articles['BA-0317'].stage, 'QA');
  assert.equal(dlq.articles['BA-0318'], undefined);
  assert.throws(() => deferStaged(emptyDlq(), { ...proof, fail_ids: ['BA-0318'] }, staged, [entry]), /stale/);
});

test('maintenance recovery requires Agent #4 terminal, green suites and Agent #5 unspent; never releases a lock', () => {
  const input = { ops: { production_enabled: true, active_incident: null }, green: true, locks: false, busy: false, complete: false, proofMissing: false };
  assert.equal(decision({ ...input, pending: true }), 'RETRY_FACTORY');
  assert.equal(decision({ ...input, ops: { production_enabled: false } }), 'OWNER_STOP');
  assert.equal(decision({ ...input, locks: true }), 'LOCKED');
  for (const status of ['OPEN', 'AGENT5_WORKING', 'FAILED_MANUAL']) {
    const action = decision({ ...input, locks: true, ops: { ...input.ops, active_incident: { status, attempts: { agent5: 0 } } } });
    assert.ok(['WAIT_MAINTENANCE', 'FAILED_MANUAL'].includes(action));
  }
  const ops = { ...input.ops, active_incident: { status: 'AGENT4_SUCCESS', attempts: { agent5: 0 } } };
  assert.equal(decision({ ...input, ops, locks: true, incidentPhase: 'RECOVER_INCIDENT' }), 'RECOVER_INCIDENT');
  assert.equal(decision({ ...input, ops, locks: true, green: false }), 'WAIT_MAINTENANCE');
  assert.equal(decision({ ...input, busy: true, complete: true }), 'WAIT');
});

test('queued equivalents and unobserved durable dispatch intents prevent overlapping writers', () => {
  const now = Date.parse('2026-10-09T00:00:00Z');
  const run = { id: 2, path: '.github/workflows/auto-writer.yml', status: 'queued', created_at: new Date(now).toISOString() };
  assert.equal(activeProduction([run, { ...run, id: 3, status: 'completed' }], 1).length, 1);
  const intent = { workflow: 'auto-writer.yml', at: new Date(now).toISOString() };
  assert.equal(unobservedIntent(intent, [], now + 1000), true);
  assert.equal(unobservedIntent(intent, [run], now + 1000), false);
  assert.equal(unobservedIntent(intent, [], now + 16 * 60 * 1000), false);
});

test('known transient reads retry at most three times; QA and permissions fail immediately', () => {
  let calls = 0;
  assert.equal(retryTechnicalRead(() => { if (++calls < 3) throw new Error('HTTP 503'); return 'ok'; }), 'ok');
  assert.equal(calls, 3);
  calls = 0;
  assert.throws(() => retryTechnicalRead(() => { calls++; throw new Error('HTTP 429'); }), /429/);
  assert.equal(calls, 3);
  for (const message of ['HTTP 403', 'QA FAIL: connection reset', 'duplicate source', 'unknown failure']) {
    calls = 0;
    assert.throws(() => retryTechnicalRead(() => { calls++; throw new Error(message); }));
    assert.equal(calls, 1);
  }
});

test('model content refusals retain bounded retry classification; transport failures remain infrastructure', async () => {
  let calls = 0;
  await assert.rejects(generateLongform({ model: 'local', system: '', user: '', needsChunks: false, config: {} }, async () => {
    calls++; return { content: 'not JSON' };
  }), (error) => error.code === 'WRITER_CONTENT_REFUSED');
  assert.equal(calls, 2);
  await assert.rejects(generateLongform({ model: 'local', system: '', user: '', needsChunks: false, config: {} }, async () => ({ error: true, status: 503, text: 'offline' })),
    (error) => !error.code && /503/.test(error.message));
});

test('failed controller lookups fail closed before model loading', (t) => {
  const { root } = fixture(t);
  write(root, 'node', '#!/bin/bash\nif [[ "$*" == *factory-controller* ]]; then exit 1; fi\necho unexpected-writer-call; exit 2\n');
  const result = spawnSync('chmod', ['+x', join(root, 'node')]); assert.equal(result.status, 0);
  const yml = readFileSync(new URL('../../.github/workflows/auto-writer.yml', import.meta.url), 'utf8');
  const block = yml.split("- name: 'Inspect queue before loading the model (resume staged chunks)'")[1].split('\n      - name:')[0];
  const script = block.split('        run: |\n')[1].split('\n').map((l) => l.replace(/^          /, '')).join('\n');
  const run = spawnSync('bash', ['-e', '-c', script], { cwd: root, encoding: 'utf8', env: { ...process.env,
    PATH: `${root}:${process.env.PATH}`, DRY_RUN: 'false', SMOKE_ONLY: 'false', GITHUB_OUTPUT: join(root, 'outputs') } });
  assert.equal(run.status, 1);
  assert.ok(!run.stdout.includes('unexpected-writer-call'));
});
