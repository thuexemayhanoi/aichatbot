import { normalize } from './normalizer.js';
import { tokenize } from './tokenizer.js';

export const PARTIAL_DISCOUNT = 0.6;

/** Convert a human-readable phrase ("Xe tay ga") into normalized tokens. */
export function phraseToTokens(phrase) {
  return tokenize(normalize(phrase));
}

/** True when phraseTokens appear as a contiguous run inside queryTokens. */
export function containsSequence(queryTokens, phraseTokens) {
  if (!phraseTokens.length || phraseTokens.length > queryTokens.length) return false;
  const first = phraseTokens[0];
  for (let i = 0; i <= queryTokens.length - phraseTokens.length; i++) {
    if (queryTokens[i] !== first) continue;
    let matched = true;
    for (let j = 1; j < phraseTokens.length; j++) {
      if (queryTokens[i + j] !== phraseTokens[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/** Fraction (0..1) of phraseTokens present anywhere in queryTokens. */
export function tokenCoverage(queryTokens, phraseTokens) {
  if (!phraseTokens.length) return 0;
  const available = new Set(queryTokens);
  let hit = 0;
  for (const token of phraseTokens) {
    if (available.has(token)) hit++;
  }
  return hit / phraseTokens.length;
}

/**
 * Score one phrase against a tokenized query.
 * Contiguous phrase match = 1.0; scattered tokens are discounted.
 * There is deliberately no bidirectional substring matching here.
 */
export function phraseScore(queryTokens, phraseTokens) {
  if (containsSequence(queryTokens, phraseTokens)) return 1;
  return tokenCoverage(queryTokens, phraseTokens) * PARTIAL_DISCOUNT;
}

/**
 * Longest contiguous match from a phrase list.
 * Returns { phrase, tokens, index } or null.
 */
export function bestPhraseMatch(queryTokens, phrases) {
  let best = null;
  phrases.forEach((phrase, index) => {
    const tokens = phraseToTokens(phrase);
    if (!tokens.length || !containsSequence(queryTokens, tokens)) return;
    if (!best || tokens.length > best.tokens.length) {
      best = { phrase, tokens, index };
    }
  });
  return best;
}
