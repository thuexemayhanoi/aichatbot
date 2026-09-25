import { tokenize } from '../nlu/tokenizer.js';

/**
 * Minimal dependency-free BM25 (Okapi) ranker.
 *
 * Pure and Node-testable: no browser APIs, no storage. The corpus is small
 * (business facts + FAQ), so a full in-memory index is fine even on weak
 * phones; this keeps the base bundle tiny and avoids any external library.
 */

const K1 = 1.4;
const B = 0.72;

/**
 * @param {Array<{id: string, tokens: string[]}>} documents
 */
export function createBm25Index(documents = []) {
  const docs = [];
  const df = new Map();
  let totalLen = 0;

  for (const doc of documents) {
    if (!doc || typeof doc.id !== 'string' || !Array.isArray(doc.tokens)) continue;
    const counts = new Map();
    for (const token of doc.tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    for (const token of counts.keys()) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
    totalLen += doc.tokens.length;
    docs.push({ id: doc.id, tokens: doc.tokens, counts });
  }

  const avgLen = docs.length > 0 ? totalLen / docs.length : 0;
  const docCount = docs.length;

  /**
   * Rank documents against a free-text query.
   * @returns {Array<{id: string, score: number}>} descending by score, score >= 0.
   */
  function search(query) {
    const queryTokens = Array.isArray(query) ? query : tokenize(query);
    if (queryTokens.length === 0 || docCount === 0) return [];

    const idfCache = new Map();
    const scores = new Map();

    for (const term of new Set(queryTokens)) {
      const dfValue = df.get(term) ?? 0;
      if (dfValue === 0) continue;
      const idf = Math.log(1 + (docCount - dfValue + 0.5) / (dfValue + 0.5));
      idfCache.set(term, idf);

      for (const doc of docs) {
        const tf = doc.counts.get(term) ?? 0;
        if (tf === 0) continue;
        const denom = tf + K1 * (1 - B + B * (doc.tokens.length / avgLen));
        const score = idf * ((tf * (K1 + 1)) / denom);
        scores.set(doc.id, (scores.get(doc.id) ?? 0) + score);
      }
    }

    return [...scores.entries()]
      .map(([id, score]) => ({ id, score: Number.isFinite(score) && score > 0 ? score : 0 }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : 1));
  }

  /** Highest possible score for a query (used to normalize into a confidence). */
  function maxScore(query) {
    const ranked = search(query);
    return ranked.length > 0 ? ranked[0].score : 0;
  }

  return { search, maxScore, get size() { return docs.length; } };
}
