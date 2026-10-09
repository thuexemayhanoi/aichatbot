import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleArticle, generateLongform, outlineError, outlineSchema, htmlWords } from '../../tools/auto-writer-longform.mjs';

// Counting/protocol fixtures only. Production QA and publication are never invoked.
const prose = (n) => `<p>${Array.from({ length: n }, (_, i) => `từ${i}`).join(' ')}</p>`;
const listed = (n) => `<ul><li>${Array.from({ length: n }, (_, i) => `từ${i}`).join(' ')}</li></ul>`;
const parts = (n) => Array.from({ length: 5 }, (_, i) => i === 3 ? listed(n) : prose(n));
const outline = () => ({ title: 'Hành trình Mai Châu cho khách thuê xe',
  description: 'Chuẩn bị hành trình Mai Châu với những lưu ý phù hợp cho khách thuê xe máy từ Hà Nội.',
  knowledge_chunks: [], intro_html: prose(80), conclusion_html: prose(80),
  sections: Array.from({ length: 5 }, (_, i) => ({ heading: `Góc cụ thể ${i}`, brief: `Phân tích chủ đề thứ ${i}` })) });

test('assembly requires all five real sections and preserves the full 1600-2200 word range', () => {
  const article = assembleArticle(outline(), parts(330));
  assert.ok(htmlWords(article.body_html) >= 1600 && htmlWords(article.body_html) <= 2200);
  assert.equal((article.body_html.match(/<h2>/g) ?? []).length, 6);
  assert.throws(() => assembleArticle(outline(), [prose(330)]), /incomplete/);
  assert.throws(() => assembleArticle(outline(), parts(299)), /section rejected/);
  assert.throws(() => assembleArticle(outline(), parts(371)), /section rejected/);
  const oversized = outline(); oversized.intro_html = prose(400);
  assert.throws(() => assembleArticle(oversized, parts(370)), /outside 1600-2200/);
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
  const internal = outline(); internal.sections[0].heading = 'Các điều kiện pháp lý chưa được cung cấp';
  assert.match(outlineError(internal, false), /reader question/);
  const leaked = outline(); leaked.intro_html = prose(80).replace('từ0', 'nguồn đề bài');
  assert.match(outlineError(leaked, false), /internal writing instructions/);
});

test('the inference grammar fixes SAFE retrieval metadata to an empty array and retrieval rows to exactly two', () => {
  for (const needsChunks of [false, true]) {
    const chunks = outlineSchema(needsChunks).properties.knowledge_chunks;
    assert.equal(chunks.minItems, needsChunks ? 2 : 0);
    assert.equal(chunks.maxItems, needsChunks ? 2 : 0);
    assert.equal(outlineSchema(needsChunks).properties.description.maxLength, 165);
    assert.equal(outlineSchema(needsChunks).properties.description.minLength, 50);
    assert.equal(outlineSchema(needsChunks).properties.title.maxLength, 70);
  }
});

test('section generation uses bounded calls, a schema and a smaller context, without article padding', async () => {
  const requests = [];
  const infer = async (_model, messages, config) => {
    requests.push({ messages, config });
    return { content: JSON.stringify(requests.length === 1 ? outline() : { body_html: requests.length === 5 ? listed(330) : prose(330) }) };
  };
  const article = await generateLongform({ model: 'local', system: '4. Tiếng Việt.\n5. Không bịa dữ liệu.', user: 'Chủ đề cụ thể', needsChunks: false, config: {} }, infer);
  assert.equal(requests.length, 6);
  assert.ok(requests.every((r) => r.config.numCtx === 4096 && r.config.responseFormat.type === 'object'));
  assert.ok(htmlWords(article.body_html) >= 1600);
});

test('an oversized real component is shortened on retry without accepting or truncating it', async () => {
  const requests = [];
  const infer = async (_model, messages) => {
    requests.push(messages);
    return { content: JSON.stringify(requests.length === 1 ? outline() : { body_html: requests.length === 6 ? listed(330) : prose(requests.length === 2 ? 420 : 330) }) };
  };
  const article = await generateLongform({ model: 'local', system: '', user: '', needsChunks: false, config: {} }, infer);
  assert.equal(requests.length, 7);
  assert.match(requests[2][1].content, /Rút gọn phần này/);
  assert.match(requests[2][0].content, /khoảng 199 từ/);
  assert.ok(!article.body_html.includes('từ419'), 'the refused component is regenerated rather than sliced');
  assert.ok(htmlWords(article.body_html) >= 1600 && htmlWords(article.body_html) <= 2200);
});

test('short prose and inference failures cannot be accepted or retried forever', async () => {
  let calls = 0;
  const infer = async () => ({ content: JSON.stringify(++calls === 1 ? outline() : { body_html: prose(90) }) });
  await assert.rejects(() => generateLongform({ model: 'local', system: '', user: '', needsChunks: false, config: {} }, infer), /two bounded attempts/);
  assert.equal(calls, 3);
  await assert.rejects(() => generateLongform({ model: 'local', system: '', user: '', needsChunks: false, config: {} },
    async () => ({ error: true, status: 0, text: 'stream ended without done' })), /stream ended without done/);
});

test('a real-sized fourth section without the required action list is regenerated before whole-article QA', async () => {
  const requests = [];
  const infer = async (_model, messages) => {
    requests.push(messages);
    return { content: JSON.stringify(requests.length === 1 ? outline() : {
      body_html: requests.length === 6 ? listed(314) : prose(322),
    }) };
  };
  const article = await generateLongform({ model: 'local', system: '', user: '', needsChunks: false, config: {} }, infer);
  assert.equal(requests.length, 7);
  assert.match(requests[5][1].content, /PHẢI có danh sách HTML/);
  assert.ok(article.body_html.includes('<ul><li>'));
  assert.throws(() => assembleArticle(outline(), Array.from({ length: 5 }, () => prose(330))), /thiếu danh sách/);
});
