#!/usr/bin/env node
/**
 * COLD-START SEO (ZERO-DATA MODE) — research-driven SEO decisions for a new
 * site that has no Search Console / Analytics / ranking data yet.
 *
 * Every number used here is observed or measured by a named public source,
 * never estimated by this tool:
 *   data/seo/serp-snapshots/*.json  live Google SERP observations (Việt Nam, vi)
 *   data/seo/keyword-demand.json    third-party keyword volumes (Google Ads data)
 *   data/seo/keyword-clusters.json  K01–K20 clusters (+ Ubersuggest volume evidence)
 *   config/seo-cold-start.json      scope rules (market, sister-owned, intent) + domain types
 *   the site itself                 published.json, article-meta.json, bodies, master matrix
 *
 * It answers, per query and per cluster: who ranks (competitor map), what
 * Google shows (AI Overview, local pack, PAA…), which page type wins (intent /
 * format fit), whether this site already has the right page (topical map +
 * content gap) and where the site already appears (visibility baseline).
 *
 * MODE SWITCH: drop real exports into data/seo/performance/ (Search Console
 * "Queries"/"Pages" CSV in English or Vietnamese UI, or API JSON rows) and the
 * next run switches to DATA-DRIVEN: it adds docs/seo/cold-start/data-driven.md
 * (striking-distance queries, pages with impressions but no clicks). Without
 * real rows the mode stays ZERO-DATA — the tool never fabricates metrics.
 *
 * Usage:
 *   node tools/seo-cold-start.mjs           # write docs/seo/cold-start/*
 *   node tools/seo-cold-start.mjs --check   # exit 1 when the reports are stale
 *
 * Read-only for the site: it never edits pages, bodies, manifest or matrix.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/config/site.js';
import { taxonomy } from './taxonomy.mjs';
import { loadSeoMeta, applySeoMeta, englishTokens } from './seo-meta.mjs';
import { parseCsv } from './seo-index-coverage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = 'docs/seo/cold-start';
export const SNAP_DIR = 'data/seo/serp-snapshots';
export const PERF_DIR = 'data/seo/performance';
export const STALE_DAYS = 45;
const TOP = 10; // competitor statistics use the top 10 of every SERP (comparable across sources)

// ---------- text helpers ----------

export const normKw = (s) => String(s ?? '').normalize('NFC').toLowerCase()
  .replace(/[“”"'’‘?!.,:;()[\]{}|/\\–—…•·-]+/g, ' ').replace(/\s+/g, ' ').trim();
// Matching text: abbreviations/synonyms unified (config "rewrite"), one-letter and year tokens dropped.
let REWRITE = [];
export const canon = (s) => {
  let t = ` ${normKw(s)} `;
  for (const [from, to] of REWRITE) t = t.split(` ${from} `).join(` ${to} `);
  return t.trim();
};
export const toks = (s) => canon(s).split(' ').filter((t) => t.length > 1 && !/^(19|20)\d\d$/.test(t));
const hasPhrase = (kw, term) => ` ${kw} `.includes(` ${normKw(term)} `);
export const fmt = (n) => (n == null ? '—' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
export const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—');
export const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// ---------- inputs ----------

function reader(root) {
  return (p) => readFileSync(join(root, p), 'utf8');
}

const SNAPSHOT_KEYS = ['query', 'cluster', 'source', 'depth', 'fetched_at', 'features', 'ai_overview', 'featured_snippet',
  'organic', 'local_pack', 'people_also_ask', 'related_searches'];

/** Schema problems of one snapshot record (empty = valid). */
export function snapshotProblems(q) {
  const out = [];
  const P = (m) => out.push(`${q?.query ?? '?'}: ${m}`);
  if (!q || typeof q.query !== 'string' || !q.query.trim()) return ['snapshot record without query'];
  for (const k of SNAPSHOT_KEYS) if (!(k in q)) P(`missing ${k}`);
  if (!/^(K(0[1-9]|1\d|20)|LANDSCAPE)$/.test(q.cluster ?? '')) P(`bad cluster ${q.cluster}`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(q.fetched_at ?? '')) P('fetched_at must be ISO');
  if (!Array.isArray(q.organic) || !q.organic.length) P('organic must be non-empty');
  for (const [i, o] of (q.organic ?? []).entries()) {
    let host = '';
    try { host = new URL(o.url).hostname; } catch { P(`organic[${i}] bad url`); }
    if (o.position !== i + 1) P(`organic[${i}] position must be ${i + 1}`);
    if (o.domain !== host) P(`organic[${i}] domain/url mismatch`);
    if (/[?&]srsltid=/.test(o.url ?? '')) P(`organic[${i}] tracking parameter left in url`);
    if (/(?:\+?84|0)(?:[\s.-]?\d){8,10}/.test(o.title ?? '')) P(`organic[${i}] phone number in title (mask it)`);
  }
  for (const k of ['people_also_ask', 'related_searches']) if (q[k] !== null && !Array.isArray(q[k])) P(`${k} must be an array or null`);
  if (!Array.isArray(q.local_pack)) P('local_pack must be an array');
  return out;
}

