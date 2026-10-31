#!/usr/bin/env node
/**
 * Factory QA snapshot for every published article (Master SEO 2026, lô M1).
 *
 * Runs the same scoped QA the Blog Factory publish gate uses
 * (tools/article-qa.mjs → scopedQa: critical checks + warnings, score /100)
 * on each article in data/blog/published.json and writes the result to
 * docs/seo/master-2026/article-qa.json, which tools/seo-master-2026.py reads.
 * Read-only for content: nothing is published, repaired or rewritten.
 *
 * Usage: node tools/article-qa-snapshot.mjs [--out docs/seo/master-2026/article-qa.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scopedQa } from './article-qa.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--out');
const OUT = resolve(ROOT, i > -1 ? process.argv[i + 1] : 'docs/seo/master-2026/article-qa.json');

export function snapshot() {
  const articles = JSON.parse(readFileSync(join(ROOT, 'data/blog/published.json'), 'utf8')).articles;
  const out = {};
  for (const a of [...articles].sort((x, y) => x.article_id.localeCompare(y.article_id))) {
    const r = scopedQa(a.article_id);
    out[a.article_id] = { score: r.score, pass: r.pass, critical: r.critical, warnings: r.warnings };
  }
  return {
    $schema: 'motoai/article-qa-snapshot@1',
    tool: 'tools/article-qa.mjs scopedQa',
    note: 'Điểm QA nhà máy (critical + warning) cho từng bài đã đăng, chạy trên mã nguồn tại thời điểm tạo; không phải điểm xếp hạng Google.',
    articles: out
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const data = snapshot();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
  console.log(`wrote ${OUT} (${Object.keys(data.articles).length} articles)`);
}
