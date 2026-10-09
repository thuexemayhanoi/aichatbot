import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractJson, countWords, splitLinks, validateCandidate, buildPrompt, chooseChunk,
  SYSTEM_PROMPT, buildCtx, sourceFactErrors,
} from '../../tools/auto-writer.mjs';

test('verified speed sources reject actual small-model contradictions without rejecting correct conditional limits', () => {
  const facts = buildCtx({ article_id: 'BA-0305', category: 'SAFE', source_policy: 'legal-gate', agent_retrieval: 'no' }).topicFacts;
  for (const statement of [
    'Trong khu đông dân cư, tốc độ cho phép trong phố không áp dụng cho du khách.',
    'Các mức tốc độ này được áp dụng trong mọi điều kiện.',
    'Theo điều 3, xe mô tô được tốc độ tối đa 60 km/h.',
  ]) assert.ok(sourceFactErrors(statement, facts).length > 0);
  assert.deepEqual(sourceFactErrors('Theo Điều 6, khi không có biển tốc độ riêng, xe mô tô được tối đa 60 km/h trên đường đôi trong khu đông dân cư; du khách cũng phải tuân thủ quy định.', facts), []);
});

/**
 * v71 AUTO WRITER contract tests (docs/AUTO-WRITER.md).
 *
 * Pure-function coverage only — no network, no model API, no repo mutation:
 *   - extractJson: fenced/chatty/trailing-garbage model output;
 *   - countWords / splitLinks: QA heuristics;
 *   - validateCandidate: the writer guardrails (stray CJK/Cyrillic, <h1>,
 *     lists, hub-only internal links, legal-gate gov.vn/vbpl.vn link,
 *     knowledge_chunks policy, literal deposit amounts, phone-like digits);
 *   - chooseChunk: FIFO — the lowest-seq RESERVED chunk of the ACTIVE batch;
 *   - buildPrompt: the prompt carries the row contract (slug, hub policy,
 *     chunk policy) and the previous QA feedback on retry.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------
// extractJson
// ---------------------------------------------------------------------------

test('extractJson parses a clean JSON object', () => {
  const o = extractJson('{"title":"Quy trinh thue xe","body_html":"<p>x</p>"}');
  assert.equal(o.title, 'Quy trinh thue xe');
});

test('extractJson strips code fences and chatter', () => {
  const o = extractJson('Sure! Here is the article:\n```json\n{"title":"T"}\n```\nHope that helps.');
  assert.equal(o.title, 'T');
});

test('extractJson repairs trailing content after the object', () => {
  const o = extractJson('{"title":"T"} extra trailing words that are not json');
  assert.equal(o.title, 'T');
});

test('extractJson returns null for non-JSON text', () => {
  assert.equal(extractJson('no object here at all'), null);
  assert.equal(extractJson(''), null);
  assert.equal(extractJson(null), null);
});

// ---------------------------------------------------------------------------
// countWords / splitLinks
// ---------------------------------------------------------------------------

test('countWords counts Vietnamese tokens on tag-stripped text', () => {
  assert.equal(countWords('<p>Thuê xe máy ở Hà Nội</p>'), 6);
  assert.equal(countWords('<h2>Tổng kết</h2>\n<ul><li>một</li><li>hai</li></ul>'), 4);
});

test('splitLinks separates root-relative internal from absolute external hrefs', () => {
  const body = '<p><a href="/blog/app/dat-xe-bang-ung-dung/">app</a> và <a href="/">chủ</a> và <a href="https://vbpl.vn/x">luật</a></p>';
  const { internal, external } = splitLinks(body);
  assert.deepEqual(internal, ['/blog/app/dat-xe-bang-ung-dung/', '/']);
  assert.deepEqual(external, ['https://vbpl.vn/x']);
});

// ---------------------------------------------------------------------------
// validateCandidate — happy path and every guardrail
// ---------------------------------------------------------------------------

function longBody({ stray = '', extra = '', links = '' } = {}) {
  // ~1500 Vietnamese tokens, no digits, no deposit amounts, no markdown.
  const para = 'Thuê xe máy ở Hà Nội trở nên thuận tiện khi bạn nắm rõ quy trình đặt xe, nhận xe và trả xe đúng hiện trạng. ';
  const words = Array.from({ length: 64 }, () => para).join('');
  return `<p>Dẫn nhập về chủ đề thuê xe máy cho người mới. ${links}</p>` +
    '<h2>Quy trình đặt xe</h2><ul><li>Chọn mẫu xe phù hợp</li><li>Chuẩn bị giấy tờ</li><li>Xác nhận thời gian nhận xe</li></ul>' +
    `<p>${words}</p>` +
    '<h2>Kinh nghiệm khi đi xe</h2><p>Đi xe cẩn thận, kiểm tra xăng và lốp trước mỗi chuyến đi dài.</p>' +
    `<p>${extra}${stray}</p>` +
    '<h2>Tổng kết</h2><p>Bạn có thể mở chat để hỏi giá và đặt xe ngay hôm nay.</p>';
}

const ROW = { article_id: 'BA-9001', category: 'APP', slug: 'quy-trinh-thue-xe' };
const CTX = {
  allowedHubPrefixes: ['/blog/app/'],
  needsLegalLink: false,
  needsChunks: true,
};
const CAND = (over = {}) => ({
  title: 'Quy trình thuê xe máy онлайн đơn giản',
  description: 'Hướng dẫn quy trình thuê xe máy online tại Hà Nội: chọn xe, đặt cọc, nhận xe và trả xe đúng hiện trạng.',
  knowledge_chunks: ['Đoạn kiến thức một tổng kết quy trình đặt xe và nhận xe cho khách thuê xe máy tại Hà Nội.'.repeat(2),
    'Đoạn kiến thức hai tổng kết lưu ý khi trả xe và kiểm tra hiện trạng xe trước khi nhận xe tại cửa hàng.'.repeat(2)],
  body_html: longBody({ links: '<a href="/blog/app/dat-xe-bang-ung-dung/">xem hướng dẫn đặt xe</a>' }),
  ...over,
});

test('validateCandidate accepts a compliant candidate', () => {
  assert.deepEqual(validateCandidate(ROW, CAND(), CTX), []);
});

test('validateCandidate rejects bad title/description lengths', () => {
  const errs = validateCandidate(ROW, CAND({ title: 'ng', description: 'short' }), CTX);
  assert.ok(errs.some((e) => e.includes('title must be 10-70 chars')));
  assert.ok(errs.some((e) => e.includes('description must be 50-165 chars')));
});

test('validateCandidate rejects stray CJK and Cyrillic characters', () => {
  const errs = validateCandidate(ROW, CAND({ body_html: longBody({ stray: '应该 chọn xe' }) }), CTX);
  assert.ok(errs.some((e) => e.includes('stray CJK')));
  const errs2 = validateCandidate(ROW, CAND({ body_html: longBody({ stray: 'изб chọn xe' }) }), CTX);
  assert.ok(errs2.some((e) => e.includes('stray CJK')));
});

test('validateCandidate rejects <h1>, missing <h2>, missing list, markdown links', () => {
  const withH1 = CAND({ body_html: longBody().replace('<h2>Quy trình', '<h1>Quy trình').replace('<h2>Kinh nghiệm', '<h2>Kinh nghiệm').replace('<h2>Tổng kết</h2>', '<h2>Tổng kết</h2>') + '<h1>extra</h1>' });
  const errs1 = validateCandidate(ROW, withH1, CTX);
  assert.ok(errs1.some((e) => e.includes('must not contain <h1>')));

  const noList = CAND({ body_html: longBody().replace(/<ul>.*?<\/ul>/s, '') });
  const errs2 = validateCandidate(ROW, noList, CTX);
  assert.ok(errs2.some((e) => e.includes('needs at least one <ul>/<ol> list')));

  const md = CAND({ body_html: longBody() + '<p>xem [hướng dẫn](https://example.com)</p>' });
  const errs3 = validateCandidate(ROW, md, CTX);
  assert.ok(errs3.some((e) => e.includes('markdown links are not allowed')));
});

test('validateCandidate rejects internal links outside the hub and non-legal external links', () => {
  const errs = validateCandidate(ROW, CAND({ body_html: longBody({ links: '<a href="/blog/an-toan/mu-bao-hiem-chuan/">sai hub</a> <a href="https://example.com/x">ngoài</a>' }) }), CTX);
  assert.ok(errs.some((e) => e.includes("outside the row's hub")));
  assert.ok(errs.some((e) => e.includes('external link not allowed')));
});

test('validateCandidate enforces the legal-gate gov.vn/vbpl.vn link', () => {
  const ctx = { ...CTX, needsLegalLink: true };
  const missing = validateCandidate(ROW, CAND(), ctx);
  assert.ok(missing.some((e) => e.includes('legal-gate row')));
  const ok = validateCandidate(ROW, CAND({ body_html: longBody({ links: '<a href="https://vbpl.vn/van-ban-luat">thông tư</a>' }) }), ctx);
  assert.ok(!ok.some((e) => e.includes('legal-gate row')), `expected no legal-gate error, got ${ok}`);
});

test('validateCandidate enforces the knowledge_chunks policy', () => {
  const errsEmpty = validateCandidate(ROW, CAND({ knowledge_chunks: [] }), CTX);
  assert.ok(errsEmpty.some((e) => e.includes('exactly 2 chunks required')));
  const errsLong = validateCandidate(ROW, CAND({ knowledge_chunks: ['a'.repeat(800), 'b'.repeat(100)] }), CTX);
  assert.ok(errsLong.some((e) => e.includes('must be < 800 chars')));
  const noChunksCtx = { ...CTX, needsChunks: false };
  const errsForbidden = validateCandidate(ROW, CAND(), noChunksCtx);
  assert.ok(errsForbidden.some((e) => e.includes('must be empty for agent_retrieval=no')));
});

test('validateCandidate rejects literal deposit amounts and phone-like numbers', () => {
  const deposit = validateCandidate(ROW, CAND({ body_html: longBody({ extra: 'Tiền cọc là 1000000 đ cho mỗi chiếc xe. ' }) }), CTX);
  assert.ok(deposit.some((e) => e.includes('deposit sentence with a literal amount')));
  const phone = validateCandidate(ROW, CAND({ body_html: longBody({ extra: 'Gọi 0987654321 để đặt xe. ' }) }), CTX);
  assert.ok(phone.some((e) => e.includes('phone-like number')));
});

test('validateCandidate allows only whitelisted placeholders', () => {
  const errs = validateCandidate(ROW, CAND({ body_html: longBody({ extra: '{{ business.policies.deposit.min | vnd }} ' }) }), CTX);
  assert.deepEqual(errs, []);
  const bad = validateCandidate(ROW, CAND({ body_html: longBody({ extra: '{{ business.prices.vision | vnd }} ' }) }), CTX);
  assert.ok(bad.some((e) => e.includes('unknown placeholder')));
});

// ---------------------------------------------------------------------------
// chooseChunk — FIFO across writers
// ---------------------------------------------------------------------------

const ASSIGN = (chunks, status = 'ACTIVE') => ({
  active: {
    batch_id: 'WRITER-BATCH-0099', status,
    chunks: chunks.map(([seq, writer, st]) => ({ seq, writer, status: st, ids: [`BA-9${seq}01`, `BA-9${seq}02`] })),
  },
});

test('chooseChunk returns the lowest-seq RESERVED chunk of the ACTIVE batch', () => {
  const a = ASSIGN([[1, 'writer_A', 'PUBLISHED'], [2, 'writer_B', 'PUBLISHED'], [4, 'writer_A', 'RESERVED'], [3, 'writer_C', 'RESERVED']]);
  const { batch, chunk } = chooseChunk(a);
  assert.equal(batch.batch_id, 'WRITER-BATCH-0099');
  assert.equal(chunk.seq, 3);
  assert.equal(chunk.writer, 'writer_C');
});

test('chooseChunk returns null when the batch is not ACTIVE or all chunks are terminal', () => {
  assert.equal(chooseChunk(ASSIGN([[1, 'writer_A', 'RESERVED']], 'COMPLETED')).chunk, null);
  assert.equal(chooseChunk(ASSIGN([[1, 'writer_A', 'PUBLISHED'], [2, 'writer_B', 'FAILED']])).chunk, null);
  assert.equal(chooseChunk(null).batch, null);
});

// ---------------------------------------------------------------------------
// buildPrompt — the row contract reaches the model
// ---------------------------------------------------------------------------

const PROMPT_ROW = {
  article_id: 'BA-9001',
  primary_keyword: 'quy trình thuê xe máy',
  secondary_keywords: 'thuê xe Hà Nội, đặt xe online',
  search_intent: 'informational',
  working_title: 'Quy trình thuê xe máy online',
  slug: 'quy-trinh-thue-xe',
  category: 'GUIDE',
  parent_hub: 'huong-dan',
};
const PROMPT_CTX = {
  systemPrompt: SYSTEM_PROMPT,
  allowedHubPrefixes: ['/blog/huong-dan/'],
  hubSlugs: ['/blog/huong-dan/thu-tuc-thue-xe-may/'],
  exampleTitles: ['Thủ tục thuê xe máy đơn giản'],
  needsLegalLink: false,
  legalLinks: [],
  needsChunks: true,
};

test('buildPrompt carries slug, hub policy and chunk policy', () => {
  const { system, user } = buildPrompt(PROMPT_ROW, PROMPT_CTX);
  assert.equal(system, SYSTEM_PROMPT);
  for (const needle of ['BA-9001', 'quy-trinh-thue-xe', 'thu-tuc-thue-xe-may', 'knowledge_chunks: đúng 2 đoạn']) {
    assert.ok(user.includes(needle), `prompt must mention: ${needle}`);
  }
  assert.ok(user.includes('KHÔNG dùng bất kỳ liên kết ngoài nào'));
});

test('buildPrompt switches to legal-gate mode and injects QA feedback on retry', () => {
  const legal = buildPrompt(PROMPT_ROW, { ...PROMPT_CTX, needsLegalLink: true, legalLinks: ['https://vbpl.vn/tt-29-2015'] }, 'WARN: description too short');
  assert.ok(legal.user.includes('legal-gate'));
  assert.ok(legal.user.includes('https://vbpl.vn/tt-29-2015'));
  assert.ok(legal.user.includes('description too short'), 'previous QA feedback must reach the model');
});

test('current recovery articles use verified subject-specific facts and preserve source policies', () => {
  const legal = { ...PROMPT_ROW, article_id: 'BA-0305', category: 'SAFE', source_policy: 'legal-gate', agent_retrieval: 'no' };
  const ctx = buildCtx(legal, []);
  const prompt = buildPrompt(legal, ctx).user;
  assert.match(prompt, /xe gắn máy tối đa 40 km\/h/);
  assert.match(prompt, /38-bgtvt\.pdf/);
  const local = { ...PROMPT_ROW, article_id: 'BA-0306', category: 'LOCAL', local_scope: 'Mai Châu; bản Lác', source_policy: 'no-external', agent_retrieval: 'yes' };
  const localPrompt = buildPrompt(local, buildCtx(local, [])).user;
  assert.match(localPrompt, /Tên địa danh đúng là Mai Châu/);
  assert.match(localPrompt, /KHÔNG dùng bất kỳ liên kết ngoài nào/);
  assert.equal(buildCtx(local, []).legalLinks.length, 0);
});
