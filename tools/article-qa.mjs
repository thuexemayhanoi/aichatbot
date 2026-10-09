#!/usr/bin/env node
/**
 * Minimal production QA — ONE article, score gate (v69).
 *
 * Policy (docs/CONTINUOUS-WRITER.md §Minimal production QA):
 *   score 70–100  -> PASS (never edited again just to raise the score)
 *   score  < 70   -> FAIL -> REPAIR queue (no REVIEW state, no EXCELLENT band)
 *   critical gate -> score 0 (FAIL regardless of warnings)
 *   everything that is not a critical gate is a WARNING worth -5 points
 *
 * Critical gates (the ONLY publish blockers):
 *   matrix-row            id must exist in content-matrix.csv
 *   unique-article-id     no duplicate article_id rows
 *   unique-slug           no duplicate slug rows
 *   manifest-entry        complete draft entry in published.json (valid JSON)
 *   id-slug-path          matrix/manifest slug-category-path-body agree
 *   body-exists           body file present and non-empty
 *   body-substantial      body is not a stub (< MIN_CRITICAL_WORDS = 300)
 *   fact-resolution       {{ business.* }} placeholders all resolve
 *   html-render-safe      no embedded script/style, balanced core tags
 *   verified-phones-only  no phone-like number outside business.json
 *   verified-deposits-only deposit sentences use verified amounts only
 *   internal-links-resolve every internal href exists on disk
 *
 * Warnings (never block publish, -5 each, score never goes below 0):
 *   body-words (guideline 800–2.000) / body-structure / no-filler /
 *   no-duplicate-paragraphs / no-duplicate-sentences /
 *   no-cross-article-duplicate / no-cannibalization / title-meta-valid /
 *   seo-ownership / local-angle / safe-legal-gate / no-external-links /
 *   retrieval-consistency
 *
 * Usage:
 *   node tools/article-qa.mjs <BA-id>            # human report, exit 0/1
 * Used by tools/blog-factory.mjs `qa <BA-id>` / `qa-chunk` (same contract).
 * Sandboxed tests run this via MOTOAI_FACTORY_ROOT.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { text, words } from './seo-score.mjs';
import { resolveInternal } from './site-audit.mjs';
import { resolveFacts, HUBS } from './build-blog.mjs';
import { parseMatrix, MATRIX, MANIFEST } from './blog-factory.mjs';
import { CONTENT_MIN_WORDS, CONTENT_MAX_WORDS } from './writer-content-policy.mjs';

export const ROOT = process.env.MOTOAI_FACTORY_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)), '..');

/** PASS threshold: score >= 70 passes, anything below goes to REPAIR. */
export const PASS_SCORE = 70;
/** Each warning costs 5 points; 6 warnings still pass, 7 fail. */
export const WARN_PENALTY = 5;
/** Below this the body is a stub — critical, not a length warning. */
export const MIN_CRITICAL_WORDS = 300;
/** Guideline floor/ceiling (docs/ARTICLE-RULES.md) — warnings only. */
export const MIN_WORDS = CONTENT_MIN_WORDS;
export const MAX_WORDS = CONTENT_MAX_WORDS;

const HUB_DIR = Object.fromEntries(HUBS.map((h) => [h.id, h.dir]));
const read = (p) => readFileSync(isAbsolute(p) ? p : join(ROOT, p), 'utf8');

/** Paragraph fingerprints (same heuristic family as seo-score, no new system). */
function paragraphKeys(bodyText) {
  return bodyText.split(/\n+/).flatMap((para) => para.split(/(?<=\.) /))
    .map((s) => s.trim())
    .filter((s) => s.length > 40)
    .map((s) => s.slice(0, 80));
}

function sentenceKeys(bodyText) {
  return bodyText.split(/(?<=[.!?])\s+/).map((s) => s.trim())
    .filter((s) => s.length > 30);
}

/** Verified digit strings allowed in prose (phone/whatsapp from business.json). */
function verifiedPhones(business) {
  const set = new Set();
  const add = (s) => { const d = String(s ?? '').replace(/\D/g, ''); if (d) set.add(d); };
  add(business.contact?.phone);
  add(business.contact?.phone_uri); // tel:+84942467674 -> 84942467674
  add(business.contact?.whatsapp);
  return set;
}

