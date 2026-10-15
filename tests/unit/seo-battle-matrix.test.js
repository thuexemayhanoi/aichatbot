/**
 * v73 SEO Master Battle Matrix (10 weapons, ZERO-DATA): every matrix is built
 * from committed research files (SERP snapshots, keyword tools, competitor
 * page audits, a competitor backlink profile) plus the engine 06 run. Nothing
 * is estimated: priorities print their formula, confidence labels say whether
 * a number was observed, measured or derived, and the reports are regenerated
 * by the tool (the SEO monitor warns when they are stale).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runBattle, render, weaknessesOf, betterPagePlan, benchmarkGaps, classifyLinkSource, ownPageFeatures, loadBattleData, ANSWER_FORM, WEAKNESS,
  OUT_DIR, LABS_PATH, METRICS_PATH, AUDITS_PATH, BACKLINKS_PATH
} from '../../tools/seo-battle-matrix.mjs';
import { engineContext } from '../../tools/seo-engine.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
// One research pass shared by every test (the cold-start analysis reads all bodies).
const bt = runBattle(ROOT, { context: engineContext(ROOT) });

test('research files carry their provenance and only measured/observed numbers', () => {
  const data = loadBattleData(ROOT);
  assert.ok(data.labs?.source?.tool && /^\d{4}-\d{2}-\d{2}$/.test(data.labs.source.retrieved), `${LABS_PATH}: tool + date`);
  assert.ok(Array.isArray(data.labs.source.excluded) && data.labs.competitors.every((c) => c.domain && typeof c.visibility === 'number'), 'labs rows are domains with visibility');
  assert.ok(data.metrics.sources.every((s) => s.tool && s.retrieved && s.location === 'Vietnam'), `${METRICS_PATH}: every source names tool, date and market`);
  for (const k of data.metrics.keywords) {
    assert.ok(k.keyword && (k.search_volume == null || Number.isInteger(k.search_volume)) && data.metrics.sources.some((s) => s.id === k.source), `${k.keyword}: integer volume or null, known source`);
  }
  assert.ok(data.audits.pages.length >= 100, `${AUDITS_PATH}: competitor pages audited`);
  for (const p of data.audits.pages) {
    assert.ok(/^https?:\/\//.test(p.url) && Array.isArray(p.queries) && p.queries.length, `${p.url}: audited page knows the queries it ranks for`);
    if (p.unavailable) assert.ok(p.reason || p.status >= 400, `${p.url}: unavailable pages say why`);
    else assert.ok(Number.isInteger(p.words) && Array.isArray(p.h2) && Array.isArray(p.schema) && p.scraped, `${p.url}: observed features`);
  }
  const prof = data.backlinks.profiles[0];
  assert.ok(prof.tool && prof.retrieved && Number.isInteger(prof.summary.referring_domains) && prof.referring_domains.every((d) => d.domain && Number.isInteger(d.spam_score)), `${BACKLINKS_PATH}: measured competitor profile`);
});

test('W1 competitors come from captured SERPs + Labs; own and sister domains never appear; social platforms are not content competitors', () => {
  const { w1 } = bt;
  const cfg = JSON.parse(read('config/seo-cold-start.json'));
  const banned = new Set([cfg.site_domain, ...cfg.sister_domains]);
  assert.ok(w1.selected.length >= 20 && w1.selected.length <= 30, `${w1.selected.length} competitors selected (20–30)`);
  for (const r of w1.rows) {
    assert.ok(!banned.has(r.domain.replace(/^www\./, '')), `${r.domain} is this site or its sister`);
    assert.ok(r.queries > 0 || r.labs, `${r.domain}: evidence is a captured top-10 position or a Labs row`);
    if (r.queries) assert.ok(r.evidence.length && r.evidence.every((e) => e.query && e.position >= 1), `${r.domain}: evidence lists query + position`);
  }
  assert.ok(w1.selected.every((r) => !r.social) && w1.social.every((r) => ['social', 'video', 'appstore'].includes(r.kind)));
  assert.ok(w1.strongest.length === 10 && w1.strongest.every((r) => r.threat !== 'THẤP'));
  assert.equal(w1.selected[0].threat, 'CAO');
});

test('W2 keyword master: two volume sources are kept apart, confidence labels follow the data, sister-owned terms are not targets', () => {
  const { w2 } = bt;
  assert.ok(w2.rows.length > 500 && w2.measured > 300 && w2.bothTools > 50 && w2.withKd > 30);
  for (const r of w2.rows) {
    if (r.confidenceKey === 'TWO') assert.ok(r.volumeA != null && r.volumeB != null, r.keyword);
    if (r.confidenceKey === 'SERP') assert.ok(r.volumeA == null && r.volumeB == null && r.serpIntent, r.keyword);
    if (r.scope !== 'IN-SCOPE') assert.ok(!r.tier, `${r.keyword}: out-of-scope keyword never gets a priority tier`);
    if (r.referenceUrl) assert.match(r.referenceUrl, /^https?:\/\//);
  }
  const sister = w2.rows.find((r) => r.keyword === 'thuê xe máy hà nội');
  assert.ok(sister && sister.scope === 'SISTER' && !sister.tier && !sister.target);
});

test('W3 weakness rules are observable facts, and the better-page plan never copies a competitor', () => {
  const legal = weaknessesOf({ words: 400, faq_heading: false, schema: [], legal_sources: ['Nghị định 100/2019/NĐ-CP'], title_years: ['2023'], tables: 0, published: null, modified: null, title_other_city: [], title: 'Mức phạt', h2: [], first_paragraph: 'Nội dung', links_internal: 1, links_external: 1 },
    { query: 'không có bằng lái xe máy phạt bao nhiêu', cluster: 'K09', kind: 'info' });
  for (const w of ['THIN', 'NO_FAQ', 'NO_SCHEMA', 'OLD_LAW', 'OLD_YEAR', 'NO_TABLE', 'NO_DATE', 'NO_ANSWER_FIRST']) assert.ok(legal.includes(w), w);
  assert.ok(!legal.includes('NO_LEGAL_SOURCE'), 'a page citing a decree has a legal source (even an outdated one)');
  assert.deepEqual(weaknessesOf({ unavailable: true }), ['UNAVAILABLE']);
  const good = weaknessesOf({ words: 1800, faq_heading: true, schema: ['Article'], legal_sources: ['Nghị định 168/2024/NĐ-CP'], title_years: ['2026'], tables: 1, published: '2026-01-02', h2: ['a', 'b', 'c', 'd'],
    first_paragraph: 'Không có bằng lái xe máy bị phạt theo Nghị định 168/2024', h1: ['Không có bằng lái xe máy phạt bao nhiêu'], title: 'x', title_other_city: [], links_internal: 3, links_external: 2 }, { query: 'không có bằng lái xe máy phạt bao nhiêu', cluster: 'K09' });
  assert.deepEqual(good, []);
  const plan = betterPagePlan({ NO_FAQ: 2, NO_TABLE: 1 }, { query: 'mức phạt nồng độ cồn xe máy', cluster: 'K09' });
  assert.ok(plan.some((p) => /Câu hỏi thường gặp/.test(p)) && plan.some((p) => /Bảng/.test(p)) && plan.some((p) => /legal-facts/.test(p)));
  assert.ok(Object.keys(WEAKNESS).every((k) => bt.w3.totals[k] == null || bt.w3.totals[k] >= 0));
  assert.ok(bt.w3.rows.length >= 100 && bt.w3.queries.length >= 40);
  for (const r of bt.w3.rows) assert.ok(r.weaknesses.every((w) => WEAKNESS[w]), `${r.url}: known weakness codes`);
});

test('W4 opportunity tiers rank only measured demand; competitor gap lists flag out-of-scope queries', () => {
  const { w4 } = bt;
  assert.ok(w4.tiers.P0 >= 1, 'at least one P0 opportunity');
  for (const r of w4.rows) {
    if (/^P[012]$/.test(r.tier)) assert.ok(r.demand > 0 && r.score > 0, `${r.keyword}: ranked rows have measured demand`);
    if (r.tier === '(chưa đo volume)') assert.equal(r.demand, null, `${r.keyword}: unmeasured groups are labelled, not ranked`);
    if (r.demand == null) assert.equal(r.score, 0, `${r.keyword}: unmeasured demand never scores`);
    assert.ok(['Cao', 'Trung bình', 'Thấp', 'Chưa chụp SERP'].includes(r.competition));
  }
  const p0 = w4.rows.filter((r) => r.tier === 'P0');
  assert.ok(p0.every((r) => r.score >= 1000) && p0.some((r) => r.keyword === 'xe máy điện có cần bằng lái không'));
  assert.equal(w4.competitors.length, 10);
  for (const c of w4.competitors) assert.ok(c.queries.length >= c.gaps.length && c.gaps.every((q) => q.own == null));
});

test('W5 clusters: every cluster has a pillar that exists; mixed-intent targets are reported, never silently merged', () => {
  const { w5 } = bt;
  assert.equal(w5.rows.length, 20);
  assert.equal(w5.pillarsMissing, 0);
  for (const r of w5.rows) {
    assert.ok(r.articles > 0 && r.pillar && r.pillarExists, `${r.id}: pillar + supporting pages`);
    assert.ok(r.hubs.every((h) => !/\/page\/\d+\/$/.test(h)), `${r.id}: pagination pages are not hubs`);
    for (const m of r.mixed) assert.match(m, /\(.+\) \/ .+\(.+\)/, `${r.id}: a mixed target names at least two intents`);
  }
  assert.ok(w5.rows.find((r) => r.id === 'K09').open.some((o) => /đối chiếu văn bản gốc/.test(o.action)), 'legal cluster carries the verified-article work');
});

test('W6 benchmark compares medians of audited top pages with this site\'s own built page', () => {
  const { w6 } = bt;
  assert.ok(w6.rows.length >= 40 && w6.withOwn >= 30);
  for (const r of w6.rows) {
    assert.ok(r.audited >= 1 && Number.isInteger(r.bench.words));
    if (r.own) assert.ok(r.target.startsWith('/') && Number.isInteger(r.own.words) && Array.isArray(r.gaps));
    else assert.deepEqual(r.gaps, ['Chưa có trang đích (bài mới)']);
  }
  const own = ownPageFeatures(ROOT, '/blog/thue-xe/bang-lai-a1-va-thue-xe-may-chay-pho/');
  assert.ok(own.words > 800 && own.h2.length >= 5 && own.faq_heading && own.schema.includes('Article') && own.legal_sources.length >= 1);
  assert.equal(ownPageFeatures(ROOT, '/blog/khong-ton-tai/'), null);
  const gaps = benchmarkGaps({ words: 500, faq: false, tables: 0, images: 0, legal: false, h2: 2, h1: ['Khác'], lead: '', first_paragraph: '' }, { words: 2000, faq: 60, tables: 1, images: 5, legal: 80, h2: 8 }, { query: 'mức phạt nồng độ cồn xe máy', cluster: 'K09' });
  assert.ok(gaps.length >= 6 && gaps.some((g) => /pháp lý|văn bản/.test(g)));
});

test('W7 AI search: observed sources only, answer forms by question type, gaps measured on the target page', () => {
  const { w7 } = bt;
  assert.ok(w7.rows.length >= 40 && w7.withAi >= 1 && w7.paaTotal >= 1);
  for (const r of w7.rows) {
    assert.ok(r.sources.every((s) => /^https?:\/\//.test(s.url)), `${r.query}: AI Overview sources are URLs seen in the capture`);
    if (r.target.startsWith('/')) assert.ok(typeof r.answerFirst === 'boolean');
    else assert.equal(r.answerFirst, null);
  }
  assert.match(ANSWER_FORM('không có bằng lái xe máy phạt bao nhiêu'), /Con số/);
  assert.match(ANSWER_FORM('xe máy điện có cần bằng lái không'), /Có\/Không/);
  assert.match(ANSWER_FORM('bằng lái xe máy là hạng gì'), /Định nghĩa/);
  assert.match(ANSWER_FORM('kinh nghiệm thuê xe máy hà nội'), /bước/);
});

test('W8 link sources are classified with risk; bought links and spam never become opportunities', () => {
  const { w8 } = bt;
  assert.equal(classifyLinkSource('trangvangvietnam.com', 0).type, 'Danh bạ doanh nghiệp / trang vàng');
  assert.match(classifyLinkSource('video-bookmark.com', 28).risk, /cao/);
  assert.match(classifyLinkSource('anything.example', 45).risk, /spam score 45/);
  assert.ok(w8.profiles[0].rows.every((r) => r.type && r.risk));
  assert.ok(w8.opportunities.some((o) => /KHÔNG làm/.test(o.action) && o.risk === 'cao'), 'buying links is listed only to be refused');
  assert.ok(w8.listingPages.length >= 10 && w8.listingPages.every((p) => p.url && p.query && p.opportunity));
  assert.ok(w8.authorities.every((a) => Number.isFinite(a.rating)));
});

test('W9 architecture keeps every URL (one keyword, intent, position, conversion goal) and proposes pages only as PROPOSED ids', () => {
  const { w9 } = bt;
  const matrix = JSON.parse(read('docs/seo/seo-master-matrix.json'));
  assert.equal(w9.total, matrix.summary.urls, 'no URL dropped or added');
  for (const r of w9.rows) assert.ok(r.url.startsWith('/') && r.type && r.position && r.goal, r.url);
  const pillars = w9.rows.filter((r) => r.position.startsWith('Pillar')).length;
  assert.ok(pillars >= 100 && pillars <= 500, `${pillars} pillars: the topic-family pillars of the master audit plus keyword-group targets, not every article`);
  assert.ok(w9.rows.filter((r) => r.position.startsWith('Supporting')).length > 1500, 'most articles are supporting pages');
  assert.ok(w9.rows.some((r) => r.url === '/' && r.position.startsWith('Trang chủ')));
  for (const p of w9.proposed) assert.ok(/^PROPOSED-\d{3}$/.test(p.id) && /^\/blog\/[a-z-]+\/[a-z0-9-]+\/$/.test(p.url) && !w9.rows.some((r) => r.url === p.url), `${p.url}: new URL only`);
});

test('W10 master matrix: tiers by score, every item carries evidence, confidence, owner, KPI and verification; roadmap covers 30/60/90', () => {
  const { w10 } = bt;
  assert.ok(w10.items.length >= 20 && w10.tiers.P0 >= 1);
  const ids = new Set();
  for (const i of w10.items) {
    assert.ok(!ids.has(i.id)); ids.add(i.id);
    assert.ok(['P0', 'P1', 'P2'].includes(i.tier) && /^W\d$/.test(i.weapon) && i.evidence && ['OBSERVED', 'MEASURED', 'DERIVED'].includes(i.confidence) && i.owner && i.kpi && i.verify, i.id);
    if (i.weapon === 'W4') assert.equal(i.tier, i.score >= 1000 ? 'P0' : i.score >= 100 ? 'P1' : 'P2', `${i.id}: tier follows the score`);
    assert.ok(!/mua link|PBN/i.test(i.action) || /KHÔNG/.test(i.action), `${i.id}: never buys links`);
  }
  assert.deepEqual(w10.roadmap.map((r) => r.phase), ['0–30 ngày', '31–60 ngày', '61–90 ngày']);
  assert.equal(w10.roadmap[0].items.length, w10.tiers.P0);
  assert.ok(w10.kpis.length >= 5 && w10.kpis.every((k) => k.kpi && k.how));
  assert.ok(w10.kpis.some((k) => /Search Console/.test(k.kpi) && /chưa có dữ liệu/.test(String(k.baseline))), 'no invented performance numbers');
});

test('committed battle reports come from the tool (files, sources, deterministic)', () => {
  const files = render(bt);
  const names = Object.keys(files).sort();
  assert.deepEqual(names, ['01-competitor-intelligence', '02-keyword-master-matrix', '03-weakness-matrix', '04-opportunity-matrix', '05-topic-cluster-matrix', '06-serp-benchmark', '07-ai-search-matrix', '08-backlink-matrix', '09-url-architecture', '10-master-battle-matrix']
    .flatMap((n) => [`${n}.csv`, `${n}.md`]).concat(['README.md', 'battle.json']).sort());
  for (const name of names) assert.ok(existsSync(join(ROOT, OUT_DIR, name)), `${OUT_DIR}/${name} committed`);
  const committed = JSON.parse(read(`${OUT_DIR}/battle.json`));
  const fresh = JSON.parse(files['battle.json']);
  assert.equal(committed.mode, fresh.mode);
  assert.deepEqual(committed.snapshots, fresh.snapshots, 'reports regenerated after the last SERP research');
  assert.deepEqual(committed.sources, fresh.sources, 'reports regenerated after the last research file change');
  assert.deepEqual(render(bt)['battle.json'], files['battle.json'], 'rendering is deterministic');
  for (const name of names.filter((n) => n.endsWith('.md'))) assert.ok(!/undefined|NaN|\[object Object\]/.test(files[name]), `${name}: no leaked placeholders`);
  assert.match(files['README.md'], /chế độ ZERO-DATA|chế độ DATA-DRIVEN/);
});
