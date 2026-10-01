import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Shared sandbox for blog-factory / article-qa tests (v64 micro loop).
 *
 * The sandbox is a FULL COPY of the repo (minus .git) so scoped QA can
 * resolve internal links and publish transactions can run build-blog
 * INSIDE the sandbox — the real production matrix is never mutated.
 *
 * Tools are executed from the sandbox's own copy (no MOTOAI_FACTORY_ROOT
 * override), which guarantees every file the factory touches lives in tmp.
 *
 * v64.2: the sandbox ALWAYS starts from the canonical baseline — the two
 * pilot articles PUBLISHED, every other row PLANNED — no matter how far
 * real production has gone (writer drafts in QA/PASS, rows the workflow
 * already published). Factory contract tests must not depend on live
 * production state, otherwise CI breaks on every writer push (draft
 * matrix) and after every publish (published count drifts).
 */

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function repoSandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'motoai-factory-'));
  cpSync(REPO, dir, { recursive: true, filter: (src) => !src.includes('/.git') });
  baselineSandbox(dir);
  return dir;
}

/** Reset a sandbox copy to the canonical baseline (pilots published, rest PLANNED). */
function baselineSandbox(dir) {
  // 1. Matrix: pilot rows keep PUBLISHED; every other row becomes PLANNED again.
  const pilots = new Set(readJson(dir, 'data/blog/published.json').articles
    .filter((a) => a.pilot === true).map((a) => a.article_id));
  const lines = readMatrix(dir);
  const out = lines.map((l, i) => {
    if (i === 0) return l;
    const cells = l.split(',');
    if (!pilots.has(cells[0])) cells[3] = 'PLANNED';
    return cells.join(',');
  });
  writeFileSync(join(dir, 'data/blog/content-matrix.csv'), out.join('\n') + '\n');
  // 2. Manifest: only entries whose (baseline) row is PUBLISHED — drop drafts.
  const published = new Set(out.slice(1)
    .filter((l) => l.split(',')[3] === 'PUBLISHED').map((l) => l.split(',')[0]));
  const manifest = readJson(dir, 'data/blog/published.json');
  manifest.articles = manifest.articles.filter((a) => published.has(a.article_id));
  writeJson(dir, 'data/blog/published.json', manifest);
  // 3. Remove draft body files and built pages of demoted rows (PLANNED rows
  //    must have no body committed) — pilots and pilot pages stay untouched.
  for (const l of out.slice(1)) {
    const cells = l.split(',');
    if (published.has(cells[0])) continue;
    rmSync(join(dir, 'data/blog/articles', `${cells[8]}.body.html`), { force: true });
    rmSync(join(dir, cells[9].replace(/index\.html$/, '')), { recursive: true, force: true });
  }
  // 4. Never inherit a writer's run state into the sandbox.
  for (const f of ['blog-factory.lock', 'blog-factory.transaction.json', 'blog-factory.checkpoint.json']) {
    rmSync(join(dir, 'docs/state', f), { force: true });
  }
}

/** Run a repo tool from the sandbox copy (all writes land in the sandbox). */
export function run(dir, tool, args, expectFail = false) {
  try {
    return execFileSync('node', [join(dir, 'tools', tool), ...args], { encoding: 'utf8' });
  } catch (e) {
    if (expectFail) return { fail: true, msg: String(e), out: `${e.stdout ?? ''}` };
    throw e;
  }
}

export const factory = (dir, args, expectFail) => run(dir, 'blog-factory.mjs', args, expectFail);
export const qaCli = (dir, args, expectFail) => run(dir, 'article-qa.mjs', args, expectFail);
export const selectCli = (dir, args, expectFail) => run(dir, 'factory-select.mjs', args, expectFail);

export const readMatrix = (dir) =>
  readFileSync(join(dir, 'data/blog/content-matrix.csv'), 'utf8').trim().split('\n');

export function matrixRow(dir, id) {
  const lines = readMatrix(dir);
  const header = lines[0].split(',');
  const line = lines.find((l) => l.startsWith(id + ','));
  const cells = line.split(',');
  const row = {};
  header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
  return row;
}

export function setStatus(dir, id, status) {
  const lines = readMatrix(dir);
  const out = lines.map((l) => (l.startsWith(id + ',')
    ? l.split(',').map((c, i) => (i === 3 ? status : c)).join(',')
    : l));
  writeFileSync(join(dir, 'data/blog/content-matrix.csv'), out.join('\n') + '\n');
}

export const readJson = (dir, p) => JSON.parse(readFileSync(join(dir, p), 'utf8'));
export const writeJson = (dir, p, value) =>
  writeFileSync(join(dir, p), JSON.stringify(value, null, 2) + '\n');

