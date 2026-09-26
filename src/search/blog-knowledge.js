import { createBm25Index } from './bm25.js';
import { tokenize } from '../nlu/tokenizer.js';

/**
 * Blog knowledge retriever — OPTIONAL retrieval tier BELOW business data.
 *
 * Source priority is fixed and enforced in moto-app: business rules
 * -> business-data retrieval -> THIS blog retriever -> local LLM -> fallback.
 * The blog tier is only consulted when the engine returned the honest
 * fallback, so blog prose can never override verified prices, deposits,
 * hours, addresses, phone numbers or policies.
 *
 * Protected intents (owned by verified business data) are declined here
 * even if a blog chunk happens to match.
 */

const PROTECTED_INTENTS = new Set([
  'price_query', 'compare_query', 'deposit_query', 'hours_query',
  'location_query', 'contact_query', 'delivery_query', 'return_query',
  'documents_query', 'policy_query', 'recommendation_query', 'duration_query'
]);

const DEFAULTS = Object.freeze({ minScore: 1.5 });

/** @returns {{retriever, retrieve, size}} */
export function createBlogRetriever({ chunks = [], minScore = DEFAULTS.minScore } = {}) {
  const docs = (Array.isArray(chunks) ? chunks : [])
    .filter((c) => c && typeof c.text === 'string' && c.text.length > 0)
    .map((c) => ({
      id: String(c.id ?? c.article_id ?? 'blog-chunk'),
      url: typeof c.url === 'string' ? c.url : '',
      title: typeof c.title === 'string' ? c.title : '',
      text: c.text,
      tokens: tokenize(`${c.title ?? ''} ${c.text}`)
    }));
  const index = createBm25Index(docs);

  /** @returns {{handled:true, answer, confidence, source, retrieval}|null */
  function retriever(query, context = {}) {
    const intentId = context?.analysis?.intent?.id ?? null;
    if (intentId && PROTECTED_INTENTS.has(intentId)) return null;
    const tokens = tokenize(String(query ?? ''));
    if (tokens.length === 0) return null;
    const hits = index.search(tokens, 1);
    if (hits.length === 0) return null;
    const top = hits[0];
    if (!Number.isFinite(top.score) || top.score < minScore) return null; // malformed scores never publish
    const doc = docs.find((d) => d.id === top.id) ?? null;
    if (!doc) return null;
    const link = doc.url ? `\n\nĐọc thêm: ${doc.url}` : '';
    return {
      handled: true,
      answer: `${doc.text}${link}`,
      confidence: Math.min(0.6, Math.max(0.35, top.score / 10)),
      source: 'blog-knowledge',
      retrieval: hits
    };
  }

  return { retriever, retrieve: (q, limit = 5) => index.search(tokenize(String(q ?? '')), limit), get size() { return docs.length; } };
}
