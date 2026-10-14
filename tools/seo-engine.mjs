#!/usr/bin/env node
/**
 * AUTONOMOUS SEO ENGINE — "vũ khí 06" (v72), ZERO-DATA mode.
 *
 * One command runs the whole research → decision loop on top of the five
 * existing SEO tools and never re-implements them:
 *   1. repository audit — tools/site-audit.mjs, tools/seo-score.mjs,
 *      tools/seo-master-audit.mjs (URL matrix), tools/seo-index-coverage.mjs,
 *      tools/seo-cold-start.mjs freshness, tools/indexnow.mjs key
 *   2. SERP research    — the observed snapshots of tools/seo-cold-start.mjs;
 *      this engine emits the RESEARCH QUEUE of what is still unmeasured
 *   3. keyword clustering (new) — keywords whose live Google top 10 share ≥ 3
 *      URLs are one search intent (SERP overlap); spelling/word-order variants
 *      with the same core words are merged (lexical); every group gets one
 *      target page, its measured demand and its internal competitors
 *   4. SEO matrix (new) — one row per keyword group: demand, cluster, SERP
 *      intent and features, observed position, target URL, coverage, action
 *      and a transparent priority score
 *   5. topical map (new) — category → cluster K01–K20 → pillar → groups
 *   6. content gap → briefs for writers and proposed matrix rows (owner
 *      approval; data/blog/content-matrix.csv is never edited here)
 *
 * Decisions of people/agents live in data/seo/engine-decisions.json
 * (done / rejected / deferred per group and action), so the queue never
 * repeats finished work. Numbers come only from the sources above: volumes
 * from keyword tools, positions from captured SERPs, nothing estimated.
 *
 * Usage:
 *   node tools/seo-engine.mjs           # run + write docs/seo/engine/*
 *   node tools/seo-engine.mjs --check   # exit 1 when docs/seo/engine is stale
 * Read-only for the site (pages, bodies, manifest and matrix untouched).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/config/site.js';
import { taxonomy, viSlug } from './taxonomy.mjs';
import { topicFamily } from './seo-meta.mjs';
import { parseCsv, reconcileIndexCoverage } from './seo-index-coverage.mjs';
import { createSiteIo, auditSite } from './site-audit.mjs';
import { scoreRepo } from './seo-score.mjs';
import { runAudit, finalize, summarize, clusterOf, BASELINE } from './seo-master-audit.mjs';
import {
  analyze as coldStartAnalyze, build as coldStartBuild, normKw, toks, canon, fmt, mdCell, sum, scoreAgainst, idfWeights,
  SCOPE_LABEL, STATUS_LABEL, OUT_DIR as COLD_START_DIR, STALE_DAYS
} from './seo-cold-start.mjs';
import { keyFileExists } from './indexnow.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = 'docs/seo/engine';
export const DECISIONS_PATH = 'data/seo/engine-decisions.json';
export const SERP_OVERLAP = 3; // shared top-10 URLs that make two queries one intent
const TOP = 10;

const read = (root, p) => readFileSync(join(root, p), 'utf8');

// ---------- keyword clustering ----------

/** Comparable URL: host without www, path without trailing slash. */
export function normUrl(u) {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '') || '/'}`.toLowerCase();
  } catch { return String(u); }
}

/** Core words of a keyword (generic words, years and one-letter tokens removed). */
export function coreSet(keyword, cfg) {
  return new Set(toks(keyword).filter((t) => !cfg.generic.has(t)));
}

const jaccard = (a, b) => {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
};

const STATUS_RANK = { COVERED: 3, SECTION: 2, PARTIAL: 1, GAP: 0 };

/**
 * Group in-scope keywords into search intents.
 *  - SERP overlap: both keywords have a captured SERP and share ≥ SERP_OVERLAP
 *    of their top-10 URLs (Google answers them with the same pages);
 *  - lexical: identical core words (spelling, word order, "k"/"không", years),
 *    or Jaccard ≥ 0.75 of core words when both already map to the same article.
 * Union-find keeps it deterministic and transitive.
 */
export function clusterKeywords(keywords, serps, cfg, { overlap = SERP_OVERLAP } = {}) {
  const items = keywords.filter((k) => k.scope === 'IN-SCOPE');
  const n = items.length;
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); };
  const cores = items.map((k) => coreSet(k.keyword, cfg));
  const serpOf = new Map(serps.map((s) => [normKw(s.query), s]));
  const urlSets = items.map((k) => {
    const s = serpOf.get(k.keyword);
    return s ? new Set(s.raw.organic.slice(0, TOP).map((o) => normUrl(o.url))) : null;
  });
  const edges = { serp: [], lexical: 0 };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = cores[i], b = cores[j];
      const same = a.size === b.size && [...a].every((t) => b.has(t));
      const ai = items[i].match?.article?.id, bj = items[j].match?.article?.id;
      const bothMatched = ai && ai === bj && items[i].match.status !== 'GAP' && items[j].match.status !== 'GAP';
      if (same || (bothMatched && jaccard(a, b) >= 0.75)) { union(i, j); edges.lexical++; continue; }
      if (urlSets[i] && urlSets[j]) {
        let shared = 0;
        for (const u of urlSets[i]) if (urlSets[j].has(u)) shared++;
        if (shared >= overlap) { union(i, j); edges.serp.push([items[i].keyword, items[j].keyword, shared]); }
      }
    }
  }
  const groups = new Map();
  items.forEach((k, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push({ ...k, serp: serpOf.get(k.keyword) ?? null });
  });
  const byVolume = (a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.length - b.keyword.length || a.keyword.localeCompare(b.keyword);
  return {
    groups: [...groups.values()].map((members) => members.sort(byVolume)),
    edges
  };
}

// ---------- matrix ----------

const OPPORTUNITY = { FIX_FIRST: 1, NEW_ARTICLE_VERIFY: 1, NEW_ARTICLE: 1, ADD_SECTION: 0.7, REVIEW_TARGET: 0.5, CONSIDER_STANDALONE: 0.5,
  ALIGN_META: 0.3, LOCAL_ONLY: 0, MONITOR: 0.1, KEEP: 0 };
export const FOCUS_MIN = 0.5; // share of a page's own topic words the group must contain for the page to be its target
const LOCAL = 'Giao dịch – địa phương';
const SERP_FEASIBILITY = { 'Thông tin': 1, 'Hỗn hợp (thương mại + thông tin)': 0.6, 'Giao dịch – địa phương': 0.25 };
const TOOL_FEASIBILITY = { informational: 0.8, commercial: 0.6, transactional: 0.4, navigational: 0.1 };
const TOOL_INTENT = { informational: 'Thông tin', commercial: 'Thương mại', transactional: 'Giao dịch', navigational: 'Điều hướng' };
export const ACTION_LABEL = {
  FIX_FIRST: 'Sửa nội dung lỗi thời trước (review body có nguồn)',
  NEW_ARTICLE: 'Bài mới (owner thêm ID vào ma trận)',
  ADD_SECTION: 'Bổ sung mục/FAQ vào bài đích (review body)',
  CONSIDER_STANDALONE: 'Cân nhắc tách bài riêng',
  ALIGN_META: 'Đưa cụm từ chính vào title/meta (article-meta)',
  REVIEW_TARGET: 'Chọn trang đích (trang khớp từ ngữ nhưng chủ đề khác)',
  LOCAL_ONLY: 'Ý định giao dịch – địa phương: trang bán hàng/Google Business Profile, không viết blog',
  MONITOR: 'Theo dõi (nhu cầu thấp/chưa đo)',
  KEEP: 'Giữ nguyên',
  NEW_ARTICLE_VERIFY: 'Bài mới sau khi đối chiếu văn bản gốc'
};
export const PRIORITY_FORMULA = 'điểm = volume đo được × hệ số cơ hội (sửa nội dung lỗi thời 1; bài mới 1; bổ sung mục 0,7; chọn trang đích 0,5; tách bài 0,5; chỉnh title/meta 0,3; theo dõi 0,1; giao dịch–địa phương 0) × hệ số khả thi theo SERP (thông tin 1; hỗn hợp 0,6; giao dịch–địa phương 0,25; chưa có SERP: theo ý định của công cụ 0,1–0,8) × hệ số hiển thị (đang ở vị trí 11–20: 1,5; đã trong top 10: 0,5)';

/**
 * How much of a page's own topic the group is about: IDF-weighted share of the
 * page keyword's core words (without its family qualifier such as "tóm tắt",
 * "giá tốt") that appear among the group's words. A page whose topic words are
 * mostly absent ("IDP", "khiếu nại") is about something else even when it
 * contains the query's words.
 */
export function focusOf(article, words, ctx) {
  const ks = topicWords(article, ctx);
  if (!ks.length) return 1;
  const idf = idfWeights(ctx.index);
  return sum(ks.filter((t) => words.has(t)).map(idf)) / sum(ks.map(idf));
}

/** PRIORITY_FORMULA as code: ordering only, never a traffic forecast. */
export function priorityOf({ demand, action, serpIntent = null, toolIntent = null, ownBest = null }) {
  const feasibility = serpIntent ? SERP_FEASIBILITY[serpIntent] : (TOOL_FEASIBILITY[toolIntent] ?? 0.5);
  const visibility = ownBest == null ? 1 : (ownBest <= 10 ? 0.5 : (ownBest <= 20 ? 1.5 : 1));
  return Math.round(demand * OPPORTUNITY[action] * feasibility * visibility);
}

/** Core words of a page's own topic: its keyword without generic words and its family qualifier. */
export function topicWords(article, ctx) {
  const qual = ctx.qualifier?.get(article.id) ?? new Set();
  return [...new Set(toks(article.keyword).filter((t) => !ctx.cfg.generic.has(t) && !qual.has(t)))];
}

/** Article a member points at (a section hit counts for its article). */
const pointed = (m) => (m.match?.status === 'SECTION' ? (m.match.section?.a ?? m.match.article) : m.match?.article);

/**
 * Action, priority and evidence for one keyword group.
 * ctx: byId, family (article → topic family), pillarOf (family → pillar id),
 * curatedOf (keyword → curated topic id), flags (article → reason),
 * decisions, clusters, index, cfg.
 */
export function assessGroup(members, ctx) {
  const head = members[0];
  const demand = sum(members.map((m) => m.volume ?? 0));
  const measured = members.filter((m) => m.volume != null).length;
  const familyOf = (a) => ctx.family.get(a.id);
  // Target: volume-weighted vote of the members' matched articles…
  const votes = new Map();
  for (const m of members) {
    const a = pointed(m);
    if (!a || m.match.status === 'GAP') continue;
    votes.set(a.id, (votes.get(a.id) ?? 0) + (m.volume ?? 1) * (1 + STATUS_RANK[m.match.status]));
  }
  const winner = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const override = decisionFor(members, ctx)?.target;
  let target = override && ctx.byId.has(override) ? ctx.byId.get(override) : (winner ? ctx.byId.get(winner) : (head.match?.article ?? null));
  // …then the topic family's pillar (bare seed) when it answers the head keyword as well (±0,1):
  // a qualifier article ("… cho sinh viên") should not take the family's head term.
  const pillar = winner && !override && ctx.pillarOf?.get(familyOf(target));
  if (pillar && pillar !== target.id && ctx.byId.has(pillar) && ctx.index && ctx.cfg) {
    const p = ctx.byId.get(pillar);
    if (scoreAgainst(head.keyword, p, ctx.index, ctx.cfg) >= scoreAgainst(head.keyword, target, ctx.index, ctx.cfg) - 0.1) target = p;
  }
  // Coverage of the group = best match inside the target's topic family.
  let status = 'GAP';
  let score = 0;
  for (const m of members) {
    const a = pointed(m);
    if (!target || !a || m.match.status === 'GAP' || (a.id !== target.id && familyOf(a) !== familyOf(target))) continue;
    if (STATUS_RANK[m.match.status] > STATUS_RANK[status]) status = m.match.status;
    score = Math.max(score, m.match.score ?? 0);
  }
  if (!winner) score = head.match?.score ?? 0;
  if (override && target) {
    // A reviewed target (engine-decisions.json) is measured directly.
    score = scoreAgainst(head.keyword, target, ctx.index, ctx.cfg);
    status = score >= 0.75 ? 'COVERED' : (score >= 0.4 ? 'PARTIAL' : status === 'SECTION' ? 'SECTION' : 'GAP');
  }
  const words = new Set(members.flatMap((m) => [...coreSet(m.keyword, ctx.cfg)]));
  // The page already carries the group's wording when a member phrase is in its title or its main keyword.
  const exactIn = (a) => members.some((m) => ` ${canon(a.title)} `.includes(` ${canon(m.keyword)} `) || ` ${canon(a.keyword)} `.includes(` ${canon(m.keyword)} `));
  const focus = target ? Math.round(focusOf(target, words, ctx) * 100) / 100 : 0;
  const exact = Boolean(target) && exactIn(target);
  // Strict: every topic word of the page (its keyword without the family qualifier) is a word of this group.
  const strict = Boolean(target) && topicWords(target, ctx).every((t) => words.has(t));
  // On topic: reviewed target, a section hit (judged by its heading), a page that already targets the phrase,
  // or one mostly about these words. Lexical evidence only — a weak match goes to REVIEW_TARGET, never auto-retargeted.
  const onTopic = Boolean(target) && (Boolean(override) || status === 'SECTION' || exact || strict || focus >= FOCUS_MIN);
  const competing = [...new Set(members.filter((m) => m.match?.status === 'COVERED' && m.match.score >= 0.75 && m.match.article
    && target && m.match.article.id !== target.id && familyOf(m.match.article) !== familyOf(target)).map((m) => m.match.article.id))].sort();
  const serps = members.filter((m) => m.serp).map((m) => m.serp);
  const intents = {};
  for (const s of serps) intents[s.intent] = (intents[s.intent] ?? 0) + 1;
  const serpIntent = Object.entries(intents).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const ownPositions = serps.flatMap((s) => s.own.map((o) => o.position));
  const ownBest = ownPositions.length ? Math.min(...ownPositions) : null;
  const sisterBest = serps.flatMap((s) => s.sister).sort((a, b) => a.position - b.position)[0] ?? null;
  const topic = members.map((m) => ctx.curatedOf?.get(normKw(m.keyword))).find(Boolean) ?? null;
  // A reviewed topic carries its own cluster; otherwise the target page's, the SERP's, or the keyword rules'.
  const cluster = (topic && ctx.curatedCluster?.get(topic)) || target?.cluster || serps[0]?.cluster
    || clusterOf(ctx.clusters, target?.category ?? 'RENT', head.keyword)?.id || '';
  const flag = target && ctx.flags?.get(target.id) ? ctx.flags.get(target.id) : null;

  const wanted = demand >= 50; // unmeasured groups wait in the volume research queue
  let action;
  if (topic) action = 'NEW_ARTICLE_VERIFY'; // reviewed topic: a new article after checking the official text
  else if (serpIntent === LOCAL) action = onTopic && (status === 'COVERED' || status === 'SECTION') ? 'KEEP' : 'LOCAL_ONLY';
  else if (status === 'GAP') action = wanted ? 'NEW_ARTICLE' : 'MONITOR';
  else if (!onTopic) action = demand >= 300 ? 'REVIEW_TARGET' : (wanted ? 'NEW_ARTICLE' : 'MONITOR');
  else if (status === 'PARTIAL') action = wanted ? 'ADD_SECTION' : 'MONITOR';
  else if (status === 'SECTION') action = demand >= 1000 ? 'CONSIDER_STANDALONE' : 'KEEP';
  else if (exact || demand < 300) action = 'KEEP';
  // A title change must not move a page off its own topic: only when the page is strictly about the group's words.
  else action = strict || override ? 'ALIGN_META' : 'REVIEW_TARGET';
  // Never push more searches to a page whose content is flagged as outdated.
  if (flag && onTopic && !['NEW_ARTICLE', 'NEW_ARTICLE_VERIFY', 'LOCAL_ONLY'].includes(action)) action = 'FIX_FIRST';

  const priority = priorityOf({ demand, action, serpIntent, toolIntent: head.intent, ownBest });
  // Reported coverage: words found only on a page about something else are partial coverage;
  // a reviewed topic keeps its reviewed status.
  if (topic) status = ctx.curatedStatus?.get(topic) ?? 'GAP';
  else if (!onTopic && status === 'COVERED') status = 'PARTIAL';
  const id = viSlug(head.keyword) || 'nhom';
  const found = decisionFor(members, ctx);
  const decision = found && (found.action === action || found.status === 'rejected' || found.status === 'deferred') ? found : null;
  const candidates = action !== 'REVIEW_TARGET' && action !== 'NEW_ARTICLE' ? [] : (ctx.index ?? [])
    .map((a) => ({ a, fit: scoreAgainst(head.keyword, a, ctx.index, ctx.cfg) }))
    .filter((c) => c.fit >= 0.4 && (!target || c.a.id !== target.id))
    .sort((x, y) => y.fit - x.fit || x.a.id.localeCompare(y.a.id)).slice(0, 3)
    .map((c) => ({ id: c.a.id, url: c.a.url, fit: Math.round(c.fit * 100) / 100, focus: Math.round(focusOf(c.a, words, ctx) * 100) / 100 }));
  return {
    id, head: head.keyword, members: members.map((m) => ({ keyword: m.keyword, volume: m.volume, origin: m.origin })),
    demand, measured, cluster, intent: serpIntent ?? (TOOL_INTENT[head.intent] ? `${TOOL_INTENT[head.intent]} (công cụ)` : '—'),
    serp: { queries: serps.map((s) => s.query), ai: serps.some((s) => s.ai), local: serps.some((s) => s.local), paa: serps.some((s) => s.paa) },
    ownBest, sisterBest, target: target ? { id: target.id, url: target.url, title: target.title, category: target.category } : null,
    status, score: Math.round(score * 100) / 100, focus, strict, onTopic, exact, competing, candidates, topic, flag, action, priority, decision
  };
}

/** Recorded decision for a group: by its id or any member's slug (survives a head change after new volumes). */
function decisionFor(members, ctx) {
  if (!ctx.decisions) return null;
  for (const k of [viSlug(members[0].keyword), ...members.slice(1).map((m) => viSlug(m.keyword))]) if (ctx.decisions[k]) return { ...ctx.decisions[k], key: k };
  return null;
}

// ---------- repository audit (existing tools only) ----------

export function repoHealth(root = ROOT) {
  const io = createSiteIo(root);
  const site = auditSite(io);
  const score = scoreRepo(io);
  const { rows } = runAudit(root);
  const baseline = existsSync(join(root, BASELINE)) ? JSON.parse(read(root, BASELINE)) : null;
  const matrix = summarize(finalize(rows, baseline));
  const coverage = reconcileIndexCoverage({
    matrixCsv: read(root, 'data/blog/content-matrix.csv'),
    sitemapXml: read(root, 'sitemap.xml'),
    publishedManifest: JSON.parse(read(root, 'data/blog/published.json'))
  });
  const committed = existsSync(join(root, 'docs/seo/seo-master-matrix.json'))
    ? JSON.parse(read(root, 'docs/seo/seo-master-matrix.json').split('\n')[1].replace(/^"summary":/, '').replace(/,$/, '')) : null;
  const cs = coldStartBuild(root);
  const coldStale = Object.entries(cs).filter(([name, text]) => !existsSync(join(root, COLD_START_DIR, name)) || read(root, `${COLD_START_DIR}/${name}`) !== text).map(([n]) => n);
  return {
    site: { pass: site.pass, broken: site.broken_internal_links, checked: site.checked_internal_urls, sitemap: site.sitemap_urls, published: site.published_articles },
    score: { total: score.total, pass: score.pass, issues: score.issue_count },
    matrix: { urls: matrix.urls, by_status: matrix.by_status, p0_open: matrix.p0_open, issues: Object.keys(matrix.issue_counts ?? {}).length,
      committedCurrent: Boolean(committed) && JSON.stringify(committed.by_status) === JSON.stringify(matrix.by_status) && committed.p0_open === matrix.p0_open },
    coverage: { pass: coverage.pass, counts: coverage.counts },
    coldStart: { stale: coldStale },
    indexnow: keyFileExists(root)
  };
}

// ---------- engine ----------

export function loadDecisions(root = ROOT) {
  return existsSync(join(root, DECISIONS_PATH)) ? JSON.parse(read(root, DECISIONS_PATH)).decisions ?? {} : {};
}

/** Research data + decision context shared by runEngine and the tests. */
export function engineContext(root = ROOT) {
  const cs = coldStartAnalyze(root);
  const rows = parseCsv(read(root, 'data/blog/content-matrix.csv'));
  const head = rows[0];
  const col = (r, name) => r[head.indexOf(name)] ?? '';
  const byId = new Map(cs.index.map((a) => [a.id, a]));
  const family = new Map();
  const pillarOf = new Map(); // topic family → its published bare-seed article (lowest id)
  const qualifier = new Map(); // article → words of its family variant ("tóm tắt", "giá tốt nhất"…)
  for (const r of rows.slice(1)) {
    const f = topicFamily(col(r, 'category'), col(r, 'primary_keyword'));
    const id = col(r, 'article_id');
    family.set(id, f.key);
    qualifier.set(id, new Set(toks(f.variant)));
    if (f.order === 0 && byId.has(id) && (!pillarOf.has(f.key) || id < pillarOf.get(f.key))) pillarOf.set(f.key, id);
  }
  const slugs = new Set(rows.slice(1).map((r) => col(r, 'slug')));
  const clusters = JSON.parse(read(root, 'data/seo/keyword-clusters.json'));
  const curatedOf = new Map(cs.curated.flatMap((t) => (t.keywords ?? []).map((k) => [normKw(k), viSlug(t.topic)])));
  const curatedCluster = new Map(cs.curated.map((t) => [viSlug(t.topic), t.cluster]));
  const curatedStatus = new Map(cs.curated.map((t) => [viSlug(t.topic), t.status ?? 'GAP']));
  // Active content flags block keyword work on a page until its content is fixed; resolved ones are history.
  const flags = new Map((cs.cfg.content_flags ?? []).filter((f) => !f.resolved).map((f) => [f.article, f.reason]));
  const ctx = { byId, family, pillarOf, qualifier, curatedOf, curatedCluster, curatedStatus, flags, clusters, decisions: loadDecisions(root), index: cs.index, cfg: cs.cfg };
  return { cs, ctx, slugs, clusters, flags };
}

export function runEngine(root = ROOT, { health = true, context = null } = {}) {
  const { cs, ctx, slugs, clusters, flags } = context ?? engineContext(root);
  const { byId } = ctx;
  const { groups: raw, edges } = clusterKeywords(cs.keywords, cs.serps, cs.cfg);
  const groups = raw.map((m) => assessGroup(m, ctx))
    .sort((a, b) => b.priority - a.priority || b.demand - a.demand || a.id.localeCompare(b.id));
  // Ids must be unique and stable: suffix collisions deterministically.
  const seen = new Map();
  for (const g of groups) { const n = (seen.get(g.id) ?? 0) + 1; seen.set(g.id, n); if (n > 1) g.id = `${g.id}-${n}`; }

  const curated = cs.curated.map((t) => ({ ...t, id: viSlug(t.topic), action: 'NEW_ARTICLE_VERIFY', decision: ctx.decisions[viSlug(t.topic)] ?? null,
    groups: groups.filter((g) => g.topic === viSlug(t.topic)).map((g) => g.id) }));
  const flagged = (cs.cfg.content_flags ?? []).map((f) => ({ article: f.article, reason: f.reason, resolved: f.resolved ?? null, fix: f.fix ?? null,
    url: byId.get(f.article)?.url ?? '',
    groups: groups.filter((g) => g.target?.id === f.article && (g.flag || f.resolved)).map((g) => g.id),
    demand: sum(groups.filter((g) => g.target?.id === f.article && (g.flag || f.resolved)).map((g) => g.demand)) }));
  // Every recorded decision, also those whose group now asks for another action (history).
  const decisions = Object.entries(ctx.decisions).map(([key, d]) => ({ key, ...d,
    group: groups.find((g) => g.id === key || g.members.some((m) => viSlug(m.keyword) === key)) ?? null }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.key.localeCompare(b.key));
  const majorityCategory = new Map();
  for (const a of cs.index) {
    if (!a.cluster) continue;
    const m = majorityCategory.get(a.cluster) ?? {};
    m[a.category] = (m[a.category] ?? 0) + 1;
    majorityCategory.set(a.cluster, m);
  }
  const categoryOfCluster = (k) => Object.entries(majorityCategory.get(k) ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'GUIDE';

  // Research queue: what the next research run should measure.
  const serpQueue = groups.filter((g) => !g.serp.queries.length && g.demand >= 100).sort((a, b) => b.demand - a.demand || a.id.localeCompare(b.id));
  const volumeQueue = groups.filter((g) => g.measured === 0).sort((a, b) => a.cluster.localeCompare(b.cluster) || a.head.localeCompare(b.head));

  // Writer briefs + proposed matrix rows (owner approval).
  const open = (g) => !['done', 'rejected', 'deferred'].includes(g.decision?.status);
  const actionable = groups.filter((g) => ['FIX_FIRST', 'NEW_ARTICLE', 'ADD_SECTION', 'CONSIDER_STANDALONE', 'REVIEW_TARGET'].includes(g.action) && open(g));
  const briefs = actionable.slice(0, 15);
  const proposals = [];
  let n = 0;
  // New pages: measured gaps (≥ 300/month) and sections big enough to stand alone (≥ 1.000/month).
  for (const g of groups.filter((x) => ((x.action === 'NEW_ARTICLE' && x.demand >= 300) || (x.action === 'CONSIDER_STANDALONE' && x.demand >= 1000)) && open(x))) {
    const cat = categoryOfCluster(g.cluster);
    let slug = viSlug(g.head);
    if (slugs.has(slug)) slug = `${slug}-moi`;
    proposals.push({ id: `PROPOSED-${String(++n).padStart(3, '0')}`, category: cat, primary_keyword: g.head,
      secondary_keywords: g.members.slice(1, 8).map((m) => m.keyword).join('; '), slug, cluster: g.cluster, demand: g.demand,
      source: g.action === 'CONSIDER_STANDALONE' ? `engine-06 nhóm ${g.id} (tách từ mục của ${g.target?.id})` : `engine-06 nhóm ${g.id}` });
  }
  for (const t of curated.filter((x) => !['done', 'rejected', 'deferred'].includes(x.decision?.status))) {
    const cat = t.cluster === 'K09' || t.cluster === 'K10' || t.cluster === 'K11' ? 'SAFE' : categoryOfCluster(t.cluster);
    proposals.push({ id: `PROPOSED-${String(++n).padStart(3, '0')}`, category: cat, primary_keyword: normKw(t.keywords?.[0] ?? t.topic),
      secondary_keywords: (t.keywords ?? []).slice(1, 8).join('; '), slug: viSlug(t.topic), cluster: t.cluster, demand: t.demand, source: `engine-06 chủ đề: ${t.topic}` });
  }

  return {
    mode: cs.mode.mode, snapshots: cs.snaps.files, serps: cs.serps.length, keywords: cs.keywords, scopeCount: Object.fromEntries(Object.keys(SCOPE_LABEL).map((s) => [s, cs.keywords.filter((k) => k.scope === s).length])),
    groups, edges, curated, flagged, decisions, serpQueue, volumeQueue, briefs, proposals, categoryOfCluster, clusters: clusters.clusters, index: cs.index,
    serpByQuery: new Map(cs.serps.map((s) => [normKw(s.query), s])),
    health: health ? repoHealth(root) : null
  };
}

// ---------- rendering ----------

const CATEGORY_LABEL = Object.fromEntries(Object.entries(taxonomy.categories).map(([k, v]) => [k, v.name]));
const HUB_DIR = Object.fromEntries(Object.entries(taxonomy.categories).map(([k, v]) => [k, v.dir]));
const pos = (p) => (p == null ? '—' : `#${p}`);
const legal = (cluster, category) => category === 'SAFE' || ['K09', 'K10', 'K11'].includes(cluster);

