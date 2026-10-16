#!/usr/bin/env node
/**
 * v74 Legal citation freshness (rà soát hiệu lực văn bản pháp luật).
 *
 * Every published body is scanned for citations of legal documents (Luật,
 * Bộ luật, Nghị định, Thông tư, Quyết định, Nghị quyết, Chỉ thị — by number,
 * or by name for the few laws the registry lists names for). Each citation is
 * joined with the registry data/seo/legal-documents.json (status, evidence
 * level, replacing/amending document, official sources, pending checks) and
 * classified from its own sentence as CURRENT (cited as the rule in force) or
 * HISTORICAL (cited as the old rule: "thay thế", "quy định cũ", "hết hiệu
 * lực", …). The report lists:
 *   1. articles citing a replaced document as the rule in force (to fix via
 *      tools/seo-body-review.mjs once the official text is read — these must
 *      carry a content flag in config/seo-cold-start.json, see the test);
 *   2. citations with a wrong document symbol (typo such as TB-BGTVT);
 *   3. documents amended after publication — pending full-text check;
 *   4. documents cited as current whose text nobody has verified yet;
 *   5. every document with counts; 6. citations the registry does not know.
 * Nothing here changes a body: the tool reads and reports. Numbers only
 * enter articles through data/seo/legal-facts.json (full-text verified).
 *
 *   node tools/seo-legal-citations.mjs            # write docs/seo/legal-citations.{md,json}
 *   node tools/seo-legal-citations.mjs --check    # exit 1 when the report is stale
 *   node tools/seo-legal-citations.mjs --json     # print the JSON summary
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTRY = 'data/seo/legal-documents.json';
export const MANIFEST = 'data/blog/published.json';
export const OUT_DIR = 'docs/seo';
export const OUT_MD = 'legal-citations.md';
export const OUT_JSON = 'legal-citations.json';
export const STATUSES = ['in_force', 'amended', 'replaced', 'unverified'];
export const EVIDENCE = ['fulltext', 'reported', 'unverified'];

const read = (root, p) => readFileSync(join(root, p), 'utf8');
const CITE_RE = /(Bộ luật|Luật|Nghị định|Thông tư|Quyết định|Nghị quyết|Chỉ thị)\s+(?:số\s+)?(\d{1,4})\/(\d{4}|CT-TTg)(?:\/([A-ZĐ][A-ZĐa-z0-9]*(?:-[A-ZĐa-z0-9]+)*))?/g;

/** Citation key as the registry writes it: 'loại|số/năm' in lower case. */
export const citeKey = (type, num, year) => `${type.toLowerCase()}|${num}/${year.toLowerCase()}`;

const stripTags = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
export const sentences = (text) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

const HISTORICAL_AFTER = ['hết hiệu lực', 'không còn hiệu lực', 'không còn áp dụng', 'đã được thay', 'đã bị thay', 'được thay thế', 'bị thay thế', 'bị bãi bỏ', 'đã bãi bỏ', 'trước đây', 'đã xóa bỏ', ' cũ '];
const HISTORICAL_BEFORE = ['quy định cũ', 'văn bản cũ', 'nghị định cũ', 'thông tư cũ', 'luật cũ', 'trước đây', 'trước đó', 'trước thời điểm', 'ban đầu', 'kế thừa', 'từng'];

/**
 * CURRENT or HISTORICAL for one citation inside its sentence (lower-cased
 * sentence, index of the citation). Lexical rules only; the report prints the
 * sentence so a reviewer can overrule by hand.
 */
export function classify(low, idx) {
  // "A thay thế B" / "A bãi bỏ B": the document after the cue is the old one,
  // unless the cue reads "thay thế bởi/bằng" (then the document after is new).
  const cueRe = /thay thế|bãi bỏ|thay cho/g;
  let m;
  while ((m = cueRe.exec(low))) {
    if (m.index < idx) {
      const between = low.slice(m.index + m[0].length, idx);
      if (between.length <= 60) return /^\s*(bởi|bằng)\b/.test(between) ? 'CURRENT' : 'HISTORICAL';
    } else {
      const between = low.slice(idx, m.index);
      if (between.length <= 90) return /(được|bị|đã|sẽ)\s*$/.test(between) ? 'HISTORICAL' : 'CURRENT';
    }
  }
  for (const cue of HISTORICAL_AFTER) {
    const at = low.indexOf(cue, idx);
    if (at !== -1 && at - idx <= 110) return 'HISTORICAL';
  }
  for (const cue of HISTORICAL_BEFORE) {
    const at = low.lastIndexOf(cue, idx);
    if (at !== -1 && idx - at <= 80) return 'HISTORICAL';
  }
  return 'CURRENT';
}

