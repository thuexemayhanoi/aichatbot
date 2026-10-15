/**
 * v72 Autonomous SEO Engine 06 (ZERO-DATA): keyword clustering, matrix
 * actions, priority formula, decisions and content flags, owner-only
 * proposals, and committed reports that come from the tool. The engine reuses
 * the cold-start research (SERP snapshots, measured volumes); nothing here is
 * estimated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clusterKeywords, assessGroup, engineContext, runEngine, render, priorityOf, normUrl, landing,
  OUT_DIR, DECISIONS_PATH, ACTION_LABEL
} from '../../tools/seo-engine.mjs';
import { loadConfig } from '../../tools/seo-cold-start.mjs';
import { parseCsv } from '../../tools/seo-index-coverage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const cfg = loadConfig(ROOT);
// One research pass shared by every test (the cold-start analysis reads all bodies).
const context = engineContext(ROOT);
const engine = runEngine(ROOT, { health: false, context });
const groupOf = (kw) => engine.groups.find((g) => g.members.some((m) => m.keyword === kw));

const kw = (keyword, volume, article = null, status = 'COVERED') => ({
  keyword, volume, scope: 'IN-SCOPE', intent: 'informational', origin: 'test',
  match: article ? { status, article: { id: article }, score: status === 'COVERED' ? 1 : 0.5 } : { status: 'GAP', article: null, score: 0 }
});
const serp = (query, urls) => ({ query, raw: { organic: urls.map((url, i) => ({ position: i + 1, url })) } });

test('clustering: spelling/abbreviation variants merge, different intents stay apart, out-of-scope ignored', () => {
  const { groups, edges } = clusterKeywords([
    kw('không có bằng lái xe máy phạt bao nhiêu', 5400, 'BA-0029'),
    kw('k có bằng lái xe máy phạt bao nhiêu', 5400, 'BA-0029'),
    kw('mức phạt nồng độ cồn xe máy', 5400, 'BA-0011'),
    { ...kw('thuê xe máy hà nội', 40000), scope: 'SISTER' }
  ], [], cfg);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.length).sort(), [1, 2]);
  assert.ok(edges.lexical >= 1 && edges.serp.length === 0);
  assert.ok(!groups.flat().some((m) => m.keyword === 'thuê xe máy hà nội'), 'sister-owned keyword never clustered here');
});

test('clustering: Google answering two queries with ≥ 3 shared top-10 URLs makes them one intent', () => {
  const a = ['https://a.vn/1', 'https://www.b.vn/2/', 'https://c.vn/3', 'https://d.vn/4'];
  const keywords = [kw('mũ bảo hiểm đạt chuẩn', 900), kw('nón bảo hiểm tốt', 300), kw('gương chiếu hậu', 200)];
  const three = clusterKeywords(keywords, [serp('mũ bảo hiểm đạt chuẩn', a), serp('nón bảo hiểm tốt', ['https://b.vn/2', 'https://a.vn/1', 'https://c.vn/3']),
    serp('gương chiếu hậu', ['https://a.vn/1', 'https://x.vn/9'])], cfg);
  assert.equal(three.groups.length, 2);
  assert.deepEqual(three.edges.serp, [['mũ bảo hiểm đạt chuẩn', 'nón bảo hiểm tốt', 3]]);
  assert.equal(normUrl('https://www.B.vn/2/'), normUrl('https://b.vn/2'), 'www and trailing slash do not split a URL');
  const two = clusterKeywords(keywords, [serp('mũ bảo hiểm đạt chuẩn', a), serp('nón bảo hiểm tốt', ['https://a.vn/1', 'https://c.vn/3'])], cfg);
  assert.equal(two.groups.length, 3, 'two shared URLs are not enough');
});

test('priority formula: measured volume × opportunity × SERP feasibility × visibility, nothing estimated', () => {
  assert.equal(priorityOf({ demand: 1000, action: 'NEW_ARTICLE', serpIntent: 'Thông tin' }), 1000);
  assert.equal(priorityOf({ demand: 1000, action: 'ALIGN_META', serpIntent: 'Hỗn hợp (thương mại + thông tin)' }), 180);
  assert.equal(priorityOf({ demand: 1000, action: 'ADD_SECTION', serpIntent: 'Thông tin', ownBest: 14 }), 1050, 'page 2 is the best lever');
  assert.equal(priorityOf({ demand: 1000, action: 'ADD_SECTION', serpIntent: 'Thông tin', ownBest: 4 }), 350);
  assert.equal(priorityOf({ demand: 1000, action: 'LOCAL_ONLY', serpIntent: 'Giao dịch – địa phương' }), 0);
  assert.equal(priorityOf({ demand: 0, action: 'NEW_ARTICLE', toolIntent: 'informational' }), 0, 'unmeasured demand never ranks');
  for (const g of engine.groups) assert.equal(g.measured === 0 ? g.priority : 0, 0, `${g.id}: unmeasured groups score 0`);
  for (const a of Object.keys(ACTION_LABEL)) assert.ok(Number.isFinite(priorityOf({ demand: 10, action: a, serpIntent: 'Thông tin' })), a);
});

test('matrix actions follow the evidence: local SERPs, reviewed topics, exact titles, decisions', () => {
  // Transactional-local SERP (driving schools / shops in the local pack): no blog work.
  const licence = groupOf('bằng lái xe máy');
  assert.ok(licence.serp.local && ['LOCAL_ONLY', 'KEEP'].includes(licence.action), licence.action);
  // Curated (reviewed) topics are new articles after checking the official text, in their own cluster —
  // until the article exists: a done decision with a published target settles the group on that page.
  const ev = groupOf('xe máy điện có cần bằng lái không');
  assert.equal(ev.decision?.status, 'done');
  assert.equal(ev.target.id, 'BA-2001');
  assert.equal(ev.action, 'KEEP');
  assert.equal(ev.cluster, 'K09');
  assert.equal(landing(ev), ev.target.url);
  const pending = engine.curated.filter((t) => !['done', 'rejected', 'deferred'].includes(t.decision?.status));
  for (const t of pending) for (const gid of t.groups) {
    const g = engine.groups.find((x) => x.id === gid);
    assert.equal(g.action, 'NEW_ARTICLE_VERIFY', `${gid}: open reviewed topic`);
    assert.equal(landing(g), '(bài mới)');
  }
  // A page whose title already carries the phrase is kept.
  const drink = groupOf('mức phạt nồng độ cồn xe máy');
  assert.equal(drink.action, 'KEEP');
  assert.equal(drink.target.id, 'BA-0011');
  // Rejected / deferred decisions never reach the action queue.
  const decisions = JSON.parse(read(DECISIONS_PATH)).decisions;
  for (const [key, d] of Object.entries(decisions)) {
    assert.ok(['done', 'planned', 'deferred', 'rejected'].includes(d.status) && ACTION_LABEL[d.action] && /^\d{4}-\d{2}-\d{2}$/.test(d.date), key);
    const g = engine.groups.find((x) => x.id === key);
    if (g && ['deferred', 'rejected'].includes(d.status)) assert.ok(!engine.briefs.includes(g), `${key}: closed decision not briefed`);
  }
});

test('content flags: an open flag blocks keyword work (FIX_FIRST), a resolved one does not', () => {
  const { cs, ctx } = context;
  const { groups } = clusterKeywords(cs.keywords, cs.serps, cs.cfg);
  const members = groups.find((m) => m.some((k) => k.keyword === 'bằng lái xe máy a1'));
  const clean = assessGroup(members, ctx);
  assert.notEqual(clean.action, 'FIX_FIRST', 'BA-0122 was corrected: its flag is resolved');
  const flagged = assessGroup(members, { ...ctx, flags: new Map([[clean.target.id, 'nội dung lỗi thời (thử nghiệm)']]) });
  assert.equal(flagged.action, 'FIX_FIRST');
  assert.ok(flagged.priority > 0);
  for (const f of cs.cfg.content_flags ?? []) {
    assert.ok(/^BA-\d{4}$/.test(f.article) && f.reason, `${f.article}: flag has an article and a reason`);
    if (f.resolved) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(f.resolved) && f.fix, `${f.article}: a resolved flag says when and how`);
  }
  // A recorded target is honoured and the decision attaches to its group.
  const id = clean.id;
  const decided = assessGroup(members, { ...ctx, decisions: { [id]: { action: clean.action, status: 'done', date: '2026-10-14', target: clean.target.id } } });
  assert.equal(decided.decision?.status, 'done');
});

test('proposals are owner-only rows: PROPOSED ids, new slugs, legal gate, matrix untouched', () => {
  const files = render(engine);
  const rows = parseCsv(files['proposed-matrix-rows.csv']);
  const head = rows[0];
  const col = (r, name) => r[head.indexOf(name)];
  const matrix = parseCsv(read('data/blog/content-matrix.csv'));
  const mh = matrix[0];
  const slugs = new Set(matrix.slice(1).map((r) => r[mh.indexOf('slug')]));
  const ids = new Set(matrix.slice(1).map((r) => r[mh.indexOf('article_id')]));
  // The queue may be empty once every measured gap has its article (owner added the ids); rows that exist stay owner-only.
  assert.deepEqual(head.slice(0, 4), ['article_id', 'batch_id', 'category', 'status']);
  for (const r of rows.slice(1)) {
    assert.match(col(r, 'article_id'), /^PROPOSED-\d{3}$/);
    assert.ok(!ids.has(col(r, 'article_id')) && !slugs.has(col(r, 'slug')), `${col(r, 'slug')}: never collides with the real matrix`);
    assert.equal(col(r, 'status'), 'PROPOSED');
    if (col(r, 'category') === 'SAFE') assert.equal(col(r, 'source_policy'), 'legal-gate');
  }
  // Reviewed topics are proposed once, not again as plain gaps.
  const keywords = rows.slice(1).map((r) => col(r, 'primary_keyword'));
  assert.equal(new Set(keywords).size, keywords.length);
  assert.ok(!matrix.slice(1).some((r) => r[mh.indexOf('status')] === 'PROPOSED'), 'content-matrix.csv never receives proposals');
});

test('committed engine reports come from the tool (structure, mode, snapshots)', () => {
  // Numbers move with the live corpus and research, so this is structural;
  // byte freshness is a warning of the SEO monitor (seo-engine --check).
  const files = render(engine);
  assert.deepEqual(Object.keys(files).sort(), ['README.md', 'content-briefs.md', 'engine.json', 'keyword-groups.md', 'proposed-matrix-rows.csv',
    'research-queue.md', 'seo-engine-matrix.csv', 'seo-engine-matrix.json', 'topical-map.md'].sort());
  for (const name of Object.keys(files)) assert.ok(existsSync(join(ROOT, OUT_DIR, name)), `${OUT_DIR}/${name} committed`);
  const committed = JSON.parse(read(`${OUT_DIR}/engine.json`));
  const fresh = JSON.parse(files['engine.json']);
  assert.equal(committed.mode, fresh.mode);
  assert.deepEqual(committed.snapshots, fresh.snapshots, 'reports regenerated after the last SERP research');
  assert.ok(committed.health && committed.health.site && committed.health.score, 'committed README carries the repository audit');
  assert.match(files['README.md'], new RegExp(`chế độ ${engine.mode}`));
  const ids = engine.groups.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, 'group ids are unique anchors');
});
