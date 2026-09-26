import { detectCapabilities } from './capability.js';
import { buildPrompt, validateLlmOutput, guardFacts, withDisclosure } from './grounding.js';
import { selectBestLocalModel, MODEL_CANDIDATES } from './model-selection.js';

/**
 * Optional local LLM layer on top of WebLLM (https://github.com/mlc-ai/web-llm).
 *
 * Design constraints:
 *  - NEVER auto-downloads a model. The user must explicitly confirm.
 *  - The model id is DISCOVERED at runtime from the loaded WebLLM module's
 *    `prebuiltAppConfig.model_list` (see model-selection.js) — no id is
 *    assumed to exist, so WebLLM upgrades cannot break Local AI.
 *  - `importFn` is injected so tests can stub the WebLLM module; production
 *    dynamically imports the WebLLM ESM bundle from a CDN only when enabled.
 *  - Every failure path (no WebGPU, import error, no compatible model,
 *    engine error, timeout, invalid output) resolves to a decline — the
 *    deterministic engine and fallback always remain available.
 *  - Technical errors never reach the UI: `state.error` is for the console
 *    and diagnostics; `state.userMessage` is the friendly Vietnamese line.
 */

const DEFAULT_IMPORT_URL = 'https://esm.run/@mlc-ai/web-llm';
const INIT_TIMEOUT_MS = 120_000;
const GENERATION_TIMEOUT_MS = 45_000;
const MAX_NEW_TOKENS = 256;

export const FRIENDLY_MESSAGES = Object.freeze({
  unsupported: 'Agent chưa dùng được trên thiết bị này. Trợ lý cơ bản vẫn hoạt động bình thường.',
  failed: 'Agent chưa khởi động được. Trợ lý cơ bản vẫn hoạt động bình thường.',
  noModel: 'Không tìm thấy model AI phù hợp trong thư viện hiện tại. Trợ lý cơ bản vẫn hoạt động bình thường.'
});

/**
 * @param {object} [options]
 * @param {string}    [options.importUrl]  - WebLLM ESM module URL.
 * @param {function}  [options.importFn]   - injected dynamic import (tests).
 * @param {object}    [options.env]        - environment for capability detection.
 * @param {object}    [options.data]        - { business, pricing, faq }.
 * @param {function}  [options.retrieve]   - (query, limit) => docs (search layer).
 * @param {string}    [options.disclosure] - footer line for AI answers.
 * @param {Array}     [options.candidates]  - override model preference order (tests).
 */