export function loadRegistry(root = ROOT) {
  const reg = JSON.parse(read(root, REGISTRY));
  if (!Array.isArray(reg.documents)) throw new Error('invalid legal-documents registry');
  const byCite = new Map();
  const byId = new Map();
  for (const d of reg.documents) {
    if (byId.has(d.id)) throw new Error(`duplicate legal document id ${d.id}`);
    byId.set(d.id, d);
    for (const c of d.cite ?? []) {
      if (byCite.has(c)) throw new Error(`cite key ${c} claimed twice`);
      byCite.set(c, d);
    }
  }
  return { reg, byCite, byId };
}

/** Scan every published body. Returns per-article citations (numbered and by name). */
export function scan(root = ROOT, registry = loadRegistry(root)) {
  const manifest = JSON.parse(read(root, MANIFEST)).articles;
  const out = [];
  for (const a of [...manifest].sort((x, y) => x.article_id.localeCompare(y.article_id))) {
    const text = stripTags(read(root, a.body));
    const cites = [];
    for (const s of sentences(text)) {
      const low = s.toLowerCase();
      CITE_RE.lastIndex = 0;
      let m;
      const seenNamed = new Set();
      while ((m = CITE_RE.exec(s))) {
        const key = citeKey(m[1], m[2], m[3]);
        const doc = registry.byCite.get(key) ?? null;
        cites.push({ key, text: m[0], suffix: m[4] ?? null, doc: doc?.id ?? null, use: classify(low, m.index), sentence: s });
        if (doc) seenNamed.add(doc.id);
      }
      const lowNoComma = low.replace(/,/g, '');
      for (const d of registry.reg.documents) {
        if (!d.names?.length || seenNamed.has(d.id)) continue;
        const name = d.names.map((n) => n.replace(/,/g, '')).find((n) => lowNoComma.includes(n));
        if (!name) continue;
        cites.push({ key: `name:${d.id}`, text: name, suffix: null, doc: d.id, use: classify(lowNoComma, lowNoComma.indexOf(name)), sentence: s, byName: true });
      }
    }
    if (cites.length) out.push({ article_id: a.article_id, slug: a.slug, category: a.category, cites });
  }
  return out;
}

