/** Exact publication target. This module never writes repository state. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLICATION_TARGET = 2000;
const ROOT = process.env.MOTOAI_FACTORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');

export function publicationBudget(rows, entries, target = PUBLICATION_TARGET) {
  const published = rows.filter((r) => r.status === 'PUBLISHED');
  if (!Array.isArray(entries) || entries.length !== published.length) {
    throw new Error('manifest and PUBLISHED matrix counts disagree');
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
  return budget;
}