export function createLocalLlm(options = {}) {
  const importUrl = options.importUrl ?? DEFAULT_IMPORT_URL;
  const importFn = options.importFn ?? ((url) => import(/* @vite-ignore */ url));
  const env = options.env ?? globalThis;
  const data = options.data ?? {};
  const retrieve = options.retrieve ?? null;
  const disclosure = options.disclosure ?? 'Câu trả lời được tạo bởi Agent (thử nghiệm), dựa trên dữ liệu của cửa hàng.';
  const candidates = options.candidates ?? MODEL_CANDIDATES;

  let engine = null;          // WebLLM engine once loaded
  let loadPromise = null;     // in-flight load
  let selectedModel = null;  // { modelId, record, reason } discovered at runtime
  const state = {
    status: 'idle', // idle -> loading -> ready | failed | unsupported
    progress: 0,
    error: null,        // technical detail — console/diagnostics only
    userMessage: null,  // friendly Vietnamese line for normal UI
    selectedModelId: null,
    capabilities: detectCapabilities(env)
  };

  function setStatus(status, patch = {}) {
    state.status = status;
    Object.assign(state, patch);
    // Keep technical details out of the default console; debug only.
    if (state.error) console.debug('[MotoAI local-llm]', state.status, state.error);
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
      setStatus('unsupported', {
        error: state.capabilities.reasons.join('; '),
        userMessage: FRIENDLY_MESSAGES.unsupported
      });
      return Promise.resolve(false);
    }

    loadPromise = (async () => {
      setStatus('loading', { progress: 0, error: null, userMessage: null });
      try {
        // 1. Load the WebLLM module (JS only — no model bytes yet).
        const mod = await withTimeout(importFn(importUrl), INIT_TIMEOUT_MS, 'import webllm');
        if (!mod?.CreateMLCEngine) throw new Error('CreateMLCEngine missing in WebLLM module');

        // 2. Discover the ACTUAL built-in model list — never assume an id.
        const modelList = mod?.prebuiltAppConfig?.model_list ?? [];
        selectedModel = selectBestLocalModel({
          modelList,
          capabilities: state.capabilities,
          deviceMemoryGb: state.capabilities.deviceMemoryGb,
          candidates
        });
        if (!selectedModel) {
          throw Object.assign(new Error(`no compatible model in model_list (${modelList.length} records)`), {
            userMessage: FRIENDLY_MESSAGES.noModel
          });
        }
        state.selectedModelId = selectedModel.modelId;

        // 3. Initialize with the verified id (this starts the model download).
        const llm = await withTimeout(
          mod.CreateMLCEngine(selectedModel.modelId, {
            initProgressCallback: (report) => {
              const frac = typeof report?.progress === 'number' ? report.progress : null;
              if (frac != null) {
                state.progress = Math.min(1, Math.max(0, frac));
                onProgress?.(state.progress, report.text ?? '');
              }
            }
          }),
          INIT_TIMEOUT_MS,
          `engine init ${selectedModel.modelId}`
        );
        engine = llm;
        setStatus('ready', { progress: 1, error: null, userMessage: null });
        return true;
      } catch (error) {
        engine = null;
        loadPromise = null;
        setStatus('failed', {
          error: error?.message ?? String(error),
          userMessage: typeof error?.userMessage === 'string' ? error.userMessage : FRIENDLY_MESSAGES.failed
        });
        return false;
      }
    })();
    return loadPromise;
  }

  function unload() {
    engine = null;
    loadPromise = null;
    setStatus('idle', { progress: 0, error: null, userMessage: null });
  }

  /**
   * Generate a grounded answer for a fallback question.
   * @returns {Promise<{text, source, retrieval}|null>} null = declined,
   *   the deterministic fallback must answer instead.
   */
  async function answer(question) {
    if (!engine) return null;
    const docs = typeof retrieve === 'function' ? await Promise.resolve(retrieve(question, MAX_CONTEXT_DOCS)) : [];
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


  /**
   * PHRASING mode (v44): reword already-verified deterministic facts.
   * The model receives ONLY the structured facts; any output that fails
   * the injected guard (Fact Guard v2) is discarded — the deterministic
   * template answer is used instead.
   * @returns {Promise<{text}|null>} null = declined.
   */
  async function phrase({ question, facts, guard }) {
    if (!engine || typeof question !== 'string' || typeof facts !== 'string') return null;
    const system = [
      'You are MotoAI, an assistant for a Vietnamese motorbike rental business.',
      'Rewrite the VERIFIED FACTS below as a short, natural, conversational answer to the user question.',
      'HARD RULES: use ONLY the numbers and facts given; never add prices, policies, phone numbers, hours or availability; keep every number exactly as given; reply in the language of the question; at most 4 sentences.'
    ].join(' ');
    let raw;
    try {
      const chunks = await withTimeout(
        engine.chat.completions.create({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `USER QUESTION: ${question}\n\nVERIFIED FACTS:\n${facts}` }
          ],
          temperature: 0.2,
          max_tokens: MAX_NEW_TOKENS
        }),
        GENERATION_TIMEOUT_MS,
        'phrasing'
      );
      raw = chunks?.choices?.[0]?.message?.content ?? null;
    } catch {
      return null;
    }
    const cleaned = validateLlmOutput(raw);
    if (!cleaned) return null;
    if (typeof guard === 'function' && !guard(cleaned)) return null;
    return { text: cleaned, source: 'local-llm-phrased' };
  }

  return {
    load,
    unload,
    answer,
    phrase,
    state,
    get modelId() { return state.selectedModelId; },
    get selection() { return selectedModel; }
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
