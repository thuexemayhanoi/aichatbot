#!/usr/bin/env node
/**
 * SEO BODY REVIEW (v70) — the separate review process AGENTS.md requires
 * before a PUBLISHED body may change.
 *
 * Reviewers never rewrite a body. They submit a structured PATCH per article
 * and this tool applies it deterministically, so existing prose is always
 * preserved; only these operations exist:
 *
 *   intro    : one direct-answer paragraph prepended (AEO / AI answers)
 *   replace  : exact text-node replacements (Vietnamese for English fragments)
 *   links    : wrap an existing phrase in a contextual link to a published article
 *   table    : a comparison table summarising what the article already says
 *   faq      : a "Câu hỏi thường gặp" section (only if the body has none)
 *   sections : extra H2 sections for thin articles (< 800 words)
 *
 * Gates (any failure rejects the whole article patch):
 *   - new text is plain Vietnamese: no markup, no English fragments, no
 *     forbidden commercial claims, no digits that the original body does not
 *     already contain ({{ business.* }} placeholders must resolve);
 *   - link targets are published articles, never self, never already linked;
 *   - word count never drops; thin articles reach 800; additions never push a
 *     body past 2,000 words;
 *   - (apply) the factory QA (tools/article-qa.mjs scopedQa) still passes with
 *     a score >= the pre-review score.
 *
 * Usage:
 *   node tools/seo-body-review.mjs check <patch.json>   # validate only, writes nothing
 *   node tools/seo-body-review.mjs apply <patch.json>   # validate, write bodies, QA, log
 *
 * Applied reviews are logged in data/seo/body-reviews.json (reviewed date ->
 * Article dateModified). Revert = `git revert`; bodies are plain files.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { englishTokens } from './seo-meta.mjs';
import { taxonomy } from './taxonomy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
export const REVIEW_LOG = 'data/seo/body-reviews.json';
export const REVIEW_DATE = '2026-10-14';
const FORBIDDEN = ['app store', 'google play', 'toàn quốc', 'không cần cọc', 'miễn cọc', 'rẻ nhất', 'số 1', 'uy tín nhất',
  'tốt nhất việt nam', 'giao xe miễn phí', 'miễn phí giao', 'cam kết 100%', '24/7'];
const MAX_WORDS = 2000, MIN_WORDS = 800;

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stripTags = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ');
const wordCount = (h) => stripTags(h).split(/\s+/).filter(Boolean).length;
const digitsOf = (s) => new Set((String(s).replace(/\{\{[^}]*\}\}/g, '').match(/\d+/g) ?? []).map((d) => d.replace(/^0+(?=\d)/, '')));
const FAQ_RE = /<h2[^>]*>[^<]*(câu hỏi|hỏi đáp|faq|thắc mắc)/i;

function manifestIndex() {
  const arts = JSON.parse(read('data/blog/published.json')).articles;
  const urls = new Map();
  for (const a of arts) urls.set(`/blog/${taxonomy.categories[a.category].dir}/${a.slug}/`, a);
  return { byId: new Map(arts.map((a) => [a.article_id, a])), urls };
}

/** Text-only check shared by every inserted string. */
function textProblems(label, s, allowedDigits) {
  const out = [];
  if (typeof s !== 'string' || !s.trim()) return [`${label}: empty`];
  if (/[<>]/.test(s)) out.push(`${label}: markup is not allowed (plain text only)`);
  const en = englishTokens(s);
  if (en.length) out.push(`${label}: English tokens ${en.join(', ')}`);
  const low = s.toLowerCase();
  for (const f of FORBIDDEN) if (low.includes(f)) out.push(`${label}: forbidden claim "${f}"`);
  for (const d of digitsOf(s)) if (!allowedDigits.has(d)) out.push(`${label}: number "${d}" does not appear in the original article`);
  for (const m of s.matchAll(/\{\{\s*business\.([a-z0-9_.]+)/gi)) {
    const v = m[1].split('.').reduce((o, k) => (o == null ? undefined : o[k]), JSON.parse(read('data/business/business.json')));
    if (v === undefined) out.push(`${label}: unresolved placeholder business.${m[1]}`);
  }
  return out;
}

/** Split html into [isTag, chunk] segments. */
const segments = (html) => html.split(/(<[^>]+>)/g).filter((x) => x !== '').map((x) => [x.startsWith('<'), x]);

/** Apply text replacements to text nodes only (never attributes/hrefs). */
function replaceText(html, from, to) {
  let n = 0;
  const out = segments(html).map(([tag, x]) => {
    if (tag) return x;
    const parts = x.split(from);
    n += parts.length - 1;
    return parts.join(escText(to));
  }).join('');
  return { html: out, n };
}

/** Wrap the first occurrence of `anchor` that sits in a <p>/<li> text node,
 *  outside any <a>, <h2>/<h3> or <strong>, in a link. */
function wrapLink(html, anchor, href) {
  const segs = segments(html);
  let inA = 0, inH = 0, inBlock = 0;
  for (let i = 0; i < segs.length; i++) {
    const [tag, x] = segs[i];
    if (tag) {
      if (/^<a\b/i.test(x)) inA++; else if (/^<\/a>/i.test(x)) inA--;
      else if (/^<h[1-6]\b|^<strong\b/i.test(x)) inH++; else if (/^<\/h[1-6]>|^<\/strong>/i.test(x)) inH--;
      else if (/^<(p|li)\b/i.test(x)) inBlock++; else if (/^<\/(p|li)>/i.test(x)) inBlock--;
      continue;
    }
    if (inA || inH || !inBlock) continue;
    const at = x.indexOf(anchor);
    if (at < 0) continue;
    segs[i][1] = `${x.slice(0, at)}<a href="${href}">${anchor}</a>${x.slice(at + anchor.length)}`;
    return { html: segs.map(([, y]) => y).join(''), ok: true };
  }
  return { html, ok: false };
}

/** Index right before the conclusion/FAQ H2 (or end of body). */
function insertionPoint(html, beforeFaq) {
  const heads = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)];
  const isEnd = (t) => /kết luận|lời kết|tóm lại|tổng kết/i.test(stripTags(t));
  const target = heads.find((m) => (beforeFaq && FAQ_RE.test(m[0])) || isEnd(m[1]));
  return target ? target.index : html.trimEnd().length;
}

