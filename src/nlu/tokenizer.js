import { normalize } from './normalizer.js';

const SPLIT = /[^a-z0-9.,]+/;
// Plain digits, or Vietnamese thousands grouping (1.500.000).
// Rejects decimals ("1,5", "1.5") and compounds like "50cc".
const NUMBER = /^(\d+|\d{1,3}(\.\d{3})+)$/;

/**
 * Split text into tokens on a normalized form.
 * Digit+letter compounds stay whole ("50cc"), so an engine displacement
 * can never detach from its "cc" unit during later processing.
 */
export function tokenize(text) {
  if (typeof text !== 'string') return [];
  return normalize(text)
    .split(SPLIT)
    .map((token) => token.replace(/^\.+|[.,]+$/g, ''))
    .filter((token) => token.length > 0);
}

/**
 * Parse a numeric token.
 * "3" -> 3, "1.500.000" -> 1500000.
 * "50cc", "1,5", "1.5", "abc" -> null (never a plain number).
 */
export function parseNumber(token) {
  if (typeof token !== 'string' || !NUMBER.test(token)) return null;
  const value = Number(token.replace(/\./g, ''));
  return Number.isFinite(value) ? value : null;
}
