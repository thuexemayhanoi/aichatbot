#!/usr/bin/env node
/**
 * SEO MASTER BATTLE MATRIX — "10 vũ khí" (v73), ZERO-DATA mode.
 *
 * Ten matrices for a site without Search Console / GA4, built only from what
 * was observed or measured and committed under data/seo/:
 *   W1  Competitor Intelligence  — domains in the captured Google top 10
 *       (data/seo/serp-snapshots) + DataForSEO Labs visibility
 *       (data/seo/battle/serp-competitors-labs.json) + audited pages
 *   W2  Keyword Master           — every researched keyword with its measured
 *       volumes (two tools, never merged), difficulty, intents, SERP features,
 *       observed positions, reference URL, data confidence and priority
 *   W3  Competitor Weakness      — observable weaknesses of the ranking pages
 *       (data/seo/battle/page-audits.json) and what a better page needs
 *   W4  Keyword Gap / Opportunity— keyword sets of the strongest competitors
 *       vs. this site, opportunity tiers P0/P1/P2
 *   W5  Topic Cluster            — K01–K20: pillar, hubs, supporting pages,
 *       FAQ questions, internal links, one intent per URL
 *   W6  SERP Benchmark           — structure of the pages ranking for each
 *       query vs. the page this site puts forward
 *   W7  AI Search (GEO/AEO)      — question queries, AI Overview sources seen,
 *       answer forms, entities, what the target page still lacks
 *   W8  Backlink / Authority     — observed link sources of the competitors
 *       (listings, forums, press, official), risk and quality labels
 *   W9  URL Architecture         — one keyword, intent, position and
 *       conversion goal per URL for the whole site + proposed pages
 *   W10 Master Battle Matrix     — every action of W1–W9 ranked P0/P1/P2 with
 *       its evidence, a 30/60/90-day roadmap, KPIs and verification conditions
 *
 * Everything reuses the engine (tools/seo-engine.mjs: groups, targets,
 * priority) and the cold-start research (tools/seo-cold-start.mjs). Numbers
 * are observed (SERP capture, page audit) or measured (keyword tools); the few
 * derived scores print their formula. Nothing here edits the site.
 *
 * Usage:
 *   node tools/seo-battle-matrix.mjs           # write docs/seo/battle/*
 *   node tools/seo-battle-matrix.mjs --check   # exit 1 when the reports are stale
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/config/site.js';
import { taxonomy, viSlug } from './taxonomy.mjs';
import { parseCsv } from './seo-index-coverage.mjs';
import { FOUNDATION_ROWS } from './matrix-size.mjs';
import { engineContext, runEngine, normUrl, landing, ACTION_LABEL } from './seo-engine.mjs';
import { normKw, toks, canon, fmt, mdCell, sum, resultKind, KIND_LABEL, STATUS_LABEL } from './seo-cold-start.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = 'docs/seo/battle';
export const DATA_DIR = 'data/seo/battle';
export const LABS_PATH = `${DATA_DIR}/serp-competitors-labs.json`;
export const METRICS_PATH = `${DATA_DIR}/keyword-metrics.json`;
export const AUDITS_PATH = `${DATA_DIR}/page-audits.json`;
export const BACKLINKS_PATH = `${DATA_DIR}/backlink-sources.json`;
const TOP = 10;
const LEGAL_CLUSTERS = new Set(['K09', 'K10', 'K11']);
const LEGAL_Q_RX = /phạt|lỗi|luật|quy định|cấm|bằng lái|giấy phép|nghị định|chuẩn|bảo hiểm|trách nhiệm|tuổi|nồng độ cồn/iu;
/** K09/K11 queries are legal topics; K10 (riding safety) only when the query asks about a fine, rule or standard. */
export const legalQuery = (query, cluster) => LEGAL_CLUSTERS.has(cluster) && (cluster !== 'K10' || LEGAL_Q_RX.test(String(query)));
const SOCIAL = new Set(['social', 'video', 'appstore']);