/** Manifest articles whose matrix row is PUBLISHED. In-flight drafts
 *  (QA/PASS/REVIEW rows committed by a writer cycle) are not built yet
 *  and must never be page-audited — only the factory workflow builds them. */
export function publishedManifestArticles(dir) {
  const ids = new Set(readMatrix(dir).slice(1)
    .filter((l) => l.split(',')[3] === 'PUBLISHED')
    .map((l) => l.split(',')[0]));
  return readJson(dir, 'data/blog/published.json').articles.filter((a) => ids.has(a.article_id));
}

/** Manifest entries whose matrix row is NOT PUBLISHED (in-flight drafts). */
export function draftManifestArticles(dir) {
  const published = new Set(publishedManifestArticles(dir).map((a) => a.article_id));
  return readJson(dir, 'data/blog/published.json').articles.filter((a) => !published.has(a.article_id));
}

/** First PLANNED row of a category (matrix order) — full parsed row. */
export function firstPlanned(dir, category) {
  const lines = readMatrix(dir);
  const header = lines[0].split(',');
  for (const l of lines.slice(1)) {
    const cells = l.split(',');
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    if (row.status === 'PLANNED' && (!category || row.category === category)) return row;
  }
  return null;
}

/**
 * Deterministic fixture body, inside the 1.500–4.000-word range
 * (docs/ARTICLE-RULES.md: length follows search intent).
 * Paragraphs are indexed so no duplicate-paragraph/sentence check trips.
 * Contains only verified facts via {{ business.* }} placeholders.
 * `tag` prefixes every block so TWO fixture articles in one sandbox chunk
 * stay unique for the no-cross-article-duplicate QA gate (default: none,
 * keeping the historical single-article output byte-identical).
 */
export function fixtureBody({ paragraphs = 16, tag = '' } = {}) {
  const aspects = ['chi phí', 'loại xe', 'thủ tục', 'thời gian', 'nhiên liệu',
    'tuyến đường', 'an toàn', 'bảo quản', 'khởi động', 'lưu giữ xe'];
  // Tag EVERY sentence (not just the paragraph): the anti-duplicate
  // fingerprints are sentence-level, so two tagged fixture articles in one
  // chunk stay fully distinct.
  const T = (s) => (tag ? `${tag} ${s}` : s);
  const out = [];
  out.push(`<h2>${T('Tổng quan chi phí thuê xe')}</h2>`);
  out.push(`<p>${T('Bài này giúp bạn ước tính chi phí thuê trước khi liên hệ.')} ${T('Giờ mở cửa là {{ business.hours.display }} và số điện thoại đã xác minh là {{ business.contact.phone_display }}.')}</p>`);
  out.push(`<ul><li>${T('So sánh giá theo ngày, tuần và tháng')}</li><li>${T('Kiểm tra tình trạng xe trước khi nhận')}</li><li>${T('Xác nhận khoản phát sinh nếu trả xe trễ')}</li></ul>`);
  let n = 0;
  for (let p = 0; p < paragraphs; p++) {
    const a = aspects[p % aspects.length];
    n++;
    const s = (k) => `Lưu ý số ${n}.${k} về ${a}: khách nên kiểm tra kỹ trước khi quyết định thuê.`;
    // Every QA fingerprint segment (text between ". " boundaries) starts with
    // the tag, so tagged fixture articles share no paragraph/sentence keys.
    out.push(`<p>${[
      s(1), `Mẹo ${n}a: giá thuê thay đổi theo mùa và theo loại xe nên bạn cần hỏi giá trực tiếp.`,
      s(2), `Mẹo ${n}b: với hành trình ngắn trong nội thành, chi phí thường thấp hơn so với hành trình dài.`,
      s(3), `Mẹo ${n}c: bạn nên chụp ảnh tình trạng xe để tránh tranh chấp khi trả xe.`,
    ].map(T).join(' ')}</p>`);
  }
  out.push(`<h2>${T('Tiền cọc và các khoản cần xác nhận')}</h2>`);
  out.push(`<p>${T('Tiền cọc dao động từ 2.000.000đ đến 5.000.000đ tùy loại xe và mức cọc chính xác được xác nhận khi đặt xe.')} ${T('Bạn nên mang theo giấy tờ tùy thân và bằng lái phù hợp với dung tích xe.')}</p>`);
  out.push(`<p>${T('Bài viết này thuộc')} <a href="/aichatbot/blog/">cẩm nang thuê xe</a>, ${T('bạn có thể xem thêm trong')} <a href="/aichatbot/blog/thue-xe/">danh mục thuê xe</a> ${T('hoặc hỏi trực tiếp trên')} <a href="/aichatbot/">Agent</a> ${T('để tính chi phí cho hành trình cụ thể.')}</p>`);
  return out.join('\n');
}

