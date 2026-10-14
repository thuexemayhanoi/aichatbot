/**
 * v71 ZERO-DATA / cold-start SEO: research inputs are real and sourced,
 * keyword scope rules hold, the site index answers coverage, the mode only
 * switches to DATA-DRIVEN when real Search Console rows exist, and the
 * committed reports are exactly what the tool generates.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadSnapshots, loadConfig, loadDemand, classifyScope, bestMatch, siteIndex, detectMode,
  parsePerformanceFile, dataDrivenReport, build, snapshotProblems, OUT_DIR
} from '../../tools/seo-cold-start.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cfg = loadConfig(ROOT);

test('SERP snapshots are real observations: valid schema, sourced, no tracking params or phone numbers', () => {
  const { files, queries } = loadSnapshots(ROOT);
  assert.ok(files.length >= 1 && queries.length >= 40, 'at least one dated snapshot with 40+ queries');
  for (const f of readdirSync(join(ROOT, 'data/seo/serp-snapshots'))) {
    const snap = JSON.parse(readFileSync(join(ROOT, 'data/seo/serp-snapshots', f), 'utf8'));
    assert.equal(snap.location, 'Vietnam');
    assert.equal(snap.language, 'Vietnamese');
    for (const q of snap.queries) {
      assert.deepEqual(snapshotProblems(q), []);
      assert.ok(snap.sources[q.source], `${q.query}: source "${q.source}" is documented`);
    }
  }
  assert.ok(snapshotProblems({ query: 'x', cluster: 'K01', organic: [{ position: 1, url: 'https://a.vn/?srsltid=1', domain: 'a.vn', title: 'Gọi 0912 345 678' }] }).length >= 2);
});

test('keyword demand carries only tool-returned numbers with source metadata', () => {
  const d = JSON.parse(readFileSync(join(ROOT, 'data/seo/keyword-demand.json'), 'utf8'));
  assert.ok(d.source.tool && d.source.retrieved && d.source.location === 'Vietnam');
  const seen = new Set();
  for (const k of d.keywords) {
    assert.ok(k.volume === null || (Number.isInteger(k.volume) && k.volume >= 0), `${k.keyword}: volume is a returned integer or null`);
    assert.ok(!seen.has(k.keyword), `${k.keyword}: unique`);
    seen.add(k.keyword);
  }
  // Later measurements are sourced separately and only fill keywords without a number.
  for (const sup of d.supplements ?? []) {
    assert.ok(sup.source.tool && sup.source.retrieved && sup.source.location === 'Vietnam', 'supplement has its own source');
    for (const k of sup.keywords) {
      assert.ok(Number.isInteger(k.volume) && k.volume >= 0, `${k.keyword}: supplement volume is a returned integer`);
      assert.ok(!(sup.not_returned ?? []).includes(k.keyword), `${k.keyword}: not both returned and not returned`);
    }
  }
  const demand = loadDemand(ROOT);
  assert.ok(demand.size >= seen.size);
  for (const k of d.keywords) if (k.volume != null) assert.equal(demand.get(k.keyword.normalize('NFC').toLowerCase().trim())?.volume ?? k.volume, k.volume, 'main source numbers are never overwritten');
});

test('scope rules: sister-owned, other markets, other intents, near-me, trip destinations, unverified services', () => {
  const s = (k) => classifyScope(k, cfg).scope;
  assert.equal(s('thuê xe máy hà nội'), 'SISTER');
  assert.equal(s('thuê xe máy nguyễn tú'), 'SISTER');
  assert.equal(s('thuê xe máy đà nẵng'), 'OUT-MARKET');
  assert.equal(s('thuê xe máy sài gòn giá rẻ'), 'OUT-MARKET');
  assert.equal(s('thi bằng lái xe máy a1'), 'OUT-INTENT');
  assert.equal(s('app thuê xe tự lái'), 'OUT-INTENT');
  assert.equal(s('motorbike rental hanoi'), 'OUT-INTENT');
  assert.equal(s('thuê xe máy gần đây'), 'LOCAL-PACK');
  assert.equal(s('thuê xe máy ninh bình'), 'TRIP-DEST');
  assert.equal(s('thuê xe máy đi ninh bình'), 'IN-SCOPE');
  assert.equal(s('thuê xe máy điện vinfast'), 'UNVERIFIED');
  assert.equal(s('mức phạt nồng độ cồn xe máy'), 'IN-SCOPE');
  assert.equal(s('xe máy điện có cần bằng lái không'), 'IN-SCOPE');
});

test('coverage: a measured legal query maps to the article that answers it', () => {
  const index = siteIndex(ROOT, cfg);
  const m = bestMatch('mức phạt nồng độ cồn xe máy', index, cfg);
  assert.equal(m.status, 'COVERED');
  assert.equal(m.article.url, '/blog/an-toan/nong-do-con-khi-lai-xe/');
  const none = bestMatch('zzz qqq', index, cfg);
  assert.equal(none.status, 'GAP');
});

test('mode switch: ZERO-DATA without exports, DATA-DRIVEN only with real Search Console rows', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cold-start-'));
  assert.equal(detectMode(tmp).mode, 'ZERO-DATA');
  mkdirSync(join(tmp, 'data/seo/performance'), { recursive: true });
  writeFileSync(join(tmp, 'data/seo/performance/empty.csv'), 'Truy vấn hàng đầu,Số lượt nhấp,Số lần hiển thị,CTR,Vị trí\n');
  assert.equal(detectMode(tmp).mode, 'ZERO-DATA', 'a header-only export is not data');
  // Synthetic test fixture (temporary directory only, never committed as site data).
  writeFileSync(join(tmp, 'data/seo/performance/queries.csv'),
    'Truy vấn hàng đầu,Số lượt nhấp,Số lần hiển thị,CTR,Vị trí\nví dụ truy vấn a,1,40,"2,5%","7,4"\nví dụ truy vấn b,0,12,0%,"2,1"\n');
  const mode = detectMode(tmp);
  assert.equal(mode.mode, 'DATA-DRIVEN');
  assert.deepEqual(mode.rows.map((r) => [r.query, r.clicks, r.impressions, r.position]), [['ví dụ truy vấn a', 1, 40, 7.4], ['ví dụ truy vấn b', 0, 12, 2.1]]);
  const md = dataDrivenReport(mode.rows);
  assert.match(md, /ví dụ truy vấn a \| 40 \| 1 \| 7,4/);
  assert.doesNotMatch(md, /ví dụ truy vấn b \| 12/, 'position 2 is not "striking distance"');
  const api = parsePerformanceFile('pages.json', JSON.stringify({ rows: [{ keys: ['https://chatbot.thuexemaynguyentu.com/blog/x/'], clicks: 0, impressions: 30, ctr: 0, position: 9 }] }));
  assert.equal(api[0].page, 'https://chatbot.thuexemaynguyentu.com/blog/x/');
});

test('committed cold-start reports come from the tool and match the current mode and snapshots', () => {
  // Coverage numbers depend on the live corpus (the factory may update bodies
  // between research runs), so this is a structural check; byte freshness is
  // reported as a warning by the SEO monitor (seo-cold-start --check).
  const files = build(ROOT);
  assert.deepEqual(Object.keys(files).sort(), ['README.md', 'cold-start.json', 'competitor-map.md', 'content-gap.md', 'serp-intent.md', 'topical-map.md', 'visibility-baseline.md']);
  for (const name of Object.keys(files)) assert.ok(existsSync(join(ROOT, OUT_DIR, name)), `${OUT_DIR}/${name} committed`);
  const committed = JSON.parse(readFileSync(join(ROOT, OUT_DIR, 'cold-start.json'), 'utf8'));
  const fresh = JSON.parse(files['cold-start.json']);
  assert.equal(committed.mode, fresh.mode);
  assert.deepEqual(committed.snapshots, fresh.snapshots, 'reports were regenerated after the last SERP research');
  assert.match(files['README.md'], /chế độ ZERO-DATA/);
  assert.ok(!existsSync(join(ROOT, OUT_DIR, 'data-driven.md')), 'no data-driven report without real data');
  assert.ok(!existsSync(join(ROOT, 'data/seo/performance')) || readdirSync(join(ROOT, 'data/seo/performance')).every((f) => !/\.(csv|json)$/.test(f)),
    'no performance export committed while the site has no Search Console data');
});