/** Where the group should land: an existing page, or a page that does not exist yet. */
export const landing = (g) => (g.action === 'NEW_ARTICLE' || g.action === 'NEW_ARTICLE_VERIFY' ? '(bài mới)'
  : g.action === 'LOCAL_ONLY' ? '(trang bán hàng / Google Business Profile)' : g.status === 'GAP' ? '' : g.target?.url ?? '');
/** Closest existing page worth naming (nothing for a query no page answers). */
const nearest = (g) => (g.target && (g.status !== 'GAP' || g.score >= 0.3) ? g.target : null);

function matrixRows(e) {
  return e.groups.map((g) => ({
    'Nhóm': g.id, 'Từ khóa chính': g.head, 'Số biến thể': g.members.length, 'Volume/tháng (đo được)': g.measured ? g.demand : null,
    'Cụm': g.cluster, 'Ý định': g.intent, 'SERP đã chụp': g.serp.queries.length,
    'Tính năng SERP': [g.serp.ai ? 'AI Overview' : '', g.serp.local ? 'local pack' : '', g.serp.paa ? 'PAA' : ''].filter(Boolean).join(', '),
    'Vị trí website': g.ownBest, 'Website chị em': g.sisterBest ? `#${g.sisterBest.position} ${g.sisterBest.domain}` : '',
    'Trang đích': landing(g), 'Trang gần nhất': nearest(g)?.url ?? '', 'Độ phủ': STATUS_LABEL[g.status], 'Cạnh tranh nội bộ': g.competing.join(' '),
    'Hành động': ACTION_LABEL[g.action], 'Điểm ưu tiên': g.priority, 'Quyết định': g.decision ? `${g.decision.status} ${g.decision.date}` : '',
    'Biến thể': g.members.slice(1).map((m) => `${m.keyword}${m.volume != null ? ` (${m.volume})` : ''}`).join('; ')
  }));
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function render(e) {
  const files = {};
  const G = e.groups;
  const inScope = e.keywords.filter((k) => k.scope === 'IN-SCOPE').length;
  const byAction = (a) => G.filter((g) => g.action === a);
  const actionable = G.filter((g) => !['KEEP', 'MONITOR', 'LOCAL_ONLY'].includes(g.action));
  const top = actionable.filter((g) => !['done', 'rejected', 'deferred'].includes(g.decision?.status)).slice(0, 25);
  const snapDates = e.snapshots.map((f) => f.collected).join(', ') || '—';
  const groupLink = (g) => `[${mdCell(g.head)}](keyword-groups.md#${g.id})`;

  // --- seo-engine-matrix.csv / .json
  {
    const rows = matrixRows(e);
    const cols = Object.keys(rows[0] ?? { 'Nhóm': '' });
    files['seo-engine-matrix.csv'] = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
    const targets = {};
    for (const g of G) {
      if (!g.target) continue;
      const t = (targets[g.target.url] ??= { article: g.target.id, groups: [], demand: 0 });
      t.groups.push(g.id); t.demand += g.demand;
    }
    files['seo-engine-matrix.json'] = `{"$schema":"motoai/seo-engine-matrix@1",\n"mode":${JSON.stringify(e.mode)},\n"formula":${JSON.stringify(PRIORITY_FORMULA)},\n"columns":${JSON.stringify(cols)},\n"rows":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n],\n"targets":{\n${Object.entries(targets).sort((a, b) => b[1].demand - a[1].demand || a[0].localeCompare(b[0])).map(([u, t]) => `${JSON.stringify(u)}:${JSON.stringify(t)}`).join(',\n')}\n}}\n`;
  }

  // --- keyword-groups.md
  {
    const L = ['# Keyword clustering — nhóm theo ý định tìm kiếm', '',
      `> ${inScope} từ khóa trong phạm vi → **${G.length} nhóm**. Gộp khi top 10 Google trùng ≥ ${SERP_OVERLAP} URL (${e.edges.serp.length} cặp quan sát được) hoặc cùng bộ từ lõi (biến thể chính tả, thứ tự từ, "k/không", năm). Volume là số công cụ trả về; "—" = chưa đo.`, '',
      '## Cặp truy vấn Google trả về cùng trang (bằng chứng SERP)', '', '| Truy vấn A | Truy vấn B | URL trùng (top 10) |', '|---|---|---:|'];
    for (const [a, b, s] of e.edges.serp) L.push(`| ${mdCell(a)} | ${mdCell(b)} | ${s} |`);
    if (!e.edges.serp.length) L.push('| — | | |');
    L.push('', '## Các nhóm (theo nhu cầu đo được)', '');
    for (const g of [...G].sort((a, b) => b.demand - a.demand || a.id.localeCompare(b.id))) {
      L.push(`<a id="${g.id}"></a>`, `### ${mdCell(g.head)}`, '',
        `- Nhu cầu: ${g.measured ? `${fmt(g.demand)}/tháng (${g.measured}/${g.members.length} từ khóa đo được)` : 'chưa đo'} · Cụm ${g.cluster || '—'} · Ý định: ${g.intent}`,
        `- Trang đích: ${landing(g) || '—'} · ${STATUS_LABEL[g.status]}${nearest(g) && landing(g) !== nearest(g).url ? ` · trang gần nhất ${nearest(g).url} (${nearest(g).id})` : ''}${g.competing.length ? ` · cạnh tranh nội bộ: ${g.competing.join(', ')}` : ''}`,
        ...(g.candidates.length ? [`- Ứng viên trang đích (khớp từ khóa / mức đúng chủ đề): ${g.candidates.map((c) => `${c.url} (${c.id}; ${String(c.fit).replace('.', ',')} / ${String(c.focus).replace('.', ',')})`).join('; ')}`] : []),
        `- SERP: ${g.serp.queries.length ? g.serp.queries.map((q) => `"${mdCell(q)}"`).join(', ') : 'chưa chụp'}${g.ownBest != null ? ` · website ${pos(g.ownBest)}` : ''}`,
        `- Hành động: **${ACTION_LABEL[g.action]}** · điểm ${fmt(g.priority)}${g.decision ? ` · quyết định: ${g.decision.status} (${g.decision.date})` : ''}`,
        `- Thành viên: ${g.members.map((m) => `${mdCell(m.keyword)}${m.volume != null ? ` (${fmt(m.volume)})` : ''}`).join('; ')}`, '');
    }
    files['keyword-groups.md'] = L.join('\n');
  }

  // --- topical-map.md (tree)
  {
    const L = ['# Topical map — danh mục → cụm → pillar → nhóm từ khóa', '',
      `> Cây chủ đề từ ${e.index.length} bài đã đăng (cụm theo \`docs/seo/seo-master-matrix.json\`), pillar theo \`data/seo/keyword-clusters.json\`, nhóm từ khóa và nhu cầu từ engine. Bảng số liệu theo cụm: [../cold-start/topical-map.md](../cold-start/topical-map.md).`, ''];
    const byCat = new Map();
    for (const c of e.clusters) {
      const cat = e.categoryOfCluster(c.id);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(c);
    }
    for (const cat of Object.keys(taxonomy.categories)) {
      const cs = byCat.get(cat) ?? [];
      if (!cs.length) continue;
      const catArticles = e.index.filter((a) => a.category === cat).length;
      L.push(`## ${CATEGORY_LABEL[cat]} (/blog/${HUB_DIR[cat]}/ · ${catArticles} bài)`, '');
      for (const c of cs) {
        const gs = G.filter((g) => g.cluster === c.id);
        const demand = sum(gs.map((g) => g.demand));
        const articles = e.index.filter((a) => a.cluster === c.id).length;
        L.push(`- **${c.id} ${mdCell(c.name)}** — pillar ${c.pillar}${c.support_pillar ? ` + ${c.support_pillar}` : ''} · ${articles} bài · ${gs.length} nhóm từ khóa · ${fmt(demand)}/tháng đo được`);
        for (const g of gs.sort((a, b) => b.demand - a.demand || a.id.localeCompare(b.id)).slice(0, 6)) {
          L.push(`  - ${groupLink(g)} (${g.measured ? fmt(g.demand) : '—'}) → ${landing(g) || 'chưa có trang'} · ${STATUS_LABEL[g.status]} · ${ACTION_LABEL[g.action]}`);
        }
        const gaps = gs.filter((g) => g.action === 'NEW_ARTICLE');
        if (gaps.length) L.push(`  - Khoảng trống: ${gaps.map((g) => mdCell(g.head)).join('; ')}`);
        for (const t of e.curated.filter((x) => x.cluster === c.id)) L.push(`  - Chủ đề mới (cần đối chiếu): ${mdCell(t.topic)}`);
      }
      L.push('');
    }
    files['topical-map.md'] = L.join('\n');
  }

  // --- content-briefs.md
  {
    const L = ['# Brief nội dung cho khoảng trống (ưu tiên theo điểm)', '',
      '> Mỗi brief chỉ chứa dữ liệu quan sát được (SERP đã chụp, volume công cụ, bài hiện có). Bài mới: owner thêm ID vào ma trận → writer viết body → factory đăng (AGENTS.md). Bổ sung mục cho bài đã đăng: chỉ qua `tools/seo-body-review.mjs`.', ''];
    const one = (title, g, extra = []) => {
      const cat = g.target?.category ?? e.categoryOfCluster(g.cluster);
      const serps = g.serp.queries.map((q) => e.serpByQuery.get(normKw(q))).filter(Boolean);
      const competitors = serps.flatMap((s) => s.raw.organic.slice(0, 5).map((o) => `${o.position}. ${mdCell(o.title)} — ${o.domain}`));
      const questions = [...new Set(serps.flatMap((s) => [...(s.raw.people_also_ask ?? []), ...(s.raw.related_searches ?? [])]))].slice(0, 8);
      L.push(`## ${title}`, '',
        `- Hành động: **${ACTION_LABEL[g.action] ?? g.action}**${g.priority != null ? ` · điểm ${fmt(g.priority)}` : ''}`,
        `- Từ khóa chính: ${mdCell(g.head)}${g.measured ? ` (${fmt(g.demand)}/tháng cả nhóm)` : ''}`,
        `- Biến thể: ${g.members.slice(1, 9).map((m) => `${mdCell(m.keyword)}${m.volume != null ? ` (${fmt(m.volume)})` : ''}`).join('; ') || '—'}`,
        `- Danh mục/cụm: ${CATEGORY_LABEL[cat]} (/blog/${HUB_DIR[cat]}/) · ${g.cluster}`,
        `- Ý định: ${g.intent}${g.serp.ai ? ' · SERP có AI Overview → trả lời trực tiếp ở đoạn đầu' : ''}${g.serp.local ? ' · có local pack' : ''}`,
        `- Trang đích: ${landing(g) || '—'}${g.target && nearest(g) && landing(g) !== g.target.url ? ` · trang hiện có gần nhất: ${g.target.url} (${STATUS_LABEL[g.status]})` : ''}`,
        ...(g.flag ? [`- Vấn đề nội dung: ${mdCell(g.flag)}`] : []),
        `- Đối thủ trên SERP: ${competitors.length ? '' : 'chưa chụp SERP — xem research-queue.md'}`);
      for (const c of competitors.slice(0, 5)) L.push(`  - ${c}`);
      if (questions.length) L.push(`- Câu hỏi/tìm kiếm liên quan trên SERP: ${questions.map(mdCell).join('; ')}`);
      L.push(`- Ràng buộc: tiếng Việt; 800–2.000 từ; dữ kiện kinh doanh chỉ từ \`data/business/business.json\`; không số liệu tự đặt${legal(g.cluster, cat) ? '; **legal gate**: trích văn bản gốc + ngày hiệu lực' : ''}.`, ...extra, '');
    };
    for (const t of e.curated) {
      const vol = (k) => e.keywords.find((x) => x.keyword === normKw(k))?.volume ?? null;
      one(`${t.topic} (chủ đề mới)`, { head: t.keywords?.[0] ?? t.topic, members: (t.keywords ?? []).map((k) => ({ keyword: k, volume: vol(k) })), measured: t.demand ? 1 : 0, demand: t.demand ?? 0,
        cluster: t.cluster, intent: '—', serp: { queries: [t.evidence_query], ai: false, local: false }, target: null, status: 'GAP', action: 'NEW_ARTICLE_VERIFY', priority: null },
      [`- Nguồn cần đối chiếu: ${t.sources_to_verify.join(' · ')}`, `- Ghi chú: ${mdCell(t.action)}`]);
    }
    for (const g of e.briefs) one(mdCell(g.head), g);
    files['content-briefs.md'] = L.join('\n');
  }

  // --- research-queue.md
  {
    const L = ['# Hàng đợi nghiên cứu (agent có công cụ nghiên cứu thực hiện)', '',
      `> Mốc SERP hiện tại: ${snapDates}; làm mới cùng bộ truy vấn sau ${STALE_DAYS} ngày. Lưu kết quả theo định dạng \`data/seo/serp-snapshots/<ngày>.json\` (xem \`tools/seo-cold-start.mjs\`), volume vào \`data/seo/keyword-demand.json\`; không nhập số tự đặt.`, '',
      `## 1. Chụp SERP cho nhóm có nhu cầu nhưng chưa có SERP (${e.serpQueue.length})`, '', '| Nhóm | Volume/tháng | Cụm |', '|---|---:|---|'];
    for (const g of e.serpQueue) L.push(`| ${mdCell(g.head)} | ${fmt(g.demand)} | ${g.cluster} |`);
    L.push('', `## 2. Đo volume cho nhóm chỉ có trên SERP (${e.volumeQueue.length})`, '', '| Nhóm | Cụm | Nguồn |', '|---|---|---|');
    for (const g of e.volumeQueue) L.push(`| ${mdCell(g.head)} | ${g.cluster} | ${mdCell(g.members[0].origin)} |`);
    L.push('', '## 3. Đối chiếu văn bản gốc trước khi viết', '');
    for (const t of e.curated) L.push(`- ${mdCell(t.topic)}: ${t.sources_to_verify.join(' · ')}`);
    L.push('');
    files['research-queue.md'] = L.join('\n');
  }

  // --- proposed-matrix-rows.csv (owner approval; never written into the real matrix)
  {
    const cols = ['article_id', 'batch_id', 'category', 'status', 'primary_keyword', 'secondary_keywords', 'search_intent', 'working_title', 'slug', 'output_path', 'parent_hub', 'requires_sources', 'source_policy', 'notes'];
    const intentOf = (cat) => ({ SAFE: 'informational-legal', LOCAL: 'local-informational', RENT: 'commercial-informational', APP: 'informational-product' }[cat] ?? 'informational');
    const lines = [cols.join(',')];
    for (const p of e.proposals) {
      const dir = HUB_DIR[p.category];
      lines.push([p.id, 'ENGINE-06', p.category, 'PROPOSED', p.primary_keyword, p.secondary_keywords, intentOf(p.category), '', p.slug,
        `blog/${dir}/${p.slug}/index.html`, `blog/${dir}/`, p.category === 'SAFE' ? 'yes' : 'no', p.category === 'SAFE' ? 'legal-gate' : 'no-external',
        `${p.source}; nhu cầu ${p.demand ?? 'chưa đo'}/tháng; cần owner duyệt trước khi thêm vào data/blog/content-matrix.csv`].map(csvCell).join(','));
    }
    files['proposed-matrix-rows.csv'] = lines.join('\n') + '\n';
  }

  // --- README.md
  {
    const h = e.health;
    const ok = (b) => (b ? 'Đạt' : 'Cần xử lý');
    const L = [`# SEO Engine 06 — chế độ ${e.mode}`, '',
      e.mode === 'ZERO-DATA'
        ? '> Không có Search Console/GA4/thứ hạng thật: engine chạy trên SERP Google đã chụp, volume do công cụ bên thứ ba đo và dữ liệu của repo. Không số liệu ước đoán. Có tệp xuất Search Console trong `data/seo/performance/` → engine tự sang DATA-DRIVEN (qua `tools/seo-cold-start.mjs`).'
        : '> Đã có dữ liệu Search Console thật: xem `docs/seo/cold-start/data-driven.md`; nghiên cứu SERP dưới đây là bối cảnh.',
      '', '## Quy trình (tái dùng 5 công cụ, engine chỉ bổ sung phần còn thiếu)', '',
      '| Bước | Công cụ | Kết quả |', '|---|---|---|',
      `| 1. Audit repo | site-audit, seo-score, seo-master-audit, seo-index-coverage, IndexNow | ${h ? `liên kết hỏng ${h.site.broken}; SEO score ${String(h.score.total).replace('.', ',')}; P0 ${h.matrix.p0_open}; sitemap↔ma trận ${ok(h.coverage.pass)}; IndexNow ${h.indexnow ? 'có khóa' : 'chưa có'}` : 'bỏ qua (--no-health)'} |`,
      `| 2. SEO Matrix | seo-master-audit (URL) + engine (từ khóa) | ${h ? `${h.matrix.urls} URL` : '—'}; ${G.length} nhóm từ khóa → [seo-engine-matrix.csv](seo-engine-matrix.csv) |`,
      `| 3. Nghiên cứu SERP | seo-cold-start (snapshot) | ${e.serps} SERP (${snapDates}); hàng đợi: ${e.serpQueue.length} nhóm cần chụp SERP, ${e.volumeQueue.length} nhóm cần đo volume → [research-queue.md](research-queue.md) |`,
      `| 4. Keyword clustering | engine | ${inScope} từ khóa → ${G.length} nhóm (${e.edges.serp.length} cặp trùng SERP) → [keyword-groups.md](keyword-groups.md) |`,
      `| 5. Topical map | engine + seo-master-audit | ${e.clusters.length} cụm K01–K20 → [topical-map.md](topical-map.md) |`,
      `| 6. Content gap | seo-cold-start + engine | ${byAction('NEW_ARTICLE').length} nhóm cần bài mới, ${byAction('ADD_SECTION').length} bổ sung mục, ${byAction('ALIGN_META').length} chỉnh title/meta, ${byAction('FIX_FIRST').length} nhóm chờ sửa nội dung lỗi thời, ${e.curated.length} chủ đề cần đối chiếu (${byAction('NEW_ARTICLE_VERIFY').length} nhóm) → [content-briefs.md](content-briefs.md), [proposed-matrix-rows.csv](proposed-matrix-rows.csv) |`, ''];
    if (h) {
      L.push('## Sức khỏe repo (công cụ hiện có)', '', '| Kiểm tra | Kết quả |', '|---|---|',
        `| Liên kết nội bộ (site-audit) | ${h.site.checked} URL kiểm tra, ${h.site.broken} hỏng — ${ok(h.site.pass)} |`,
        `| SEO score (seo-score) | ${String(h.score.total).replace('.', ',')}/100 — ${ok(h.score.pass)} |`,
        `| Ma trận URL (seo-master-audit) | ${h.matrix.urls} URL; ${Object.entries(h.matrix.by_status).map(([k, v]) => `${k} ${v}`).join(', ')}; P0 ${h.matrix.p0_open}; tệp đã commit ${h.matrix.committedCurrent ? 'khớp' : 'cần chạy lại'} |`,
        `| Sitemap ↔ ma trận (seo-index-coverage) | ${ok(h.coverage.pass)} (${h.coverage.counts.published ?? '—'} bài đăng) |`,
        `| Báo cáo cold-start | ${h.coldStart.stale.length ? `cần chạy lại: ${h.coldStart.stale.join(', ')}` : 'khớp dữ liệu'} |`,
        `| IndexNow | ${h.indexnow ? 'khóa công khai có trên site' : 'chưa cấu hình'} |`, '');
    }
    if (e.flagged.length) {
      L.push('## Rà soát nội dung trước khi đẩy từ khóa (config/seo-cold-start.json → content_flags)', '',
        '| Bài | Vấn đề | Trạng thái | Nhóm từ khóa trỏ tới | Volume/tháng |', '|---|---|---|---:|---:|');
      for (const f of e.flagged) L.push(`| ${f.article} ${f.url} | ${mdCell(f.reason)} | ${f.resolved ? `Đã sửa ${f.resolved}${f.fix ? ` (${mdCell(f.fix)})` : ''}` : 'Cần sửa trước'} | ${f.groups.length} | ${fmt(f.demand)} |`);
      L.push('');
    }
    L.push('## Hàng đợi hành động (top 25 theo điểm ưu tiên)', '', `> ${PRIORITY_FORMULA}. Điểm chỉ để xếp thứ tự, không phải dự báo traffic.`, '',
      '| # | Nhóm | Volume/tháng | Cụm | Trang đích | Độ phủ | Hành động | Điểm |', '|---:|---|---:|---|---|---|---|---:|');
    top.forEach((g, i) => L.push(`| ${i + 1} | ${groupLink(g)} | ${g.measured ? fmt(g.demand) : '—'} | ${g.cluster} | ${landing(g) || '—'} | ${STATUS_LABEL[g.status]} | ${ACTION_LABEL[g.action]} | ${fmt(g.priority)} |`));
    if (e.decisions.length) {
      L.push('', '## Quyết định đã ghi (data/seo/engine-decisions.json)', '', '| Nhóm | Hành động | Trạng thái | Ngày | Ghi chú | Hiện tại |', '|---|---|---|---|---|---|');
      for (const d of e.decisions) {
        L.push(`| ${d.group ? groupLink(d.group) : mdCell(d.key)} | ${ACTION_LABEL[d.action] ?? mdCell(d.action)} | ${mdCell(d.status)} | ${mdCell(d.date)} | ${mdCell(d.note ?? '')} | ${d.group ? ACTION_LABEL[d.group.action] : '—'} |`);
      }
    }
    L.push('', '## Phạm vi từ khóa', '', `${Object.entries(SCOPE_LABEL).map(([k, v]) => `${v}: ${e.scopeCount[k]}`).join(' · ')}`, '',
      '## Vòng tự động (agent)', '',
      '1. `node tools/seo-engine.mjs` → đọc hàng đợi hành động và [research-queue.md](research-queue.md).',
      '2. Nghiên cứu: chụp SERP/đo volume theo hàng đợi bằng công cụ sẵn có (không API trả phí mới), lưu vào `data/seo/serp-snapshots/` và `data/seo/keyword-demand.json`.',
      '3. Thực thi an toàn: chỉnh title/meta qua `data/seo/article-meta.json` (validator + audit cannibalization), bổ sung mục/FAQ qua `tools/seo-body-review.mjs`; bài mới → [proposed-matrix-rows.csv](proposed-matrix-rows.csv) chờ owner.',
      '4. Ghi quyết định vào `data/seo/engine-decisions.json`, chạy lại `node tools/seo-cold-start.mjs`, `node tools/seo-engine.mjs`, `node --test`, build, rồi commit/push.', '');
    files['README.md'] = L.join('\n');
  }

  // --- engine.json (machine readable summary)
  {
    const summary = { mode: e.mode, serps: e.serps, snapshots: e.snapshots.map((f) => f.collected), in_scope_keywords: inScope, groups: G.length,
      serp_overlap_pairs: e.edges.serp.length, actions: Object.fromEntries(Object.keys(ACTION_LABEL).map((a) => [a, byAction(a).length])),
      curated_topics: e.curated.length, content_flags: { open: e.flagged.filter((f) => !f.resolved).map((f) => f.article), resolved: e.flagged.filter((f) => f.resolved).map((f) => f.article) },
      decisions: e.decisions.length,
      research_queue: { serp: e.serpQueue.length, volume: e.volumeQueue.length }, proposals: e.proposals.length, health: e.health };
    files['engine.json'] = JSON.stringify(summary, null, 1) + '\n';
  }
  return files;
}

export function build(root = ROOT, opts = {}) {
  return render(runEngine(root, opts));
}

export function main(argv = process.argv.slice(2), root = ROOT) {
  const files = build(root, { health: !argv.includes('--no-health') });
  const stale = Object.entries(files).filter(([name, text]) => !existsSync(join(root, OUT_DIR, name)) || read(root, `${OUT_DIR}/${name}`) !== text).map(([n]) => n);
  if (argv.includes('--check')) {
    if (stale.length) { console.error(`stale SEO engine reports: ${stale.join(', ')} — run node tools/seo-engine.mjs`); return 1; }
    console.log(`SEO engine reports up to date (${Object.keys(files).length} files)`);
    return 0;
  }
  mkdirSync(join(root, OUT_DIR), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, OUT_DIR, name), text, 'utf8');
  const s = JSON.parse(files['engine.json']);
  console.log(`SEO engine: ${s.groups} keyword groups, actions ${JSON.stringify(s.actions)}, research queue ${JSON.stringify(s.research_queue)}; wrote ${Object.keys(files).length} files (${stale.length} changed) to ${OUT_DIR}/`);
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exitCode = main();
}