/**
 * Count visible words EXACTLY like tools/article-qa.mjs: resolve business
 * facts first, then strip tags/entities (same pipeline as tools/seo-score.mjs
 * `text()`), then split on whitespace. No HTML tag, schema or navigation
 * text is ever counted.
 */
export function countWords(dir, html) {
  const business = readJson(dir, 'data/business/business.json');
  const resolved = html.replace(/\{\{\s*business\.([a-z0-9_.]+)(?:\s*\|\s*(\w+))?\s*\}\}/gi,
    (_, path) => {
      const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), business);
      if (v === undefined) throw new Error(`unresolved business fact: business.${path}`);
      return typeof v === 'number' ? v.toLocaleString('vi-VN') + 'đ' : String(v);
    });
  const visible = String(resolved)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return visible ? visible.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * Fixture body with an EXACT visible word count — used by the length-gate
 * boundary tests (1.499 FAIL / 1.500 / 2.500 / 4.000 PASS / >4.000 REVIEW).
 * Builds on fixtureBody({paragraphs:1}) and appends UNIQUE one-sentence
 * paragraphs (no duplicate sentences, no filler markers, no truncation)
 * until the target lands precisely.
 */
export function fixtureBodyExact(dir, target) {
  const aspects = ['chi phí', 'loại xe', 'thủ tục', 'thời gian', 'nhiên liệu',
    'tuyến đường', 'an toàn', 'bảo quản', 'khởi động', 'lưu giữ xe'];
  let body = fixtureBody({ paragraphs: 1 });
  let n = 0;
  while (countWords(dir, body) < target) {
    const remaining = target - countWords(dir, body);
    n++;
    const a = aspects[n % aspects.length];
    const full = `Đoạn đệm số ${n} về ${a}: khách nên so sánh giá thuê theo ngày tuần tháng và hỏi trước các khoản phát sinh để chủ động ngân sách.`;
    if (full.split(/\s+/).filter(Boolean).length <= remaining) {
      body += `\n<p>${full}</p>`;
      continue;
    }
    // Exact-fit tail paragraph made of unique 1-word tokens.
    const parts = remaining === 1 ? [`đệm-${n}`]
      : remaining === 2 ? ['Đoạn', `đệm-${n}`]
        : ['Đoạn', `đệm-${n}`, ...Array.from({ length: remaining - 2 }, (_, k) => `đệm-${n}-${k}`)];
    body += `\n<p>${parts.join(' ')}.</p>`;
  }
  return body;
}

/** Manifest draft entry for a fixture article (published.json). */
export function fixtureEntry(row, { title, description, date = '2026-09-30' } = {}) {
  return {
    article_id: row.article_id,
    category: row.category,
    slug: row.slug,
    title,
    description,
    published_date: date,
    author: 'MotoAI Editorial',
    pilot: false,
    body: `data/blog/articles/${row.slug}.body.html`,
    knowledge_chunks: row.agent_retrieval === 'yes'
      ? ['Đoạn kiểm tra dùng cho unit test của vòng sản xuất một bài mỗi lượt, mô tả cách ước tính chi phí thuê xe máy và các khoản cần xác nhận trước khi nhận xe.']
      : []
  };
}

/** Install a full fixture article in a sandbox: body + manifest + status.
 *  Targets `rowId` when given (e.g. the row claimed earlier in a cycle),
 *  otherwise the first PLANNED row of the category. */
export function installFixture(dir, { category, rowId, title, description, body, status = 'QA' }) {
  const lines = readMatrix(dir);
  const header = lines[0].split(',');
  let row = null;
  for (const l of lines.slice(1)) {
    const cells = l.split(',');
    const r = {};
    header.forEach((h, i) => { r[h] = cells[i] ?? ''; });
    if (rowId && r.article_id === rowId) { row = r; break; }
    if (!rowId && r.status === 'PLANNED' && (!category || r.category === category)) { row = r; break; }
  }
  if (!row) throw new Error(`fixture row not found (rowId=${rowId ?? ''} category=${category ?? ''})`);
  const entry = fixtureEntry(row, { title, description });
  writeFileSync(join(dir, 'data/blog/articles', `${row.slug}.body.html`), body);
  const manifest = readJson(dir, 'data/blog/published.json');
  manifest.articles.push(entry);
  writeJson(dir, 'data/blog/published.json', manifest);
  setStatus(dir, row.article_id, status);
  return row.article_id;
}
