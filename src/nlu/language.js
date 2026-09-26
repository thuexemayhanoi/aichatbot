/**
 * Lightweight vi/en language detection on the RAW text (before accent
 * stripping). Vietnamese diacritics are decisive; otherwise function-word
 * counts break the tie. Deterministic, no external model.
 */
const VI_MARKERS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
const EN_WORDS = new Set(['the', 'is', 'are', 'do', 'does', 'what', 'where', 'when',
  'how', 'much', 'you', 'your', 'i', 'need', 'want', 'rent', 'bike', 'price', 'have', 'can']);
const VI_WORDS = new Set(['khong', 'co', 'the', 'la', 'gi', 'bao', 'nhieu', 'cho',
  'minh', 'ban', 'duoc', 'thue', 'xe', 'giá', 'o', 'dau', 'nao', 'roi']);

/**
 * @returns {'vi'|'en'}
 */
export function detectLanguage(text, fallback = 'vi') {
  const raw = String(text ?? '');
  if (VI_MARKERS.test(raw)) return 'vi';
  const tokens = raw.toLowerCase().split(/[^a-zà-ỹ]+/).filter(Boolean);
  let en = 0;
  let vi = 0;
  for (const token of tokens) {
    if (EN_WORDS.has(token)) en++;
    if (VI_WORDS.has(token)) vi++;
  }
  if (en > vi) return 'en';
  if (vi > en) return 'vi';
  return fallback === 'en' ? 'en' : 'vi';
}
