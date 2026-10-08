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

/**
 * Ollama streams newline-delimited JSON (NDJSON). Using stream:false waits for
 * the entire answer before HTTP headers arrive; Node/undici can terminate that
 * wait after ~300s even when our AbortController timeout is 20 minutes.
 * Streaming also makes mid-generation model crashes visible immediately.
 */
export async function callModel(model, messages, config = modelConfig(), fetchImpl = fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);
  try {
    const res = await fetchImpl(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model, messages, stream: true, think: false, format: 'json', keep_alive: '30m',
        options: {
          temperature: 0.7,
          num_ctx: config.numCtx ?? 8192,
          num_predict: config.numPredict ?? 7000,
        },
      }),
    });
    if (!res.ok) {
      const raw = (await res.text()).slice(0, 300);
      return { error: true, status: res.status, text: raw || 'Ollama HTTP error' };
    }
    if (!res.body) {
      return { error: true, status: res.status, text: 'Ollama response stream missing' };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let done = false;
    let doneReason = '';
    let bytes = 0;
    let metrics;
    const MAX_BYTES = 4 * 1024 * 1024;
    const processFrame = (line) => {
      if (!line.trim()) return;
      if (done) throw new Error('Ollama sent data after final done marker');
      let frame;
      try { frame = JSON.parse(line); }
      catch { throw new Error('non-JSON Ollama NDJSON frame'); }
      if (frame.error) throw new Error('Ollama: ' + String(frame.error).slice(0, 220));
      if (typeof frame.message?.content === 'string') content += frame.message.content;
      if (frame.done === true) {
        done = true;
        doneReason = frame.done_reason || '';
        metrics = {
          done_reason: doneReason,
          model: frame.model || model,
          prompt_tokens: frame.prompt_eval_count,
          generated_tokens: frame.eval_count,
          generation_seconds: frame.eval_duration / 1e9,
          load_seconds: frame.load_duration / 1e9,
        };
        for (const key of ['total_duration', 'load_duration', 'prompt_eval_count', 'prompt_eval_duration', 'eval_count', 'eval_duration']) {
          if (Number.isFinite(frame[key])) metrics[key] = frame[key];
        }
      }
    };
    for await (const chunk of res.body) {
      bytes += chunk.byteLength;
      if (bytes > MAX_BYTES) throw new Error('Ollama response exceeded 4 MiB');
      buffer += decoder.decode(chunk, { stream: true });
      let pos;
      while ((pos = buffer.indexOf('\n')) !== -1) {
        processFrame(buffer.slice(0, pos));
        buffer = buffer.slice(pos + 1);
      }
      if (buffer.length > 262144) throw new Error('oversized Ollama NDJSON frame');
    }
    buffer += decoder.decode();
    if (buffer.trim()) processFrame(buffer);
    if (!done) {
      return { error: true, status: res.status, text: 'Ollama stream ended without done=true (model exited or connection dropped)' };
    }
    if (doneReason === 'length') {
      return { error: true, status: res.status, text: 'incomplete or truncated model response' };
    }
    if (!content.trim()) {
      return { error: true, status: res.status, text: 'empty model response' };
    }
    config.onMetrics?.(metrics);
    return { content };
  } catch (e) {
    const code = e?.cause?.code ? ' (' + e.cause.code + ')' : '';
    return {
      error: true, status: 0, text: ctrl.signal.aborted
        ? `inference timed out after ${config.timeoutMs}ms`
        : `local inference unavailable: ${e.message}${code}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