const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : '—');
const trim = (s, n = 180) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function analyse(root = ROOT) {
  const registry = loadRegistry(root);
  const articles = scan(root, registry);
  const { reg, byId } = registry;
  const perDoc = new Map(reg.documents.map((d) => [d.id, { current: new Set(), historical: new Set(), byName: new Set(), mentions: 0 }]));
  const unknown = new Map();
  const wrongSuffix = [];
  const needsFix = [];
  const amended = [];
  const unverified = [];
  for (const a of articles) {
    const fixes = new Map();
    for (const c of a.cites) {
      if (!c.doc) {
        const u = unknown.get(c.key) ?? { key: c.key, articles: new Set(), sample: c.sentence };
        u.articles.add(a.article_id);
        unknown.set(c.key, u);
        continue;
      }
      const d = byId.get(c.doc);
      const p = perDoc.get(c.doc);
      p.mentions += 1;
      if (c.byName) p.byName.add(a.article_id);
      (c.use === 'CURRENT' ? p.current : p.historical).add(a.article_id);
      if (c.suffix && d.suffix && c.suffix.toUpperCase() !== d.suffix.toUpperCase()) {
        wrongSuffix.push({ article_id: a.article_id, slug: a.slug, cited: c.text, expected: `${c.text.split('/').slice(0, 2).join('/')}/${d.suffix}`, doc: d.id, sentence: trim(c.sentence) });
      }
      if (d.status === 'replaced' && c.use === 'CURRENT') {
        const f = fixes.get(d.id) ?? { article_id: a.article_id, slug: a.slug, doc: d.id, replaced_by: d.replaced_by, replaced_from: d.replaced_from ?? null, evidence: d.evidence, mentions: 0, sample: trim(c.sentence) };
        f.mentions += 1;
        fixes.set(d.id, f);
      }
    }
    needsFix.push(...fixes.values());
  }
  for (const d of reg.documents) {
    const p = perDoc.get(d.id);
    const current = [...p.current].sort();
    if (d.status === 'amended' && current.length) amended.push({ doc: d.id, amended_by: d.amended_by, amended_from: d.amended_from ?? null, articles: current.length, pending: d.pending ?? '', sample: current.slice(0, 12) });
    if (d.status !== 'replaced' && d.evidence !== 'fulltext' && current.length) unverified.push({ doc: d.id, evidence: d.evidence, status: d.status, articles: current.length, pending: d.pending ?? '', sources: d.sources ?? [], sample: current.slice(0, 8) });
  }
  const documents = reg.documents.map((d) => {
    const p = perDoc.get(d.id);
    return { id: d.id, title: d.title, status: d.status, evidence: d.evidence, effective: d.effective ?? null, replaced_by: d.replaced_by ?? null, amended_by: d.amended_by ?? null,
      articles_current: [...p.current].sort(), articles_historical: [...p.historical].sort(), by_name: [...p.byName].sort(), mentions: p.mentions };
  });
  needsFix.sort((x, y) => x.article_id.localeCompare(y.article_id) || x.doc.localeCompare(y.doc));
  wrongSuffix.sort((x, y) => x.article_id.localeCompare(y.article_id));
  const unknownList = [...unknown.values()].map((u) => ({ key: u.key, articles: [...u.articles].sort(), sample: trim(u.sample) })).sort((x, y) => y.articles.length - x.articles.length || x.key.localeCompare(y.key));
  return {
    $schema: 'motoai/legal-citations@1',
    registry_checked: reg.checked ?? null,
    articles_scanned: articles.length,
    counts: { needs_fix: needsFix.length, wrong_suffix: wrongSuffix.length, amended: amended.length, unverified: unverified.length, unknown: unknownList.length,
      documents: documents.length, cited_documents: documents.filter((d) => d.mentions).length },
    needs_fix: needsFix, wrong_suffix: wrongSuffix, amended, unverified, documents, unknown: unknownList,
  };
}