/** All snapshot files, newest observation per query wins. */
export function loadSnapshots(root = ROOT) {
  const dir = join(root, SNAP_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
  const byQuery = new Map();
  const meta = [];
  for (const f of files) {
    const snap = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const bad = snap.queries.flatMap(snapshotProblems);
    if (bad.length) throw new Error(`${SNAP_DIR}/${f}: ${bad.slice(0, 5).join('; ')}`);
    meta.push({ file: f, collected: snap.collected, queries: snap.queries.length, sources: snap.sources });
    for (const q of snap.queries) byQuery.set(normKw(q.query), { ...q, collected: snap.collected });
  }
  return { files: meta, queries: [...byQuery.values()].sort((a, b) => a.cluster.localeCompare(b.cluster) || a.query.localeCompare(b.query)) };
}

/** Measured demand: OpenRush keyword-demand.json + Ubersuggest rows of keyword-clusters.json. */
export function loadDemand(root = ROOT) {
  const read = reader(root);
  const out = new Map();
  if (existsSync(join(root, 'data/seo/keyword-demand.json'))) {
    const d = JSON.parse(read('data/seo/keyword-demand.json'));
    for (const k of d.keywords) {
      out.set(normKw(k.keyword), { keyword: normKw(k.keyword), volume: k.volume ?? null, intent: k.intent ?? null, source: `${d.source.tool} ${d.source.retrieved}` });
    }
  }
  const kc = JSON.parse(read('data/seo/keyword-clusters.json'));
  const ev = kc.volume_evidence;
  for (const r of ev?.rows ?? []) {
    const key = normKw(r.keyword);
    if (!out.has(key) && r.volume != null) out.set(key, { keyword: key, volume: r.volume, intent: null, source: `Ubersuggest ${ev.retrieved}` });
  }
  return out;
}

export function loadConfig(root = ROOT) {
  const cfg = JSON.parse(reader(root)('config/seo-cold-start.json'));
  useRewrites(cfg);
  const rx = (r) => ({ ...r, rx: new RegExp(r.re, 'u') });
  return {
    ...cfg,
    out_of_intent: cfg.out_of_intent.map(rx),
    unverified_service: cfg.unverified_service.map(rx),
    local_pack: rx(cfg.local_pack),
    domain_types: cfg.domain_types.map(rx),
    generic: new Set(cfg.generic_tokens.map(normKw))
  };
}

function useRewrites(cfg) {
  REWRITE = Object.entries(cfg.rewrite ?? {}).map(([a, b]) => [normKw(a), normKw(b)]).sort((x, y) => y[0].length - x[0].length || x[0].localeCompare(y[0]));
}

// ---------- scope ----------

export const SCOPE_LABEL = {
  'IN-SCOPE': 'Trong phạm vi',
  SISTER: 'Website chị em sở hữu',
  'OUT-INTENT': 'Ngoài ý định thuê xe',
  'OUT-MARKET': 'Thị trường khác',
  'TRIP-DEST': 'Thuê tại điểm đến',
  'LOCAL-PACK': 'Ý định gần tôi (bản đồ)',
  UNVERIFIED: 'Dịch vụ chưa xác minh'
};

/** Where a keyword belongs for THIS site (config/seo-cold-start.json order). */
export function classifyScope(keyword, cfg) {
  const kw = normKw(keyword);
  if (cfg.sister_owned.some((t) => kw === normKw(t))) return { scope: 'SISTER', reason: 'Từ khóa thương mại do website chị em sở hữu (config/seo-ownership.json)' };
  if (cfg.sister_prefix && cfg.sister_owned.some((t) => kw.startsWith(`${normKw(t)} `))) return { scope: 'SISTER', reason: 'Biến thể thương mại của từ khóa website chị em sở hữu' };
  if (cfg.brands?.own.some((t) => hasPhrase(kw, t))) return { scope: 'SISTER', reason: 'Tên thương hiệu của cửa hàng — trang chủ/website chị em phục vụ' };
  if (cfg.brands?.terms.some((t) => hasPhrase(kw, t))) return { scope: 'OUT-INTENT', reason: cfg.brands.reason };
  if (englishTokens(kw).length) return { scope: 'OUT-INTENT', reason: 'Từ khóa tiếng Anh — website chỉ làm SEO tiếng Việt' };
  for (const r of cfg.out_of_intent) if (r.rx.test(kw)) return { scope: 'OUT-INTENT', reason: r.reason };
  const home = cfg.home_market.some((t) => hasPhrase(kw, t));
  const market = cfg.other_markets.find((t) => hasPhrase(kw, t));
  if (market && !home) return { scope: 'OUT-MARKET', reason: `Thị trường khác (${market}) — cửa hàng chỉ ở Hà Nội` };
  const dest = cfg.trip_destinations.find((t) => hasPhrase(kw, t));
  if (dest && !home && /(^| )thuê( |$)/.test(kw) && !/(^| )đi( |$)/.test(kw)) {
    return { scope: 'TRIP-DEST', reason: `Thuê tại ${dest}; chỉ phục vụ được bằng góc "thuê ở Hà Nội đi ${dest}"` };
  }
  if (cfg.local_pack.rx.test(kw)) return { scope: 'LOCAL-PACK', reason: cfg.local_pack.reason };
  for (const r of cfg.unverified_service) if (r.rx.test(kw)) return { scope: 'UNVERIFIED', reason: r.reason };
  if (cfg.intent_markers && !cfg.intent_markers.terms.some((t) => hasPhrase(kw, t))) return { scope: 'OUT-INTENT', reason: cfg.intent_markers.reason };
  return { scope: 'IN-SCOPE', reason: '' };
}

// ---------- site index ----------

function headingsOf(html) {
  return [...String(html).matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

/** One entry per published article: url, title, keyword, cluster, token sets. */
export function siteIndex(root = ROOT, cfg = loadConfig(root)) {
  const read = reader(root);
  const arts = JSON.parse(read('data/blog/published.json')).articles;
  const meta = loadSeoMeta(root);
  const rows = parseCsv(read('data/blog/content-matrix.csv'));
  const head = rows[0];
  const matrix = new Map(rows.slice(1).map((r) => [r[head.indexOf('article_id')], Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))]));
  const mm = existsSync(join(root, 'docs/seo/seo-master-matrix.json')) ? JSON.parse(read('docs/seo/seo-master-matrix.json')).rows : [];
  const clusterById = new Map(mm.filter((r) => r['Article ID']).map((r) => [r['Article ID'], r['Topic Cluster'] ?? '']));
  const distinct = (s) => new Set(toks(s).filter((t) => !cfg.generic.has(t)));
  return arts.map((a0) => {
    const a = applySeoMeta(a0, meta);
    const m = matrix.get(a.article_id) ?? {};
    const keyword = a.seo_keyword ?? m.primary_keyword ?? '';
    const text = [a.title, keyword, m.primary_keyword].join(' ');
    const body = existsSync(join(root, a.body)) ? read(a.body) : '';
    return {
      id: a.article_id, category: a.category,
      url: `/blog/${taxonomy.categories[a.category].dir}/${a.slug}/`,
      title: a.title, keyword, cluster: (clusterById.get(a.article_id) ?? '').split(' ')[0] || '',
      all: new Set(toks(text)), distinct: distinct(text), phrase: toks(text).join(' '),
      headings: headingsOf(body).map((h) => ({ text: h, all: new Set(toks(h)), phrase: toks(h).join(' ') }))
    };
  });
}

const bigrams = (ts) => ts.slice(1).map((t, i) => `${ts[i]} ${t}`);

// Rare words decide the topic ("gương", "nồng độ") more than frequent ones ("không", "lỗi").
const IDF = new WeakMap();
function idfOf(index) {
  if (!IDF.has(index)) {
    const df = new Map();
    for (const a of index) for (const t of a.all) df.set(t, (df.get(t) ?? 0) + 1);
    IDF.set(index, (t) => Math.log((index.length + 1) / ((df.get(t) ?? 0) + 1)) + 1);
  }
  return IDF.get(index);
}

/** Corpus IDF of a token (rare words weigh more), shared with the SEO engine. */
export const idfWeights = (index) => idfOf(index);

/** Match score of one article for a keyword, with the corpus-wide IDF. */
export function scoreAgainst(keyword, article, index, cfg) {
  const idf = idfOf(index);
  const all = toks(keyword);
  const q = all.filter((t) => !cfg.generic.has(t));
  const qt = [...new Set(q.length ? q : all)];
  const phrases = [...new Set(bigrams(all).filter((b) => b.split(' ').every((t) => !cfg.generic.has(t))))];
  const pw = (b) => sum(b.split(' ').map(idf)) / 2;
  const total = sum(qt.map(idf)) + sum(phrases.map(pw));
  return (sum(qt.filter((t) => article.all.has(t)).map(idf)) + sum(phrases.filter((b) => ` ${article.phrase} `.includes(` ${b} `)).map(pw))) / total;
}

/** Best article for a keyword: IDF-weighted containment of its distinctive
 *  words plus its two-word phrases ("điện thoại", "bằng lái", "nồng độ"). */
export function bestMatch(keyword, index, cfg) {
  const idf = idfOf(index);
  const all = toks(keyword);
  const q = all.filter((t) => !cfg.generic.has(t));
  const qt = [...new Set(q.length ? q : all)];
  const phrases = [...new Set(bigrams(all).filter((b) => b.split(' ').every((t) => !cfg.generic.has(t))))];
  const pw = (b) => sum(b.split(' ').map(idf)) / 2; // a phrase confirms its words, it does not count twice
  const total = sum(qt.map(idf)) + sum(phrases.map(pw));
  const weight = (set, text) => (sum(qt.filter((t) => set.has(t)).map(idf)) + sum(phrases.filter((b) => ` ${text} `.includes(` ${b} `)).map(pw))) / total;
  const bg = bigrams(all);
  const phrase = canon(keyword);
  let best = null;
  for (const a of index) {
    const score = weight(a.all, a.phrase);
    // Ties (e.g. a query of generic words only) go to the page whose main keyword carries the exact phrase.
    const key = [score, Number(` ${canon(a.keyword)} `.includes(` ${phrase} `)), bg.filter((b) => a.phrase.includes(b)).length, -a.keyword.length, -a.title.length];
    let better = !best;
    for (let i = 0; !better && i < key.length; i++) {
      if (key[i] !== best.key[i]) { better = key[i] > best.key[i]; break; }
      if (i === key.length - 1) better = a.id < best.a.id;
    }
    if (better) best = { a, score, key };
  }
  let section = null;
  for (const a of index) {
    for (const h of a.headings) {
      const s = weight(h.all, h.phrase);
      if (s >= 0.65 && (!section || s > section.score || (s === section.score && a.id < section.a.id))) section = { a, heading: h.text, score: s };
    }
  }
  const exact = best && best.a.phrase.includes(canon(keyword));
  let status = 'GAP';
  if (best && best.score >= 0.75) status = 'COVERED';
  else if (section && section.score > (best?.score ?? 0)) status = 'SECTION';
  else if (best && best.score >= 0.4) status = 'PARTIAL';
  else if (section) status = 'SECTION';
  return { status, article: best?.a ?? null, score: best?.score ?? 0, exact, section };
}

// ---------- SERP analysis ----------

export function resultKind(o, cfg) {
  if (o.domain === cfg.site_domain) return 'own';
  if (cfg.sister_domains.includes(o.domain)) return 'sister';
  for (const d of cfg.domain_types) if (d.rx.test(o.domain)) return d.kind;
  const t = String(o.title ?? '').toLowerCase();
  if (cfg.commercial_title_cues.some((c) => t.includes(c))) return 'business';
  if (cfg.informational_title_cues.some((c) => t.includes(c))) return 'info';
  return 'other';
}

export const KIND_LABEL = {
  own: 'Website này', sister: 'Website chị em', social: 'Mạng xã hội', video: 'Video', forum: 'Diễn đàn', gov: 'Cơ quan nhà nước',
  legal: 'Pháp luật', news: 'Báo chí', travel: 'Du lịch/OTA', appstore: 'Kho ứng dụng', retail: 'Hãng/bán lẻ',
  business: 'Doanh nghiệp (trang bán hàng)', info: 'Blog/hướng dẫn', other: 'Khác'
};
const COMMERCIAL = new Set(['business', 'social', 'appstore', 'retail']);
const INFORMATIONAL = new Set(['info', 'news', 'legal', 'gov', 'forum', 'travel', 'video']);

export function analyzeSerp(q, cfg) {
  const top = q.organic.slice(0, TOP);
  const kinds = top.map((o) => resultKind(o, cfg));
  const com = kinds.filter((k) => COMMERCIAL.has(k)).length;
  const inf = kinds.filter((k) => INFORMATIONAL.has(k)).length;
  const local = q.features.includes('local_pack');
  let intent = 'Hỗn hợp (thương mại + thông tin)';
  if (local || com >= 0.6 * top.length) intent = 'Giao dịch – địa phương';
  else if (inf >= 0.6 * top.length) intent = 'Thông tin';
  const own = q.organic.filter((o) => o.domain === cfg.site_domain);
  const sister = q.organic.filter((o) => cfg.sister_domains.includes(o.domain));
  return {
    query: q.query, cluster: q.cluster, source: q.source, depth: q.depth, collected: q.collected,
    intent, local, ai: q.features.includes('ai_overview'), paa: q.features.includes('people_also_ask'),
    video: q.features.includes('video'), kinds, com, inf,
    own: own.map((o) => ({ position: o.position, url: o.url })), sister: sister.map((o) => ({ position: o.position, domain: o.domain }))
  };
}

function formatFit(s) {
  if (s.intent === 'Giao dịch – địa phương') return 'Trang blog khó vào top: Google ưu tiên trang bán hàng, nhóm Facebook và bản đồ. Đòn bẩy: Google Business Profile, NAP nhất quán, trang /lien-he/ + /gia-thue/.';
  if (s.intent === 'Thông tin') return 'Phù hợp bài/pillar thông tin: trả lời trực tiếp ở đoạn đầu, FAQ, nguồn chính thức.';
  return 'Bài hướng dẫn có khối giá/CTA rõ và liên kết sang trang chuyển đổi.';
}

// ---------- mode switch (real performance data only) ----------

const num = (v) => {
  const s = String(v ?? '').trim().replace('%', '');
  if (!s) return NaN;
  return Number(/,\d{1,2}$/.test(s) && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, ''));
};

