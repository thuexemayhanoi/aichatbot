const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Canonical text form for all NLU stages.
 * Lowercase, accents stripped ("Thuê" and "Thue" compare equal), single spaces.
 * Note: "đ" does not decompose under NFD, so it is mapped explicitly.
 */
export function normalize(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}
