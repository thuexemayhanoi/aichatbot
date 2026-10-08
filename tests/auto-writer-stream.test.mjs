import test from 'node:test';
import assert from 'node:assert/strict';
import { callModel, modelConfig } from '../tools/auto-writer-model.mjs';

const framesToFetch = (frames, splitIndex = 0) => async (_url, init) => {
  const payload = JSON.parse(init.body);
  assert.equal(payload.stream, true, 'Ollama must stream to avoid undici 300s headers timeout');
  assert.equal(payload.options.num_ctx, 8192);
  const bytes = new TextEncoder().encode(frames.join(''));
  const chunks = splitIndex ? [bytes.slice(0, splitIndex), bytes.slice(splitIndex)] : [bytes];
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
};

test('streamed Ollama frames rebuild the entire Vietnamese JSON answer', async () => {
  const text = '{"title":"Thuê xe máy","body_html":"<p>Hà Nội</p>"}';
  const frames = [
    JSON.stringify({message:{content:text.slice(0,20)},done:false})+'\n',
    JSON.stringify({message:{content:text.slice(20)},done:false})+'\n',
    JSON.stringify({message:{content:''},done:true,done_reason:'stop'})+'\n',
  ];
  const r = await callModel('qwen3:4b-instruct', [{role:'user',content:'test'}],
    { ...modelConfig(), timeoutMs:10000 }, framesToFetch(frames, 13));
  assert.deepEqual(r, {content:text});
});

test('stream ending without final done marker is rejected', async () => {
  const r = await callModel('test', [{role:'user',content:'test'}],
    { ...modelConfig(), timeoutMs:10000 },
    framesToFetch([JSON.stringify({message:{content:'{"ok":true}'},done:false})+'\n']));
  assert.equal(r.error, true);
  assert.match(r.text, /without done=true/);
});

test('Ollama error frame is returned as failure, not an article', async () => {
  const r = await callModel('test', [], { ...modelConfig(), timeoutMs:10000 },
    framesToFetch([JSON.stringify({error:'model runner out of memory'})+'\n']));
  assert.equal(r.error, true);
  assert.match(r.text, /out of memory/);
});

test('Ollama truncation is rejected even when done=true', async () => {
  const r = await callModel('test', [], { ...modelConfig(), timeoutMs:10000 },
    framesToFetch([JSON.stringify({message:{content:'{"x":1}'},done:true,done_reason:'length'})+'\n']));
  assert.equal(r.error, true);
  assert.match(r.text, /truncated/);
});

test('model URL must remain on loopback, never expose GitHub tokens', () => {
  assert.throws(() => modelConfig({ AUTO_WRITER_URL:'https://example.com/api/chat' }), /loopback/);
});

test('Unicode bytes split in the middle of a character are preserved', async () => {
  const frame = JSON.stringify({ message: { content: 'Hà Nội tiếng Việt' }, done: true, done_reason: 'stop', eval_count: 8 }) + '\n';
  const offset = new TextEncoder().encode(frame.slice(0, frame.indexOf('à'))).length + 1;
  let metrics;
  const r = await callModel('test', [], { ...modelConfig(), onMetrics: (m) => { metrics = m; } }, framesToFetch([frame], offset));
  assert.equal(r.content, 'Hà Nội tiếng Việt');
  assert.equal(metrics.eval_count, 8);
});