/** Parse Search Console exports (UI CSV in EN/VI, or API JSON rows). */
export function parsePerformanceFile(name, text) {
  const rows = [];
  if (/\.json$/i.test(name)) {
    const data = JSON.parse(text);
    for (const r of Array.isArray(data) ? data : (data.rows ?? [])) {
      const keys = r.keys ?? [];
      rows.push({ query: r.query ?? (keys.length === 1 && !/^https?:/.test(keys[0]) ? keys[0] : null), page: r.page ?? (keys.find((k) => /^https?:/.test(k)) ?? null),
        clicks: num(r.clicks), impressions: num(r.impressions), ctr: num(r.ctr), position: num(r.position) });
    }
  } else {
    const csv = parseCsv(text);
    const head = (csv[0] ?? []).map((h) => normKw(h));
    const col = (re) => head.findIndex((h) => re.test(h));
    const iq = col(/^(top queries|queries|query|truy vấn hàng đầu|truy vấn)$/);
    const ip = col(/^(top pages|pages|page|trang hàng đầu|trang)$/);
    const ic = col(/^(clicks|số lượt nhấp|lượt nhấp)$/);
    const ii = col(/^(impressions|số lần hiển thị|lượt hiển thị)$/);
    const ir = col(/^ctr$/);
    const io = col(/^(position|vị trí)$/);
    if ((iq < 0 && ip < 0) || ic < 0 || ii < 0) return [];
    for (const r of csv.slice(1)) {
      rows.push({ query: iq >= 0 ? r[iq] : null, page: ip >= 0 ? r[ip] : null, clicks: num(r[ic]), impressions: num(r[ii]),
        ctr: ir >= 0 ? num(r[ir]) : NaN, position: io >= 0 ? num(r[io]) : NaN });
    }
  }
  return rows.filter((r) => (r.query || r.page) && Number.isFinite(r.impressions));
}

