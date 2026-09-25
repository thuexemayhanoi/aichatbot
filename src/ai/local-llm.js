import { detectCapabilities } from './capability.js';
import { buildPrompt, validateLlmOutput, guardFacts, withDisclosure } from './grounding.js';

/**
 * Optional local LLM layer on top of WebLLM (https://github.com/mlc-ai/web-llm).
 *
 * Design constraints:
 *  - NEVER auto-downloads a model. The user must explicitly enable it.
 *  - `importFn` is injected so tests can stub the WebLLM module; production
 *    dynamically imports the WebLLM ESM bundle from a CDN only when enabled.
 *  - Every failure path (no WebGPU, import error, model error, timeout,
 *    invalid output) resolves to a decline — the deterministic engine and
 *    fallback always remain available. No blank screens, no endless loading.
 */

export const DEFAULT_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1MLC';
const DEFAULT_IMPORT_URL = 'https://esm.run/@mlc-ai/web-llm';
const INIT_TIMEOUT_MS = 120_000;
const GENERATION_TIMEOUT_MS = 45_000;
const MAX_NEW_TOKENS = 256;

/**
 * @param {object} [options]
 * @param {string}    [options.model]      - WebLLM model id.
 * @param {string}    [options.importUrl] - WebLLM ESM module URL.
 * @param {function}  [options.importFn]  - injected dynamic import (tests).
 * @param {object}    [options.env]       - environment for capability detection.
 * @param {object}    [options.data]      - { business, pricing, faq }.
 * @param {function}  [options.retrieve]  - (query, limit) => docs (search layer).
 * @param {string}    [options.disclosure] - footer line for AI answers.
 */
export function createLocalLlm(options = {}) {
  const model = options.model ?? DEFAULT_MODEL;
  const importUrl = options.importUrl ?? DEFAULT_IMPORT_URL;
  const importFn = options.importFn ?? ((url) => import(/* @vite-ignore */ url));
  const env = options.env ?? globalThis;
  const data = options.data ?? {};
  const retrieve = options.retrieve ?? null;
  const disclosure = options.disclosure ?? 'Câu trả lời được tạo bởi AI tại chỗ (thử nghiệm), dựa trên dữ liệu của cửa hàng.';

  let engine = null;          // WebLLM engine once loaded
  let loadPromise = null;     // in-flight load
  const state = {
    status: 'idle', // idle -> loading -> ready | failed | unsupported
    progress: 0,
    error: null,
    capabilities: detectCapabilities(env)
  };

  function setStatus(status, patch = {}) {
    state.status = status;
    Object.assign(state, patch);
  }

  /**
   * Load (or reuse) the WebLLM engine. Resolves to true when ready.
   * Never throws to the caller — failures resolve to false.
   */
  function load({ onProgress } = {}) {
    if (engine) return Promise.resolve(true);
    if (state.status === 'unsupported') return Promise.resolve(false);
    if (loadPromise) return loadPromise;

    if (!state.capabilities.canUseLocalLlm) {
      setStatus('unsupported', { error: state.capabilities.reasons.join('; ') });
      return Promise.resolve(false);
    }

    loadPromise = (async () => {
      setStatus('loading', { progress: 0, error: null });
      try {
        const mod = await withTimeout(importFn(importUrl), INIT_TIMEOUT_MS, 'import webllm');
        if (!mod?.CreateMLCEngine) throw new Error('CreateMLCEngine missing in WebLLM module');
        const llm = await withTimeout(
          mod.CreateMLCEngine(model, {
            initProgressCallback: (report) => {
              const frac = typeof report?.progress === 'number' ? report.progress : null;
              if (frac != null) {
                state.progress = Math.min(1, Math.max(0, frac));
                onProgress?.(state.progress, report.text ?? '');
              }
            }
          }),
          INIT_TIMEOUT_MS,
          'engine init'
        );
        engine = llm;
        setStatus('ready', { progress: 1, error: null });
        return true;
      } catch (error) {
        engine = null;
        loadPromise = null;
        setStatus('failed', { error: error?.message ?? String(error) });
        return false;
      }
    })();
    return loadPromise;
  }

  function unload() {
    engine = null;
    loadPromise = null;
    setStatus('idle', { progress: 0, error: null });
  }

  /**
   * Generate a grounded answer for a fallback question.
   * @returns {Promise<{text, source, retrieval}|null>} null = declined,
   *   the deterministic fallback must answer instead.
   */
  async function answer(question) {
    if (!engine) return null;
    const docs = typeof retrieve === 'function' ? retrieve(question, MAX_CONTEXT_DOCS) : [];
    const { system, user } = buildPrompt({ question, docs, business: data.business });
    let raw;
    try {
      const chunks = await withTimeout(
        engine.chat.completions.create({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0.2,
          max_tokens: MAX_NEW_TOKENS
        }),
        GENERATION_TIMEOUT_MS,
        'generation'
      );
      raw = chunks?.choices?.[0]?.message?.content ?? null;
    } catch (error) {
      // Inference failed: degrade silently to the deterministic fallback.
      return null;
    }
    const cleaned = validateLlmOutput(raw);
    if (!cleaned) return null;
    const verifiedFooter = contactFooter(data.business);
    if (!guardFacts(cleaned, docs, verifiedFooter)) return null;
    return { text: withDisclosure(cleaned, disclosure), source: 'local-llm', retrieval: docs };
  }

  return {
    load,
    unload,
    answer,
    state,
    get modelId() { return model; }
  };
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

/** The only business facts injected into every prompt as a footer. */
function contactFooter(business) {
  const c = business?.contact;
  if (!c) return '';
  return `phone ${c.phone_display ?? ''} zalo ${c.zalo ?? ''} hours ${business.hours?.display ?? ''}`;
}

const MAX_CONTEXT_DOCS = 4;
