import { phraseToTokens } from './match.js';

/**
 * Build a lookup from every variant phrase (normalized token sequence)
 * to its group's canonical token sequence (the first entry of the group).
 * Groups come from data/business/faq.json so non-developers can extend them.
 */
export function createSynonymMap(groups = []) {
  const byPhrase = new Map();
  let maxLen = 0;
  for (const group of groups) {
    if (!Array.isArray(group) || group.length === 0) continue;
    const canonical = phraseToTokens(group[0]);
    if (!canonical.length) continue;
    for (const phrase of group) {
      const tokens = phraseToTokens(phrase);
      if (!tokens.length) continue;
      byPhrase.set(tokens.join(' '), canonical);
      maxLen = Math.max(maxLen, tokens.length);
    }
  }
  maxLen = Math.max(maxLen, canonicalLen(byPhrase));
  return { byPhrase, maxLen };
}

function canonicalLen(byPhrase) {
  let len = 0;
  for (const canonical of byPhrase.values()) {
    len = Math.max(len, canonical.length);
  }
  return len;
}

/**
 * Replace known variant phrases with their canonical form.
 * Longest match wins, scanning left to right. Unknown tokens pass through.
 * Never touches numbers or units, so duration extraction is unaffected.
 */
export function expandSynonyms(tokens, map) {
  if (!map || map.byPhrase.size === 0 || tokens.length === 0) return tokens.slice();
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    const maxWindow = Math.min(map.maxLen, tokens.length - i);
    for (let len = maxWindow; len >= 1; len--) {
      const key = tokens.slice(i, i + len).join(' ');
      const canonical = map.byPhrase.get(key);
      if (canonical) {
        out.push(...canonical);
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push(tokens[i]);
      i += 1;
    }
  }
  return out;
}