const read = (root, p) => readFileSync(join(root, p), 'utf8');
const loadJson = (root, p) => (existsSync(join(root, p)) ? JSON.parse(read(root, p)) : null);
const median = (xs) => { const a = xs.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
const share = (xs, f) => (xs.length ? Math.round((100 * xs.filter(f).length) / xs.length) : null);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (rows, cols = Object.keys(rows[0] ?? {})) => [cols.map(csvCell).join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
const table = (rows, cols) => [`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${cols.map((c) => mdCell(r[c] == null ? '—' : r[c])).join(' | ')} |`)].join('\n');
const TIER = (score) => (score >= 1000 ? 'P0' : score >= 100 ? 'P1' : 'P2');
const stripTags = (h) => String(h).replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const LEGAL_RX = /(nghị định\s*\d+\/\d{4}\/NĐ-CP|luật\s+(?:trật tự, an toàn giao thông đường bộ|giao thông đường bộ)[^.;,]{0,20}|thông tư\s*\d+\/\d{4}\/TT-[A-Z]+|quyết định\s*\d+\/\d{4}\/QĐ-[A-Z]+|nghị quyết\s*\d+\/\d{4}\/NQ-[A-ZĐ]+|bộ luật\s+(?:dân sự|hình sự)[^.;,]{0,25}|luật\s+[^.;,]{0,60}?số\s*\d+\/\d{4}\/QH\d+)/giu;
const ARTICLE_SCHEMA = new Set(['Article', 'NewsArticle', 'BlogPosting', 'FAQPage', 'HowTo', 'QAPage']);
const CORE_STOP = new Set(['là', 'gì', 'bao', 'nhiêu', 'không', 'có', 'của', 'và', 'cho', 'khi', 'ở', 'tại', 'năm', 'mới', 'nhất', 'được', 'cần', 'nào', 'thế', 'như', 'theo']);
const coreWords = (q) => toks(q).filter((t) => !CORE_STOP.has(t));

// ---------- data ----------

/** Observable features of one of this site's built pages (same fields as the competitor audit). */
export function ownPageFeatures(root, url) {
  const path = join(root, url.replace(/^\//, ''), 'index.html');
  if (!existsSync(path)) return null;
  const html = readFileSync(path, 'utf8');
  const body = html.match(/<article class="blog-article-body">([\s\S]*?)<\/article>/)?.[1] ?? html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? html;
  const text = stripTags(body);
  const heads = (lvl, h = body) => [...h.matchAll(new RegExp(`<h${lvl}[^>]*>([\\s\\S]*?)</h${lvl}>`, 'g'))].map((m) => stripTags(m[1]));
  const links = [...body.matchAll(/<a[^>]+href="([^"]+)"/g)].map((m) => m[1]);
  const internal = links.filter((l) => l.startsWith('/') || l.startsWith(SITE)).length;
  const types = new Set();
  for (const m of html.matchAll(/<script[^>]+ld\+json[^>]*>([\s\S]*?)<\/script>/g)) for (const t of m[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)) types.add(t[1]);
  const lead = stripTags(html.match(/<p class="blog-screen-lead">([\s\S]*?)<\/p>/)?.[1] ?? '');
  const firstP = stripTags(body.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
  const h2 = heads(2);
  return {
    url, title: stripTags(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''), description: html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '',
    published: html.match(/"datePublished":"([^"]+)"/)?.[1] ?? null, modified: html.match(/"dateModified":"([^"]+)"/)?.[1] ?? null,
    h1: heads(1, html).slice(0, 1), h2, h3_count: heads(3).length, words: text ? text.split(' ').length : 0,
    images: (body.match(/<img\b/g) ?? []).length, links_internal: internal, links_external: links.length - internal,
    tables: (body.match(/<table\b/g) ?? []).length, lists: (body.match(/<(ul|ol)\b/g) ?? []).length,
    faq_heading: h2.concat(heads(3)).some((h) => /câu hỏi thường gặp|hỏi đáp|faq|thắc mắc/i.test(h)),
    schema: [...types].sort(), legal_sources: [...new Set((text.match(LEGAL_RX) ?? []).map((s) => s.trim()))].slice(0, 12),
    lead, first_paragraph: firstP.slice(0, 300)
  };
}

/** Research files of the battle matrix (each one says where its numbers come from). */
export function loadBattleData(root = ROOT) {
  const labs = loadJson(root, LABS_PATH);
  const metrics = loadJson(root, METRICS_PATH);
  const audits = loadJson(root, AUDITS_PATH);
  const backlinks = loadJson(root, BACKLINKS_PATH);
  const metricOf = new Map((metrics?.keywords ?? []).map((k) => [normKw(k.keyword), k]));
  const auditOf = new Map((audits?.pages ?? []).map((p) => [normUrl(p.url), p]));
  const labsOf = new Map((labs?.competitors ?? []).map((c) => [c.domain.replace(/^www\./, ''), c]));
  return { labs, metrics, audits, backlinks, metricOf, auditOf, labsOf };
}

/** Engine run + research files + this site's own pages, shared by every weapon. */
export function battleContext(root = ROOT, { context = null } = {}) {
  const ctx = context ?? engineContext(root);
  const e = runEngine(root, { health: false, context: ctx });
  const data = loadBattleData(root);
  const matrix = loadJson(root, 'docs/seo/seo-master-matrix.json');
  const urlRows = new Map((matrix?.rows ?? []).map((r) => [r.URL, r]));
  const own = new Map();
  const ownOf = (url) => { if (!url) return null; if (!own.has(url)) own.set(url, ownPageFeatures(root, url)); return own.get(url); };
  // SERP queries → the engine group that owns them.
  const groupOfQuery = new Map();
  for (const g of e.groups) for (const q of g.serp.queries) groupOfQuery.set(normKw(q), g);
  const groupOfKeyword = new Map();
  for (const g of e.groups) for (const m of g.members) groupOfKeyword.set(normKw(m.keyword), g);
  return { root, e, cs: ctx.cs, cfg: ctx.cs.cfg, data, matrix, urlRows, ownOf, groupOfQuery, groupOfKeyword, clusters: e.clusters };
}

const clusterName = (b, id) => b.clusters.find((c) => c.id === id)?.name ?? '';

// ---------- W1 competitor intelligence ----------

export const THREAT_RULE = 'Mức đe dọa: CAO = ≥ 3 lần top 3 trong SERP đã chụp hoặc visibility Labs ≥ 2; TRUNG BÌNH = ≥ 3 truy vấn top 10 hoặc có dữ liệu Labs; THẤP = còn lại. Mạng xã hội/video/kho ứng dụng là người chiếm SERP, không phải đối thủ nội dung.';

export function competitorIntelligence(b) {
  const { cs, data } = b;
  const rows = [];
  for (const c of cs.competitors) {
    const labs = data.labsOf.get(c.domain.replace(/^www\./, ''));
    const audited = (data.audits?.pages ?? []).filter((p) => p.domain === c.domain.replace(/^www\./, '') && !p.unavailable);
    const evidence = cs.serps.flatMap((s) => s.raw.organic.slice(0, TOP).filter((o) => o.domain === c.domain).map((o) => ({ query: s.query, position: o.position, url: o.url, cluster: s.cluster })))
      .sort((x, y) => x.position - y.position || x.query.localeCompare(y.query));
    const threat = SOCIAL.has(c.kind) ? 'SERP (không phải nội dung)' : (c.top3 >= 3 || (labs?.visibility ?? 0) >= 2) ? 'CAO' : (c.queries >= 3 || labs) ? 'TRUNG BÌNH' : 'THẤP';
    rows.push({
      domain: c.domain, kind: c.kind, type: KIND_LABEL[c.kind] ?? c.kind, queries: c.queries, top3: c.top3, best: c.best, avg: Math.round(c.avg * 10) / 10,
      clusters: c.clusters, labs: labs ? { rating: labs.rating, etv: labs.etv, visibility: labs.visibility, keywords: labs.keywords_count, avg: labs.avg_position } : null,
      audited: audited.length, words: median(audited.map((p) => p.words)), faq: share(audited, (p) => p.faq_heading || p.schema?.includes('FAQPage')),
      schema: share(audited, (p) => p.schema?.some((t) => ARTICLE_SCHEMA.has(t))), legal: share(audited, (p) => (p.legal_sources ?? []).length > 0),
      threat, evidence: evidence.slice(0, 6), social: SOCIAL.has(c.kind)
    });
  }
  // Labs-only domains (visible in the Labs index for the asked keywords, not in a captured top 10).
  for (const l of data.labs?.competitors ?? []) {
    if (rows.some((r) => r.domain.replace(/^www\./, '') === l.domain)) continue;
    const kind = resultKind({ domain: l.domain, title: '' }, b.cfg);
    rows.push({ domain: l.domain, kind, type: KIND_LABEL[kind] ?? kind, queries: 0, top3: 0, best: null, avg: null, clusters: [],
      labs: { rating: l.rating, etv: l.etv, visibility: l.visibility, keywords: l.keywords_count, avg: l.avg_position }, audited: 0, words: null, faq: null, schema: null, legal: null,
      threat: SOCIAL.has(kind) ? 'SERP (không phải nội dung)' : l.visibility >= 2 ? 'CAO' : 'TRUNG BÌNH', evidence: Object.entries(l.positions ?? {}).map(([query, p]) => ({ query, position: Math.min(...p), url: '', cluster: '' })), social: SOCIAL.has(kind) });
  }
  const order = { CAO: 0, 'TRUNG BÌNH': 1, THẤP: 2, 'SERP (không phải nội dung)': 3 };
  rows.sort((x, y) => order[x.threat] - order[y.threat] || y.queries - x.queries || y.top3 - x.top3 || (y.labs?.visibility ?? 0) - (x.labs?.visibility ?? 0) || x.domain.localeCompare(y.domain));
  const content = rows.filter((r) => !r.social);
  return { rows, selected: content.slice(0, 30), social: rows.filter((r) => r.social), strongest: content.filter((r) => r.threat !== 'THẤP').slice(0, 10) };
}

// ---------- W2 keyword master ----------

export const CONFIDENCE = {
  TWO: 'Đo được (2 công cụ)', ONE: 'Đo được (1 công cụ)', SERP: 'Chỉ có SERP (chưa đo volume)', NONE: 'Chưa đo (ứng viên từ PAA/tìm kiếm liên quan)', ASKED: 'Đã hỏi công cụ, không trả số'
};

export function keywordMaster(b) {
  const { e, cs, data } = b;
  const rows = [];
  for (const k of e.keywords) {
    const key = normKw(k.keyword);
    const m = data.metricOf.get(key);
    const serp = e.serpByQuery.get(key);
    const g = b.groupOfKeyword.get(key);
    const top = serp?.raw.organic.filter((o) => !['own', 'sister'].includes(resultKind(o, b.cfg))).slice(0, 3) ?? [];
    const volA = k.volume ?? null; // keyword-demand.json (OpenRush / supplements)
    const volB = m?.search_volume ?? null; // DataForSEO via OpenSEO
    const confidence = volA != null && volB != null ? 'TWO' : volA != null || volB != null ? 'ONE' : serp ? 'SERP' : k.attempted ? 'ASKED' : 'NONE';
    const priority = g?.priority ?? 0;
    rows.push({
      keyword: k.keyword, scope: k.scope, cluster: g?.cluster ?? serp?.cluster ?? k.match?.article?.cluster ?? '', group: g?.id ?? '',
      volumeA: volA, sourceA: volA != null ? k.origin : '', volumeB: volB, kd: m?.keyword_difficulty ?? null, toolIntent: m?.main_intent ?? k.intent ?? '',
      serpIntent: serp?.intent ?? '', features: serp ? [serp.ai ? 'AI Overview' : '', serp.local ? 'local pack' : '', serp.paa ? 'PAA' : '', serp.video ? 'video' : ''].filter(Boolean).join(', ') : '',
      ownBest: serp?.own[0]?.position ?? null, sisterBest: serp?.sister[0] ? `#${serp.sister[0].position} ${serp.sister[0].domain}` : '',
      topDomain: top[0]?.domain ?? '', referenceUrl: top[0]?.url ?? '', top3: top.map((o) => `#${o.position} ${o.domain}`).join('; '),
      status: k.match ? STATUS_LABEL[k.match.status] : '', target: g ? landing(g) : (k.match?.article?.url ?? ''),
      action: g ? ACTION_LABEL[g.action] : '', priority, tier: g && !['KEEP', 'MONITOR', 'LOCAL_ONLY'].includes(g.action) ? TIER(priority) : '', confidence: CONFIDENCE[confidence], confidenceKey: confidence
    });
  }
  rows.sort((x, y) => (y.volumeA ?? y.volumeB ?? -1) - (x.volumeA ?? x.volumeB ?? -1) || x.keyword.localeCompare(y.keyword));
  const measured = rows.filter((r) => r.volumeA != null || r.volumeB != null);
  return { rows, measured: measured.length, withKd: rows.filter((r) => r.kd != null).length, withSerp: rows.filter((r) => r.serpIntent).length,
    bothTools: rows.filter((r) => r.confidenceKey === 'TWO').length, sources: [...new Set([...(data.metrics?.sources ?? []).map((s) => `${s.tool} ${s.retrieved}`), ...cs.snaps.files.map((f) => `SERP ${f.file}`)])] };
}

// ---------- W3 competitor weakness ----------

export const WEAKNESS = {
  UNAVAILABLE: 'Không tải được (chặn bot/lỗi máy chủ) — người dùng cũng có thể gặp lỗi',
  THIN: 'Nội dung mỏng (< 600 từ phần chính)',
  NO_FAQ: 'Không có mục câu hỏi thường gặp / FAQPage',
  NO_SCHEMA: 'Không có schema bài viết (Article/NewsArticle/BlogPosting/FAQPage)',
  NO_LEGAL_SOURCE: 'Chủ đề pháp lý nhưng không nêu văn bản pháp luật nào',
  OLD_LAW: 'Chỉ dẫn Nghị định 100/2019 (đã bị thay bởi Nghị định 168/2024 từ 01/01/2025)',
  OLD_YEAR: 'Năm trong tiêu đề ≤ 2024 (người đọc coi là cũ)',
  NO_TABLE: 'Truy vấn cần bảng số liệu/giá nhưng trang không có bảng',
  NO_DATE: 'Không có ngày đăng/cập nhật trong metadata',
  OTHER_CITY: 'Tiêu đề nhắm thành phố khác (không trả lời góc Hà Nội)',
  OFF_TOPIC: 'Trang về ô tô/chủ đề khác trả lời truy vấn xe máy',
  LISTING: 'Trang danh sách/công cụ, ít nội dung giải thích',
  FORUM: 'Nội dung diễn đàn/UGC không có cấu trúc trả lời',
  FEW_HEADINGS: 'Bài dài nhưng ít tiêu đề H2 (khó quét)',
  NO_ANSWER_FIRST: 'Đoạn đầu không trả lời thẳng câu hỏi (các từ khóa chính vắng mặt)'
};
const NUMERIC_RX = /bao nhiêu|mức phạt|giá|bảng|các loại|so sánh|phí/u;

/** Observable weaknesses of a ranking page for the query it ranks for. */
export function weaknessesOf(page, { query = '', cluster = '', kind = 'other' } = {}) {
  const out = [];
  if (page.unavailable) return ['UNAVAILABLE'];
  const legalTopic = LEGAL_CLUSTERS.has(cluster) || /phạt|bằng lái|giấy phép|luật|nghị định|nồng độ cồn|tuổi/u.test(normKw(query));
  const title = String(page.title ?? '').toLowerCase();
  if (page.words != null && page.words < 600) out.push(page.words < 300 && (page.links_internal + page.links_external) > 50 ? 'LISTING' : 'THIN');
  if (!page.faq_heading && !page.schema?.includes('FAQPage')) out.push('NO_FAQ');
  if (!page.schema?.some((t) => ARTICLE_SCHEMA.has(t))) out.push('NO_SCHEMA');
  if (legalTopic && !(page.legal_sources ?? []).length) out.push('NO_LEGAL_SOURCE');
  if ((page.legal_sources ?? []).some((s) => /100\/2019/.test(s)) && !(page.legal_sources ?? []).some((s) => /168\/2024/.test(s))) out.push('OLD_LAW');
  const years = (page.title_years ?? []).map(Number);
  if (years.length && Math.max(...years) <= 2024) out.push('OLD_YEAR');
  if (NUMERIC_RX.test(normKw(query)) && !page.tables) out.push('NO_TABLE');
  if (!page.published && !page.modified) out.push('NO_DATE');
  if ((page.title_other_city ?? []).length && /hà nội|ha noi/u.test(normKw(query))) out.push('OTHER_CITY');
  if (/ô tô|xe hơi/u.test(title) && !/xe máy|mô tô/u.test(title) && /xe máy/u.test(normKw(query))) out.push('OFF_TOPIC');
  if (kind === 'forum') out.push('FORUM');
  if (page.words > 800 && (page.h2 ?? []).length < 3) out.push('FEW_HEADINGS');
  const core = coreWords(query);
  const first = canon(`${page.h1?.[0] ?? ''} ${page.first_paragraph ?? ''}`);
  if (core.length && page.first_paragraph && core.filter((t) => first.includes(t)).length < Math.ceil(core.length * 0.5)) out.push('NO_ANSWER_FIRST');
  return out;
}

/** What a better page needs — derived from the weaknesses seen in the top results (never a copy of them). */
export function betterPagePlan(weaknessCounts, { query = '', cluster = '' } = {}) {
  const plan = ['Trả lời thẳng trong 2–3 câu đầu (số liệu/điều kiện) rồi mới giải thích'];
  const has = (w) => (weaknessCounts[w] ?? 0) > 0;
  if (has('NO_TABLE') || NUMERIC_RX.test(normKw(query))) plan.push('Bảng tổng hợp (mức phạt/giá/loại xe) có cột nguồn và ngày hiệu lực');
  if (has('NO_FAQ')) plan.push('Mục "Câu hỏi thường gặp" 4–6 câu lấy từ PAA/tìm kiếm liên quan');
  if (has('NO_LEGAL_SOURCE') || has('OLD_LAW') || LEGAL_CLUSTERS.has(cluster)) plan.push('Trích điều khoản gốc (Luật 36/2024/QH15, Nghị định 168/2024/NĐ-CP) qua data/seo/legal-facts.json, ghi ngày đối chiếu');
  if (has('OLD_YEAR') || has('NO_DATE')) plan.push('Ngày cập nhật hiển thị + dateModified trong schema');
  if (has('OTHER_CITY') || has('OFF_TOPIC')) plan.push('Góc người thuê xe máy ở Hà Nội: tình huống thực tế khi nhận/trả xe, giấy tờ cửa hàng yêu cầu');
  if (has('THIN') || has('LISTING') || has('FORUM')) plan.push('Bài hướng dẫn 1.200–1.800 từ có cấu trúc H2 theo ý định (điều kiện → mức → cách xử lý)');
  if (has('NO_SCHEMA')) plan.push('Schema Article + BreadcrumbList (đã có trong builder) và FAQ bằng H3 dưới mục câu hỏi');
  plan.push('Liên kết nội bộ tới pillar của cụm và tới trang chuyển đổi (/gia-thue/, /lien-he/) đúng ngữ cảnh');
  return plan;
}

export function weaknessMatrix(b) {
  const { cs, data } = b;
  const rows = [];
  const byQuery = new Map();
  for (const s of cs.serps) {
    for (const o of s.raw.organic.slice(0, TOP)) {
      const kind = resultKind(o, b.cfg);
      if (kind === 'own' || kind === 'sister') continue;
      const page = data.auditOf.get(normUrl(o.url));
      if (!page) continue;
      const g = b.groupOfQuery.get(normKw(s.query));
      const weaknesses = weaknessesOf(page, { query: s.query, cluster: s.cluster, kind });
      rows.push({ query: s.query, cluster: s.cluster, group: g?.id ?? '', position: o.position, url: o.url, domain: o.domain, kind, type: KIND_LABEL[kind] ?? kind,
        title: page.title ?? '', words: page.words ?? null, h2: (page.h2 ?? []).length, faq: Boolean(page.faq_heading || page.schema?.includes('FAQPage')), tables: page.tables ?? 0,
        schema: (page.schema ?? []).filter((t) => ARTICLE_SCHEMA.has(t)).join(', '), legal: (page.legal_sources ?? []).slice(0, 3).join('; '), published: page.published ?? '', modified: page.modified ?? '',
        weaknesses, labels: weaknesses.map((w) => WEAKNESS[w]), unavailable: Boolean(page.unavailable), ours: g ? landing(g) : '' });
      const q = byQuery.get(s.query) ?? { query: s.query, cluster: s.cluster, group: g ?? null, pages: 0, counts: {}, ownBest: s.own[0]?.position ?? null };
      q.pages++;
      for (const w of weaknesses) q.counts[w] = (q.counts[w] ?? 0) + 1;
      byQuery.set(s.query, q);
    }
  }
  rows.sort((x, y) => x.query.localeCompare(y.query) || x.position - y.position);
  const queries = [...byQuery.values()].map((q) => ({
    ...q, demand: q.group?.demand ?? null, priority: q.group?.priority ?? 0, action: q.group ? ACTION_LABEL[q.group.action] : '', ours: q.group ? landing(q.group) : '',
    avgWeak: Math.round((10 * sum(Object.values(q.counts))) / q.pages) / 10,
    top: Object.entries(q.counts).sort((a, b2) => b2[1] - a[1] || a[0].localeCompare(b2[0])).slice(0, 4).map(([w, n]) => `${WEAKNESS[w]} (${n}/${q.pages})`),
    plan: betterPagePlan(q.counts, { query: q.query, cluster: q.cluster })
  })).sort((x, y) => y.priority - x.priority || y.avgWeak - x.avgWeak || x.query.localeCompare(y.query));
  const audited = rows.filter((r) => !r.unavailable).length;
  const totals = {};
  for (const r of rows) for (const w of r.weaknesses) totals[w] = (totals[w] ?? 0) + 1;
  return { rows, queries, audited, totals };
}

// ---------- W4 keyword gap / opportunity ----------

export const OPPORTUNITY_FORMULA = 'điểm cơ hội = điểm ưu tiên engine 06 (volume đo được × cơ hội × khả thi theo SERP × hiển thị) × (1 + điểm yếu trung bình của các trang top 10 đã audit ÷ 5); P0 ≥ 1.000, P1 ≥ 100, P2 còn lại; nhóm chưa đo volume không xếp hạng';

const PAGE_TYPE_OF = (g) => {
  if (g.action === 'LOCAL_ONLY') return 'Trang bán hàng / Google Business Profile';
  if (g.action === 'NEW_ARTICLE' || g.action === 'NEW_ARTICLE_VERIFY') return LEGAL_CLUSTERS.has(g.cluster) ? 'Bài pháp lý (legal gate) — supporting của pillar an toàn' : 'Bài hướng dẫn (supporting)';
  if (g.action === 'ADD_SECTION') return 'Mục/FAQ trong bài hiện có';
  if (g.action === 'CONSIDER_STANDALONE') return 'Tách bài riêng (supporting)';
  if (g.action === 'FIX_FIRST') return 'Sửa bài hiện có (review body có nguồn)';
  if (g.action === 'ALIGN_META') return 'Title/meta của bài hiện có';
  if (g.action === 'REVIEW_TARGET') return 'Chọn trang đích';
  return 'Giữ trang hiện có';
};

export function opportunityMatrix(b, { w1, w3 }) {
  const { e } = b;
  const weakOf = new Map(w3.queries.map((q) => [normKw(q.query), q]));
  const strong = new Set(w1.strongest.map((r) => r.domain));
  const rows = e.groups.map((g) => {
    const serps = g.serp.queries.map((q) => e.serpByQuery.get(normKw(q))).filter(Boolean);
    const top = serps.flatMap((s) => s.raw.organic.slice(0, TOP));
    const strongIn = [...new Set(top.filter((o) => strong.has(o.domain)).map((o) => o.domain))];
    const kinds = top.map((o) => resultKind(o, b.cfg));
    const authority = kinds.filter((k) => ['legal', 'gov', 'news'].includes(k)).length;
    const competition = !serps.length ? 'Chưa chụp SERP' : authority >= 0.5 * top.length || strongIn.length >= 4 ? 'Cao' : strongIn.length >= 2 || authority >= 3 ? 'Trung bình' : 'Thấp';
    const weak = g.serp.queries.map((q) => weakOf.get(normKw(q))).filter(Boolean);
    const avgWeak = weak.length ? Math.round((10 * sum(weak.map((w) => w.avgWeak))) / weak.length) / 10 : null;
    const score = g.measured ? Math.round(g.priority * (1 + (avgWeak ?? 0) / 5)) : 0;
    const open = !['done', 'rejected', 'deferred'].includes(g.decision?.status);
    const actionable = !['KEEP', 'MONITOR', 'LOCAL_ONLY'].includes(g.action) && open;
    return {
      group: g.id, keyword: g.head, variants: g.members.length, demand: g.measured ? g.demand : null, cluster: g.cluster, intent: g.intent,
      serps: serps.length, ownBest: g.ownBest, status: STATUS_LABEL[g.status], competition, strongIn, authority, avgWeak, priority: g.priority, score,
      // Unmeasured demand is never ranked (it waits in the engine's volume queue); closed decisions keep their status.
      tier: actionable && g.measured ? TIER(score) : (!open ? `(${g.decision.status})` : actionable ? '(chưa đo volume)' : ''), pageType: PAGE_TYPE_OF(g), actionKey: g.action, action: ACTION_LABEL[g.action], target: landing(g),
      gapFor: strongIn.filter((d) => g.ownBest == null)
    };
  }).sort((x, y) => y.score - x.score || (y.demand ?? 0) - (x.demand ?? 0) || x.group.localeCompare(y.group));
  // Keyword sets of the strongest competitors vs. this site (captured top 10 only).
  const competitors = w1.strongest.map((c) => {
    const queries = b.cs.serps.flatMap((s) => s.raw.organic.slice(0, TOP).filter((o) => o.domain === c.domain).map((o) => ({ query: s.query, position: o.position, own: s.own[0]?.position ?? null, cluster: s.cluster })))
      .sort((x, y) => x.position - y.position);
    return { domain: c.domain, type: c.type, queries, gaps: queries.filter((q) => q.own == null), shared: queries.filter((q) => q.own != null) };
  });
  const tiers = { P0: rows.filter((r) => r.tier === 'P0').length, P1: rows.filter((r) => r.tier === 'P1').length, P2: rows.filter((r) => r.tier === 'P2').length };
  return { rows, competitors, tiers };
}

// ---------- W5 topic clusters ----------

const linkCounts = (s) => {
  const m = String(s ?? '').match(/vào: ngữ cảnh (\d+), cụm\/liên quan (\d+), hub (\d+)/);
  return m ? { context: Number(m[1]), related: Number(m[2]), hub: Number(m[3]) } : { context: 0, related: 0, hub: 0 };
};

export function topicClusterMatrix(b) {
  const { e, cs, urlRows } = b;
  const rows = b.clusters.map((c) => {
    const inCluster = [...urlRows.values()].filter((r) => String(r['Topic Cluster']).startsWith(`${c.id} `));
    const articles = inCluster.filter((r) => r['Page Type'] === 'Bài viết');
    const hubs = inCluster.filter((r) => r['Page Type'].startsWith('Hub') && r['Page Type'] !== 'Hub danh mục (phân trang)');
    const pillarUrl = c.pillar ? `${SITE.replace(/\/$/, '')}${c.pillar}` : '';
    const pillarRow = pillarUrl ? urlRows.get(pillarUrl) ?? null : null;
    const pillarExists = c.pillar ? existsSync(join(b.root, c.pillar.replace(/^\//, ''), 'index.html')) : false;
    const support = c.support_pillar ? urlRows.get(`${SITE.replace(/\/$/, '')}${c.support_pillar}`) ?? null : null;
    const groups = e.groups.filter((g) => g.cluster === c.id);
    const serps = cs.serps.filter((s) => s.cluster === c.id);
    const faq = [...new Set(serps.flatMap((s) => s.raw.people_also_ask ?? []))];
    const related = [...new Set(serps.flatMap((s) => s.raw.related_searches ?? []))];
    const inbound = pillarRow ? linkCounts(pillarRow['Internal Links']) : null;
    const zeroInbound = articles.filter((r) => { const k = linkCounts(r['Internal Links']); return k.context + k.related + k.hub === 0; }).length;
    // One intent per URL: two groups with different SERP intents landing on one page.
    const byTarget = new Map();
    // Only SERP-observed intents of groups the site pursues can collide; tool-only labels and local-pack queries left to the sales page do not.
    for (const g of groups.filter((x) => x.target && !['NEW_ARTICLE', 'NEW_ARTICLE_VERIFY', 'LOCAL_ONLY'].includes(x.action) && x.serp.queries.length && !/\(công cụ\)|^—$/.test(x.intent) && x.intent !== 'Giao dịch – địa phương')) {
      const t = byTarget.get(g.target.id) ?? { id: g.target.id, url: g.target.url, groups: [] };
      t.groups.push(g);
      byTarget.set(g.target.id, t);
    }
    // Groups settled on one page by a done decision (one reviewed topic answering several questions) are merged on purpose.
    const mixed = [...byTarget.values()].filter((t) => new Set(t.groups.map((g) => g.intent)).size > 1
      && !t.groups.every((g) => g.decision?.status === 'done' && g.decision.target === t.id));
    const competing = groups.filter((g) => g.competing.length).map((g) => `${g.head}: ${g.competing.join(' ')}`);
    const demand = sum(groups.map((g) => g.demand));
    const open = groups.filter((g) => !['KEEP', 'MONITOR', 'LOCAL_ONLY'].includes(g.action) && !['done', 'rejected', 'deferred'].includes(g.decision?.status));
    return {
      id: c.id, name: c.name, intent: c.intent, head: (c.head ?? []).slice(0, 4), pillar: c.pillar ?? '', pillarType: pillarRow?.['Page Type'] ?? (c.pillar ? 'Trang tĩnh' : ''), pillarExists,
      pillarTitle: pillarRow?.['Current Title'] ?? '', pillarInbound: inbound, supportPillar: c.support_pillar ?? '', supportTitle: support?.['Current Title'] ?? '',
      hubs: hubs.map((r) => r.URL.replace(SITE.replace(/\/$/, ''), '')).sort(), articles: articles.length, zeroInbound, groups: groups.length, demand, measured: groups.filter((g) => g.measured).length,
      serps: serps.length, faq: faq.slice(0, 10), related: related.slice(0, 10), mixed: mixed.map((t) => `${t.url}: ${t.groups.map((g) => `${g.head} (${g.intent})`).join(' / ')}`),
      competing, open: open.map((g) => ({ id: g.id, head: g.head, action: ACTION_LABEL[g.action], priority: g.priority, target: landing(g) })),
      status: !c.pillar ? 'Chưa có pillar' : !pillarExists ? 'Pillar chưa xây' : mixed.length ? 'Trộn ý định' : open.length ? 'Còn việc' : 'Ổn'
    };
  });
  return { rows, pillarsMissing: rows.filter((r) => !r.pillarExists).length, mixed: sum(rows.map((r) => r.mixed.length)), competing: sum(rows.map((r) => r.competing.length)) };
}

// ---------- W6 SERP benchmark ----------

const BENCH_FIELDS = ['words', 'h2', 'h3', 'images', 'tables', 'lists', 'internal', 'external'];

const featuresOf = (p) => ({
  words: p.words ?? null, h2: (p.h2 ?? []).length, h3: p.h3_count ?? 0, images: p.images ?? 0, tables: p.tables ?? 0, lists: p.lists ?? 0,
  internal: p.links_internal ?? 0, external: p.links_external ?? 0, faq: Boolean(p.faq_heading || p.schema?.includes('FAQPage')),
  schema: (p.schema ?? []).some((t) => ARTICLE_SCHEMA.has(t)), legal: (p.legal_sources ?? []).length > 0, date: Boolean(p.published || p.modified),
  year: (p.title_years ?? []).length > 0 || /20\d\d/.test(String(p.title ?? ''))
});

/** Pages with this many H2 are never flagged for structure, however long the top pages run. */
export const H2_CAP = 8;
/** …and only when its sections run long on average (words per H2) — a 7-section, 2.000-word article is scannable. */
export const WORDS_PER_H2 = 300;

/** What this site's page still lacks against the median of the ranking pages. */
export function benchmarkGaps(own, bench, { query = '', cluster = '' } = {}) {
  const gaps = [];
  if (!own) return ['Chưa có trang đích (bài mới)'];
  if (bench.words != null && own.words < 0.8 * bench.words) gaps.push(`Ít từ hơn trung vị top (${own.words} < ${bench.words}) — quan sát, không viết dài để bằng đối thủ`);
  if (bench.faq >= 50 && !own.faq) gaps.push('Thiếu mục câu hỏi thường gặp (≥ 50% top có)');
  if (bench.tables >= 1 && !own.tables) gaps.push('Thiếu bảng (trung vị top có bảng)');
  if (bench.images >= 2 && own.images < 1) gaps.push(`(quan sát) Không có ảnh — trung vị top ${bench.images}; site không dùng ảnh minh họa trong bài, không hành động`);
  if (bench.legal >= 50 && !own.legal) gaps.push('Thiếu trích dẫn văn bản pháp luật (≥ 50% top có)');
  const longSections = own.words / Math.max(1, own.h2) > WORDS_PER_H2;
  if (bench.h2 != null && own.h2 < Math.max(3, Math.min(H2_CAP, bench.h2 - 2)) && (longSections || own.h2 < 3)) gaps.push(`Ít H2 hơn top (${own.h2} vs trung vị ${bench.h2}; mục dài TB ${Math.round(own.words / Math.max(1, own.h2))} từ)`);
  const core = coreWords(query);
  const first = canon(`${own.h1?.[0] ?? ''} ${own.lead ?? ''} ${own.first_paragraph ?? ''}`);
  if (core.length && core.filter((t) => first.includes(t)).length < Math.ceil(core.length * 0.5)) gaps.push('Đoạn mở đầu chưa trả lời thẳng truy vấn (từ khóa chính vắng)');
  if (legalQuery(query, cluster) && !own.legal) gaps.push('Chủ đề pháp lý: cần dữ kiện đã đối chiếu (legal-facts)');
  return gaps;
}

export function serpBenchmark(b) {
  const { cs, data } = b;
  const rows = [];
  for (const s of cs.serps) {
    const top = s.raw.organic.slice(0, TOP).map((o) => ({ o, kind: resultKind(o, b.cfg), page: data.auditOf.get(normUrl(o.url)) }))
      .filter((x) => x.page && !x.page.unavailable && x.kind !== 'own' && x.kind !== 'sister');
    if (!top.length) continue;
    const feats = top.map((x) => featuresOf(x.page));
    const bench = Object.fromEntries(BENCH_FIELDS.map((f) => [f, median(feats.map((x) => x[f]))]));
    for (const f of ['faq', 'schema', 'legal', 'date', 'year']) bench[f] = share(feats, (x) => x[f]);
    const g = b.groupOfQuery.get(normKw(s.query));
    const targetUrl = g && g.target && !['NEW_ARTICLE', 'NEW_ARTICLE_VERIFY', 'LOCAL_ONLY'].includes(g.action) && g.status !== 'GAP' ? g.target.url : null;
    const ownPage = targetUrl ? b.ownOf(targetUrl) : null;
    const own = ownPage ? { ...featuresOf(ownPage), url: targetUrl, title: ownPage.title, h1: ownPage.h1, lead: ownPage.lead, first_paragraph: ownPage.first_paragraph, h2list: ownPage.h2 } : null;
    rows.push({
      query: s.query, cluster: s.cluster, group: g?.id ?? '', intent: s.intent, features: [s.ai ? 'AI Overview' : '', s.local ? 'local pack' : '', s.paa ? 'PAA' : '', s.video ? 'video' : ''].filter(Boolean),
      audited: top.length, bench, ownBest: s.own[0]?.position ?? null, target: targetUrl ?? (g ? landing(g) : ''), own,
      pages: top.slice(0, 5).map((x) => ({ position: x.o.position, domain: x.o.domain, url: x.o.url, type: KIND_LABEL[x.kind] ?? x.kind, title: x.page.title ?? '', h1: x.page.h1?.[0] ?? '',
        h2: (x.page.h2 ?? []).slice(0, 6), words: x.page.words, faq: featuresOf(x.page).faq, tables: x.page.tables ?? 0, images: x.page.images ?? 0, schema: (x.page.schema ?? []).filter((t) => ARTICLE_SCHEMA.has(t)).join(', '),
        legal: (x.page.legal_sources ?? []).slice(0, 2).join('; '), published: x.page.published ?? '' })),
      gaps: benchmarkGaps(own, bench, { query: s.query, cluster: s.cluster }), priority: g?.priority ?? 0, demand: g?.measured ? g.demand : null
    });
  }
  rows.sort((x, y) => y.priority - x.priority || (y.demand ?? 0) - (x.demand ?? 0) || x.query.localeCompare(y.query));
  const all = rows.flatMap((r) => r.pages);
  const overall = { queries: rows.length, pages: all.length, words: median(all.map((p) => p.words)), faq: share(all, (p) => p.faq), tables: share(all, (p) => p.tables > 0), images: median(all.map((p) => p.images)) };
  return { rows, overall, withOwn: rows.filter((r) => r.own).length };
}

// ---------- W7 AI search (GEO / AEO) ----------

const QUESTION_RX = /^(bao nhiêu|có |khi nào|làm sao|cách |tại sao|vì sao|là gì|nên |như thế nào)|( là gì| bao nhiêu| không$| nào$| thế nào$| ra sao$| gì$| làm sao$| cần gì$)/u;
export const ANSWER_FORM = (q) => {
  const k = normKw(q);
  if (/bao nhiêu tiền|mức phạt|phạt bao nhiêu|giá|bảng giá|phí/.test(k)) return 'Con số + bảng (mức, căn cứ, ngày hiệu lực)';
  if (/bao nhiêu tuổi|tuổi/.test(k)) return 'Ngưỡng tuổi + điều kiện (câu trả lời 1 câu, rồi bảng theo loại xe)';
  if (/có cần|cần gì|có được|được không|không\?$|có bị|có phải/.test(k)) return 'Có/Không + điều kiện (2–3 câu) + ngoại lệ';
  if (/là gì|là hạng gì|nghĩa là/.test(k)) return 'Định nghĩa 1–2 câu + bảng phân loại';
  if (/cách|làm sao|như thế nào|thủ tục|kinh nghiệm|hướng dẫn/.test(k)) return 'Các bước đánh số (3–7 bước) + lưu ý';
  if (/các loại|những|top|địa chỉ|ở đâu/.test(k)) return 'Danh sách có tiêu chí + bảng so sánh';
  return 'Trả lời ngắn trong đoạn đầu + mục chi tiết';
};
const ENTITY_RX = [
  ['Luật 36/2024/QH15 (Luật Trật tự, an toàn giao thông đường bộ)', /36\/2024|luật trật tự, an toàn giao thông đường bộ/i],
  ['Nghị định 168/2024/NĐ-CP', /168\/2024/],
  ['Nghị định 100/2019/NĐ-CP (đã thay thế)', /100\/2019/],
  ['Luật Giao thông đường bộ 2008 (hết hiệu lực)', /luật giao thông đường bộ 2008|23\/2008/i],
  ['Nghị quyết 05/2025 (vùng phát thải thấp Hà Nội)', /nghị quyết\s*0?5\/2025/i],
  ['Chỉ thị 20/CT-TTg (xe máy xăng Vành đai 1)', /20\/ct-ttg/i]
];

export function aiSearchMatrix(b) {
  const { cs, data } = b;
  const rows = [];
  for (const s of cs.serps) {
    const q = s.raw;
    const question = QUESTION_RX.test(normKw(s.query)) || (q.people_also_ask ?? []).length > 0;
    if (!question && !s.ai) continue;
    const g = b.groupOfQuery.get(normKw(s.query));
    const sources = q.ai_overview?.sources ?? [];
    const targetUrl = g && g.target && !['NEW_ARTICLE', 'NEW_ARTICLE_VERIFY', 'LOCAL_ONLY'].includes(g.action) && g.status !== 'GAP' ? g.target.url : null;
    const own = targetUrl ? b.ownOf(targetUrl) : null;
    const core = coreWords(s.query);
    const first = own ? canon(`${own.h1?.[0] ?? ''} ${own.lead ?? ''} ${own.first_paragraph ?? ''}`) : '';
    const answerFirst = own ? core.filter((t) => first.includes(t)).length >= Math.ceil(core.length * 0.5) : false;
    const topPages = q.organic.slice(0, TOP).map((o) => data.auditOf.get(normUrl(o.url))).filter((p) => p && !p.unavailable);
    const entities = [...new Set(topPages.flatMap((p) => (p.legal_sources ?? []).concat([p.title ?? ''])).flatMap((t) => ENTITY_RX.filter(([, rx]) => rx.test(t)).map(([name]) => name)))];
    const local = /hà nội|ha noi/.test(normKw(s.query)) || s.local;
    const gaps = [];
    if (!own) gaps.push(g && (g.action === 'NEW_ARTICLE' || g.action === 'NEW_ARTICLE_VERIFY') ? 'Chưa có trang trả lời (bài mới đã lên lịch)' : 'Chưa có trang đích rõ');
    else {
      if (!answerFirst) gaps.push('Đoạn mở đầu chưa nêu câu trả lời');
      if (!own.faq_heading) gaps.push('Chưa có mục câu hỏi thường gặp (H2 + H3 câu hỏi)');
      if (legalQuery(s.query, s.cluster) && !(own.legal_sources ?? []).length) gaps.push('Chưa dẫn văn bản pháp luật');
      if (ANSWER_FORM(s.query).includes('bảng') && !own.tables) gaps.push('Chưa có bảng số liệu');
    }
    rows.push({
      query: s.query, cluster: s.cluster, group: g?.id ?? '', ai: s.ai, paa: q.people_also_ask ?? [], sources: sources.map((u) => ({ url: u, domain: hostOf(u), ownSite: hostOf(u) === b.cfg.site_domain })),
      sourceKinds: [...new Set(sources.map((u) => KIND_LABEL[resultKind({ domain: hostOf(u), title: '' }, b.cfg)] ?? 'Khác'))],
      form: ANSWER_FORM(s.query), entities, local: local ? 'Có (Hà Nội / local pack)' : 'Không', target: targetUrl ?? (g ? landing(g) : ''), answerFirst: own ? answerFirst : null, gaps,
      demand: g?.measured ? g.demand : null, priority: g?.priority ?? 0
    });
  }
  rows.sort((x, y) => Number(y.ai) - Number(x.ai) || y.priority - x.priority || (y.demand ?? 0) - (x.demand ?? 0) || x.query.localeCompare(y.query));
  const cited = new Map();
  for (const r of rows) for (const sName of r.sources) cited.set(sName.domain, (cited.get(sName.domain) ?? 0) + 1);
  const citedDomains = [...cited.entries()].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0])).map(([domain, n]) => ({ domain, n, type: KIND_LABEL[resultKind({ domain, title: '' }, b.cfg)] ?? 'Khác' }));
  return { rows, withAi: rows.filter((r) => r.ai).length, ownCited: rows.filter((r) => r.sources.some((x) => x.ownSite)).length, citedDomains, paaTotal: sum(rows.map((r) => r.paa.length)) };
}

// ---------- W8 backlink / authority ----------

export const LINK_SOURCE_RULES = [
  { type: 'Trang thuộc chính đối thủ (vệ tinh thương hiệu)', rx: /motogo|motogohostel/i, opportunity: 'Không (tài sản riêng của đối thủ)', risk: 'không áp dụng' },
  { type: 'Cổng/sở du lịch, cơ quan nhà nước', rx: /vietnamtourism\.vn$|\.gov\.vn$/i, opportunity: 'Đăng ký doanh nghiệp/điểm dịch vụ trên cổng du lịch chính thức (nếu có chương trình)', risk: 'thấp' },
  { type: 'Danh bạ doanh nghiệp / trang vàng', rx: /trangvang|yellowpages|top3\.vn|thegioimuaban|vietnamtoplist|bizsitelink|about\.me|apsense|note8|viecoi|topaz/i, opportunity: 'Đăng ký hồ sơ NAP nhất quán (tên, địa chỉ Long Biên, SĐT) — citation', risk: 'thấp' },
  { type: 'Công ty du lịch / tour / OTA', rx: /tour|trip|travel|dulich|vivu|izitour|aucoeurvietnam|guidefrancophone|wanderlust|lotusdanang|mangden/i, opportunity: 'Hợp tác nội dung: hướng dẫn thuê xe cho khách tour, trang đối tác', risk: 'thấp–trung bình (chỉ khi có quan hệ thật)' },
  { type: 'Đơn vị cho thuê xe tỉnh khác (đồng nghiệp)', rx: /thuexemay|chothuexemay|xemaychothue|motorbike|motordanang|motonest|hanoibiker|mototrip/i, opportunity: 'Trao đổi giới thiệu khách liên tỉnh (Hà Nội ↔ Đà Nẵng/Hội An/Côn Đảo), bài "thuê ở Hà Nội đi …"', risk: 'trung bình (tránh trao đổi link hàng loạt)' },
  { type: 'Báo chí / tạp chí', rx: /vnexpress|thoidai|hanoireview|tinvungtau|bp\.com\.vn/i, opportunity: 'PR/phỏng vấn: xe máy điện cho thuê, Vành đai 1, kinh nghiệm an toàn cho khách', risk: 'thấp' },
  { type: 'Diễn đàn / cộng đồng', rx: /lamchame|ttvnol|otofun|otosaigon|voz|tinhte/i, opportunity: 'Trả lời đúng chủ đề, dẫn nguồn bài hướng dẫn (không rải link)', risk: 'trung bình (UGC, nofollow)' },
  { type: 'Blog cá nhân / nền tảng tự đăng', rx: /blogspot|wixsite|gitbook|web\.app|website2\.me|myspace|blogarama|mastercms/i, opportunity: 'Không chủ động xây; theo dõi', risk: 'cao (dễ bị coi là spam nếu tự tạo)' },
  { type: 'Công cụ/bookmark/thống kê (tự động)', rx: /bookmark|siteprice|windowssearch|bing\.com|feedbackplatform|oppalerts/i, opportunity: 'Không', risk: 'cao (spam/tự động)' }
];
export function classifyLinkSource(domain, spam = 0) {
  const rule = LINK_SOURCE_RULES.find((r) => r.rx.test(domain));
  if (rule) return { ...rule, risk: spam >= 30 ? `cao (spam score ${spam})` : rule.risk };
  return { type: 'Khác / ngoài ngành', opportunity: 'Không', risk: spam >= 30 ? `cao (spam score ${spam})` : 'không rõ' };
}

export function backlinkMatrix(b, { w1 }) {
  const { data, cs } = b;
  const profiles = (data.backlinks?.profiles ?? []).map((p) => {
    const kinds = new Map();
    const rows = p.referring_domains.map((d) => {
      const c = classifyLinkSource(d.domain, d.spam_score);
      kinds.set(c.type, (kinds.get(c.type) ?? 0) + 1);
      return { ...d, ...c };
    });
    return { ...p, rows, byType: [...kinds.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])) };
  });
  // Observed on the SERPs: pages that LIST rental shops or cite sources — natural citation targets.
  const listingPages = [];
  for (const s of cs.serps) {
    for (const o of s.raw.organic.slice(0, TOP)) {
      const kind = resultKind(o, b.cfg);
      const page = data.auditOf.get(normUrl(o.url));
      const listy = /địa chỉ|top \d|\d+ địa chỉ|\d+ điểm|uy tín|danh sách|app thuê|ứng dụng/i.test(o.title ?? '');
      if (!listy || ['own', 'sister', 'social', 'video', 'appstore'].includes(kind)) continue;
      listingPages.push({ query: s.query, position: o.position, url: o.url, domain: o.domain, type: KIND_LABEL[kind] ?? kind, title: o.title, phones: page?.phones ?? null, external: page?.links_external ?? null,
        opportunity: kind === 'forum' ? 'Thảo luận có dẫn nguồn (UGC, thường nofollow)' : kind === 'travel' ? 'Đề nghị đưa cửa hàng vào danh sách (có địa chỉ, giấy tờ, giá tham khảo)' : kind === 'news' ? 'Đề xuất bài/PR có số liệu thật' : 'Đề nghị bổ sung vào danh sách địa chỉ', risk: kind === 'forum' ? 'trung bình' : 'thấp' });
    }
  }
  listingPages.sort((x, y) => x.position - y.position || x.query.localeCompare(y.query));
  const authorities = w1.selected.filter((r) => r.labs?.rating != null).map((r) => ({ domain: r.domain, type: r.type, rating: r.labs.rating, visibility: r.labs.visibility, etv: r.labs.etv }))
    .sort((x, y) => y.rating - x.rating);
  const opportunities = [
    { type: 'Website chị em (thuexemaynguyentu.com, blog., wiki.)', action: 'Liên kết chéo theo ngữ cảnh tới bài hướng dẫn/pháp lý; NAP đồng nhất', evidence: 'config/seo-ownership.json', risk: 'thấp', quality: 'cao (cùng chủ sở hữu, cùng chủ đề)' },
    { type: 'Google Business Profile + danh bạ (trang vàng, top3, toplist)', action: 'Hồ sơ NAP + liên kết tới trang /lien-he/ và /gia-thue/', evidence: `motogo.vn có ${profiles[0]?.rows.filter((r) => r.type.startsWith('Danh bạ')).length ?? 0} miền danh bạ trong 100 miền giới thiệu đầu`, risk: 'thấp', quality: 'trung bình (citation)' },
    { type: 'Trang danh sách địa chỉ thuê xe trên OTA/du lịch', action: 'Đề nghị bổ sung cửa hàng vào các bài "địa chỉ thuê xe máy Hà Nội" đang xếp hạng', evidence: `${listingPages.filter((p) => p.type === 'Du lịch/OTA').length} trang OTA/du lịch dạng danh sách trong top 10 đã chụp`, risk: 'thấp', quality: 'cao (đúng chủ đề, có traffic)' },
    { type: 'Công ty tour / đối tác du lịch', action: 'Trang đối tác + bài hướng dẫn thuê xe cho khách tour (song ngữ không cần: chỉ tiếng Việt)', evidence: `motogo.vn có ${profiles[0]?.rows.filter((r) => r.type.startsWith('Công ty du lịch')).length ?? 0} miền tour/du lịch giới thiệu`, risk: 'thấp–trung bình', quality: 'cao' },
    { type: 'Báo chí / PR', action: 'Câu chuyện có số liệu thật: xe máy điện cho thuê, Vành đai 1, an toàn cho khách — chỉ khi có dữ liệu', evidence: 'laodong.vn, vietnamnet.vn, thanhnien.vn, 24h.com.vn xếp hạng cho truy vấn luật/Vành đai 1', risk: 'thấp', quality: 'cao' },
    { type: 'Diễn đàn (otofun, otosaigon, voz)', action: 'Trả lời đúng chủ đề với nguồn; không rải link', evidence: `${listingPages.filter((p) => p.type === 'Diễn đàn').length} chủ đề diễn đàn trong top 10 đã chụp`, risk: 'trung bình', quality: 'thấp–trung bình (nofollow)' },
    { type: 'Mua link / PBN / bookmark tự động', action: 'KHÔNG làm', evidence: `motogo.vn: ${profiles[0]?.rows.filter((r) => r.spam_score >= 30).length ?? 0}/100 miền giới thiệu có spam score ≥ 30`, risk: 'cao', quality: 'không' }
  ];
  return { profiles, listingPages, authorities, opportunities };
}

// ---------- W9 URL architecture ----------

const POSITION_OF = (type) => {
  if (type === 'Trang chủ (Agent)') return 'Trang chủ (pillar thương hiệu / K01)';
  if (type.startsWith('Trang chuyển đổi')) return 'Trang chuyển đổi';
  if (type === 'Trang chính sách thuê xe') return 'Trang chuyển đổi (chính sách)';
  if (type === 'Trang giới thiệu (E-E-A-T)') return 'E-E-A-T';
  if (type === 'Pháp lý') return 'Pháp lý (không nhắm từ khóa)';
  if (type === 'Blog home' || type === 'Hub cụm chủ đề') return 'Hub cấp 1';
  if (type === 'Hub danh mục') return 'Hub danh mục';
  if (type === 'Hub danh mục (phân trang)') return 'Hub phân trang (không nhắm từ khóa)';
  if (type === 'Hub chủ đề con') return 'Hub chủ đề con';
  return 'Bài viết (supporting)';
};
const GOAL_OF = (type, category) => {
  if (type.startsWith('Trang chuyển đổi') || type === 'Trang chính sách thuê xe') return 'Liên hệ / đặt xe (Zalo, điện thoại)';
  if (type === 'Trang chủ (Agent)') return 'Dùng Agent → trang giá / liên hệ';
  if (type.startsWith('Hub') || type === 'Blog home') return 'Điều hướng tới pillar và bài phù hợp';
  if (type === 'Pháp lý' || type === 'Trang giới thiệu (E-E-A-T)') return 'Niềm tin (E-E-A-T)';
  if (category === 'SAFE') return 'Đọc xong → bài thuê xe / trang chính sách (an toàn, giấy tờ)';
  if (category === 'LOCAL') return 'Đọc xong → trang giá / liên hệ (thuê để đi địa điểm này)';
  return 'Đọc xong → trang giá / liên hệ';
};

export function urlArchitecture(b) {
  const { e, urlRows } = b;
  const pillarIds = new Set();
  const pillarByFamily = new Map();
  for (const g of e.groups) if (g.target && ['KEEP', 'ALIGN_META', 'ADD_SECTION', 'FIX_FIRST', 'CONSIDER_STANDALONE'].includes(g.action)) pillarIds.add(g.target.id);
  const groupsByTarget = new Map();
  for (const g of e.groups) if (g.target) groupsByTarget.set(g.target.id, [...(groupsByTarget.get(g.target.id) ?? []), g]);
  const byKeyword = new Map();
  const rows = [...urlRows.values()].map((r) => {
    const id = r['Article ID'] || '';
    const groups = id ? groupsByTarget.get(id) ?? [] : [];
    const cannib = String(r.Cannibalization ?? '');
    const path = r.URL.replace(SITE.replace(/\/$/, ''), '');
    const pillar = /^Pillar/i.test(cannib) || b.clusters.some((c) => c.pillar && c.pillar === path) || pillarIds.has(id);
    const position = r['Page Type'] === 'Bài viết' ? (pillar ? 'Pillar (trang đích của nhóm từ khóa / pillar cụm)' : /^Hỗ trợ pillar/i.test(cannib) ? 'Supporting của pillar họ chủ đề' : 'Supporting') : POSITION_OF(r['Page Type']);
    const kw = normKw(r['Primary Keyword'] ?? '');
    if (kw && r['Page Type'] === 'Bài viết') byKeyword.set(kw, [...(byKeyword.get(kw) ?? []), r.URL]);
    return {
      url: path, type: r['Page Type'], keyword: r['Primary Keyword'] ?? '', intent: r['Search Intent'] ?? '', cluster: String(r['Topic Cluster'] ?? '').split(' ')[0],
      position, goal: GOAL_OF(r['Page Type'], r.Category), groups: groups.map((g) => g.head), serpIntents: [...new Set(groups.map((g) => g.intent))], id, links: r['Internal Links'] ?? '', cannibalization: cannib,
      status: r.Status, priority: r.Priority
    };
  });
  const dupKeywords = [...byKeyword.entries()].filter(([, urls]) => urls.length > 1);
  const mixed = rows.filter((r) => r.serpIntents.length > 1);
  // Proposed pages: engine proposals (owner approves rows in content-matrix.csv).
  const proposed = e.proposals.map((p) => ({
    url: `/blog/${taxonomy.categories[p.category]?.dir ?? 'huong-dan'}/${p.slug}/`, type: 'Bài viết (đề xuất)', keyword: p.primary_keyword, intent: LEGAL_CLUSTERS.has(p.cluster) ? 'Thông tin pháp lý' : 'Thông tin / hướng dẫn',
    cluster: p.cluster, position: `Supporting của ${b.clusters.find((c) => c.id === p.cluster)?.pillar ?? 'pillar cụm'}`, goal: GOAL_OF('Bài viết', p.category), id: p.id, demand: p.demand ?? null, legal: Boolean(p.legal) || p.category === 'SAFE', source: p.source
  }));
  const byPosition = {};
  for (const r of rows) byPosition[r.position] = (byPosition[r.position] ?? 0) + 1;
  return { rows, proposed, dupKeywords, mixed, byPosition, total: rows.length };
}

// ---------- W10 master battle matrix ----------

export const CONFIDENCE_LABEL = { OBSERVED: 'Quan sát (SERP/trang đã chụp)', MEASURED: 'Đo được (công cụ từ khóa/backlink)', DERIVED: 'Suy ra từ dữ liệu quan sát (công thức ghi rõ)' };
const PHASE = (tier) => (tier === 'P0' ? '0–30 ngày' : tier === 'P1' ? '31–60 ngày' : '61–90 ngày');

export function masterMatrix(b, parts) {
  const { w3, w4, w5, w6, w7, w8, w9 } = parts;
  const items = [];
  let n = 0;
  const push = (x) => items.push({ id: `BM-${String(++n).padStart(3, '0')}`, ...x });
  // 1. Keyword opportunities (engine groups, W4 score).
  for (const r of w4.rows.filter((x) => x.tier && /^P[012]$/.test(x.tier))) {
    const bench = w6.rows.find((x) => x.group === r.group);
    const weak = w3.queries.find((q) => q.group?.id === r.group);
    push({ weapon: 'W4', tier: r.tier, score: r.score, action: r.action, pageType: r.pageType, keyword: r.keyword, target: r.target, cluster: r.cluster,
      evidence: `volume ${fmt(r.demand)}/tháng (đo được); SERP ${r.serps} truy vấn đã chụp; cạnh tranh ${r.competition}; điểm yếu TB top 10: ${r.avgWeak ?? '—'}`,
      confidence: r.serps ? 'DERIVED' : 'MEASURED', owner: ['NEW_ARTICLE', 'NEW_ARTICLE_VERIFY'].includes(r.actionKey) ? 'Owner thêm ID vào ma trận → AI viết (legal gate nếu SAFE)' : 'AI writer (review body)',
      kpi: r.ownBest == null ? 'Trang đích vào top 20 trong lần chụp SERP kế tiếp' : `Vị trí tốt hơn #${r.ownBest} trong lần chụp SERP kế tiếp`,
      verify: 'tools/seo-cold-start.mjs với snapshot mới (data/seo/serp-snapshots/) + index coverage', plan: weak?.plan ?? [], gaps: bench?.gaps ?? [] });
  }
  // 2. Benchmark gaps of pages that already own a query (W6).
  const actionableGap = (g) => !g.startsWith('(quan sát)') && !/^Ít từ hơn trung vị/.test(g);
  for (const r of w6.rows.filter((x) => x.own && x.gaps.some(actionableGap) && !items.some((i) => i.target === x.target))) {
    const score = Math.round((r.priority || 50) * 0.7);
    push({ weapon: 'W6', tier: TIER(score), score, action: ACTION_LABEL.ADD_SECTION, pageType: 'Bổ sung cấu trúc cho bài hiện có', keyword: r.query, target: r.target, cluster: r.cluster,
      evidence: `${r.audited} trang top 10 đã audit: trung vị ${fmt(r.bench.words)} từ, FAQ ${r.bench.faq ?? 0}%, bảng ${r.bench.tables ?? 0}, ảnh ${r.bench.images ?? 0}; trang này: ${fmt(r.own.words)} từ, FAQ ${r.own.faq ? 'có' : 'không'}`,
      confidence: 'OBSERVED', owner: 'AI writer (seo-body-review, không đổi URL)', kpi: 'Trang có FAQ/bảng/nguồn như top; vị trí quan sát không giảm', verify: 'node tools/seo-battle-matrix.mjs (W6 gaps = 0 cho truy vấn)', plan: r.gaps.filter(actionableGap), gaps: r.gaps });
  }
  // 3. Answer-first / FAQ for AI search (W7).
  for (const r of w7.rows.filter((x) => x.target && !x.target.startsWith('(') && x.gaps.length && !items.some((i) => i.target === x.target))) {
    const score = Math.round((r.priority || 50) * (r.ai ? 0.8 : 0.5));
    push({ weapon: 'W7', tier: TIER(score), score, action: 'Trả lời ngay đoạn đầu + FAQ + nguồn (GEO/AEO)', pageType: 'Bổ sung cho bài hiện có', keyword: r.query, target: r.target, cluster: r.cluster,
      evidence: `${r.ai ? 'AI Overview có mặt' : 'Truy vấn dạng câu hỏi'}; ${r.paa.length} câu PAA; nguồn được trích: ${r.sources.slice(0, 3).map((s) => s.domain).join(', ') || '—'}`,
      confidence: 'OBSERVED', owner: 'AI writer (seo-body-review)', kpi: 'Đoạn đầu trả lời thẳng; mục FAQ có H3 câu hỏi từ PAA', verify: 'W7: answerFirst = true, gaps = 0', plan: r.gaps, gaps: r.gaps });
  }
  // 4. Cluster structure (W5).
  for (const c of w5.rows.filter((x) => x.status === 'Pillar chưa xây' || x.status === 'Chưa có pillar' || x.mixed.length)) {
    push({ weapon: 'W5', tier: 'P1', score: 500, action: c.mixed.length ? 'Tách ý định: một URL một ý định (chọn trang đích khác cho nhóm lệch)' : 'Xây/chọn pillar cho cụm', pageType: 'Kiến trúc cụm', keyword: c.head[0] ?? c.name, target: c.pillar || '(chưa có)', cluster: c.id,
      evidence: c.mixed.length ? c.mixed.join(' | ') : `pillar ${c.pillar || 'chưa khai báo'} chưa tồn tại`, confidence: 'OBSERVED', owner: 'AI (engine-decisions target) / owner', kpi: 'Mỗi trang đích chỉ nhận nhóm cùng ý định SERP', verify: 'W5 mixed = 0', plan: [], gaps: [] });
  }
  // 5. Authority (W8) — one row per opportunity type, never bought links.
  for (const o of w8.opportunities.filter((x) => x.risk !== 'cao')) {
    push({ weapon: 'W8', tier: /chị em|Google Business/.test(o.type) ? 'P0' : 'P1', score: /chị em|Google Business/.test(o.type) ? 1000 : 300, action: o.action, pageType: 'Ngoài trang (off-page)', keyword: o.type, target: '/lien-he/, /gia-thue/, bài hướng dẫn', cluster: 'K15',
      evidence: o.evidence, confidence: 'OBSERVED', owner: 'Owner (quan hệ, hồ sơ); AI chuẩn bị nội dung', kpi: 'Số citation/liên kết tự nhiên mới (theo dõi bằng công cụ backlink khi có)', verify: 'OpenSEO get_backlinks_overview cho website này (khi có ngân sách credit)', plan: [], gaps: [] });
  }
  // 6. Architecture hygiene (W9).
  if (w9.dupKeywords.length) push({ weapon: 'W9', tier: 'P2', score: 50, action: 'Rà soát từ khóa chính trùng giữa URL (một từ khóa một URL)', pageType: 'Kiến trúc URL', keyword: `${w9.dupKeywords.length} từ khóa trùng`, target: '(nhiều URL)', cluster: '',
    evidence: w9.dupKeywords.slice(0, 5).map(([k, urls]) => `${k}: ${urls.length} URL`).join('; '), confidence: 'OBSERVED', owner: 'AI (article-meta)', kpi: 'Không còn hai URL cùng từ khóa chính', verify: 'W9 dupKeywords = 0', plan: [], gaps: [] });
  const order = { P0: 0, P1: 1, P2: 2 };
  items.sort((x, y) => order[x.tier] - order[y.tier] || y.score - x.score || x.id.localeCompare(y.id));
  for (const it of items) it.phase = PHASE(it.tier);
  const tiers = { P0: items.filter((i) => i.tier === 'P0').length, P1: items.filter((i) => i.tier === 'P1').length, P2: items.filter((i) => i.tier === 'P2').length };
  const roadmap = [
    { phase: '0–30 ngày', items: items.filter((i) => i.tier === 'P0').map((i) => i.id), goals: ['Đăng các bài P0 (legal gate) và sửa cấu trúc trang đích P0', 'Hồ sơ NAP + liên kết chéo website chị em', 'Chụp lại SERP cho các nhóm P0 sau khi đăng (IndexNow + sitemap)'] },
    { phase: '31–60 ngày', items: items.filter((i) => i.tier === 'P1').map((i) => i.id), goals: ['Bổ sung FAQ/bảng/nguồn cho trang đích P1', 'Tách ý định các URL trộn', 'Đề nghị đưa cửa hàng vào các bài danh sách OTA/du lịch'] },
    { phase: '61–90 ngày', items: items.filter((i) => i.tier === 'P2').map((i) => i.id), goals: ['Việc P2 và các nhóm chưa đo volume (hàng đợi nghiên cứu engine 06)', 'Chụp SERP vòng 3; nếu đã có Search Console → chuyển DATA-DRIVEN'] }
  ];
  const seoPublished = b.cs.index.filter((a) => /^BA-\d+$/.test(a.id) && Number(a.id.slice(3)) > FOUNDATION_ROWS).length; // cs.index = published articles
  const kpis = [
    { kpi: 'Bài SEO mới đã đăng từ ma trận (BA-2001+, PUBLISHED)', baseline: seoPublished, target30: seoPublished + items.filter((i) => i.weapon === 'W4' && ['P0', 'P1'].includes(i.tier)).length, how: 'data/blog/content-matrix.csv (hàng sau nền 2.000) + data/blog/published.json' },
    { kpi: 'Nhóm từ khóa ưu tiên có trang trong top 20 (SERP chụp)', baseline: w4.rows.filter((r) => r.tier && r.ownBest != null && r.ownBest <= 20).length, target30: 'tăng', how: 'data/seo/serp-snapshots/ + tools/seo-cold-start.mjs' },
    { kpi: 'Trang đích còn gap cấu trúc theo W6 (FAQ/bảng/nguồn/H2/mở đầu — không tính quan sát từ/ảnh)', baseline: w6.rows.filter((r) => r.own && r.gaps.some(actionableGap)).length, target30: 0, how: 'node tools/seo-battle-matrix.mjs' },
    { kpi: 'Trang đích trả lời ngay đoạn đầu (W7 answerFirst)', baseline: w7.rows.filter((r) => r.answerFirst).length, target30: w7.rows.filter((r) => r.answerFirst != null).length, how: 'W7' },
    { kpi: 'URL trong sitemap được index (coverage PASS)', baseline: 'PASS', target30: 'PASS', how: 'tools/seo-index-coverage.mjs' },
    { kpi: 'Lượt gửi IndexNow sau mỗi đợt đăng', baseline: '—', target30: 'mỗi đợt', how: '.github/workflows/indexnow.yml' },
    { kpi: 'Hiển thị/nhấp Search Console', baseline: 'chưa có dữ liệu', target30: 'bật DATA-DRIVEN khi có tệp xuất', how: 'data/seo/performance/' }
  ];
  return { items, tiers, roadmap, kpis };
}

// ---------- run + render ----------

export function runBattle(root = ROOT, { context = null } = {}) {
  const b = battleContext(root, { context });
  const w1 = competitorIntelligence(b);
  const w2 = keywordMaster(b);
  const w3 = weaknessMatrix(b);
  const w4 = opportunityMatrix(b, { w1, w3 });
  const w5 = topicClusterMatrix(b);
  const w6 = serpBenchmark(b);
  const w7 = aiSearchMatrix(b);
  const w8 = backlinkMatrix(b, { w1 });
  const w9 = urlArchitecture(b);
  const w10 = masterMatrix(b, { w3, w4, w5, w6, w7, w8, w9 });
  const { data, cs } = b;
  const sources = {
    serp: cs.snaps.files.map((f) => ({ file: f.file, collected: f.collected, queries: f.queries })),
    demand: 'data/seo/keyword-demand.json', metrics: (data.metrics?.sources ?? []).map((s) => `${s.tool} ${s.retrieved}`),
    labs: data.labs ? `${data.labs.source.tool} ${data.labs.source.retrieved}` : null,
    audits: data.audits ? { pages: data.audits.pages.length, unavailable: data.audits.pages.filter((p) => p.unavailable).length, scraped: data.audits.pages.find((p) => p.scraped)?.scraped ?? null } : null,
    backlinks: (data.backlinks?.profiles ?? []).map((p) => `${p.tool} ${p.target} ${p.retrieved}`)
  };
  return { mode: b.e.mode, snapshots: b.e.snapshots, sources, w1, w2, w3, w4, w5, w6, w7, w8, w9, w10, engineGroups: b.e.groups.length, urls: b.urlRows.size };
}

const yesNo = (v) => (v == null ? '—' : v ? 'có' : 'không');
const list = (xs) => (xs?.length ? xs.map((x) => `- ${x}`).join('\n') : '- —');
const H = (bt) => `_Chế độ ${bt.mode}; SERP đã chụp: ${bt.snapshots.map((f) => `${f.file} (${f.queries} truy vấn)`).join(', ')}; trang đối thủ đã audit: ${bt.sources.audits?.pages ?? 0} (${bt.sources.audits?.unavailable ?? 0} không tải được). Sinh bởi \`node tools/seo-battle-matrix.mjs\` — không sửa tay._`;

export function render(bt) {
  const f = {};
  const { w1, w2, w3, w4, w5, w6, w7, w8, w9, w10 } = bt;

  // W1
  const c1 = w1.selected.map((r) => ({ 'Miền': r.domain, 'Loại': r.type, 'Đe dọa': r.threat, 'Truy vấn top 10': r.queries, 'Top 3': r.top3, 'Vị trí tốt nhất': r.best, 'TB': r.avg,
    'Cụm': r.clusters.join(' '), 'Labs rating': r.labs?.rating ?? null, 'Labs visibility': r.labs?.visibility ?? null, 'Labs ETV': r.labs?.etv ?? null, 'Trang đã audit': r.audited, 'Từ (trung vị)': r.words, 'FAQ %': r.faq, 'Schema bài %': r.schema, 'Nguồn luật %': r.legal,
    'Bằng chứng': r.evidence.map((e) => `${e.query} #${e.position}`).join('; ') }));
  f['01-competitor-intelligence.csv'] = csv(c1);
  f['01-competitor-intelligence.md'] = `# W1 — Ma trận tình báo đối thủ\n\n${H(bt)}\n\nĐối thủ = miền xuất hiện trong top 10 Google Việt Nam của ${bt.snapshots.reduce((a, s) => a + s.queries, 0)} truy vấn đã chụp (trừ website này và website chị em) + miền có dữ liệu DataForSEO Labs (${bt.sources.labs ?? 'không'}). ${THREAT_RULE}\n\n` +
    `**${w1.selected.length} đối thủ nội dung được chọn** (tổng ${w1.rows.length} miền; ${w1.social.length} miền mạng xã hội/video/kho ứng dụng chiếm SERP, không phải đối thủ nội dung).\n\n` +
    table(c1.map((r) => ({ ...r, 'Bằng chứng': r['Bằng chứng'].split('; ').slice(0, 3).join('; ') })), ['Miền', 'Loại', 'Đe dọa', 'Truy vấn top 10', 'Top 3', 'Vị trí tốt nhất', 'Labs rating', 'Labs visibility', 'Trang đã audit', 'Từ (trung vị)', 'FAQ %', 'Schema bài %', 'Bằng chứng']) +
    `\n\n## Miền chiếm SERP (không phải đối thủ nội dung)\n\n${table(w1.social.map((r) => ({ 'Miền': r.domain, 'Loại': r.type, 'Truy vấn top 10': r.queries, 'Top 3': r.top3 })), ['Miền', 'Loại', 'Truy vấn top 10', 'Top 3'])}\n\n## 10 đối thủ mạnh nhất (đầu vào W4)\n\n${list(w1.strongest.map((r) => `${r.domain} — ${r.type}, ${r.queries} truy vấn, ${r.top3} lần top 3${r.labs ? `, Labs visibility ${r.labs.visibility}` : ''}`))}\n`;

  // W2
  const c2 = w2.rows.map((r) => ({ 'Từ khóa': r.keyword, 'Phạm vi': r.scope, 'Cụm': r.cluster, 'Nhóm engine': r.group, 'Volume A (keyword-demand)': r.volumeA, 'Nguồn A': r.sourceA, 'Volume B (DataForSEO)': r.volumeB, 'KD': r.kd, 'Ý định công cụ': r.toolIntent, 'Ý định SERP': r.serpIntent, 'Tính năng SERP': r.features,
    'Vị trí website': r.ownBest, 'Website chị em': r.sisterBest, 'Đối thủ #1': r.topDomain, 'URL tham chiếu': r.referenceUrl, 'Top 3': r.top3, 'Độ phủ': r.status, 'Trang đích': r.target, 'Hành động': r.action, 'Điểm ưu tiên': r.priority, 'Hạng': r.tier, 'Độ tin cậy dữ liệu': r.confidence }));
  f['02-keyword-master-matrix.csv'] = csv(c2);
  const top2 = c2.filter((r) => r['Phạm vi'] === 'IN-SCOPE').slice(0, 80);
  f['02-keyword-master-matrix.md'] = `# W2 — Ma trận từ khóa tổng (Keyword Master Matrix)\n\n${H(bt)}\n\n${w2.rows.length} từ khóa đã nghiên cứu; ${w2.measured} có volume đo được (${w2.bothTools} bởi cả hai công cụ, không gộp số), ${w2.withKd} có độ khó (KD), ${w2.withSerp} có SERP đã chụp. Nguồn: ${w2.sources.join('; ')}; volume A = data/seo/keyword-demand.json. Độ tin cậy: ${Object.values(CONFIDENCE).join(' / ')}. Hàng ngoài phạm vi (SISTER, OUT-*) giữ để minh bạch — không nhắm.\n\n## 80 từ khóa trong phạm vi có volume cao nhất\n\n` +
    table(top2, ['Từ khóa', 'Cụm', 'Volume A (keyword-demand)', 'Volume B (DataForSEO)', 'KD', 'Ý định SERP', 'Tính năng SERP', 'Vị trí website', 'Đối thủ #1', 'Độ phủ', 'Trang đích', 'Hạng', 'Độ tin cậy dữ liệu']) + '\n\nToàn bộ: `02-keyword-master-matrix.csv`.\n';

  // W3
  const c3 = w3.rows.map((r) => ({ 'Truy vấn': r.query, 'Cụm': r.cluster, 'Vị trí': r.position, 'Miền': r.domain, 'Loại': r.type, 'URL': r.url, 'Tiêu đề': r.title, 'Từ': r.words, 'H2': r.h2, 'FAQ': yesNo(r.faq), 'Bảng': r.tables, 'Schema bài': r.schema, 'Văn bản luật': r.legal, 'Ngày đăng': r.published, 'Điểm yếu': r.labels.join('; '), 'Trang của ta': r.ours }));
  f['03-weakness-matrix.csv'] = csv(c3);
  f['03-weakness-matrix.md'] = `# W3 — Ma trận điểm yếu đối thủ (Competitor Weakness Hunter)\n\n${H(bt)}\n\n${w3.rows.length} trang top 10 (${w3.audited} tải được) được chấm theo ${Object.keys(WEAKNESS).length} điểm yếu quan sát được. Tổng theo loại: ${Object.entries(w3.totals).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${WEAKNESS[k]} (${n})`).join('; ')}.\n\n## Theo truy vấn — điểm yếu phổ biến và trang tốt hơn cần có\n\n` +
    w3.queries.slice(0, 40).map((q) => `### ${q.query}\n\nCụm ${q.cluster}; ${q.pages} trang audit; điểm yếu TB ${q.avgWeak}/trang; volume ${fmt(q.demand)}; hành động: ${q.action || '—'}; trang của ta: ${q.ours || '—'}; vị trí website: ${q.ownBest ?? '—'}.\n\nĐiểm yếu nhiều nhất:\n${list(q.top)}\n\nTrang tốt hơn (không sao chép, viết từ nguồn gốc):\n${list(q.plan)}\n`).join('\n') +
    `\n## Toàn bộ trang đã chấm\n\n${table(c3.map((r) => ({ ...r, 'Tiêu đề': r['Tiêu đề'].slice(0, 70), 'Điểm yếu': r['Điểm yếu'].slice(0, 140) })), ['Truy vấn', 'Vị trí', 'Miền', 'Loại', 'Tiêu đề', 'Từ', 'H2', 'FAQ', 'Bảng', 'Schema bài', 'Điểm yếu'])}\n`;

  // W4
  const c4 = w4.rows.map((r) => ({ 'Nhóm': r.group, 'Từ khóa': r.keyword, 'Biến thể': r.variants, 'Volume (đo được)': r.demand, 'Cụm': r.cluster, 'Ý định': r.intent, 'SERP chụp': r.serps, 'Vị trí website': r.ownBest, 'Độ phủ': r.status, 'Cạnh tranh': r.competition, 'Đối thủ mạnh trong top 10': r.strongIn.join(' '), 'Điểm yếu TB top 10': r.avgWeak, 'Điểm engine': r.priority, 'Điểm cơ hội': r.score, 'Hạng': r.tier, 'Loại trang': r.pageType, 'Hành động': r.action, 'Trang đích': r.target }));
  f['04-opportunity-matrix.csv'] = csv(c4);
  f['04-opportunity-matrix.md'] = `# W4 — Ma trận khoảng trống từ khóa & cơ hội (P0/P1/P2)\n\n${H(bt)}\n\n${OPPORTUNITY_FORMULA}. Kết quả: P0 ${w4.tiers.P0}, P1 ${w4.tiers.P1}, P2 ${w4.tiers.P2} (trong ${w4.rows.length} nhóm từ khóa của engine 06; nhóm đã có quyết định done/rejected/deferred ghi trong ngoặc).\n\n## Cơ hội xếp hạng\n\n` +
    table(c4.filter((r) => r['Hạng']).slice(0, 60), ['Hạng', 'Điểm cơ hội', 'Từ khóa', 'Volume (đo được)', 'Cụm', 'Ý định', 'Vị trí website', 'Độ phủ', 'Cạnh tranh', 'Đối thủ mạnh trong top 10', 'Điểm yếu TB top 10', 'Loại trang', 'Hành động', 'Trang đích']) +
    `\n\n## Khoảng trống so với 10 đối thủ mạnh nhất (truy vấn họ trong top 10, website này vắng)\n\n` +
    w4.competitors.map((c) => `### ${c.domain} (${c.type}) — ${c.queries.length} truy vấn top 10, ${c.gaps.length} khoảng trống, ${c.shared.length} cùng xuất hiện\n\n${list(c.gaps.slice(0, 12).map((q) => `${q.query} — họ #${q.position}${b2scope(bt, q.query)}`))}\n`).join('\n');

  // W5
  const c5 = w5.rows.map((r) => ({ 'Cụm': r.id, 'Tên': r.name, 'Ý định': r.intent, 'Từ khóa đầu': r.head.join('; '), 'Pillar': r.pillar, 'Pillar tồn tại': yesNo(r.pillarExists), 'Loại pillar': r.pillarType, 'Vào pillar (ngữ cảnh/cụm/hub)': r.pillarInbound ? `${r.pillarInbound.context}/${r.pillarInbound.related}/${r.pillarInbound.hub}` : '', 'Pillar hỗ trợ': r.supportPillar,
    'Hub': r.hubs.join(' '), 'Bài supporting': r.articles, 'Bài 0 inbound': r.zeroInbound, 'Nhóm từ khóa': r.groups, 'Volume nhóm': r.demand, 'SERP chụp': r.serps, 'Câu hỏi FAQ (PAA)': r.faq.join(' | '), 'Tìm kiếm liên quan': r.related.join(' | '), 'Trộn ý định': r.mixed.join(' | '), 'Cạnh tranh nội bộ': r.competing.join(' | '), 'Việc mở': r.open.map((o) => `${o.head} → ${o.action}`).join(' | '), 'Trạng thái': r.status }));
  f['05-topic-cluster-matrix.csv'] = csv(c5);
  f['05-topic-cluster-matrix.md'] = `# W5 — Ma trận cụm chủ đề (Topical Authority)\n\n${H(bt)}\n\nMô hình: pillar → hub danh mục/chủ đề con → bài supporting (liên kết "Cùng chủ đề" + "Bài viết liên quan" do tools/seo-links.mjs lập). Một URL một ý định: nhóm từ khóa có ý định SERP khác nhau không được dồn về một trang. Pillar thiếu: ${w5.pillarsMissing}; trang trộn ý định: ${w5.mixed}; cạnh tranh nội bộ: ${w5.competing}.\n\n` +
    table(c5, ['Cụm', 'Tên', 'Pillar', 'Pillar tồn tại', 'Vào pillar (ngữ cảnh/cụm/hub)', 'Hub', 'Bài supporting', 'Bài 0 inbound', 'Nhóm từ khóa', 'Volume nhóm', 'SERP chụp', 'Trạng thái']) +
    `\n\n## Câu hỏi FAQ quan sát được (People Also Ask) và việc mở theo cụm\n\n` + w5.rows.filter((r) => r.faq.length || r.open.length || r.mixed.length).map((r) => `### ${r.id} ${r.name}\n\nFAQ:\n${list(r.faq)}\n\nViệc mở:\n${list(r.open.map((o) => `${o.head} → ${o.action} (${o.target}, điểm ${o.priority})`))}\n${r.mixed.length ? `\nTrộn ý định:\n${list(r.mixed)}\n` : ''}`).join('\n');

  // W6
  const c6 = w6.rows.map((r) => ({ 'Truy vấn': r.query, 'Cụm': r.cluster, 'Ý định': r.intent, 'Tính năng': r.features.join(' '), 'Trang audit': r.audited, 'Từ (trung vị)': r.bench.words, 'H2': r.bench.h2, 'H3': r.bench.h3, 'Ảnh': r.bench.images, 'Bảng': r.bench.tables, 'Danh sách': r.bench.lists, 'Link nội bộ': r.bench.internal, 'FAQ %': r.bench.faq, 'Schema bài %': r.bench.schema, 'Nguồn luật %': r.bench.legal, 'Ngày %': r.bench.date, 'Năm trong title %': r.bench.year,
    'Vị trí website': r.ownBest, 'Trang của ta': r.target, 'Từ của ta': r.own?.words ?? null, 'H2 của ta': r.own?.h2 ?? null, 'FAQ của ta': r.own ? yesNo(r.own.faq) : '', 'Bảng của ta': r.own?.tables ?? null, 'Ảnh của ta': r.own?.images ?? null, 'Khoảng cách': r.gaps.join('; '), 'Top 1 title': r.pages[0]?.title ?? '', 'Top 1 H2': r.pages[0]?.h2.join(' | ') ?? '' }));
  f['06-serp-benchmark.csv'] = csv(c6);
  f['06-serp-benchmark.md'] = `# W6 — SERP Benchmark (cấu trúc trang đang xếp hạng vs. trang của ta)\n\n${H(bt)}\n\n${w6.rows.length} truy vấn có ≥ 1 trang top 10 audit được (${w6.overall.pages} trang; trung vị ${fmt(w6.overall.words)} từ, FAQ ${w6.overall.faq}%, có bảng ${w6.overall.tables}%, ảnh trung vị ${w6.overall.images}); ${w6.withOwn} truy vấn có trang đích của website để so sánh.\n\n` +
    table(c6.slice(0, 60), ['Truy vấn', 'Trang audit', 'Từ (trung vị)', 'H2', 'Ảnh', 'Bảng', 'FAQ %', 'Schema bài %', 'Nguồn luật %', 'Vị trí website', 'Trang của ta', 'Từ của ta', 'H2 của ta', 'FAQ của ta', 'Khoảng cách']) +
    `\n\n## Cấu trúc top 1–3 theo truy vấn ưu tiên\n\n` + w6.rows.slice(0, 25).map((r) => `### ${r.query}\n\n${r.pages.slice(0, 3).map((p) => `- #${p.position} ${p.domain} (${p.type}) — "${p.title}"; H1: ${p.h1 || '—'}; ${fmt(p.words)} từ; H2: ${p.h2.join(' / ') || '—'}; FAQ ${yesNo(p.faq)}; bảng ${p.tables}; ảnh ${p.images}; schema ${p.schema || '—'}; nguồn ${p.legal || '—'}; đăng ${p.published || '—'}`).join('\n')}\n${r.own ? `- **Trang của ta** ${r.target} — "${r.own.title}"; ${fmt(r.own.words)} từ; H2: ${r.own.h2list.slice(0, 6).join(' / ')}; FAQ ${yesNo(r.own.faq)}; bảng ${r.own.tables}; ảnh ${r.own.images}\n- Khoảng cách: ${r.gaps.join('; ') || 'không'}` : `- Trang của ta: ${r.target || '(chưa có)'}`}\n`).join('\n');

  // W7
  const c7 = w7.rows.map((r) => ({ 'Truy vấn': r.query, 'Cụm': r.cluster, 'AI Overview': yesNo(r.ai), 'Nguồn AI Overview (quan sát)': r.sources.map((s) => s.domain).join(' '), 'Loại nguồn': r.sourceKinds.join(' '), 'Website được trích': yesNo(r.sources.some((s) => s.ownSite)), 'PAA': r.paa.join(' | '), 'Dạng trả lời': r.form, 'Thực thể/văn bản': r.entities.join(' | '), 'Địa phương': r.local, 'Trang đích': r.target, 'Trả lời ngay đoạn đầu': r.answerFirst == null ? '' : yesNo(r.answerFirst), 'Khoảng trống': r.gaps.join('; '), 'Volume': r.demand, 'Điểm': r.priority }));
  f['07-ai-search-matrix.csv'] = csv(c7);
  f['07-ai-search-matrix.md'] = `# W7 — Ma trận tìm kiếm AI (GEO/AEO)\n\n${H(bt)}\n\n${w7.rows.length} truy vấn dạng câu hỏi hoặc có AI Overview trong SERP đã chụp; AI Overview xuất hiện ở ${w7.withAi}; website được trích trong ${w7.ownCited}; ${w7.paaTotal} câu People Also Ask. "Nguồn" = URL Google hiển thị trong AI Overview lúc chụp — chỉ là quan sát một thời điểm, không hứa hẹn được trích.\n\n## Miền được AI Overview trích (quan sát)\n\n${table(w7.citedDomains.slice(0, 20).map((d) => ({ 'Miền': d.domain, 'Loại': d.type, 'Số truy vấn': d.n })), ['Miền', 'Loại', 'Số truy vấn'])}\n\n## Theo truy vấn\n\n` +
    table(c7.map((r) => ({ ...r, 'PAA': r.PAA.slice(0, 120), 'Nguồn AI Overview (quan sát)': r['Nguồn AI Overview (quan sát)'].slice(0, 80) })), ['Truy vấn', 'AI Overview', 'Nguồn AI Overview (quan sát)', 'PAA', 'Dạng trả lời', 'Thực thể/văn bản', 'Địa phương', 'Trang đích', 'Trả lời ngay đoạn đầu', 'Khoảng trống']) + '\n';

  // W8
  const p0 = w8.profiles[0];
  const c8 = (p0?.rows ?? []).map((r) => ({ 'Miền giới thiệu': r.domain, 'Backlink': r.backlinks, 'Domain rank': r.rank, 'Spam score': r.spam_score, 'Thấy lần đầu': r.first_seen, 'Loại nguồn': r.type, 'Cơ hội cho website': r.opportunity, 'Rủi ro': r.risk }));
  f['08-backlink-matrix.csv'] = csv(c8.length ? c8 : [{ 'Miền giới thiệu': '' }]);
  f['08-backlink-matrix.md'] = `# W8 — Ma trận cơ hội liên kết & thẩm quyền (Backlink / Authority Gap)\n\n${H(bt)}\n\n${p0 ? `Hồ sơ đo được của đối thủ mạnh nhất **${p0.target}** (${p0.tool}, ${p0.retrieved}, phạm vi ${p0.scope}): Domain Rank ${p0.summary.rank}, ${fmt(p0.summary.backlinks)} backlink từ ${fmt(p0.summary.referring_domains)} miền giới thiệu (spam score hồ sơ ${p0.summary.backlinks_spam_score}); ${p0.referring_domains_total} miền giới thiệu, ${p0.rows.length} miền đầu được phân loại: ${p0.byType.map(([t, n]) => `${t} (${n})`).join('; ')}.` : 'Chưa có hồ sơ backlink đo được.'} Website này chưa có dữ liệu backlink đo được (không chạy để tiết kiệm credit) — mọi con số ở đây là của đối thủ.\n\n## Kiểu nguồn liên kết nên theo (không mua link, không PBN, không rải diễn đàn)\n\n${table(w8.opportunities.map((o) => ({ 'Nguồn': o.type, 'Việc làm': o.action, 'Bằng chứng': o.evidence, 'Rủi ro': o.risk, 'Chất lượng': o.quality })), ['Nguồn', 'Việc làm', 'Bằng chứng', 'Rủi ro', 'Chất lượng'])}\n\n## Trang danh sách/địa chỉ đang xếp hạng (mục tiêu citation tự nhiên)\n\n${table(w8.listingPages.slice(0, 30).map((p) => ({ 'Truy vấn': p.query, 'Vị trí': p.position, 'Miền': p.domain, 'Loại': p.type, 'Tiêu đề': p.title, 'Cơ hội': p.opportunity, 'Rủi ro': p.risk })), ['Truy vấn', 'Vị trí', 'Miền', 'Loại', 'Tiêu đề', 'Cơ hội', 'Rủi ro'])}\n\n## Thẩm quyền miền (DataForSEO Labs rating, quan sát)\n\n${table(w8.authorities.slice(0, 20).map((a) => ({ 'Miền': a.domain, 'Loại': a.type, 'Rating': a.rating, 'Visibility': a.visibility, 'ETV': a.etv })), ['Miền', 'Loại', 'Rating', 'Visibility', 'ETV'])}\n\n## Miền giới thiệu của ${p0?.target ?? '—'} (100 đầu, đã phân loại)\n\n${table(c8.slice(0, 100), ['Miền giới thiệu', 'Backlink', 'Domain rank', 'Spam score', 'Loại nguồn', 'Cơ hội cho website', 'Rủi ro'])}\n`;

  // W9
  const c9 = w9.rows.map((r) => ({ 'URL': r.url, 'Loại trang': r.type, 'Từ khóa chính': r.keyword, 'Ý định': r.intent, 'Cụm': r.cluster, 'Vị trí trong kiến trúc': r.position, 'Mục tiêu chuyển đổi': r.goal, 'Nhóm từ khóa engine': r.groups.join(' | '), 'Ý định SERP của nhóm': r.serpIntents.join(' | '), 'Liên kết': r.links, 'Cannibalization': r.cannibalization, 'Trạng thái': r.status }));
  f['09-url-architecture.csv'] = csv(c9);
  f['09-url-architecture.md'] = `# W9 — Bản thiết kế kiến trúc URL (một từ khóa, một ý định, một vị trí, một mục tiêu chuyển đổi)\n\n${H(bt)}\n\n${w9.total} URL hiện có (giữ nguyên 100%, không xóa/gộp/noindex) + ${w9.proposed.length} URL đề xuất (owner thêm ID vào data/blog/content-matrix.csv). Vị trí: ${Object.entries(w9.byPosition).map(([k, n]) => `${k} (${n})`).join('; ')}. Từ khóa chính trùng giữa URL: ${w9.dupKeywords.length}; trang nhận nhóm khác ý định SERP: ${w9.mixed.length}.\n\n## URL đề xuất mới\n\n${table(w9.proposed.map((p) => ({ 'ID': p.id, 'URL': p.url, 'Từ khóa': p.keyword, 'Ý định': p.intent, 'Cụm': p.cluster, 'Vị trí': p.position, 'Mục tiêu chuyển đổi': p.goal, 'Volume': p.demand, 'Legal gate': yesNo(p.legal), 'Nguồn': p.source })), ['ID', 'URL', 'Từ khóa', 'Ý định', 'Cụm', 'Vị trí', 'Mục tiêu chuyển đổi', 'Volume', 'Legal gate'])}\n\n## Trang không phải bài viết và pillar/trang đích của nhóm từ khóa\n\n${table(c9.filter((r) => r['Loại trang'] !== 'Bài viết' && r['Loại trang'] !== 'Hub danh mục (phân trang)' || r['Nhóm từ khóa engine']).slice(0, 120), ['URL', 'Loại trang', 'Từ khóa chính', 'Ý định', 'Cụm', 'Vị trí trong kiến trúc', 'Mục tiêu chuyển đổi', 'Nhóm từ khóa engine', 'Ý định SERP của nhóm'])}\n\n${w9.dupKeywords.length ? `## Từ khóa chính trùng\n\n${list(w9.dupKeywords.map(([k, urls]) => `${k}: ${urls.join(', ')}`))}\n` : ''}Toàn bộ ${w9.total} URL: \`09-url-architecture.csv\`.\n`;

  // W10
  const c10 = w10.items.map((i) => ({ 'ID': i.id, 'Hạng': i.tier, 'Giai đoạn': i.phase, 'Điểm': i.score, 'Vũ khí': i.weapon, 'Hành động': i.action, 'Loại trang': i.pageType, 'Từ khóa/chủ đề': i.keyword, 'URL/trang đích': i.target, 'Cụm': i.cluster, 'Bằng chứng': i.evidence, 'Độ tin cậy': CONFIDENCE_LABEL[i.confidence], 'Người làm': i.owner, 'KPI': i.kpi, 'Điều kiện xác minh': i.verify, 'Việc cụ thể': i.plan.join(' | '), 'Khoảng cách': i.gaps.join(' | ') }));
  f['10-master-battle-matrix.csv'] = csv(c10);
  f['10-master-battle-matrix.md'] = `# W10 — SEO Master Battle Matrix\n\n${H(bt)}\n\nTổng hợp W1–W9: ${w10.items.length} việc (P0 ${w10.tiers.P0}, P1 ${w10.tiers.P1}, P2 ${w10.tiers.P2}). Hạng theo điểm (P0 ≥ 1.000, P1 ≥ 100, P2 còn lại; việc cấu trúc/thẩm quyền có hạng cố định ghi rõ). Độ tin cậy: ${Object.values(CONFIDENCE_LABEL).join(' / ')}. Không xóa bài, không đổi URL, không noindex; bài mới chỉ sau khi owner thêm ID; con số pháp lý chỉ qua data/seo/legal-facts.json.\n\n## Ma trận\n\n` +
    table(c10.map((r) => ({ ...r, 'Bằng chứng': r['Bằng chứng'].slice(0, 160), 'Việc cụ thể': r['Việc cụ thể'].slice(0, 200) })), ['ID', 'Hạng', 'Giai đoạn', 'Điểm', 'Vũ khí', 'Hành động', 'Từ khóa/chủ đề', 'URL/trang đích', 'Bằng chứng', 'Độ tin cậy', 'Người làm', 'KPI', 'Điều kiện xác minh', 'Việc cụ thể']) +
    `\n\n## Lộ trình 30/60/90 ngày\n\n${w10.roadmap.map((r) => `### ${r.phase}\n\nViệc: ${r.items.join(', ') || '—'}\n\n${list(r.goals)}\n`).join('\n')}\n## KPI (đo được không cần Search Console; cột cuối nói cách đo)\n\n${table(w10.kpis.map((k) => ({ 'KPI': k.kpi, 'Hiện tại': k.baseline, 'Mục tiêu 30 ngày': k.target30, 'Cách đo': k.how })), ['KPI', 'Hiện tại', 'Mục tiêu 30 ngày', 'Cách đo'])}\n`;

  // README + JSON
  f['README.md'] = `# SEO Master Battle Matrix — 10 vũ khí (chế độ ${bt.mode})\n\n${H(bt)}\n\n| # | Vũ khí | Tệp | Kết quả |\n| --- | --- | --- | --- |\n| 1 | Tình báo đối thủ | [01](01-competitor-intelligence.md) | ${w1.selected.length} đối thủ nội dung / ${w1.rows.length} miền |\n| 2 | Từ khóa tổng | [02](02-keyword-master-matrix.md) | ${w2.rows.length} từ khóa, ${w2.measured} có volume, ${w2.withKd} có KD |\n| 3 | Điểm yếu đối thủ | [03](03-weakness-matrix.md) | ${w3.rows.length} trang chấm, ${w3.queries.length} truy vấn |\n| 4 | Khoảng trống & cơ hội | [04](04-opportunity-matrix.md) | P0 ${w4.tiers.P0} / P1 ${w4.tiers.P1} / P2 ${w4.tiers.P2} |\n| 5 | Cụm chủ đề | [05](05-topic-cluster-matrix.md) | ${w5.rows.length} cụm; pillar thiếu ${w5.pillarsMissing}; trộn ý định ${w5.mixed} |\n| 6 | SERP benchmark | [06](06-serp-benchmark.md) | ${w6.rows.length} truy vấn, ${w6.withOwn} có trang của ta |\n| 7 | Tìm kiếm AI | [07](07-ai-search-matrix.md) | ${w7.rows.length} truy vấn; AI Overview ${w7.withAi}; được trích ${w7.ownCited} |\n| 8 | Liên kết & thẩm quyền | [08](08-backlink-matrix.md) | ${w8.profiles.length} hồ sơ đối thủ, ${w8.listingPages.length} trang danh sách |\n| 9 | Kiến trúc URL | [09](09-url-architecture.md) | ${w9.total} URL + ${w9.proposed.length} đề xuất |\n| 10 | Master Battle Matrix | [10](10-master-battle-matrix.md) | ${w10.items.length} việc (P0 ${w10.tiers.P0}) |\n\n## Nguồn dữ liệu (chỉ quan sát/đo được)\n\n${list([
    ...bt.sources.serp.map((s) => `SERP Google Việt Nam: data/seo/serp-snapshots/${s.file} — ${s.queries} truy vấn, chụp ${s.collected}`),
    `Volume A: ${bt.sources.demand}`, ...bt.sources.metrics.map((m) => `Volume B + KD: ${m} (${METRICS_PATH})`), bt.sources.labs ? `Thị phần miền: ${bt.sources.labs} (${LABS_PATH})` : '',
    bt.sources.audits ? `Trang đối thủ: ${bt.sources.audits.pages} trang (${AUDITS_PATH}, ${bt.sources.audits.scraped ?? ''})` : '', ...bt.sources.backlinks.map((x) => `Backlink đối thủ: ${x} (${BACKLINKS_PATH})`),
    'Engine 06: docs/seo/engine/ (nhóm từ khóa, trang đích, điểm ưu tiên)', 'Ma trận URL: docs/seo/seo-master-matrix.json'].filter(Boolean))}\n\n## Cách chạy\n\n\`node tools/seo-battle-matrix.mjs\` ghi lại thư mục này; \`--check\` báo lệch khi dữ liệu đổi mà báo cáo chưa sinh lại (SEO monitor cảnh báo). Mọi thay đổi trang vẫn đi qua tools/seo-body-review.mjs, data/seo/article-meta.json và quy trình owner thêm ID; rollback = git revert commit tương ứng.\n\nGhi chú đọc W6/W10: khoảng trống "ít từ hơn trung vị top" và "không có ảnh" chỉ là quan sát để đối chiếu — không viết dài hay chèn ảnh cho bằng đối thủ; chỉ FAQ, bảng, nguồn pháp lý, đoạn mở đầu và cấu trúc H2 (khi mục dài hơn 300 từ trung bình, ngưỡng tối đa 8 H2) mới sinh việc trong W10.\n`;
  f['battle.json'] = JSON.stringify({
    mode: bt.mode, snapshots: bt.snapshots, sources: bt.sources, counts: { competitors: w1.rows.length, selected: w1.selected.length, keywords: w2.rows.length, measured: w2.measured, weaknessRows: w3.rows.length, opportunity: w4.tiers, clusters: w5.rows.length, benchmark: w6.rows.length, ai: w7.rows.length, listingPages: w8.listingPages.length, urls: w9.total, proposed: w9.proposed.length, master: w10.tiers },
    master: w10.items.map((i) => ({ id: i.id, tier: i.tier, score: i.score, weapon: i.weapon, action: i.action, keyword: i.keyword, target: i.target, cluster: i.cluster, confidence: i.confidence, phase: i.phase })),
    opportunities: w4.rows.filter((r) => r.tier && /^P[012]$/.test(r.tier)).map((r) => ({ group: r.group, keyword: r.keyword, tier: r.tier, score: r.score, demand: r.demand, target: r.target })),
    kpis: w10.kpis
  }, null, 1) + '\n';
  return f;
}

/** Scope note for a competitor's gap query (sister-owned commercial terms are never targets of this site). */
function b2scope(bt, query) {
  const k = bt.w2.rows.find((r) => normKw(r.keyword) === normKw(query));
  return k && k.scope !== 'IN-SCOPE' ? ` (${k.scope}: không nhắm)` : '';
}

export function build(root = ROOT, opts = {}) {
  return render(runBattle(root, opts));
}

export function main(argv = process.argv.slice(2), root = ROOT) {
  const files = build(root);
  if (argv.includes('--check')) {
    const stale = Object.entries(files).filter(([name, text]) => !existsSync(join(root, OUT_DIR, name)) || read(root, `${OUT_DIR}/${name}`) !== text).map(([n]) => n);
    if (stale.length) { console.error(`seo-battle-matrix: ${OUT_DIR} lệch (${stale.join(', ')}) — chạy node tools/seo-battle-matrix.mjs`); return 1; }
    console.log(`seo-battle-matrix: ${OUT_DIR} khớp dữ liệu`);
    return 0;
  }
  mkdirSync(join(root, OUT_DIR), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, OUT_DIR, name), text);
  const s = JSON.parse(files['battle.json']);
  console.log(`seo-battle-matrix: ${Object.keys(files).length} tệp → ${OUT_DIR}; master P0 ${s.counts.master.P0} / P1 ${s.counts.master.P1} / P2 ${s.counts.master.P2}; cơ hội P0 ${s.counts.opportunity.P0}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