export function render(r) {
  const L = ['# Hiệu lực văn bản pháp luật mà bài viết trích dẫn', '',
    `_Sinh bởi \`node tools/seo-legal-citations.mjs\` từ sổ đăng ký \`data/seo/legal-documents.json\` (rà ngày ${fmtDate(r.registry_checked)}) và ${r.articles_scanned} bài đã đăng có trích dẫn văn bản. Không sửa tay. Phân loại "đang áp dụng"/"nhắc quy định cũ" là theo từ ngữ trong câu; mỗi dòng in kèm câu để người rà soát quyết định._`, '',
    '| Mục | Số |', '|---|---:|',
    `| Bài dẫn văn bản đã hết hiệu lực như quy định đang áp dụng (cần sửa qua review body sau khi đối chiếu toàn văn) | ${r.counts.needs_fix} |`,
    `| Trích dẫn sai ký hiệu | ${r.counts.wrong_suffix} |`,
    `| Văn bản được sửa đổi sau khi bài đăng — chờ đối chiếu | ${r.counts.amended} |`,
    `| Văn bản dẫn như hiện hành nhưng chưa đối chiếu toàn văn | ${r.counts.unverified} |`,
    `| Trích dẫn ngoài sổ đăng ký | ${r.counts.unknown} |`, '',
    '## 1. Bài dẫn văn bản đã hết hiệu lực như quy định đang áp dụng', '',
    'Mỗi bài dưới đây phải có cờ trong `config/seo-cold-start.json` → `content_flags` (engine 06 ngừng đẩy từ khóa tới bài cho đến khi sửa). Sửa qua `tools/seo-body-review.mjs` với dữ kiện đã đối chiếu toàn văn (`data/seo/legal-facts.json`).', '',
    '| Bài | Văn bản đang dẫn | Thay bởi | Từ ngày | Bằng chứng | Lượt | Câu trong bài |', '|---|---|---|---|---|---:|---|'];
  for (const f of r.needs_fix) L.push(`| ${f.article_id} \`${f.slug}\` | ${f.doc} | ${f.replaced_by} | ${fmtDate(f.replaced_from)} | ${f.evidence} | ${f.mentions} | ${mdCell(f.sample)} |`);
  if (!r.needs_fix.length) L.push('| — | | | | | | |');
  L.push('', '## 2. Trích dẫn sai ký hiệu', '', '| Bài | Trong bài | Đúng là | Câu |', '|---|---|---|---|');
  for (const w of r.wrong_suffix) L.push(`| ${w.article_id} \`${w.slug}\` | ${w.cited} | ${w.expected} | ${mdCell(w.sentence)} |`);
  if (!r.wrong_suffix.length) L.push('| — | | | |');
  L.push('', '## 3. Văn bản được sửa đổi sau khi bài đăng — chờ đối chiếu toàn văn', '', '| Văn bản | Sửa bởi | Từ ngày | Bài đang dẫn | Việc chờ |', '|---|---|---|---:|---|');
  for (const a of r.amended) L.push(`| ${a.doc} | ${a.amended_by} | ${fmtDate(a.amended_from)} | ${a.articles} | ${mdCell(a.pending)} |`);
  if (!r.amended.length) L.push('| — | | | | |');
  L.push('', '## 4. Văn bản dẫn như hiện hành nhưng chưa đối chiếu toàn văn', '', 'Hàng đợi đối chiếu (cần truy cập nguồn chính thức: Cổng TTĐT Chính phủ, Công báo, cơ sở dữ liệu văn bản pháp luật).', '',
    '| Văn bản | Trạng thái | Bằng chứng | Bài đang dẫn | Việc chờ | Nguồn để đối chiếu |', '|---|---|---|---:|---|---|');
  for (const u of r.unverified) L.push(`| ${u.doc} | ${u.status} | ${u.evidence} | ${u.articles} | ${mdCell(u.pending || '—')} | ${u.sources.length ? u.sources.map((s) => `<${s}>`).join(' ') : '—'} |`);
  if (!r.unverified.length) L.push('| — | | | | | |');
  L.push('', '## 5. Sổ đăng ký và số bài dẫn', '', '| Văn bản | Tên | Trạng thái | Bằng chứng | Hiệu lực | Thay/sửa bởi | Bài dẫn như hiện hành | Bài nhắc quy định cũ | Dẫn theo tên |', '|---|---|---|---|---|---|---:|---:|---:|');
  for (const d of r.documents) L.push(`| ${d.id} | ${mdCell(d.title)} | ${d.status} | ${d.evidence} | ${fmtDate(d.effective)} | ${d.replaced_by ?? d.amended_by ?? '—'} | ${d.articles_current.length} | ${d.articles_historical.length} | ${d.by_name.length} |`);
  L.push('', '## 6. Trích dẫn ngoài sổ đăng ký', '', 'Thêm văn bản vào `data/seo/legal-documents.json` (có nguồn chính thức) để đưa vào rà soát.', '', '| Khóa | Bài | Câu mẫu |', '|---|---:|---|');
  for (const u of r.unknown) L.push(`| ${u.key} | ${u.articles.length} (${u.articles.slice(0, 6).join(', ')}${u.articles.length > 6 ? ', …' : ''}) | ${mdCell(u.sample)} |`);
  if (!r.unknown.length) L.push('| — | | |');
  L.push('');
  return { [OUT_MD]: L.join('\n'), [OUT_JSON]: `${JSON.stringify(r, null, 1)}\n` };
}

export function build(root = ROOT) { return render(analyse(root)); }

export function main(argv = process.argv.slice(2), root = ROOT) {
  const files = build(root);
  if (argv.includes('--json')) { console.log(files[OUT_JSON]); return 0; }
  if (argv.includes('--check')) {
    const stale = Object.entries(files).filter(([name, text]) => !existsSync(join(root, OUT_DIR, name)) || read(root, `${OUT_DIR}/${name}`) !== text).map(([n]) => n);
    if (stale.length) { console.error(`seo-legal-citations: ${OUT_DIR} lệch (${stale.join(', ')}) — chạy node tools/seo-legal-citations.mjs`); return 1; }
    console.log(`seo-legal-citations: ${OUT_DIR}/${OUT_MD} khớp dữ liệu`);
    return 0;
  }
  mkdirSync(join(root, OUT_DIR), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, OUT_DIR, name), text);
  const r = JSON.parse(files[OUT_JSON]);
  console.log(`seo-legal-citations: ${r.articles_scanned} bài có trích dẫn; cần sửa ${r.counts.needs_fix}; sai ký hiệu ${r.counts.wrong_suffix}; văn bản sửa đổi chờ đối chiếu ${r.counts.amended}; chưa đối chiếu ${r.counts.unverified}; ngoài sổ ${r.counts.unknown}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
