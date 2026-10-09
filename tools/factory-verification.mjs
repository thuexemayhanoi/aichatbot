/** Publication receipts: local evidence AND byte-matched production pages. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SITE } from '../src/config/site.js';

export const RECEIPTS_PATH = 'docs/state/publication-receipts.json';
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const entryDigest = (entry) => digest(JSON.stringify(entry));
const ROOT = process.env.MOTOAI_FACTORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (root, path) => readFileSync(join(root, path), 'utf8');
export function matrixRows(text) {
  const [header, ...lines] = text.trim().split('\n');
  const keys = header.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((value, i) => [keys[i], value])));
}

export function receiptValid(receipt, row, entry, body) {
  return receipt?.status === 'PUBLISHED' && receipt.article_id === row.article_id
    && receipt.url === SITE + row.output_path.replace(/index\.html$/, '')
    && /^[a-f0-9]{40}$/.test(receipt.publication_sha ?? '')
    && /^[a-f0-9]{64}$/.test(receipt.page_sha256 ?? '')
    && Number.isFinite(Date.parse(receipt.verified_at)) && receipt.production_status === 200
    && receipt.body_sha256 === digest(body) && receipt.entry_sha256 === entryDigest(entry);
}

export async function verifyPublications({ root = ROOT, ids, sha, fetchImpl = fetch, concurrency = 6 }) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('invalid publication SHA');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('invalid verification concurrency');
  const rows = matrixRows(read(root, 'data/blog/content-matrix.csv'));
  const entries = JSON.parse(read(root, 'data/blog/published.json')).articles;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some((id) => !/^BA-\d{4}$/.test(id))) throw new Error('invalid verification ids');
  const get = async (path) => {
    const response = await fetchImpl(SITE + path, { signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
    if (response.status !== 200 || (response.url && new URL(response.url).origin !== new URL(SITE).origin)) throw new Error(`production HTTP/origin mismatch: ${path}`);
    return response.text();
  };
  const [liveManifest, liveSitemap, liveMatrix] = await Promise.all([
    get('data/blog/published.json'), get('sitemap.xml'), get('data/blog/content-matrix.csv')]);
  const liveEntries = JSON.parse(liveManifest).articles;
  const liveRows = matrixRows(liveMatrix);
  const sitemap = read(root, 'sitemap.xml');
  const results = {};
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      const matches = rows.filter((r) => r.article_id === id);
      const candidates = entries.filter((e) => e.article_id === id);
      if (matches.length !== 1 || candidates.length !== 1 || matches[0].status !== 'PUBLISHED') throw new Error(`local publication evidence missing/duplicate: ${id}`);
      const row = matches[0], entry = candidates[0];
      if (entry.slug !== row.slug || entry.body !== `data/blog/articles/${row.slug}.body.html`) throw new Error(`manifest path mismatch: ${id}`);
      const live = liveEntries.filter((e) => e.article_id === id);
      if (live.length !== 1 || entryDigest(live[0]) !== entryDigest(entry)
        || liveRows.filter((r) => r.article_id === id && r.status === 'PUBLISHED' && r.slug === row.slug).length !== 1) throw new Error(`production manifest/matrix mismatch: ${id}`);
      const path = row.output_path.replace(/index\.html$/, ''), url = SITE + path;
      const loc = `<loc>${url}</loc>`;
      if (sitemap.split(loc).length !== 2 || liveSitemap.split(loc).length !== 2) throw new Error(`sitemap evidence missing/duplicate: ${id}`);
      const expected = read(root, row.output_path);
      if (!expected.includes(`rel="canonical" href="${url}"`)) throw new Error(`local canonical mismatch: ${id}`);
      const actual = await get(path);
      if (digest(actual) !== digest(expected)) throw new Error(`production page differs from distributed page: ${id}`);
      results[id] = { article_id: id, status: 'PUBLISHED', url, publication_sha: sha,
        page_sha256: digest(actual), body_sha256: digest(read(root, entry.body)), entry_sha256: entryDigest(entry),
        production_status: 200, verified_at: new Date().toISOString() };
    }
  }));
  return results;
}

export function saveReceipts(root, receipts) {
  const path = join(root, RECEIPTS_PATH);
  const book = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { schema_version: 1, articles: {} };
  if (book.schema_version !== 1 || !book.articles || typeof book.articles !== 'object') throw new Error('invalid receipt ledger');
  book.articles = Object.fromEntries(Object.entries({ ...book.articles, ...receipts }).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(book, null, 2) + '\n');
}

export function unverifiedIds(root = ROOT) {
  const rows = matrixRows(read(root, 'data/blog/content-matrix.csv'));
  const entries = JSON.parse(read(root, 'data/blog/published.json')).articles;
  const book = existsSync(join(root, RECEIPTS_PATH)) ? JSON.parse(read(root, RECEIPTS_PATH)) : { articles: {} };
  return rows.filter((row) => row.status === 'PUBLISHED').filter((row) => {
    const entry = entries.find((e) => e.article_id === row.article_id);
    return !entry || !receiptValid(book.articles[row.article_id], row, entry, read(root, entry.body));
  }).map((row) => row.article_id);
}

async function main() {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const rows = matrixRows(read(ROOT, 'data/blog/content-matrix.csv'));
  const ids = process.argv[2] === '--published-from'
    ? rows.filter((r) => r.status === 'PUBLISHED' && (process.argv[3] ?? '').split(',').includes(r.article_id)).map((r) => r.article_id)
    : process.argv[2] === '--all' ? rows.filter((r) => r.status === 'PUBLISHED').map((r) => r.article_id)
    : (process.argv[2] ?? '').split(',').filter(Boolean);
  if (process.argv[2] === '--published-from' && !ids.length) { console.log('No accepted publications in this scope; no receipt written.'); return; }
  const receipts = await verifyPublications({ ids, sha });
  saveReceipts(ROOT, receipts);
  console.log(`Production VERIFIED: ${Object.keys(receipts).length} exact pages, manifest, matrix and sitemap; SHA ${sha}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
