/** Local-only writer inference. GitHub Models retired on 2026-07-30.
 * Never forward the workflow's GitHub token to an inference server.
 */
export const DEFAULT_MODEL = 'qwen3:4b-instruct';

export function modelConfig(env = process.env) {
  const url = new URL(env.AUTO_WRITER_URL || 'http://127.0.0.1:11434/api/chat');
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/api/chat' || url.search || url.hash) {
    throw new Error('AUTO_WRITER_URL must be a loopback Ollama /api/chat endpoint');
  }
  const timeoutMs = Number(env.AUTO_WRITER_TIMEOUT_MS || 1200000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1800000) {
    throw new Error('AUTO_WRITER_TIMEOUT_MS must be 1..1800000');
  }
  return { url: url.href, timeoutMs };
}

export async function callModel(model, messages, config = modelConfig(), fetchImpl = fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);
  try {
    const res = await fetchImpl(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model, messages, stream: false, think: false, format: 'json', keep_alive: '30m',
        options: { temperature: 0.7, num_ctx: 16384, num_predict: 10000 },
      }),
    });
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch {
      return { error: true, status: res.status, text: 'non-JSON inference response (check the local Ollama server)' };
    }
    if (!res.ok || data.error) {
      return { error: true, status: res.status, text: String(data.error || 'inference failed').slice(0, 300) };
    }
    if (data.done !== true || data.done_reason === 'length') {
      return { error: true, status: res.status, text: 'incomplete or truncated model response' };
    }
    const content = data.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { error: true, status: res.status, text: 'empty model response' };
    }
    return { content };
  } catch (e) {
    return { error: true, status: 0, text: ctrl.signal.aborted
      ? `inference timed out after ${config.timeoutMs}ms`
      : `local inference unavailable: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}