/** After the first block under the H2 — but never between a lead-in
 *  paragraph ending in ":" and the list it introduces. */
export function tableInsertionPoint(html, from) {
  const close = /<\/(p|ul|ol)>/g; close.lastIndex = from;
  const m = close.exec(html);
  if (!m) return from;
  let at = m.index + m[0].length;
  const para = html.slice(from, m.index);
  if (m[1] === 'p' && /:\s*$/.test(stripTags(para.slice(para.lastIndexOf('<p')))) && /^\s*<(ul|ol)\b/.test(html.slice(at))) {
    const list = /^\s*<(ul|ol)\b/.exec(html.slice(at))[1];
    const end = html.indexOf(`</${list}>`, at);
    if (end > 0) at = end + list.length + 3;
  }
  return at;
}

function tableHtml(t) {
  const head = t.head.map((h) => `<th scope="col">${escText(h)}</th>`).join('');
  const rows = t.rows.map((r) => `<tr><th scope="row">${escText(r[0])}</th>${r.slice(1).map((c) => `<td>${escText(c)}</td>`).join('')}</tr>`).join('\n');
  return `<div class="table-wrap">\n<table class="blog-table">\n<caption>${escText(t.caption)}</caption>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>\n</div>\n`;
}

/**
 * Build the reviewed body for one patch. Returns { html, problems, ops, before, after }.
 * Pure: never writes.
 */
