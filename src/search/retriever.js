import { createBm25Index } from './bm25.js';
import { buildCorpus } from './corpus.js';
import { tokenize } from '../nlu/tokenizer.js';

/**
 * Engine-compatible retriever over repository-owned data.
 *
 * The engine consults the retriever ONLY after every deterministic rule
 * declined, so search never overrides business answers. Results below
 * `minScore` are declined (null), which keeps the honest fallback path.
 * Stopword-only queries (e.g. "What is your favourite colour?") decline
 * so they can fall through to the local LLM / honest fallback.
 */

const STOPWORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'do', 'does', 'i', 'you', 'your', 'my', 'me',
  'we', 'to', 'of', 'for', 'in', 'on', 'at', 'and', 'or', 'it', 'need',
  'can', 'how', 'what', 'where', 'when', 'who', 'why', 'have', 'has', 'with',
  // Vietnamese (accent-stripped by the tokenizer)
  'va', 'cua', 'khong', 'co', 'the', 'la', 'gi', 'bao', 'nhieu', 'cho',
  'minh', 'ban', 'duoc', 'khong', 'ay', 'nao', 'o', 'ei'
]);

const DEFAULTS = Object.freeze({
  minScore: 2.0,
  confidence: 0.7
});

/**
 * @param {object} data - { business, pricing, faq } authoritative data.
 * @param {object} [options]
 * @param {number} [options.minScore]   - BM25 score floor (decline below).
 * @param {number} [options.confidence] - confidence attached to a hit.
 * @returns {(query: string, ctx: object) => Promise<object|null>}
 */
export function createRetriever(data, options = {}) {
  const minScore = Number.isFinite(options.minScore) ? options.minScore : DEFAULTS.minScore;
  const hitConfidence = clamp01(options.confidence ?? DEFAULTS.confidence);

  const corpus = buildCorpus(data);
  const byId = new Map(corpus.map((doc) => [doc.id, doc]));
  const index = createBm25Index(corpus.map((doc) => ({ id: doc.id, tokens: doc.tokens })));

  /**
   * Retrieval step, independent of the engine (also feeds the local LLM).
   * @returns {Array<{id, source, question, answer, score}>}
   */
  function retrieve(query, limit = 3) {
    if (typeof query !== 'string' || query.trim().length === 0) return [];
    const contentTokens = tokenize(query).filter((token) => !STOPWORDS.has(token));
    if (contentTokens.length === 0) return [];
    const ranked = index.search(contentTokens)
      .filter((entry) => entry.score >= minScore)
      .slice(0, Math.max(1, limit));
    return ranked
      .map(({ id, score }) => {
        const doc = byId.get(id);
        return doc ? { ...doc, score } : null;
      })
      .filter(Boolean);
  }

  const business = data.business ?? {};

  /** Engine retriever contract: { handled, answer, confidence, source } or null. */
  async function retriever(query) {
    const hits = retrieve(query, 1);
    if (hits.length === 0) return null;
    const top = hits[0];
    return {
      handled: true,
      answer: top.answer,
      confidence: hitConfidence,
      source: top.source === 'pricing-data' ? 'pricing-data' : `${top.source}-search`,
      actions: searchActions(top, business),
      retrieval: hits
    };
  }

  return { retriever, retrieve, corpus, get size() { return corpus.length; } };
}

function searchActions(doc, business) {
  if (!doc || typeof doc.id !== 'string') return [];
  const contact = business?.contact ?? {};
  if (doc.id.startsWith('business:contact')) {
    return [
      { label: '📞 Gọi điện', href: contact.phone_uri ?? 'tel:' },
      { label: '💬 Zalo', href: contact.zalo ?? '' }
    ].filter((action) => action.href && action.href.length > 0);
  }
  return [];
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