/** ZERO-DATA unless real Search Console rows exist under data/seo/performance/. */
export function detectMode(root = ROOT) {
  const dir = join(root, PERF_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(csv|json)$/i.test(f)).sort() : [];
  const rows = [];
  for (const f of files) for (const r of parsePerformanceFile(f, readFileSync(join(dir, f), 'utf8'))) rows.push({ ...r, file: f });
  return { mode: rows.length ? 'DATA-DRIVEN' : 'ZERO-DATA', files, rows };
}

/** Markdown for DATA-DRIVEN mode, computed only from the exported rows. */
export function dataDrivenReport(rows) {
  const clicks = sum(rows.map((r) => (Number.isFinite(r.clicks) ? r.clicks : 0)));
  const impr = sum(rows.map((r) => r.impressions));
  const withPos = rows.filter((r) => Number.isFinite(r.position));
  const wpos = withPos.length ? sum(withPos.map((r) => r.position * r.impressions)) / Math.max(1, sum(withPos.map((r) => r.impressions))) : NaN;
  const striking = rows.filter((r) => r.query && Number.isFinite(r.position) && r.position >= 4 && r.position <= 20 && r.impressions >= 10)
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position || String(a.query).localeCompare(String(b.query))).slice(0, 50);
  const noClick = rows.filter((r) => r.page && r.impressions >= 20 && (r.clicks ?? 0) === 0)
    .sort((a, b) => b.impressions - a.impressions || String(a.page).localeCompare(String(b.page))).slice(0, 50);
  const L = [];
  L.push('# DATA-DRIVEN — số liệu Search Console thật', '');
  L.push(`Nguồn: ${[...new Set(rows.map((r) => r.file))].join(', ')} (trong \`${PERF_DIR}/\`). Chỉ tính từ các dòng đã xuất; truy vấn ẩn danh của Google không có trong tệp.`, '');
  L.push(`- Lượt nhấp: **${fmt(clicks)}** · Lượt hiển thị: **${fmt(impr)}** · CTR tổng: **${impr ? (100 * clicks / impr).toFixed(2).replace('.', ',') : '—'}%** · Vị trí TB (theo hiển thị): **${Number.isFinite(wpos) ? wpos.toFixed(1).replace('.', ',') : '—'}**`, '');
  L.push('## Truy vấn "sắp lên trang 1" (vị trí 4–20, ≥ 10 hiển thị)', '', '| Truy vấn | Hiển thị | Nhấp | Vị trí |', '|---|---:|---:|---:|');
  for (const r of striking) L.push(`| ${mdCell(r.query)} | ${fmt(r.impressions)} | ${fmt(r.clicks)} | ${r.position.toFixed(1).replace('.', ',')} |`);
  if (!striking.length) L.push('| — | | | |');
  L.push('', '## Trang có hiển thị nhưng chưa có nhấp (≥ 20 hiển thị)', '', '| Trang | Hiển thị | Vị trí |', '|---|---:|---:|');
  for (const r of noClick) L.push(`| ${mdCell(r.page)} | ${fmt(r.impressions)} | ${Number.isFinite(r.position) ? r.position.toFixed(1).replace('.', ',') : '—'} |`);
  if (!noClick.length) L.push('| — | | |');
  L.push('', 'Hành động: viết lại title/meta (qua `data/seo/article-meta.json`) cho trang hiển thị cao nhưng CTR thấp; bổ sung mục/FAQ cho truy vấn vị trí 4–20 qua `tools/seo-body-review.mjs`.', '');
  return L.join('\n');
}

// ---------- full analysis ----------