export function reviewArticle(patch, idx = manifestIndex()) {
  const problems = [];
  const ops = [];
  const a = idx.byId.get(patch.id);
  if (!a) return { problems: [`${patch.id}: unknown article`] };
  const selfUrl = `/blog/${taxonomy.categories[a.category].dir}/${a.slug}/`;
  const original = read(a.body);
  const allowed = digitsOf(stripTags(original));
  let html = original;
  const P = (s) => problems.push(`${patch.id}: ${s}`);

  for (const [i, r] of (patch.replace ?? []).entries()) {
    if (typeof r.from !== 'string' || r.from.length < 3) { P(`replace[${i}]: "from" too short`); continue; }
    // Deleting text is only allowed for leaked internal production notes.
    const internalNote = r.to === '' && /pilot|fixture|chuẩn sản xuất|^\s*Hmm\b|typo/i.test(r.from);
    if (!internalNote) for (const p of textProblems(`replace[${i}].to`, r.to, allowed)) P(p);
    const res = replaceText(html, r.from, r.to);
    if (res.n === 0) P(`replace[${i}]: "${r.from}" not found in any text node`);
    html = res.html;
  }
  if (patch.replace?.length) ops.push(`replace:${patch.replace.length}`);

  const linked = new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
  for (const [i, l] of (patch.links ?? []).entries()) {
    if (!idx.urls.has(l.href)) { P(`links[${i}]: ${l.href} is not a published article URL`); continue; }
    if (l.href === selfUrl) { P(`links[${i}]: self link`); continue; }
    if (linked.has(l.href)) { P(`links[${i}]: ${l.href} already linked in this body`); continue; }
    if (typeof l.anchor !== 'string' || l.anchor.trim().split(/\s+/).length < 2) { P(`links[${i}]: anchor must be a phrase of 2+ words`); continue; }
    const res = wrapLink(html, l.anchor, l.href);
    if (!res.ok) P(`links[${i}]: anchor "${l.anchor}" not found as plain text inside a <p>/<li>`);
    html = res.html;
    linked.add(l.href);
  }
  if (patch.links?.length) ops.push(`links:${patch.links.length}`);

  if (patch.table) {
    const t = patch.table;
    const cols = t.head?.length ?? 0;
    if (cols < 2 || !Array.isArray(t.rows) || t.rows.length < 2 || t.rows.some((r) => r.length !== cols)) {
      P('table: needs >= 2 columns, >= 2 rows, every row as wide as the header');
    } else {
      for (const [k, v] of [['caption', t.caption], ...t.head.map((h, j) => [`head[${j}]`, h]), ...t.rows.flatMap((r, y) => r.map((c, x) => [`rows[${y}][${x}]`, c]))]) {
        for (const p of textProblems(`table.${k}`, v, allowed)) P(p);
      }
      const h2 = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].find((m) => stripTags(m[1]).trim() === String(t.after_h2 ?? '').trim());
      if (!h2) P(`table: after_h2 "${t.after_h2}" is not an H2 of this article`);
      else {
        const at = tableInsertionPoint(html, h2.index + h2[0].length);
        html = `${html.slice(0, at)}\n${tableHtml(t)}${html.slice(at)}`;
        ops.push('table');
      }
    }
  }

  if (patch.sections?.length) {
    const blocks = [];
    for (const [i, s] of patch.sections.entries()) {
      for (const p of textProblems(`sections[${i}].h2`, s.h2, allowed)) P(p);
      for (const [j, para] of (s.paragraphs ?? []).entries()) for (const p of textProblems(`sections[${i}].paragraphs[${j}]`, para, allowed)) P(p);
      for (const [j, it] of (s.items ?? []).entries()) for (const p of textProblems(`sections[${i}].items[${j}]`, it, allowed)) P(p);
      if (!(s.paragraphs?.length)) P(`sections[${i}]: at least one paragraph`);
      blocks.push(`<h2>${escText(s.h2)}</h2>\n${(s.paragraphs ?? []).map((x) => `<p>${escText(x)}</p>`).join('\n')}${s.items?.length ? `\n<ul>\n${s.items.map((x) => `<li>${escText(x)}</li>`).join('\n')}\n</ul>` : ''}\n\n`);
    }
    const at = insertionPoint(html, true);
    html = `${html.slice(0, at)}${blocks.join('')}${html.slice(at)}`;
    ops.push(`sections:${patch.sections.length}`);
  }

  if (patch.faq?.length) {
    if (FAQ_RE.test(original)) P('faq: the article already has a FAQ section');
    else if (patch.faq.length < 3 || patch.faq.length > 6) P('faq: 3–6 questions');
    else {
      for (const [i, f] of patch.faq.entries()) {
        for (const p of textProblems(`faq[${i}].q`, f.q, allowed)) P(p);
        for (const p of textProblems(`faq[${i}].a`, f.a, allowed)) P(p);
        if (!/\?$/.test(String(f.q).trim())) P(`faq[${i}].q must be a question ending with "?"`);
      }
      const block = `<h2>Câu hỏi thường gặp</h2>\n${patch.faq.map((f) => `<h3>${escText(f.q)}</h3>\n<p>${escText(f.a)}</p>`).join('\n')}\n\n`;
      const at = insertionPoint(html, false);
      html = `${html.slice(0, at)}${block}${html.slice(at)}`;
      ops.push(`faq:${patch.faq.length}`);
    }
  }

  if (patch.intro) {
    for (const p of textProblems('intro', patch.intro, allowed)) P(p);
    html = `<p>${escText(patch.intro)}</p>\n\n${html.replace(/^\s+/, '')}`;
    ops.push('intro');
  }

  const before = wordCount(original), after = wordCount(html);
  if (after < before) P(`word count dropped ${before} -> ${after}`);
  if (before < MIN_WORDS && after < MIN_WORDS && (patch.sections?.length || patch.faq?.length)) P(`thin article still ${after} words (< ${MIN_WORDS})`);
  if (after > MAX_WORDS && after > before && before <= MAX_WORDS) P(`additions push the body to ${after} words (> ${MAX_WORDS})`);
  if (before > MAX_WORDS && (patch.sections?.length || patch.faq?.length || patch.table)) P(`body already ${before} words: only replace/links/intro allowed`);
  if (!ops.length) P('empty patch');
  return { id: patch.id, html, original, problems, ops, before, after, body: a.body };
}