/** Deposit amounts verified in business.json, formatted vi-VN ("2.000.000"). */
function verifiedDeposits(business) {
  const out = new Set();
  for (const v of [business.policies?.deposit?.min, business.policies?.deposit?.max]) {
    if (Number.isFinite(v)) out.add(v.toLocaleString('vi-VN'));
  }
  return out;
}

/** Render-safety of the raw body fragment: no embedded code, balanced core
 *  container tags (an unbalanced p/h2/h3/ul/ol/blockquote breaks the page).
 *  Implicit-close inline tags (li, a, b, i…) are intentionally not counted. */
function renderSafetyFailures(bodyHtml) {
  const bad = [];
  if (/<script\b|<style\b|<iframe\b|javascript:/i.test(bodyHtml)) {
    bad.push('embedded script/style/iframe or javascript: URL');
  }
  for (const tag of ['p', 'h2', 'h3', 'ul', 'ol', 'blockquote']) {
    const open = (bodyHtml.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
    const close = (bodyHtml.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (open !== close) bad.push(`unbalanced <${tag}> (${open} open / ${close} close)`);
  }
  return bad;
}

/** Cross-article paragraph corpus, cached per manifest content so qa-chunk
 *  does not re-read every body for each article. Map article_id -> key set. */
let corpusCache = { key: null, byId: new Map() };
function corpusByKey(manifestRaw, business) {
  if (corpusCache.key === manifestRaw) return corpusCache.byId;
  const byId = new Map();
  let manifest;
  try { manifest = JSON.parse(manifestRaw); } catch { manifest = { articles: [] }; }
  for (const a of manifest.articles) {
    const keys = new Set();
    if (a.body) {
      const p = isAbsolute(a.body) ? a.body : join(ROOT, a.body);
      if (existsSync(p)) {
        let raw = readFileSync(p, 'utf8');
        try { raw = resolveFacts(raw, business); } catch { /* unresolved pilot: compare raw */ }
        for (const k of paragraphKeys(text(raw))) keys.add(k);
      }
    }
    byId.set(a.article_id, keys);
  }
  corpusCache = { key: manifestRaw, byId };
  return byId;
}

/**
 * Run every minimal-QA check for ONE article id.
 * Returns { article_id, pass, score, critical, warnings, checks } where
 * checks is [{ name, ok, level: 'critical'|'warning', detail }].
 */
export function scopedQa(id) {
  const critical = [];
  const warnings = [];
  const checks = [];
  const crit = (name, ok, detail = '') => {
    checks.push({ name, ok: !!ok, level: 'critical', detail: ok ? '' : detail });
    if (!ok) critical.push(name);
  };
  const warn = (name, ok, detail = '') => {
    checks.push({ name, ok: !!ok, level: 'warning', detail: ok ? '' : detail });
    if (!ok) warnings.push(name);
  };

  const rows = parseMatrix();
  const row = rows.find((r) => r.article_id === id);
  crit('matrix-row', !!row, `${id} not in content-matrix.csv`);
  if (!row) {
    return { article_id: id, pass: false, score: 0, critical, warnings, checks };
  }

  crit('unique-article-id', rows.filter((r) => r.article_id === id).length === 1,
    `duplicate matrix row for ${id}`);
  crit('unique-slug', rows.filter((r) => r.slug === row.slug).length === 1,
    `duplicate slug ${row.slug} (also used by ${rows.filter((r) => r.slug === row.slug).map((r) => r.article_id).join(', ')})`);

  const manifestRaw = read(MANIFEST);
  let manifest = null;
  try { manifest = JSON.parse(manifestRaw); } catch (e) { /* reported below */ }
  const entry = manifest?.articles.find((a) => a.article_id === id);
  crit('manifest-entry', !!(entry && entry.title && entry.description && entry.slug
    && entry.category && entry.body && entry.published_date && entry.author),
  manifest ? 'published.json needs a complete draft entry (title, description, slug, category, body, published_date, author)' : `published.json is not valid JSON: ${manifest === null ? 'parse error' : ''}`.trim());
  if (!entry) {
    return { article_id: id, pass: false, score: 0, critical, warnings, checks };
  }

  const hubDir = HUB_DIR[row.category];
  crit('id-slug-path', row.slug === entry.slug && row.category === entry.category
    && !!hubDir
    && row.output_path === `blog/${hubDir}/${row.slug}/index.html`
    && entry.body === `data/blog/articles/${row.slug}.body.html`,
  `slug/category/output_path/body must be consistent (expected blog/${hubDir ?? '?'}/${row.slug}/index.html + data/blog/articles/${row.slug}.body.html)`);

  const bodyPath = isAbsolute(entry.body) ? entry.body : join(ROOT, entry.body);
  const bodyRaw = existsSync(bodyPath) ? readFileSync(bodyPath, 'utf8') : '';
  crit('body-exists', bodyRaw.trim().length > 0, `body file missing or empty: ${entry.body}`);

  const business = JSON.parse(read('data/business/business.json'));
  let resolved = '';
  if (bodyRaw) {
    try {
      resolved = resolveFacts(bodyRaw, business);
      crit('fact-resolution', true);
    } catch (e) {
      crit('fact-resolution', false, e.message);
      resolved = bodyRaw;
    }
  } else {
    crit('fact-resolution', false, 'no body to resolve');
  }
  const bodyText = text(resolved);
  const wc = words(bodyText);

  crit('body-substantial', wc >= MIN_CRITICAL_WORDS,
    `body is a stub: ${wc} words (< ${MIN_CRITICAL_WORDS} — truncated/empty article)`);

  const renderBad = renderSafetyFailures(bodyRaw);
  crit('html-render-safe', renderBad.length === 0, renderBad.join('; '));

  const phones = verifiedPhones(business);
  const rawNumbers = [...resolved.matchAll(/\+?\d(?:[\d\s.\-]{7,})\d/g)]
    .map((m) => m[0].replace(/\D/g, '')).filter((d) => d.length >= 9 && d.length <= 13);
  const badPhone = rawNumbers.find((d) => !phones.has(d));
  crit('verified-phones-only', badPhone === undefined, `unverified phone-like number in body: ${badPhone ?? ''}`);

  const deposits = verifiedDeposits(business);
  const amountRe = /(\d[\d.,]*)\s?đ/g;
  let badDeposit = null;
  // Split on sentence enders followed by whitespace so vi-VN thousand
  // separators ("2.000.000đ") never break a sentence in half.
  for (const sentence of bodyText.split(/(?<=[.!?])\s+/)) {
    if (!/\bcọc\b/i.test(sentence)) continue;
    for (const a of sentence.matchAll(amountRe)) {
      if (!deposits.has(a[1])) { badDeposit = a[1] + 'đ'; break; }
    }
    if (badDeposit) break;
  }
  crit('verified-deposits-only', badDeposit === null, `deposit amount not backed by business.json: ${badDeposit ?? ''}`);

  const pagePath = row.output_path;
  const badLinks = [];
  const existsFile = (path) => existsSync(join(ROOT, path)) && statSync(join(ROOT, path)).isFile();
  for (const m of resolved.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)) {
    const target = resolveInternal(pagePath, m[2], existsFile);
    if (target && !existsFile(target)) badLinks.push(m[2]);
  }
  crit('internal-links-resolve', badLinks.length === 0, `broken internal link(s): ${badLinks.join(', ')}`);

  // ---------- warnings (never block publish, -5 points each) ----------

  warn('body-words', wc >= MIN_WORDS && wc <= MAX_WORDS,
    `${wc} words (guideline: ${MIN_WORDS}–${MAX_WORDS}, < ${MIN_CRITICAL_WORDS} is critical — no padding, no truncation)`);

  warn('body-structure', (resolved.match(/<h2\b/g) || []).length >= 2
    && !/<h1\b/i.test(resolved) && /<ul\b|<ol\b/i.test(resolved),
  'body should have >=2 H2, no H1 (shell renders it), and at least one list');

  warn('no-filler', !/lorem|TBD|coming soon|đang cập nhật|chưa có nội dung/i.test(bodyText),
  'filler/placeholder markers found');

  const paras = paragraphKeys(bodyText);
  warn('no-duplicate-paragraphs', new Set(paras).size === paras.length, 'duplicate paragraph detected inside the article');

  const sentences = sentenceKeys(bodyText);
  warn('no-duplicate-sentences', new Set(sentences).size === sentences.length, 'identical sentence repeated (spun content)');

  // Cross-corpus: no paragraph may already exist in another article body.
  const byId = corpusByKey(manifestRaw, business);
  const shared = paras.find((k) => [...byId.entries()].some(([aid, set]) => aid !== id && set.has(k)));
  warn('no-cross-article-duplicate', shared === undefined, `paragraph already used in another article: "${shared ?? ''}"`);

  const othersRows = rows.filter((r) => r.article_id !== id);
  warn('no-cannibalization',
    !othersRows.some((r) => r.primary_keyword === row.primary_keyword)
    && !othersRows.some((r) => r.working_title.toLowerCase() === row.working_title.toLowerCase()),
  'primary_keyword and title should be unique across the matrix');

  const title = entry.title ?? '';
  const desc = entry.description ?? '';
  warn('title-meta-valid',
    title.length >= 10 && title.length <= 70
    && desc.length >= 50 && desc.length <= 165
    && /^[a-z0-9-]+$/.test(row.slug)
    && /^\d{4}-\d{2}-\d{2}$/.test(entry.published_date ?? ''),
  `title ${title.length} (10–70), description ${desc.length} (50–165), slug format, YYYY-MM-DD date`);

  const ownership = JSON.parse(read('config/seo-ownership.json'));
  const protectedKw = ownership.protected_commercial_intents.map((p) => p.keyword.trim().toLowerCase());
  const titleLc = title.toLowerCase();
  warn('seo-ownership',
    !protectedKw.includes(titleLc) && !protectedKw.includes(row.primary_keyword.toLowerCase())
    && !/app store|google play/i.test(bodyText)
    && !/(thuê|cho thuê|dịch vụ)[^.,]{0,25}toàn quốc/i.test(bodyText)
    && !/app thuê xe máy\s+(quận|phường|xã|huyện)/i.test(titleLc),
  'avoid protected commercial intents, native-app claims, nationwide rental claims, "quận X" doorway titles');

  if (row.category === 'LOCAL') {
    warn('local-angle', (row.local_scope ?? '').length > 0, 'LOCAL article should have a non-empty local_scope (distinct angle, not a doorway clone)');
  }

  const externalLinks = [...resolved.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  if (row.category === 'SAFE') {
    warn('safe-legal-gate',
      row.source_policy === 'legal-gate' && row.agent_retrieval === 'no'
      && (entry.knowledge_chunks ?? []).length === 0
      && /https?:\/\/[a-z0-9.-]*(?:gov\.vn|vbpl\.vn)/i.test(resolved),
    'SAFE article should have source_policy=legal-gate, agent_retrieval=no, empty knowledge_chunks and a gov.vn/vbpl.vn primary source link');
  }
  if (row.source_policy === 'no-external') {
    warn('no-external-links', externalLinks.length === 0, `source_policy=no-external but body has ${externalLinks.length} external link(s): ${externalLinks[0] ?? ''}`);
  }

  const chunks = entry.knowledge_chunks ?? [];
  warn('retrieval-consistency',
    row.agent_retrieval === 'yes' ? chunks.length > 0 && chunks.every((c) => c.length > 0 && c.length < 800)
      : chunks.length === 0,
  `agent_retrieval=${row.agent_retrieval} inconsistent with knowledge_chunks`);

  const score = critical.length > 0 ? 0 : Math.max(0, 100 - WARN_PENALTY * warnings.length);
  const pass = critical.length === 0 && score >= PASS_SCORE;
  return { article_id: id, pass, score, critical, warnings, checks };
}

const isCli = typeof process !== 'undefined' && process.argv && process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isCli) {
  const id = process.argv[2];
  if (!id || !/^BA-\d{4}$/.test(id)) {
    console.error('usage: article-qa.mjs <BA-id>');
    process.exit(2);
  }
  const result = scopedQa(id);
  for (const c of result.checks) {
    const tag = c.ok ? 'PASS' : (c.level === 'critical' ? 'FAIL' : 'WARN');
    console.log(`${tag}  ${c.name}${c.ok ? '' : ` — ${c.detail}`}`);
  }
  if (result.pass) {
    console.log(`QA PASS ${id} score=${result.score} warnings=${result.warnings.length}`);
  } else if (result.critical.length > 0) {
    console.log(`QA FAIL ${id} score=${result.score}: critical: ${result.critical.join(', ')}`);
  } else {
    console.log(`QA FAIL ${id} score=${result.score}: warnings: ${result.warnings.join(', ')}`);
  }
  process.exit(result.pass ? 0 : 1);
}