export function analyze(root = ROOT) {
  const cfg = loadConfig(root);
  const snaps = loadSnapshots(root);
  const demand = loadDemand(root);
  const index = siteIndex(root, cfg);
  const clusters = JSON.parse(reader(root)('data/seo/keyword-clusters.json')).clusters;
  const mode = detectMode(root);
  const serps = snaps.queries.map((q) => ({ ...analyzeSerp(q, cfg), raw: q }));

  // Candidate keywords: measured demand + SERP related searches + People Also Ask text.
  const cand = new Map();
  for (const d of demand.values()) cand.set(d.keyword, { keyword: d.keyword, volume: d.volume, intent: d.intent, origin: d.source });
  for (const s of serps) {
    const key = normKw(s.query);
    if (!cand.has(key)) cand.set(key, { keyword: key, volume: null, intent: null, origin: `SERP ${s.collected}` });
    for (const k of ['related_searches', 'people_also_ask']) {
      for (const t of s.raw[k] ?? []) {
        const kk = normKw(t);
        if (!cand.has(kk)) cand.set(kk, { keyword: kk, volume: null, intent: null, origin: `${k === 'people_also_ask' ? 'PAA' : 'Tìm kiếm liên quan'} của "${s.query}"` });
      }
    }
  }
  const manual = new Map((cfg.manual_review ?? []).flatMap((m) => m.keywords.map((k) => [normKw(k), m])));
  const byId = new Map(index.map((a) => [a.id, a]));
  const keywords = [...cand.values()].map((c) => {
    const sc = classifyScope(c.keyword, cfg);
    let m = sc.scope === 'IN-SCOPE' ? bestMatch(c.keyword, index, cfg) : null;
    const rev = manual.get(c.keyword);
    if (m && rev) m = { ...m, status: rev.status, article: rev.article ? byId.get(rev.article) : m.article, section: rev.status === 'SECTION' ? { a: byId.get(rev.article), heading: '(rà soát thủ công)' } : null, exact: false, note: rev.note };
    return { ...c, ...sc, match: m };
  }).sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.localeCompare(b.keyword));
  const curated = (cfg.curated_topics ?? []).map((t) => {
    const vols = (t.keywords ?? []).map((k) => demand.get(normKw(k))?.volume).filter((v) => v != null);
    return { ...t, demand: vols.length ? sum(vols) : null, measured: vols.length };
  });

  // Competitor map (top 10 of every SERP, own + sister excluded).
  const comp = new Map();
  for (const s of serps) {
    const seen = new Set();
    for (const [i, o] of s.raw.organic.slice(0, TOP).entries()) {
      const k = s.kinds[i];
      if (k === 'own' || k === 'sister' || seen.has(o.domain)) continue;
      seen.add(o.domain);
      const c = comp.get(o.domain) ?? { domain: o.domain, kind: k, queries: 0, top3: 0, positions: [], clusters: new Set() };
      c.queries++; if (o.position <= 3) c.top3++; c.positions.push(o.position); c.clusters.add(s.cluster);
      comp.set(o.domain, c);
    }
  }
  const competitors = [...comp.values()].map((c) => ({ ...c, best: Math.min(...c.positions), avg: sum(c.positions) / c.positions.length, clusters: [...c.clusters].sort() }))
    .sort((a, b) => b.queries - a.queries || a.avg - b.avg || a.domain.localeCompare(b.domain));

  // Cluster rollup.
  const byCluster = new Map(clusters.map((c) => [c.id, { id: c.id, name: c.name, pillar: c.pillar, articles: 0, serps: [], demand: 0, keywords: 0, gaps: 0 }]));
  for (const a of index) if (byCluster.has(a.cluster)) byCluster.get(a.cluster).articles++;
  for (const s of serps) byCluster.get(s.cluster)?.serps.push(s);
  for (const k of keywords.filter((x) => x.scope === 'IN-SCOPE' && x.match?.article)) {
    const c = byCluster.get(k.match.article.cluster);
    if (!c) continue;
    c.keywords++; c.demand += k.volume ?? 0;
    if (k.match.status === 'GAP' || k.match.status === 'PARTIAL') c.gaps++;
  }

  // Site state the research points at.
  const read = reader(root);
  const htmlWithIndexLinks = [];
  for (const a of index) {
    const p = join(root, a.url.slice(1), 'index.html');
    if (existsSync(p) && /href="\/[^"]*\/index\.html"/.test(readFileSync(p, 'utf8'))) htmlWithIndexLinks.push(a.url);
  }
  const indexVariantsInSerp = serps.flatMap((s) => s.own.filter((o) => /\/index\.html$/.test(o.url)).map((o) => ({ query: s.query, url: o.url })));
  const robots = existsSync(join(root, 'robots.txt')) ? read('robots.txt') : '';
  const indexnow = existsSync(join(root, 'config/indexnow.json')) ? JSON.parse(read('config/indexnow.json')) : null;
  const state = {
    sitemapInRobots: robots.includes(`Sitemap: ${SITE}sitemap.xml`),
    indexnow: Boolean(indexnow && existsSync(join(root, `${indexnow.key}.txt`))),
    htmlWithIndexLinks: htmlWithIndexLinks.length,
    indexVariantsInSerp
  };

  return { cfg, snaps, mode, serps, keywords, competitors, clusters: [...byCluster.values()], index, state, curated };
}

// ---------- rendering ----------

export const STATUS_LABEL = { COVERED: 'Đã có bài', SECTION: 'Có mục trong bài', PARTIAL: 'Phủ một phần', GAP: 'Chưa có' };

function gapAction(k) {
  const m = k.match;
  if (m.status === 'COVERED') return m.exact ? 'Giữ nguyên — bài đã nhắm đúng cụm từ' : 'Đã có bài phù hợp; nếu đây là trang đích chính, đưa cụm từ chính xác vào title/meta (data/seo/article-meta.json)';
  if (m.status === 'SECTION') return 'Có mục riêng trong bài; chỉ tách bài mới nếu nhu cầu đủ lớn (cần owner thêm ID vào ma trận)';
  if (m.status === 'PARTIAL') return 'Bổ sung mục/FAQ trả lời đúng câu hỏi vào bài gần nhất (review body) hoặc đề xuất bài mới';
  if (m.score >= 0.3) return 'Kiểm tra bài gần nhất; nếu chưa trả lời đúng câu hỏi, bổ sung mục/FAQ (review body) hoặc đề xuất bài mới';
  return 'Đề xuất bài mới — cần owner thêm ID vào ma trận (writer viết, factory đăng)';
}