function loadLog() {
  return existsSync(join(ROOT, REVIEW_LOG)) ? JSON.parse(read(REVIEW_LOG)) : { $schema: 'motoai/seo-body-reviews@1', note: '', reviews: {} };
}

export async function main(argv) {
  const [cmd, file] = argv;
  if (!['check', 'apply'].includes(cmd) || !file) {
    console.error('usage: node tools/seo-body-review.mjs check|apply <patch.json>');
    return 2;
  }
  const patches = JSON.parse(readFileSync(file, 'utf8'));
  const idx = manifestIndex();
  const seen = new Set();
  const results = patches.map((p) => {
    if (seen.has(p.id)) return { id: p.id, problems: [`${p.id}: duplicate patch id`] };
    seen.add(p.id);
    return reviewArticle(p, idx);
  });
  const bad = results.filter((r) => r.problems.length);
  for (const r of bad) console.log(r.problems.join('\n'));
  if (cmd === 'check') {
    console.log(bad.length ? `FAIL: ${bad.length}/${results.length} patch(es) rejected` : `OK: ${results.length} patch(es) valid`);
    return bad.length ? 1 : 0;
  }
  const { scopedQa } = await import('./article-qa.mjs');
  const log = loadLog();
  log.note = 'Applied SEO body reviews (tools/seo-body-review.mjs). Each entry: review date (Article dateModified), operations, words and factory QA score before/after.';
  let applied = 0;
  const qaFailed = [];
  for (const r of results.filter((x) => !x.problems.length)) {
    const qaBefore = scopedQa(r.id);
    writeFileSync(join(ROOT, r.body), r.html, 'utf8');
    const qaAfter = scopedQa(r.id);
    if (!qaAfter.pass || qaAfter.score < qaBefore.score) {
      writeFileSync(join(ROOT, r.body), r.original, 'utf8');
      qaFailed.push(`${r.id}: QA ${qaBefore.score} -> ${qaAfter.score} (${[...qaAfter.critical, ...qaAfter.warnings.filter((w) => !qaBefore.warnings.includes(w))].join(', ')}) — reverted`);
      continue;
    }
    const prev = log.reviews[r.id];
    log.reviews[r.id] = {
      reviewed: REVIEW_DATE,
      ops: [...new Set([...(prev?.ops ?? []), ...r.ops])],
      words: [prev?.words?.[0] ?? r.before, r.after],
      qa: [prev?.qa?.[0] ?? qaBefore.score, qaAfter.score]
    };
    applied++;
  }
  log.reviews = Object.fromEntries(Object.entries(log.reviews).sort(([x], [y]) => x.localeCompare(y)));
  // One review per line: readable diffs as batches are appended.
  writeFileSync(join(ROOT, REVIEW_LOG), `{"$schema":${JSON.stringify(log.$schema)},\n"note":${JSON.stringify(log.note)},\n"reviews":{\n${Object.entries(log.reviews).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}\n}}\n`, 'utf8');
  for (const q of qaFailed) console.log(q);
  console.log(`applied ${applied}/${results.length}; rejected ${bad.length}; reverted after QA ${qaFailed.length}`);
  return bad.length || qaFailed.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
