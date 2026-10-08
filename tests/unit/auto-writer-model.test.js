import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { callModel, modelConfig } from '../../tools/auto-writer-model.mjs';
import { buildCtx } from '../../tools/auto-writer.mjs';

test('local inference accepts complete Ollama output and sends no GitHub credentials', async (t) => {
  let request;
  const server = createServer(async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    request = { headers: req.headers, body: JSON.parse(Buffer.concat(parts)) };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ done: true, done_reason: 'stop', message: { content: '{"title":"Valid article"}' } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const config = modelConfig({ AUTO_WRITER_URL: `http://127.0.0.1:${server.address().port}/api/chat` });
  const r = await callModel('qwen3:4b-instruct', [{ role: 'user', content: 'write' }], config);
  assert.equal(r.content, '{"title":"Valid article"}');
  assert.equal(request.headers.authorization, undefined);
  assert.equal(request.body.stream, false);
  assert.equal(request.body.format, 'json');
  assert.equal(request.body.think, false);
});

test('HTTP 200 OK text is an error, never mistaken for an article', async () => {
  const r = await callModel('qwen', [], modelConfig({}), async () => new Response('OK\n'));
  assert.equal(r.error, true);
  assert.match(r.text, /non-JSON/);
});

test('missing, truncated and HTTP-error responses fail closed', async () => {
  for (const body of [
    { done: true, message: { content: '' } },
    { done: false, message: { content: 'partial' } },
    { done: true, done_reason: 'length', message: { content: 'partial' } },
    { error: 'model not found' },
  ]) {
    const r = await callModel('qwen', [], modelConfig({}), async () => Response.json(body));
    assert.equal(r.error, true);
  }
  const r = await callModel('qwen', [], modelConfig({}), async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  assert.equal(r.status, 503);
});

test('network failures and timeouts produce actionable errors', async () => {
  const disconnected = await callModel('qwen', [], modelConfig({}), async () => { throw new Error('connection refused'); });
  assert.match(disconnected.text, /connection refused/);
  const timedOut = await callModel('qwen', [], modelConfig({ AUTO_WRITER_TIMEOUT_MS: '10' }),
    async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort')))));
  assert.match(timedOut.text, /timed out/);
});

test('inference configuration refuses remote endpoints and invalid timeouts', () => {
  for (const url of ['https://models.github.ai/api/chat', 'http://example.com/api/chat', 'http://user:pass@localhost/api/chat']) {
    assert.throws(() => modelConfig({ AUTO_WRITER_URL: url }), /loopback/);
  }
  assert.throws(() => modelConfig({ AUTO_WRITER_TIMEOUT_MS: 'NaN' }), /TIMEOUT/);
});

test('writer context supplies real /blog/ hub URLs from flat body paths', () => {
  const ctx = buildCtx({ category: 'RENT', agent_retrieval: 'yes' }, [
    { category: 'RENT', slug: 'thu-tuc-thue-xe', title: 'Thủ tục thuê xe', body: 'data/blog/articles/thu-tuc-thue-xe.body.html' },
    { category: 'EV', slug: 'sac-pin', title: 'Sạc pin', body: 'data/blog/articles/sac-pin.body.html' },
  ]);
  assert.deepEqual(ctx.allowedHubPrefixes, ['/blog/thue-xe/']);
  assert.deepEqual(ctx.hubSlugs, ['/blog/thue-xe/thu-tuc-thue-xe/']);
  assert.deepEqual(ctx.exampleTitles, ['Thủ tục thuê xe']);
});