function render(r) {
  const files = {};
  const snapDates = r.snaps.files.map((f) => f.collected).join(', ') || '—';
  const inScope = r.keywords.filter((k) => k.scope === 'IN-SCOPE');
  const measured = inScope.filter((k) => k.volume != null);
  const byStatus = (st) => inScope.filter((k) => k.match?.status === st);
  const n = r.serps.length;
  const ownTop10 = r.serps.filter((s) => s.own.some((o) => o.position <= 10));
  const ownAny = r.serps.filter((s) => s.own.length);
  const aiCount = r.serps.filter((s) => s.ai).length;
  const localCount = r.serps.filter((s) => s.local).length;
  const scopeCount = Object.fromEntries(Object.keys(SCOPE_LABEL).map((s) => [s, r.keywords.filter((k) => k.scope === s).length]));

  // --- competitor-map.md
  {
    const L = ['# Bản đồ đối thủ (SERP Google Việt Nam)', '',
      `> Từ ${n} SERP thật (${snapDates}); tính trên top ${TOP} mỗi truy vấn, không gồm website này và website chị em. "TB" = vị trí trung bình khi xuất hiện.`, '',
      '| # | Tên miền | Loại | Số SERP | Top 3 | Tốt nhất | TB | Cụm |', '|---:|---|---|---:|---:|---:|---:|---|'];
    r.competitors.slice(0, 60).forEach((c, i) => L.push(`| ${i + 1} | ${c.domain} | ${KIND_LABEL[c.kind]} | ${c.queries} | ${c.top3} | ${c.best} | ${c.avg.toFixed(1).replace('.', ',')} | ${c.clusters.join(', ')} |`));
    const kinds = {};
    for (const s of r.serps) for (const k of s.kinds) kinds[k] = (kinds[k] ?? 0) + 1;
    L.push('', '## Cơ cấu kết quả top 10 theo loại trang', '', '| Loại trang | Số kết quả | Tỷ lệ |', '|---|---:|---:|');
    const totalK = sum(Object.values(kinds));
    for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) L.push(`| ${KIND_LABEL[k]} | ${v} | ${pct(v, totalK)} |`);
    L.push('', 'Đọc nhanh: nhóm Facebook và trang dịch vụ chiếm phần lớn truy vấn giao dịch; truy vấn pháp lý do trang hỏi đáp pháp luật/báo chí nắm; cẩm nang du lịch và diễn đàn chiếm truy vấn kinh nghiệm. Không mua/đổi link — chỉ xây trích dẫn biên tập tự nhiên.', '');
    files['competitor-map.md'] = L.join('\n');
  }

  // --- serp-intent.md
  {
    const L = ['# Ý định tìm kiếm & tính năng SERP theo truy vấn', '',
      `> ${n} truy vấn tiếng Việt, Google Việt Nam (${snapDates}). AI Overview xuất hiện ở **${aiCount}/${n}** SERP, local pack ở **${localCount}/${n}**. Vị trí của website chỉ là quan sát một thời điểm, không phải thứ hạng ổn định.`, '',
      '| Cụm | Truy vấn | Ý định chiếm ưu thế | AI Overview | Local pack | PAA | Website này | Website chị em | Bài/trang đích gợi ý | Định dạng phù hợp |',
      '|---|---|---|:-:|:-:|:-:|---|---|---|---|'];
    for (const s of r.serps) {
      const m = bestMatch(s.query, r.index, r.cfg);
      const target = classifyScope(s.query, r.cfg).scope === 'IN-SCOPE' && m.article ? m.article.url : '—';
      L.push(`| ${s.cluster} | ${mdCell(s.query)} | ${s.intent} | ${s.ai ? '✓' : ''} | ${s.local ? '✓' : ''} | ${s.paa ? '✓' : ''} | ${s.own.map((o) => `#${o.position}`).join(', ') || '—'} | ${s.sister.map((o) => `#${o.position} ${o.domain}`).join(', ') || '—'} | ${target} | ${formatFit(s)} |`);
    }
    L.push('', `Nguồn: \`${SNAP_DIR}/\` (OpenRush depth 10 / OpenSEO depth 20). PAA/tìm kiếm liên quan chỉ có văn bản khi nguồn trả về.`, '');
    files['serp-intent.md'] = L.join('\n');
  }

  // --- visibility-baseline.md
  {
    const L = ['# Baseline hiển thị (quan sát SERP, không phải Search Console)', '',
      `- Website này xuất hiện trong **${ownAny.length}/${n}** SERP đã quan sát; trong top 10: **${ownTop10.length}**.`,
      `- Website chị em xuất hiện trong **${r.serps.filter((s) => s.sister.length).length}/${n}** SERP.`,
      `- URL dạng \`/index.html\` của website này thấy trên SERP: **${r.state.indexVariantsInSerp.length}**; trang HTML còn link nội bộ dạng \`/index.html\`: **${r.state.htmlWithIndexLinks}**.`, '',
      '| Cụm | Truy vấn | Nguồn (độ sâu) | Vị trí website này | URL | Website chị em |', '|---|---|---|---|---|---|'];
    for (const s of r.serps) {
      L.push(`| ${s.cluster} | ${mdCell(s.query)} | ${s.source} (${s.depth}) | ${s.own.map((o) => `#${o.position}`).join(', ') || 'ngoài top ' + s.depth} | ${s.own.map((o) => o.url.replace(SITE.slice(0, -1), '')).join('<br>') || '—'} | ${s.sister.map((o) => `#${o.position} ${o.domain}`).join(', ') || '—'} |`);
    }
    L.push('', 'Dùng bảng này làm mốc so sánh cho lần chụp SERP sau (cùng truy vấn, cùng thị trường). Khi có Search Console, thay bằng số liệu hiển thị/nhấp thật (chế độ DATA-DRIVEN).', '');
    files['visibility-baseline.md'] = L.join('\n');
  }

  // --- topical-map.md
  {
    const L = ['# Topical map — cụm chủ đề, độ phủ và nhu cầu đo được', '',
      `> Số bài theo cụm lấy từ \`docs/seo/seo-master-matrix.json\`; nhu cầu = tổng volume (công cụ bên thứ ba) của các từ khóa trong phạm vi khớp với bài thuộc cụm; SERP = số truy vấn đã chụp của cụm.`, '',
      '| Cụm | Tên | Pillar | Số bài | Từ khóa đo được | Tổng volume/tháng | Cần bổ sung | SERP | AI Overview | Local pack | Ý định chiếm ưu thế | Website này (top 20) |',
      '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|'];
    for (const c of r.clusters) {
      const intents = {};
      for (const s of c.serps) intents[s.intent] = (intents[s.intent] ?? 0) + 1;
      const dom = Object.entries(intents).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '—';
      const own = c.serps.filter((s) => s.own.some((o) => o.position <= 20)).map((s) => `${s.query} #${s.own[0].position}`);
      L.push(`| ${c.id} | ${mdCell(c.name)} | ${c.pillar} | ${c.articles} | ${c.keywords} | ${fmt(c.demand)} | ${c.gaps} | ${c.serps.length} | ${c.serps.filter((s) => s.ai).length} | ${c.serps.filter((s) => s.local).length} | ${dom} | ${mdCell(own.join('; ')) || '—'} |`);
    }
    L.push('', '## Phân bố từ khóa theo phạm vi', '', '| Phạm vi | Số từ khóa | Ý nghĩa |', '|---|---:|---|');
    const meaning = {
      'IN-SCOPE': 'Có thể phục vụ bằng nội dung của website', SISTER: 'Không nhắm (tránh ăn thịt từ khóa với site chị em)',
      'OUT-INTENT': 'Ý định khác (thi bằng, mua xe, ô tô…) — bỏ qua', 'OUT-MARKET': 'Thành phố khác — cửa hàng chỉ ở Hà Nội',
      'TRIP-DEST': 'Thuê tại điểm đến — chỉ dùng góc hành trình từ Hà Nội', 'LOCAL-PACK': 'Ý định "gần tôi" — Google Business Profile',
      UNVERIFIED: 'Dịch vụ chưa có trong dữ liệu kinh doanh đã xác minh — chỉ viết thông tin'
    };
    for (const [s, label] of Object.entries(SCOPE_LABEL)) L.push(`| ${label} | ${scopeCount[s]} | ${meaning[s]} |`);
    L.push('');
    files['topical-map.md'] = L.join('\n');
  }

  // --- content-gap.md
  {
    const rows = inScope.filter((k) => k.volume == null || k.volume >= 10);
    const L = ['# Content gap — nhu cầu thật so với kho bài', '',
      `> ${inScope.length} từ khóa trong phạm vi (${measured.length} có volume đo được). Trạng thái: **${byStatus('COVERED').length}** đã có bài · **${byStatus('SECTION').length}** có mục trong bài · **${byStatus('PARTIAL').length}** phủ một phần · **${byStatus('GAP').length}** chưa có. Khớp theo từ khóa SEO, title và H2/H3 của ${r.index.length} bài đã đăng.`, '',
      '## Chủ đề mới phát hiện từ SERP/tin tức (cần kiểm chứng văn bản gốc trước khi viết)', ''];
    for (const t of r.curated) {
      L.push(`### ${t.topic} (${t.cluster})`, '', `- Bằng chứng: SERP "${t.evidence_query}" — ${t.observed}`,
        `- Nhu cầu đo được: ${t.demand == null ? 'chưa đo' : `${fmt(t.demand)}/tháng (tổng ${t.measured} từ khóa: ${t.keywords.join('; ')})`}`,
        `- Nguồn cần đối chiếu: ${t.sources_to_verify.join(' · ')}`, `- Hành động: ${t.action}`, '');
    }
    L.push('## Từ khóa trong phạm vi (volume giảm dần; "—" = chưa đo, lấy từ SERP)', '',
      '| Từ khóa | Volume/tháng | Nguồn | Trạng thái | Bài gần nhất | Hành động |', '|---|---:|---|---|---|---|');
    for (const k of rows) {
      const m = k.match;
      const where = m.status === 'SECTION' ? `${m.section.a.url} (mục "${mdCell(m.section.heading)}")` : (m.article ? m.article.url : '—');
      L.push(`| ${mdCell(k.keyword)} | ${fmt(k.volume)} | ${mdCell(k.origin)} | ${STATUS_LABEL[m.status]}${m.note ? ' (rà soát thủ công)' : ''} | ${where} | ${m.note ? mdCell(m.note) + ' — ' : ''}${gapAction(k)} |`);
    }
    L.push('', '## Từ khóa có nhu cầu nhưng không nhắm (lý do)', '', '| Từ khóa | Volume/tháng | Phạm vi | Lý do |', '|---|---:|---|---|');
    for (const k of r.keywords.filter((x) => x.scope !== 'IN-SCOPE' && (x.volume ?? 0) >= 500)) L.push(`| ${mdCell(k.keyword)} | ${fmt(k.volume)} | ${SCOPE_LABEL[k.scope]} | ${mdCell(k.reason)} |`);
    L.push('');
    files['content-gap.md'] = L.join('\n');
  }

  // --- README.md (mode, inputs, findings, roadmap)
  {
    const topGaps = inScope.filter((k) => k.volume != null && (k.match.status === 'GAP' || k.match.status === 'PARTIAL')).slice(0, 8);
    const topCovered = inScope.filter((k) => k.volume != null && k.match.status === 'COVERED' && !k.match.exact).slice(0, 8);
    const app = r.serps.filter((s) => s.cluster === 'K01');
    const L = [`# SEO cold-start — chế độ ${r.mode.mode}`, '',
      r.mode.mode === 'ZERO-DATA'
        ? `> Chưa có dữ liệu Search Console/GA4/thứ hạng thật trong \`${PERF_DIR}/\`, nên mọi quyết định dựa trên SERP thật, nhu cầu từ khóa đo bởi công cụ bên thứ ba và dữ liệu sẵn có của repo. Không có số liệu ước đoán. Khi có tệp xuất Search Console, chạy lại công cụ — chế độ tự chuyển sang DATA-DRIVEN (xem [data-driven.md](data-driven.md)).`
        : `> Đã có ${r.mode.rows.length} dòng Search Console thật trong \`${PERF_DIR}/\` (${r.mode.files.join(', ')}). Số liệu hiệu suất: [data-driven.md](data-driven.md); nghiên cứu SERP bên dưới vẫn dùng làm bối cảnh.`,
      '', '## Dữ liệu đầu vào', '',
      `- SERP: ${n} truy vấn tiếng Việt, Google Việt Nam — \`${SNAP_DIR}/\` (${r.snaps.files.map((f) => `${f.file}: ${f.queries} truy vấn`).join('; ')}).`,
      `- Nhu cầu từ khóa: ${r.keywords.filter((k) => k.volume != null).length} từ khóa có volume (\`data/seo/keyword-demand.json\`, \`data/seo/keyword-clusters.json\`).`,
      `- Kho bài: ${r.index.length} bài đã đăng (title/từ khóa SEO, H2/H3), 20 cụm K01–K20.`,
      '- Tín hiệu sớm sẵn có: `docs/INDEX-MONITORING-20261013.md` ghi một ảnh chụp Search Console rời rạc (9–10/10/2026: 130 lượt hiển thị, 3 lượt nhấp; trang Hồ Tây và Hoàn Kiếm có hiển thị). Repo không có tệp xuất nên số này chỉ là bối cảnh, không kích hoạt DATA-DRIVEN.', '',
      '## Phát hiện chính', '',
      `1. **AI Overview ở ${aiCount}/${n} SERP** — câu trả lời trực tiếp, FAQ và nguồn chính thức trong bài là điều kiện để được trích dẫn (GEO).`,
      `2. **Local pack ở ${localCount}/${n} SERP**, đều là truy vấn giao dịch theo khu vực — Google ưu tiên bản đồ, nhóm Facebook và trang dịch vụ; bài blog khó vào top cho các truy vấn này.`,
      `3. **Website này đã xuất hiện ở ${ownAny.length}/${n} SERP** (top 10: ${ownTop10.length}). Cụm ứng dụng (K01): ${app.map((s) => `"${s.query}" ${s.own.map((o) => '#' + o.position).join(', ') || '—'}`).join('; ')}.`,
      `4. **${r.state.indexVariantsInSerp.length} URL dạng /index.html** của website đang hiển thị trên SERP (trùng URL chuẩn) — trang HTML còn link nội bộ dạng này: ${r.state.htmlWithIndexLinks}.`,
      `5. **Phạm vi từ khóa**: ${scopeCount['IN-SCOPE']} trong phạm vi; ${scopeCount['OUT-MARKET']} thuộc thành phố khác; ${scopeCount['OUT-INTENT']} ý định khác; ${scopeCount.SISTER} do site chị em sở hữu; ${scopeCount['LOCAL-PACK']} ý định "gần tôi"; ${scopeCount.UNVERIFIED} dịch vụ chưa xác minh.`,
      `6. **Độ phủ nội dung**: ${byStatus('COVERED').length} đã có bài, ${byStatus('SECTION').length} có mục, ${byStatus('PARTIAL').length} phủ một phần, ${byStatus('GAP').length} chưa có (chi tiết: [content-gap.md](content-gap.md)).`, '',
      '## Lộ trình (ưu tiên)', '',
      '| Ưu tiên | Hạng mục | Bằng chứng | Hành động | Trạng thái |', '|---|---|---|---|---|',
      `| P0 | URL trùng /index.html | ${r.state.indexVariantsInSerp.length} URL trên SERP | Chuẩn hóa link nội bộ về dạng thư mục khi build; canonical tự trỏ đã có | ${r.state.htmlWithIndexLinks === 0 ? 'Đã xử lý' : 'Cần xử lý'} |`,
      `| P0 | Khám phá URL không cần Search Console | sitemap trong robots.txt: ${r.state.sitemapInRobots ? 'có' : 'không'} | IndexNow (Bing, Yandex, Seznam, Naver…) cho URL mới/cập nhật | ${r.state.indexnow ? 'Đã triển khai' : 'Cần triển khai'} |`,
      '| P0 | Chuyển sang DATA-DRIVEN | chưa có dữ liệu thật | Owner xác minh Google Search Console + Bing Webmaster Tools cho đúng subdomain, xuất "Queries"/"Pages" vào `data/seo/performance/` | Chờ owner |',
      ...topGaps.map((k) => `| P1 | Nội dung: "${mdCell(k.keyword)}" | ${fmt(k.volume)}/tháng, ${STATUS_LABEL[k.match.status].toLowerCase()} | ${gapAction(k)}${k.match.article ? ` (gần nhất: ${k.match.article.url})` : ''} | Đề xuất |`),
      ...topCovered.map((k) => `| P2 | Khớp cụm từ: "${mdCell(k.keyword)}" | ${fmt(k.volume)}/tháng | Bài ${k.match.article.url} đã phủ; cân nhắc đưa cụm từ chính xác vào title/meta | Đề xuất |`),
      ...r.curated.map((t) => `| P1 | Chủ đề mới: ${mdCell(t.topic)} | SERP "${mdCell(t.evidence_query)}"${t.demand == null ? '' : `; ${fmt(t.demand)}/tháng đo được`} | Bài mới sau khi đối chiếu văn bản gốc (cần owner thêm ID vào ma trận) | Đề xuất |`),
      '| P2 | Truy vấn địa phương/gần tôi | local pack trên mọi truy vấn quận/khu vực | Google Business Profile, NAP khớp `data/business/business.json`, ảnh thật; trang /lien-he/ có LocalBusiness schema | Chờ owner |',
      '| P2 | Trích dẫn (off-page) | diễn đàn, cẩm nang du lịch, báo chí chiếm truy vấn kinh nghiệm | Chỉ trích dẫn/biên tập tự nhiên; không mua link, không spam nhóm Facebook | Liên tục |',
      `| P3 | Làm mới SERP | mốc ${snapDates} | Chụp lại cùng bộ truy vấn sau ${STALE_DAYS} ngày, so với visibility-baseline | Định kỳ |`, '',
      '## Tệp chi tiết', '',
      '- [competitor-map.md](competitor-map.md) — đối thủ theo tên miền và loại trang',
      '- [serp-intent.md](serp-intent.md) — ý định, tính năng SERP, trang đích gợi ý từng truy vấn',
      '- [topical-map.md](topical-map.md) — cụm chủ đề, số bài, nhu cầu đo được',
      '- [content-gap.md](content-gap.md) — độ phủ từng từ khóa và đề xuất',
      '- [visibility-baseline.md](visibility-baseline.md) — vị trí quan sát được của website',
      '- [cold-start.json](cold-start.json) — dữ liệu máy đọc', '',
      '## Quy tắc', '',
      '- Không bịa số liệu: volume chỉ lấy từ công cụ (ghi nguồn, ngày); vị trí chỉ lấy từ SERP đã chụp; "—" nghĩa là chưa đo.',
      '- Không nhắm từ khóa thương mại của site chị em (`config/seo-ownership.json`), không tạo doorway theo thành phố khác.',
      '- Bài mới chỉ qua ma trận + writer + factory (AGENTS.md); sửa bài đã đăng chỉ qua `tools/seo-body-review.mjs`; title/meta qua `data/seo/article-meta.json`.', ''];
    files['README.md'] = L.join('\n');
  }

  // --- cold-start.json (machine readable, one record per line)
  {
    const recs = {
      mode: r.mode.mode,
      snapshots: r.snaps.files.map((f) => ({ file: f.file, collected: f.collected, queries: f.queries })),
      summary: { serps: n, ai_overview: aiCount, local_pack: localCount, own_in_serp: ownAny.length, own_top10: ownTop10.length, scope: scopeCount,
        coverage: Object.fromEntries(Object.keys(STATUS_LABEL).map((s) => [s, byStatus(s).length])), state: { ...r.state, indexVariantsInSerp: r.state.indexVariantsInSerp.length } },
      serps: r.serps.map((s) => ({ query: s.query, cluster: s.cluster, intent: s.intent, ai: s.ai, local: s.local, paa: s.paa, own: s.own.map((o) => o.position), sister: s.sister.map((o) => `${o.position} ${o.domain}`) })),
      keywords: r.keywords.map((k) => ({ keyword: k.keyword, volume: k.volume, scope: k.scope, status: k.match?.status ?? null, article: k.match?.article?.id ?? null }))
    };
    const lines = ['{', `"mode":${JSON.stringify(recs.mode)},`, `"snapshots":${JSON.stringify(recs.snapshots)},`, `"summary":${JSON.stringify(recs.summary)},`,
      '"serps":[', recs.serps.map((x) => JSON.stringify(x)).join(',\n'), '],', '"keywords":[', recs.keywords.map((x) => JSON.stringify(x)).join(',\n'), ']}'];
    files['cold-start.json'] = lines.join('\n') + '\n';
  }

  if (r.mode.mode === 'DATA-DRIVEN') files['data-driven.md'] = dataDrivenReport(r.mode.rows);
  return files;
}

export function build(root = ROOT) {
  return render(analyze(root));
}

export function main(argv = process.argv.slice(2), root = ROOT) {
  const files = build(root);
  const stale = [];
  for (const [name, text] of Object.entries(files)) {
    const p = join(root, OUT_DIR, name);
    if (!existsSync(p) || readFileSync(p, 'utf8') !== text) stale.push(name);
  }
  const extra = existsSync(join(root, OUT_DIR, 'data-driven.md')) && !files['data-driven.md'] ? ['data-driven.md (mode is ZERO-DATA)'] : [];
  const snaps = loadSnapshots(root).files;
  const latest = snaps.map((f) => f.collected).sort().at(-1);
  if (latest) {
    const age = Math.floor((Date.now() - Date.parse(`${latest}T00:00:00Z`)) / 86400000);
    if (age > STALE_DAYS) console.warn(`warning: newest SERP snapshot ${latest} is ${age} days old (> ${STALE_DAYS}); refresh ${SNAP_DIR}/`);
  }
  if (argv.includes('--check')) {
    if (stale.length || extra.length) {
      console.error(`stale cold-start reports: ${[...stale, ...extra].join(', ')} — run node tools/seo-cold-start.mjs`);
      return 1;
    }
    console.log(`cold-start reports up to date (${Object.keys(files).length} files, mode ${files['README.md'].match(/chế độ ([A-Z-]+)/)[1]})`);
    return 0;
  }
  mkdirSync(join(root, OUT_DIR), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, OUT_DIR, name), text, 'utf8');
  if (extra.length) unlinkSync(join(root, OUT_DIR, 'data-driven.md'));
  console.log(`wrote ${Object.keys(files).length} files to ${OUT_DIR}/ (${stale.length} changed)`);
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exitCode = main();
}
