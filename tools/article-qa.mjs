#!/usr/bin/env node
/**
 * Scoped article QA — deterministic PASS/FAIL for EXACTLY ONE article (v64).
 *
 * The repo has NO article-level numeric score (tools/seo-score.mjs scores the
 * whole site), so per the QA policy this module stays a deterministic
 * PASS/FAIL checklist — no new scoring system is introduced here.
 *
 * Checks (docs/BLOG-FACTORY.md §Scoped QA):
 *   matrix-row / manifest-entry / id-slug-path / body-exists
 *   body-words 1.600–2.000 / structure (>=2 H2, no H1, has list)
 *   no filler / duplicate paragraphs / duplicate sentences
 *   no paragraph shared with any other article body (anti-spun/anti-dup)
 *   no keyword cannibalization (unique primary_keyword + unique title)
 *   title/meta/slug/date validity
 *   SEO ownership: no protected commercial keyword, no native-app claim,
 *     no nationwide rental claim, no "quận X" doorway title
 *   business facts: {{ business.* }} must resolve; raw phones/deposit
 *     amounts must match data/business/business.json
 *   SAFE legal gate (source_policy=legal-gate, agent_retrieval=no,
 *     empty knowledge chunks, gov.vn primary source link)
 *   internal links resolve; source_policy=no-external means zero external links
 *
 * Usage:
 *   node tools/article-qa.mjs <BA-id>            # human report, exit 0/1
 * Used by tools/blog-factory.mjs `qa <BA-id>` (same contract).
 * Sandboxed tests run this via MOTOAI_FACTORY_ROOT.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { text, words, resolveHref } from './seo-score.mjs';
import { resolveFacts, HUBS } from './build-blog.mjs';
import { parseMatrix, MATRIX, MANIFEST } from './blog-factory.mjs';

export const ROOT = process.env.MOTOAI_FACTORY_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)), '..');

const HUB_DIR = Object.fromEntries(HUBS.map((h) => [h.id, h.dir]));
const read = (p) => readFileSync(isAbsolute(p) ? p : join(ROOT, p), 'utf8');

/** QA gate for article depth (docs/ARTICLE-RULES.md). */
export const MIN_WORDS = 1600;
export const MAX_WORDS = 2000;

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

/**
 * Run every scoped check for ONE article id.
 * Returns { article_id, pass, checks: [{name, ok, detail}], failures: [name] }.
 */
