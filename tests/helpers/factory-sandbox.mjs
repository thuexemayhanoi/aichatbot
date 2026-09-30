import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
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
 */

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function repoSandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'motoai-factory-'));
  cpSync(REPO, dir, { recursive: true, filter: (src) => !src.includes('/.git') });
  return dir;
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
 * Deterministic fixture body, 1.600–2.000 words (docs/ARTICLE-RULES.md).
 * Paragraphs are indexed so no duplicate-paragraph/sentence check trips.
 * Contains only verified facts via {{ business.* }} placeholders.
 */
export function fixtureBody({ paragraphs = 16 } = {}) {
  const aspects = ['chi phí', 'loại xe', 'thủ tục', 'thời gian', 'nhiên liệu',
    'tuyến đường', 'an toàn', 'bảo quản', 'khởi động', 'lưu giữ xe'];
  const out = [];
  out.push('<h2>Tổng quan chi phí thuê xe</h2>');
  out.push('<p>Bài này giúp bạn ước tính chi phí thuê trước khi liên hệ. Giờ mở cửa là {{ business.hours.display }} và số điện thoại đã xác minh là {{ business.contact.phone_display }}.</p>');
  out.push('<ul><li>So sánh giá theo ngày, tuần và tháng</li><li>Kiểm tra tình trạng xe trước khi nhận</li><li>Xác nhận khoản phát sinh nếu trả xe trễ</li></ul>');
  let n = 0;
  for (let p = 0; p < paragraphs; p++) {
    const a = aspects[p % aspects.length];
    n++;
    const s = (k) => `Lưu ý số ${n}.${k} về ${a}: khách nên kiểm tra kỹ trước khi quyết định thuê.`;
    out.push(`<p>${s(1)} Mẹo ${n}a: giá thuê thay đổi theo mùa và theo loại xe nên bạn cần hỏi giá trực tiếp. ${s(2)} Mẹo ${n}b: với hành trình ngắn trong nội thành, chi phí thường thấp hơn so với hành trình dài. ${s(3)} Mẹo ${n}c: bạn nên chụp ảnh tình trạng xe để tránh tranh chấp khi trả xe.</p>`);
  }
  out.push('<h2>Tiền cọc và các khoản cần xác nhận</h2>');
  out.push('<p>Tiền cọc dao động từ 2.000.000đ đến 5.000.000đ tùy loại xe và mức cọc chính xác được xác nhận khi đặt xe. Bạn nên mang theo giấy tờ tùy thân và bằng lái phù hợp với dung tích xe.</p>');
  out.push('<p>Bài viết này thuộc <a href="/aichatbot/blog/">cẩm nang thuê xe</a>, bạn có thể xem thêm trong <a href="/aichatbot/blog/thue-xe/">danh mục thuê xe</a> hoặc hỏi trực tiếp trên <a href="/aichatbot/">Agent</a> để tính chi phí cho hành trình cụ thể.</p>');
  return out.join('\n');
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
