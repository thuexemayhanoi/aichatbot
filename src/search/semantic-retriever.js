/**
 * Optional LOCAL semantic retriever over Transformers.js (WASM, in-browser).
 *
 * - Lazy: nothing loads until warmup() is called (never on page load).
 * - No API: the embedding model is downloaded from a static CDN and runs
 *   fully on-device; Transformers.js caches model files in the browser's
 *   Cache Storage when the browser permits.
 * - Graceful: any failure (offline, old browser, OOM) resolves to
 *   `available === false` and the caller stays on BM25-only.
 *
 * Model: Xenova/multilingual-e5-small (compact multilingual, vi+en,
 * quantized ONNX ~30MB) — e5 models need the "query:"/"passage:" prefixes.
 */

const DEFAULT_IMPORT_URL = 'https://esm.run/@xenova/transformers';
const DEFAULT_MODEL = 'Xenova/multilingual-e5-small';

/**
 * @param {object} [options]
 * @param {function} [options.importFn] - injected dynamic import (tests).
 * @param {string}   [options.importUrl]
 * @param {string}   [options.model]
 * @param {object}   [options.env]      - Transformers.js env override.
 */
export function createSemanticRetriever(options = {}) {
  const importFn = options.importFn ?? ((url) => import(/* @vite-ignore */ url));
  const importUrl = options.importUrl ?? DEFAULT_IMPORT_URL;
  const model = options.model ?? DEFAULT_MODEL;

  let pipeline = null;
  let embedder = null;   // { embed(texts) -> number[][] }
  let docVectors = null; // Map<docId, number[]>
  let loadPromise = null;
  const state = { status: 'idle', error: null }; // idle | loading | ready | failed

  /** Normalize a vector to unit length (cosine similarity == dot product). */
  function unit(vec) {
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    return norm > 0 ? vec.map((v) => v / norm) : vec;
  }

  async function meanPoolAndNormalize(outputs) {
    return outputs.map((out) => unit(out.data ?? out));
  }

  /** Load the pipeline lazily. Never throws; resolves to boolean. */
  function warmup() {
    if (pipeline) return Promise.resolve(true);
    if (state.status === 'failed') return Promise.resolve(false);
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      state.status = 'loading';
      try {
        const mod = await importFn(importUrl);
        if (typeof mod?.pipeline !== 'function') throw new Error('pipeline() missing in transformers.js');
        if (options.env && mod.env) Object.assign(mod.env, options.env);
        const pipe = await mod.pipeline('feature-extraction', model, { quantized: true });
        embedder = {
          async embed(texts) {
            const outputs = await pipe(texts, { pooling: 'mean', normalize: false });
            const list = Array.isArray(outputs) ? outputs : [outputs];
            return meanPoolAndNormalize(list);
          }
        };
        pipeline = pipe;
        state.status = 'ready';
        return true;
      } catch (error) {
        state.status = 'failed';
        state.error = error?.message ?? String(error);
        loadPromise = null;
        return false;
      }
    })();
    return loadPromise;
  }

  /**
   * Embed the corpus once (idempotent). Resolves to boolean availability.
   * @param {Array<{id, text}>} docs
   */
  async function index(docs) {
    if (!pipeline && !(await warmup())) return false;
    if (docVectors) return true;
    try {
      const texts = docs.map((d) => `passage: ${d.text}`);
      const vectors = await embedder.embed(texts);
      docVectors = new Map(docs.map((doc, i) => [doc.id, vectors[i]]));
      return true;
    } catch (error) {
      state.status = 'failed';
      state.error = error?.message ?? String(error);
      return false;
    }
  }

  /**
   * Semantic similarity ranking for a query.
   * @returns {Array<{id, score}>} cosine in [0, 1] (e5 vectors are not
   *   sign-aligned, so negative similarities are clamped away), or [] when
   *   the layer is unavailable.
   */
  async function search(query, limit = 5) {
    if (!docVectors || docVectors.size === 0) return [];
    try {
      const [qvec] = await embedder.embed([`query: ${query}`]);
      const ranked = [...docVectors.entries()]
        .map(([id, vec]) => ({ id, score: clamp01(dot(qvec, vec)) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : 1));
      return ranked.slice(0, Math.max(1, limit));
    } catch {
      return [];
    }
  }

  return {
    warmup,
    index,
    search,
    state,
    get available() { return docVectors !== null; },
    get modelName() { return model; }
  };
}

function dot(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

function clamp01(v) {
  return Number.isFinite(v) && v > 0 ? Math.min(1, v) : 0;
}
