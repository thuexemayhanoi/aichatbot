/** Exact publication target. This module never writes repository state. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECEIPTS_PATH, receiptValid } from './factory-verification.mjs';

export const PUBLICATION_TARGET = 2000;
const ROOT = process.env.MOTOAI_FACTORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');

export function publicationBudget(rows, entries, target = PUBLICATION_TARGET) {
  const published = rows.filter((r) => r.status === 'PUBLISHED');
  if (!Array.isArray(entries)) throw new Error('invalid manifest');
  const matrix = new Map(rows.map((r) => [r.article_id, r]));
  const manifestIds = new Set();
  const manifestSlugs = new Set();
  for (const entry of entries) {
    const row = matrix.get(entry.article_id);
    if (!row || row.slug !== entry.slug) throw new Error(`invalid manifest evidence for ${entry.article_id}`);
    if (manifestIds.has(entry.article_id) || manifestSlugs.has(entry.slug)) throw new Error('duplicate manifest ID or slug');
    manifestIds.add(entry.article_id); manifestSlugs.add(entry.slug);
  }
  const ids = new Set();
  const slugs = new Set();
  for (const row of published) {
    if (!row.article_id || !row.slug || ids.has(row.article_id) || slugs.has(row.slug)) throw new Error('duplicate or empty published article ID or slug');
    ids.add(row.article_id); slugs.add(row.slug);
    const matching = entries.filter((e) => e.article_id === row.article_id);
    if (matching.length !== 1 || matching[0].slug !== row.slug) throw new Error(`invalid publication evidence for ${row.article_id}`);
  }
  if (published.length > target) throw new Error(`publication target exceeded: ${published.length} > ${target}`);
  if (entries.length > target) throw new Error('staged manifest would exceed publication target');
  return { target, published: published.length, remaining: target - published.length, complete: published.length === target };
}

export function readPublicationBudget(root = ROOT) {
  const lines = readFileSync(join(root, 'data/blog/content-matrix.csv'), 'utf8').trim().split('\n');
  const keys = lines.shift().split(',');
  const rows = lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [keys[i], v])));
  const entries = JSON.parse(readFileSync(join(root, 'data/blog/published.json'), 'utf8')).articles;
  const budget = publicationBudget(rows, entries);
  for (const row of rows.filter((r) => r.status === 'PUBLISHED')) {
    const entry = entries.find((e) => e.article_id === row.article_id);
    if (!existsSync(join(root, entry.body)) || !existsSync(join(root, row.output_path))) {
      throw new Error(`published source or page missing for ${row.article_id}`);
    }
  }
  const ledger = join(root, RECEIPTS_PATH);
  if (existsSync(ledger)) {
    const book = JSON.parse(readFileSync(ledger, 'utf8'));
    if (book.schema_version !== 1 || !book.articles) throw new Error('invalid publication receipt ledger');
    const verified = rows.filter((r) => r.status === 'PUBLISHED').filter((row) => {
      const entry = entries.find((e) => e.article_id === row.article_id);
      return receiptValid(book.articles[row.article_id], row, entry, readFileSync(join(root, entry.body), 'utf8'));
    }).length;
    return { target: budget.target, published: verified, unverified: budget.published - verified,
      remaining: budget.target - verified, complete: verified === budget.target };
  }
  return budget;
}
