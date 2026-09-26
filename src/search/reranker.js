/**
 * Deterministic hybrid reranker.
 *
 * Merges BM25 hits and semantic (cosine) hits into one ranking:
 *   score = wLexical * norm(bm25) + wSemantic * norm(cosine)
 * with min-max normalization per list (empty list contributes 0) and a
 * deterministic tie-break on document id. Pure function, fully testable.
 */

export const DEFAULT_WEIGHTS = Object.freeze({ lexical: 0.6, semantic: 0.4 });

/**
 * @param {Array<{id, score}>} lexicalHits  - BM25 scores (>= 0).
 * @param {Array<{id, score}>} semanticHits  - cosine scores in [0, 1].
 * @param {object} [weights] - { lexical, semantic } (default 0.6 / 0.4).
 * @param {number} [limit]
 * @returns {Array<{id, score, lexical, semantic}>}
 */
export function rerank(lexicalHits = [], semanticHits = [], weights = DEFAULT_WEIGHTS, limit = 5) {
  const wLex = clampPositive(weights?.lexical ?? DEFAULT_WEIGHTS.lexical);
  const wSem = clampPositive(weights?.semantic ?? DEFAULT_WEIGHTS.semantic);

  const lex = normalizeScores(lexicalHits);
  const sem = normalizeScores(semanticHits);

  const byId = new Map();
  const add = (id, key, value) => {
    if (typeof id !== 'string' || !Number.isFinite(value)) return;
    const row = byId.get(id) ?? { id, lexical: 0, semantic: 0 };
    row[key] = Math.max(row[key], value);
    byId.set(id, row);
  };
  for (const hit of lex) add(hit.id, 'lexical', hit.score);
  for (const hit of sem) add(hit.id, 'semantic', hit.score);

  return [...byId.values()]
    .map((row) => ({ ...row, score: wLex * row.lexical + wSem * row.semantic }))
    .filter((row) => row.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : 1))
    .slice(0, Math.max(1, limit));
}

/** Normalize to (0, 1] by dividing by the list maximum (no zero floor, so a
 * strong-but-not-top hit keeps a meaningful share of the lexical weight). */
function normalizeScores(hits) {
  const clean = hits.filter((h) => h && typeof h.id === 'string' && Number.isFinite(h.score) && h.score > 0);
  if (clean.length === 0) return [];
  const max = Math.max(...clean.map((h) => h.score));
  return clean.map((h) => ({ id: h.id, score: max > 0 ? h.score / max : 1 }));
}

function clampPositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
