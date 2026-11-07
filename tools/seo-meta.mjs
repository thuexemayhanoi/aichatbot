/**
 * SEO metadata layer (v70 SEO master).
 *
 * Reviewed Vietnamese SEO metadata — primary keyword, <title>/H1 and meta
 * description — for PUBLISHED articles lives in data/seo/article-meta.json,
 * OUTSIDE the factory-owned manifest (data/blog/published.json) and the
 * article bodies. The builder applies it at render time:
 *
 *   effective title       = seo.title       ?? manifest.title
 *   effective description = seo.description ?? manifest.description
 *
 * URLs, slugs, IDs, bodies and the 2,000-row matrix never change. Deleting
 * an entry (or the whole file) rolls that article back to its manifest
 * metadata on the next build. Invalid entries fail the build loudly, the
 * same way an unresolved {{ business.* }} placeholder does.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { VARIANTS } from './gen-blog-matrix.mjs';

export const SEO_META_PATH = 'data/seo/article-meta.json';
export const LIMITS = Object.freeze({ titleMin: 35, titleMax: 65, descMin: 120, descMax: 165 });

/** Generic commercial head terms owned by sister sites (config/seo-ownership.json). */
const PROTECTED = new Set(['thuê xe máy hà nội', 'cho thuê xe máy hà nội']);

/** Diacritic-insensitive Vietnamese normalisation (đ → d). */
export function norm(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

/** English words that must not appear in Vietnamese-only SEO metadata
 *  (brand names such as MotoAI, Agent, Grab, VinFast are allowed). */
const ENGLISH = new Set(['ride', 'riding', 'weekend', 'view', 'views', 'by', 'bike', 'bikes', 'and', 'the', 'for',
  'of', 'to', 'in', 'rental', 'rent', 'motorbike', 'motorbikes', 'scooter', 'scooters', 'tour', 'tours', 'guide',
  'tips', 'best', 'top', 'review', 'checklist', 'check', 'list', 'ev', 'delta', 'mekong', 'with', 'how', 'what',
  'why', 'where', 'cheap', 'price', 'booking', 'travel', 'trip', 'road', 'route', 'street', 'food', 'coffee',
  'old', 'quarter', 'lake', 'night', 'morning', 'day', 'days', 'faq', 'step', 'steps', 'easy', 'fast', 'safe',
  'safety', 'new', 'beginner', 'student', 'family']);
export function englishTokens(text) {
  return String(text ?? '').split(/[^0-9a-zA-ZÀ-ỹđĐ]+/).filter((w) => w && ENGLISH.has(w.toLowerCase()));
}

/** Spelling slips inherited from the generated topic seeds. */
export const SEED_TYPOS = Object.freeze(['chủ tích', 'xe máy phượng', 'mài châu', 'soc son', 'co loa', 'khiển nại',
  'kỳ nghĩ lễ', 'ha giang', 'quảng đi']);
export function seedTypos(text) {
  const t = String(text ?? '').toLowerCase();
  return SEED_TYPOS.filter((x) => t.includes(x));
}

/** A body's question-and-answer section: an H2 whose heading names questions
 *  ("Câu hỏi thường gặp", "Thắc mắc thường gặp về …", "Câu hỏi du khách hay
 *  hỏi …", FAQ). One definition for the body review (never adds a second FAQ)
 *  and the SEO score (Q&A present). */
export const FAQ_HEADING_RE = /<h2[^>]*>[^<]*(câu hỏi|hỏi đáp|faq|thắc mắc)/i;

/** Vietnamese words written without their diacritics, which are spelling
 *  errors in prose: "iê", "uô", "ươ", "yê" always carry a mark, and a few
 *  frequent words have no valid unaccented form. Quoted text is skipped —
 *  articles quote unaccented messages on purpose ("thue vision 3 ngay").
 *  Capitalised tokens are skipped for the vowel rule (English place names
 *  such as Hoan Kiem, Long Bien in English passages). */
const UNACCENTED_WORDS = new Set(['thue', 'xang', 'khong', 'duoc', 'nguoi', 'viec', 'neu']);
const UNACCENTED_OK = new Set(['gieo', 'yes']);
export function unaccentedWords(html) {
  const text = String(html ?? '')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/"[^"\n]{0,200}"/g, ' ')
    .replace(/“[^”\n]{0,200}”/g, ' ');
  const out = [];
  for (const [w] of text.matchAll(/(?<![A-Za-zÀ-ỹđĐ])[A-Za-z]+(?![A-Za-zÀ-ỹđĐ])/g)) {
    const lw = w.toLowerCase();
    if (UNACCENTED_OK.has(lw)) continue;
    const vowelRule = w === lw && /^(ngh|ng|nh|ch|tr|th|kh|gh|ph|gi|qu|[bcdghklmnpqrstvx])?(ie|uo|uye|ye)[a-z]{1,2}$/.test(lw);
    if (UNACCENTED_WORDS.has(lw) || vowelRule) out.push(w);
  }
  return out;
}

/** H2/H3 headings written in English-style Title Case ("Kiểm Tra Tình Trạng
 *  Xe Khi Nhận"). Vietnamese headings use sentence case; proper nouns keep
 *  their capitals, so a heading only counts when a function word ("Và",
 *  "Khi", "Của", "Là"…) is capitalised mid-heading as well. */
