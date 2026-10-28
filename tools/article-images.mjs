#!/usr/bin/env node
/**
 * IMAGE REGISTRY (v80) — the one source of truth for article featured images.
 *
 *   data/seo/article-images.json   article id → image file, size, hashes, ALT,
 *                                  generator provenance and production status
 *   assets/images/blog/*.webp      the optimized files (1200 × 800, ≤ 200 KB)
 *   data/seo/image-plan.csv        per-article brief + planned filename/ALT
 *                                  (tools/image-briefs.mjs)
 *
 * The builder renders an image (featured figure, og:image, twitter:image,
 * Article.image) ONLY for entries whose status is QA_PASSED or later, so a
 * generated-but-unreviewed image can never reach a page. Article bodies,
 * slugs, canonicals and the manifest are never touched.
 *
 * Status ladder (each step keeps every field of the previous one):
 *   IMAGE_GENERATED  generator provenance recorded (file may not exist yet)
 *   IMAGE_OPTIMIZED  WebP 1200×800 ≤ 200 KB in assets/images/blog/, sha256 + dHash
 *   IMAGE_ATTACHED   ALT written after looking at the image
 *   QA_PASSED        this gate passed → the builder renders it
 *   DEPLOYED         merged on main (commit recorded)
 *   LIVE_VERIFIED    production URL serves the page with the image (date recorded)
 *
 * Usage:
 *   node tools/article-images.mjs --check     # QA gate (exit 1 on any error)
 *   node tools/article-images.mjs --report    # counts per status as JSON
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/config/site.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTRY = 'data/seo/article-images.json';
export const SPEC = Object.freeze({
  dir: 'assets/images/blog/',
  width: 1200,
  height: 800,
  maxBytes: 200 * 1024,
  /** Minimum dHash Hamming distance between two different articles' images. */
  minDistance: 10,
  altMin: 15,
  altMax: 125
});
export const STATUSES = Object.freeze(['IMAGE_GENERATED', 'IMAGE_OPTIMIZED', 'IMAGE_ATTACHED', 'QA_PASSED', 'DEPLOYED', 'LIVE_VERIFIED']);
const RANK = Object.fromEntries(STATUSES.map((s, i) => [s, i]));
export const atLeast = (status, step) => (RANK[status] ?? -1) >= RANK[step];
/** Captions are honest: generated images are labelled as illustrations. */
export const CAPTIONS = Object.freeze({ ai: 'Ảnh minh họa tạo bằng AI', photo: 'Ảnh thực tế' });

