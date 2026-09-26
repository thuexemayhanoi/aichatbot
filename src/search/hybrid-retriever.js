/**
 * Hybrid retriever: BM25 (always on) + optional local semantic layer.
 *
 * Contract-compatible with the previous BM25 retriever: the engine sees
 * { handled, answer, confidence, source, actions } or null. The semantic
 * layer is LAZY: warmup() is called by the app only after the first user
 * turn (never on page load), and until the embeddings are ready every
 * query is answered by BM25 alone. If the model cannot load (offline,
 * old phone), the hybrid retriever silently stays BM25-only forever.
 *
 * Hybrid mode only ACTIVATES once the semantic index is ready; from then
 * on, results are merged via the deterministic reranker and the answer
 * source becomes 'hybrid-search' (traceable).
 */
import { createRetriever } from './retriever.js';
import { createSemanticRetriever } from './semantic-retriever.js';
import { rerank } from './reranker.js';

const SEMANTIC_MIN_SCORE = 0.35;

/**
 * @param {object} data - { business, pricing, faq } authoritative data.
 * @param {object} [options]
 * @param {boolean} [options.semantic] - enable the semantic layer (default true).
 * @param {object}  [options.semanticOptions] - passed to createSemanticRetriever.
 * @param {object}  [options.weights] - reranker weights.
 */
export function createHybridRetriever(data, options = {}) {
  const base = createRetriever(data, options);
  const semanticEnabled = options.semantic !== false;
  const semantic = createSemanticRetriever(options.semanticOptions ?? {});
  const weights = options.weights ?? null;
  let hybridReady = false;

  /** Embed the corpus for hybrid search (lazy, idempotent, non-throwing). */
  async function warmup() {
    if (!semanticEnabled || hybridReady) return false;
    const docs = base.corpus.map((doc) => ({ id: doc.id, text: `${doc.question} ${doc.answer}` }));
    const ok = await semantic.index(docs);
    hybridReady = Boolean(ok);
    return hybridReady;
  }

  /**
   * Hybrid retrieval, independent of the engine (also feeds the local LLM).
   * @returns {Array<{id, source, question, answer, score}>}
   */
  async function retrieve(query, limit = 3) {
    const bm25 = base.retrieve(query, limit * 2);
    if (!hybridReady) return bm25;
    const semanticHits = await semantic.search(query, limit * 2);
    const merged = rerank(
      bm25.map((hit) => ({ id: hit.id, score: hit.score })),
      semanticHits.filter((hit) => hit.score >= SEMANTIC_MIN_SCORE),
      weights ?? undefined,
      limit
    );
    const byId = new Map(base.corpus.map((doc) => [doc.id, doc]));
    return merged
      .map(({ id, score }) => {
        const doc = byId.get(id);
        return doc ? { ...doc, score } : null;
      })
      .filter(Boolean);
  }

  /** Engine retriever contract. */
  async function retriever(query, ctx) {
    const hits = await retrieve(query, 1);
    if (hits.length === 0) return null;
    const top = hits[0];
    return {
      handled: true,
      answer: top.answer,
      confidence: 0.7,
      source: hybridReady
        ? `${top.source === 'pricing-data' ? 'pricing-data' : top.source}-hybrid`
        : `${top.source}-search`,
      actions: contactActions(top, data.business),
      retrieval: hits
    };
  }

  return {
    retriever,
    retrieve,
    corpus: base.corpus,
    warmup,
    semantic,
    get hybridActive() { return hybridReady; },
    get size() { return base.size; }
  };
}

/** Same contact CTA policy as the BM25 retriever (shared contract). */
function contactActions(doc, business) {
  if (!doc || typeof doc.id !== 'string' || !doc.id.startsWith('business:contact')) return [];
  const contact = business?.contact ?? {};
  return [
    { label: '📞 Gọi điện', href: contact.phone_uri ?? 'tel:' },
    { label: '💬 Zalo', href: contact.zalo ?? '' }
  ].filter((action) => action.href && action.href.length > 0);
}