const TITLE_CASE_FUNCTION_WORDS = new Set(['Và', 'Khi', 'Của', 'Là', 'Gì', 'Tại', 'Về', 'Cho', 'Trong', 'Với',
  'Có', 'Không', 'Để', 'Các', 'Những', 'Hay', 'Hoặc', 'Theo', 'Sau', 'Trước', 'Nên', 'Cần', 'Bị', 'Được', 'Như',
  'Nào', 'Sao', 'Từ', 'Đến', 'Bằng', 'Ở', 'Thì', 'Mà', 'Này', 'Đó']);
export function titleCaseHeadings(html) {
  const out = [];
  for (const [, text] of String(html ?? '').matchAll(/<h[23]\b[^>]*>([^<]+)<\/h[23]>/g)) {
    const words = text.match(/[A-Za-zÀ-ỹđĐ]+/g) ?? [];
    if (words.length >= 3 && words.every((w) => w[0] === w[0].toUpperCase())
      && words.slice(1).some((w) => TITLE_CASE_FUNCTION_WORDS.has(w))) out.push(text.trim());
  }
  return out;
}

/** Read the SEO metadata map { article_id -> entry }; missing file = {}. */
export function loadSeoMeta(root) {
  const p = join(root, SEO_META_PATH);
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, 'utf8')).articles ?? {};
}

/** Problems with one entry (empty list = valid). */
export function seoEntryProblems(id, e) {
  const out = [];
  const str = (v) => typeof v === 'string' && v.trim() === v && v.length > 0;
  if (!str(e?.keyword) || !str(e?.title) || !str(e?.description)) return [`${id}: keyword/title/description must be trimmed non-empty strings`];
  const { titleMin, titleMax, descMin, descMax } = LIMITS;
  if (e.title.length < titleMin || e.title.length > titleMax) out.push(`${id}: title length ${e.title.length} outside ${titleMin}-${titleMax}`);
  if (e.description.length < descMin || e.description.length > descMax) out.push(`${id}: description length ${e.description.length} outside ${descMin}-${descMax}`);
  if (!/[.?!]$/.test(e.description)) out.push(`${id}: description must end with a full sentence`);
  for (const [k, v] of Object.entries({ keyword: e.keyword, title: e.title, description: e.description })) {
    if (/\{\{|\}\}|<|>/.test(v)) out.push(`${id}: ${k} must be plain text without placeholders/markup`);
  }
  if (PROTECTED.has(e.keyword.toLowerCase())) out.push(`${id}: keyword is a protected sister-site head term`);
  return out;
}

/**
 * Validate the whole map against the manifest: valid entries, unique
 * keywords/titles/descriptions across EFFECTIVE metadata. Throws with every
 * problem listed. Entries for articles absent from the manifest are inert
 * (factory sandboxes build with a trimmed manifest); `strictIds` turns them
 * into errors — the repository test suite runs strict.
 */
export function assertSeoMeta(meta, manifestArticles, { strictIds = false } = {}) {
  const known = new Set(manifestArticles.map((a) => a.article_id));
  const problems = [];
  for (const [id, e] of Object.entries(meta)) {
    if (!known.has(id)) {
      if (strictIds) problems.push(`${id}: not in data/blog/published.json`);
      continue;
    }
    problems.push(...seoEntryProblems(id, e));
  }
  const effective = manifestArticles.map((a) => applySeoMeta(a, meta));
  for (const field of ['title', 'description']) {
    const seen = new Map();
    for (const a of effective) {
      const key = a[field].toLowerCase();
      if (seen.has(key)) problems.push(`${a.article_id}: duplicate ${field} with ${seen.get(key)}`);
      else seen.set(key, a.article_id);
    }
  }
  const kw = new Map();
  for (const [id, e] of Object.entries(meta).filter(([id]) => known.has(id))) {
    const key = norm(e.keyword ?? '');
    if (kw.has(key)) problems.push(`${id}: duplicate keyword with ${kw.get(key)}`);
    else kw.set(key, id);
  }
  if (problems.length) throw new Error(`invalid ${SEO_META_PATH}:\n  ${problems.join('\n  ')}`);
}

/** Effective article metadata (manifest entry is never mutated). */
export function applySeoMeta(article, meta) {
  const e = meta[article.article_id];
  if (!e) return { ...article, seo_keyword: null };
  return { ...article, title: e.title, description: e.description, seo_keyword: e.keyword };
}

/**
 * Topic family of a matrix row: the 2,000 topics were generated as
 * SEED (+ one VARIANT modifier per category, see tools/gen-blog-matrix.mjs).
 * The bare seed article is the family PILLAR; variants are its supporting
 * articles. Key is stable across builds.
 */
export function topicFamily(category, primaryKeyword) {
  const pk = String(primaryKeyword ?? '').trim();
  const variants = VARIANTS[category] ?? [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    if (pk.toLowerCase().endsWith(` ${v.toLowerCase()}`)) {
      const seed = pk.slice(0, -(v.length + 1)).trim();
      return { key: `${category}:${seed.toLowerCase()}`, seed, variant: v, order: i + 1 };
    }
  }
  return { key: `${category}:${pk.toLowerCase()}`, seed: pk, variant: '', order: 0 };
}