export function loadRegistry(root = ROOT) {
  const path = join(root, REGISTRY);
  if (!existsSync(path)) return { images: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Width/height of a WebP file from its RIFF header (VP8 lossy, VP8L
 * lossless, VP8X extended). Throws on anything that is not a WebP.
 */
export function webpInfo(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('not a RIFF/WEBP file');
  }
  if (buf.readUInt32LE(4) + 8 !== buf.length) throw new Error('RIFF size does not match the file size (truncated?)');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) throw new Error('bad VP8 start code');
    return { chunk, width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (buf[20] !== 0x2f) throw new Error('bad VP8L signature');
    const b = buf.readUInt32LE(21);
    return { chunk, width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
    const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
    return { chunk, width: w + 1, height: h + 1 };
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}

/** Hamming distance between two 64-bit dHash hex strings. */
export function hamming(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** ALT problems (empty array = valid). Natural Vietnamese, describes the image. */
export function altProblems(alt) {
  const out = [];
  const text = String(alt ?? '').trim();
  if (text.length < SPEC.altMin || text.length > SPEC.altMax) out.push(`ALT length ${text.length} outside ${SPEC.altMin}–${SPEC.altMax}`);
  if (!/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text)) out.push('ALT is not Vietnamese');
  if (/^(ảnh|hình ảnh|hình|image|photo)\b/i.test(text)) out.push('ALT starts with "ảnh/hình" (describe the scene instead)');
  if (/[{}<>"]/.test(text)) out.push('ALT contains markup or quotes');
  const f = fold(text);
  if ((f.match(/thue xe may/g) ?? []).length > 1) out.push('ALT repeats "thuê xe máy" (keyword stuffing)');
  if (/gia re|tot nhat|uy tin|gan day|so 1\b/.test(f)) out.push('ALT carries promotional keywords, not a description');
  if (text.split(',').length > 4) out.push('ALT is a keyword list');
  return out;
}

/** Featured image view model for the builder, or null when not renderable. */
export function featuredImage(id, registry, { exists = (p) => existsSync(join(ROOT, p)) } = {}) {
  const e = registry.images?.[id];
  if (!e || !atLeast(e.status, 'QA_PASSED') || !exists(e.file)) return null;
  return {
    src: `/${e.file}`,
    url: `${SITE}${e.file}`,
    width: e.width,
    height: e.height,
    alt: e.alt,
    caption: e.caption ?? CAPTIONS[e.source] ?? null
  };
}

/**
 * Full QA gate over the registry. `plan` = rows of data/seo/image-plan.csv
 * (article_id → filename), `articles` = Set of published ids.
 */
export function auditRegistry(registry, { plan = [], articles = null, root = ROOT } = {}) {
  const errors = [];
  const warn = [];
  const byFile = new Map();
  const bySha = new Map();
  const alts = new Map();
  const planned = new Map(plan.map((r) => [r.article_id, r.filename]));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const hashes = [];

  for (const [id, e] of Object.entries(registry.images ?? {})) {
    const err = (m) => errors.push(`${id}: ${m}`);
    if (!(e.status in RANK)) { err(`unknown status ${e.status}`); continue; }
    counts[e.status]++;
    if (articles && !articles.has(id)) err('not a published article id');
    if (!e.file?.startsWith(SPEC.dir) || !/^[a-z0-9-]+\.webp$/.test(e.file.slice(SPEC.dir.length))) err(`file must be ${SPEC.dir}<lowercase-ascii>.webp`);
    if (planned.size && planned.get(id) && e.file !== SPEC.dir + planned.get(id)) err(`file ${e.file} differs from the planned filename ${planned.get(id)}`);
    if (byFile.has(e.file)) err(`file shared with ${byFile.get(e.file)}`);
    byFile.set(e.file, id);
    if (!e.generator?.tool || !e.generator?.generated_at) err('generator provenance (tool, generated_at) missing');
    if (!['ai', 'photo'].includes(e.source)) err('source must be "ai" or "photo"');

    if (atLeast(e.status, 'IMAGE_OPTIMIZED')) {
      const path = join(root, e.file);
      if (!existsSync(path)) { err(`file ${e.file} missing`); continue; }
      const buf = readFileSync(path);
      let info;
      try { info = webpInfo(buf); } catch (x) { err(`invalid WebP: ${x.message}`); continue; }
      if (info.width !== SPEC.width || info.height !== SPEC.height) err(`size ${info.width}×${info.height}, expected ${SPEC.width}×${SPEC.height}`);
      if (e.width !== info.width || e.height !== info.height) err('registry width/height differ from the file');
      if (buf.length > SPEC.maxBytes) err(`${Math.round(buf.length / 1024)} KB > ${SPEC.maxBytes / 1024} KB`);
      if (e.bytes !== statSync(path).size) err('registry bytes differ from the file');
      const sha = createHash('sha256').update(buf).digest('hex');
      if (e.sha256 !== sha) err('sha256 differs from the file (re-run tools/image-factory.py optimize)');
      if (bySha.has(sha)) err(`identical bytes to ${bySha.get(sha)}`);
      // Honest labelling: an AI image carries IPTC DigitalSourceType in its XMP.
      if (e.source === 'ai' && !buf.includes('digitalsourcetype/trainedAlgorithmicMedia')) err('AI image without IPTC trainedAlgorithmicMedia XMP');
      bySha.set(sha, id);
      if (!/^[0-9a-f]{16}$/.test(e.dhash ?? '')) err('dhash (64-bit hex) missing');
      else if (e.dhash_of !== sha) err('dhash was computed for another file version');
      else hashes.push([id, e.dhash]);
    }
    if (atLeast(e.status, 'IMAGE_ATTACHED')) {
      for (const p of altProblems(e.alt)) err(p);
      const key = fold(e.alt ?? '');
      if (alts.has(key)) err(`ALT identical to ${alts.get(key)}`);
      alts.set(key, id);
      if (!e.alt_reviewed) err('ALT not marked as written from the actual image (alt_reviewed)');
    }
    if (atLeast(e.status, 'DEPLOYED') && !/^[0-9a-f]{7,40}$/.test(e.commit ?? '')) err('DEPLOYED without commit sha');
    if (atLeast(e.status, 'LIVE_VERIFIED') && !/^\d{4}-\d{2}-\d{2}$/.test(e.live_verified ?? '')) err('LIVE_VERIFIED without live_verified date');
  }

  // Near-duplicate gate: perceptual distance between every pair.
  for (let i = 0; i < hashes.length; i++) {
    for (let j = i + 1; j < hashes.length; j++) {
      const d = hamming(hashes[i][1], hashes[j][1]);
      if (d < SPEC.minDistance) errors.push(`${hashes[i][0]} ~ ${hashes[j][0]}: near-duplicate (dHash distance ${d} < ${SPEC.minDistance})`);
    }
  }
  return { errors, warnings: warn, counts, total: Object.keys(registry.images ?? {}).length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { loadPlan } = await import('./image-briefs.mjs');
  const published = JSON.parse(readFileSync(join(ROOT, 'data/blog/published.json'), 'utf8')).articles;
  const result = auditRegistry(loadRegistry(), { plan: loadPlan(), articles: new Set(published.map((a) => a.article_id)) });
  if (process.argv.includes('--report')) console.log(JSON.stringify({ total: result.total, counts: result.counts }, null, 2));
  for (const w of result.warnings) console.warn(`warn: ${w}`);
  if (result.errors.length) {
    for (const e of result.errors) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log(`image registry OK: ${result.total} entries ${JSON.stringify(result.counts)}`);
}