export function scopedQa(id) {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: ok ? '' : detail });
  const rows = parseMatrix();
  const row = rows.find((r) => r.article_id === id);
  check('matrix-row', !!row, `${id} not in content-matrix.csv`);
  if (!row) return { article_id: id, pass: false, checks, failures: checks.filter((c) => !c.ok).map((c) => c.name) };

  const manifest = JSON.parse(read(MANIFEST));
  const entry = manifest.articles.find((a) => a.article_id === id);
  check('manifest-entry', !!(entry && entry.title && entry.description && entry.slug
    && entry.category && entry.body && entry.published_date && entry.author),
  'published.json needs a complete draft entry (title, description, slug, category, body, published_date, author)');

  const hubDir = HUB_DIR[row.category];
  check('id-slug-path', !!entry && row.slug === entry.slug && row.category === entry.category
    && !!hubDir
    && row.output_path === `blog/${hubDir}/${row.slug}/index.html`
    && entry.body === `data/blog/articles/${row.slug}.body.html`,
  `slug/category/output_path/body must be consistent (expected blog/${hubDir ?? '?'}/${row.slug}/index.html + data/blog/articles/${row.slug}.body.html)`);

  const bodyPath = join(ROOT, entry?.body ?? '');
  const bodyRaw = existsSync(bodyPath) ? readFileSync(bodyPath, 'utf8') : '';
  check('body-exists', bodyRaw.trim().length > 0, `body file missing or empty: ${entry?.body}`);

  const business = JSON.parse(read('data/business/business.json'));
  let resolved = '';
  if (bodyRaw) {
    try {
      resolved = resolveFacts(bodyRaw, business);
      check('fact-resolution', true);
    } catch (e) {
      check('fact-resolution', false, e.message);
      resolved = bodyRaw;
    }
  } else {
    check('fact-resolution', false, 'no body to resolve');
  }
  const bodyText = text(resolved);

  const wc = words(bodyText);
  check('body-words', wc >= MIN_WORDS && wc <= MAX_WORDS, `${wc} words (rule: ${MIN_WORDS}–${MAX_WORDS})`);

  check('body-structure', (resolved.match(/<h2\b/g) || []).length >= 2
    && !/<h1\b/i.test(resolved) && /<ul\b|<ol\b/i.test(resolved),
  'body needs >=2 H2, no H1 (shell renders it), and at least one list');

  check('no-filler', !/lorem|TBD|coming soon|đang cập nhật|chưa có nội dung/i.test(bodyText),
  'filler/placeholder markers found');

  const paras = paragraphKeys(bodyText);
  check('no-duplicate-paragraphs', new Set(paras).size === paras.length, 'duplicate paragraph detected inside the article');

  const sentences = sentenceKeys(bodyText);
  check('no-duplicate-sentences', new Set(sentences).size === sentences.length, 'identical sentence repeated (spun content)');

  // Cross-corpus: no paragraph may already exist in another article body.
  // Bodies are fact-resolved first so fingerprints compare apples to apples.
  const others = manifest.articles.filter((a) => a.article_id !== id);
  const corpus = new Set();
  for (const a of others) {
    const p = join(ROOT, a.body);
    if (existsSync(p)) {
      let raw = readFileSync(p, 'utf8');
      try { raw = resolveFacts(raw, business); } catch { /* unresolved pilot: compare raw */ }
      for (const k of paragraphKeys(text(raw))) corpus.add(k);
    }
  }
  const shared = paras.find((k) => corpus.has(k));
  check('no-cross-article-duplicate', shared === undefined, `paragraph already used in another article: "${shared ?? ''}"`);

  const othersRows = rows.filter((r) => r.article_id !== id);
  check('no-cannibalization',
    !othersRows.some((r) => r.primary_keyword === row.primary_keyword)
    && !othersRows.some((r) => r.working_title.toLowerCase() === row.working_title.toLowerCase()),
  'primary_keyword and title must be unique across the matrix');

  const title = entry?.title ?? '';
  const desc = entry?.description ?? '';
  check('title-meta-valid',
    title.length >= 10 && title.length <= 70
    && desc.length >= 50 && desc.length <= 165
    && /^[a-z0-9-]+$/.test(row.slug)
    && /^\d{4}-\d{2}-\d{2}$/.test(entry?.published_date ?? ''),
  `title ${title.length} (10–70), description ${desc.length} (50–165), slug format, YYYY-MM-DD date`);

  const ownership = JSON.parse(read('config/seo-ownership.json'));
  const protectedKw = ownership.protected_commercial_intents.map((p) => p.keyword.trim().toLowerCase());
  const titleLc = title.toLowerCase();
  check('seo-ownership',
    !protectedKw.includes(titleLc) && !protectedKw.includes(row.primary_keyword.toLowerCase())
    && !/app store|google play/i.test(bodyText)
    && !/(thuê|cho thuê|dịch vụ)[^.,]{0,25}toàn quốc/i.test(bodyText)
    && !/app thuê xe máy\s+(quận|phường|xã|huyện)/i.test(titleLc),
  'title/keyword must not own protected commercial intents, no native-app claim, no nationwide rental claim, no "quận X" doorway title');

  if (row.category === 'LOCAL') {
    check('local-angle', (row.local_scope ?? '').length > 0, 'LOCAL article needs a non-empty local_scope (distinct angle, not a doorway clone)');
  }

  const phones = verifiedPhones(business);
  const rawNumbers = [...resolved.matchAll(/\+?\d(?:[\d\s.\-]{7,})\d/g)]
    .map((m) => m[0].replace(/\D/g, '')).filter((d) => d.length >= 9 && d.length <= 13);
  const badPhone = rawNumbers.find((d) => !phones.has(d));
  check('verified-phones-only', badPhone === undefined, `unverified phone-like number in body: ${badPhone ?? ''}`);

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
  check('verified-deposits-only', badDeposit === null, `deposit amount not backed by business.json: ${badDeposit ?? ''}`);

  const externalLinks = [...resolved.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  if (row.category === 'SAFE') {
    check('safe-legal-gate',
      row.source_policy === 'legal-gate' && row.agent_retrieval === 'no'
      && (entry?.knowledge_chunks ?? []).length === 0
      && /https?:\/\/[a-z0-9.-]*(?:gov\.vn|vbpl\.vn)/i.test(resolved),
    'SAFE article needs source_policy=legal-gate, agent_retrieval=no, empty knowledge_chunks and a gov.vn/vbpl.vn primary source link');
  }
  if (row.source_policy === 'no-external') {
    check('no-external-links', externalLinks.length === 0, `source_policy=no-external but body has ${externalLinks.length} external link(s): ${externalLinks[0] ?? ''}`);
  }

  const chunks = entry?.knowledge_chunks ?? [];
  check('retrieval-consistency',
    row.agent_retrieval === 'yes' ? chunks.length > 0 && chunks.every((c) => c.length > 0 && c.length < 800)
      : chunks.length === 0,
  `agent_retrieval=${row.agent_retrieval} inconsistent with knowledge_chunks`);

  // Internal links must resolve to real files (hub/blog/agent/published pages).
  const pagePath = row.output_path;
  const badLinks = [];
  for (const m of resolved.matchAll(/href="([^"]+)"/g)) {
    const target = resolveHref(pagePath, m[1]);
    if (target && !existsSync(join(ROOT, target))) badLinks.push(m[1]);
  }
  check('internal-links-resolve', badLinks.length === 0, `broken internal link(s): ${badLinks.join(', ')}`);

  const failures = checks.filter((c) => !c.ok).map((c) => c.name);
  return { article_id: id, pass: failures.length === 0, checks, failures };
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
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : ` — ${c.detail}`}`);
  }
  console.log(result.pass ? `QA PASS ${id}` : `QA FAIL ${id}: ${result.failures.join(', ')}`);
  process.exit(result.pass ? 0 : 1);
}
