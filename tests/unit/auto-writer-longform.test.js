import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleArticle, generateLongform, outlineError, outlineSchema, htmlWords } from '../../tools/auto-writer-longform.mjs';

// Counting/protocol fixtures only. Production QA and publication are never invoked.
const prose = (n) => `<p>${Array.from({ length: n }, (_, i) => `từ${i}`).join(' ')}</p>`;
const outline = () => ({ title: 'Hành trình Mai Châu cho khách thuê xe',
  description: 'Chuẩn bị hành trình Mai Châu với những lưu ý phù hợp cho khách thuê xe máy từ Hà Nội.',
  knowledge_chunks: [], intro_html: prose(80), conclusion_html: prose(80),
  sections: Array.from({ length: 7 }, (_, i) => ({ heading: `Góc cụ thể ${i}`, brief: `Phân tích chủ đề thứ ${i}` })) });

test('assembly requires all seven real sections and enforces the full word range', () => {
  const article = assembleArticle(outline(), Array.from({ length: 7 }, () => prose(240)));
  assert.ok(htmlWords(article.body_html) >= 1600 && htmlWords(article.body_html) <= 2200);
  assert.equal((article.body_html.match(/<h2>/g) ?? []).length, 8);
  assert.throws(() => assembleArticle(outline(), [prose(240)]), /incomplete/);
  assert.throws(() => assembleArticle(outline(), Array.from({ length: 7 }, () => prose(120))), /section rejected/);
});

test('outline rejects missing chunks, duplicate coverage and invalid language', () => {
  assert.equal(outlineError(outline(), false), '');
  assert.match(outlineError(outline(), true), /knowledge_chunks/);
  const duplicate = outline(); duplicate.sections[1].heading = duplicate.sections[0].heading;
  assert.match(outlineError(duplicate, false), /distinct/);
  const stray = outline(); stray.title += ' 中文';
  assert.match(outlineError(stray, false), /Vietnamese/);
  const filler = outline(); filler.sections[0].heading = 'Tổng kết và lời mời mở chat';
  assert.match(outlineError(filler, false), /substantive/);
});

test('the inference grammar fixes SAFE retrieval metadata to an empty array and retrieval rows to exactly two', () => {
  for (const needsChunks of [false, true]) {
    const chunks = outlineSchema(needsChunks).properties.knowledge_chunks;
    assert.equal(chunks.minItems, needsChunks ? 2 : 0);
    assert.equal(chunks.maxItems, needsChunks ? 2 : 0);
  }
});

test('section generation uses bounded calls, a schema and a smaller context, without article padding', async () => {
  const requests = [];
  const infer = async (_model, messages, config) => {
    requests.push({ messages, config });
    return { content: JSON.stringify(requests.length === 1 ? outline() : { body_html: prose(240) }) };
  };
  const article = await generateLongform({ model: 'local', system: '4. Tiếng Việt.\n5. Không bịa dữ liệu.', user: 'Chủ đề cụ thể', needsChunks: false, config: {} }, infer);
  assert.equal(requests.length, 8);
  assert.ok(requests.every((r) => r.config.numCtx === 4096 && r.config.responseFormat.type === 'object'));
  assert.ok(htmlWords(article.body_html) >= 1600);
});

test('short prose and inference failures cannot be accepted or retried forever', async () => {
  let calls = 0;
  const infer = async () => ({ content: JSON.stringify(++calls === 1 ? outline() : { body_html: prose(90) }) });
  await assert.rejects(() => generateLongform({ model: 'local', system: '', user: '', needsChunks: false, config: {} }, infer), /two bounded attempts/);
  assert.equal(calls, 3);
  await assert.rejects(() => generateLongform({ model: 'local', system: '', user: '', needsChunks: false, config: {} },
    async () => ({ error: true, status: 0, text: 'stream ended without done' })), /stream ended without done/);
});
