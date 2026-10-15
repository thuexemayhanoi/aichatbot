#!/usr/bin/env node
/** Read-only index *readiness* audit, not a Google index count. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SITE } from '../src/config/site.js';
import { MATRIX_ROWS } from './matrix-size.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function parseCsv(text) {
  const rows = [];
  const line = String(text).replace(/^\uFEFF/, '');
  let row = [], field = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(field); field = ''; }
    else if ((ch === '\r' || ch === '\n') && !quoted) {
      if (ch === '\r' && line[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.length)) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (row.length || field.length) { row.push(field); rows.push(row); }
  return rows;
}

export function sitemapLocs(xml) {
  return [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
    .map(m => m[1].replace(/&amp;/g, '&'));
}

export function canonicalCandidate(page) {
  const parsed = new URL(page);
  if (parsed.pathname.endsWith('/index.html')) {
    parsed.pathname = parsed.pathname.slice(0, -'index.html'.length);
  }
  return parsed.href;
}

export function reconcileIndexCoverage({ matrixCsv, sitemapXml, publishedManifest, gscPages = null, site = SITE, expectedRows = MATRIX_ROWS }) {
  const data = parseCsv(matrixCsv);
  const head = data.shift() || [];
  const index = Object.fromEntries(head.map((col, i) => [col, i]));
  for (const col of ['article_id', 'category', 'status', 'output_path']) {
    if (index[col] === undefined) throw new Error('Missing Matrix column: ' + col);
  }
  const rows = data.map(parts => ({
    id: parts[index.article_id], category: parts[index.category],
    status: parts[index.status], path: parts[index.output_path]
  }));
  const base = site.endsWith('/') ? site : site + '/';
  const statuses = {};
  for (const row of rows) statuses[row.status] = (statuses[row.status] || 0) + 1;
  const published = rows.filter(row => row.status === 'PUBLISHED');
  const sitemap = sitemapLocs(sitemapXml);
  const sitemapSet = new Set(sitemap);
  const urlFromPath = path => new URL(path.replace(/index\.html$/, ''), base).href;
  const publishedUrls = published.map(row => urlFromPath(row.path));
  const publishedSet = new Set(publishedUrls);
  const missingPublished = published.filter(row => !sitemapSet.has(urlFromPath(row.path)))
    .map(row => ({ id: row.id, url: urlFromPath(row.path) }));
  const manifestIds = new Set((publishedManifest.articles || []).map(a => a.article_id));
  const matrixPublishedIds = new Set(published.map(row => row.id));
  const missingManifest = published.filter(row => !manifestIds.has(row.id)).map(row => row.id);
  const manifestNotPublished = [...manifestIds].filter(id => !matrixPublishedIds.has(id));
  const invalidPaths = published.filter(row => !row.path.endsWith('/index.html')).map(row => row.id);
  const foreignUrls = sitemap.filter(url => {
    try { return new URL(url).origin !== new URL(base).origin; }
    catch { return true; }
  });
  const byCategory = {};
  for (const row of published) {
    const cat = row.category;
    byCategory[cat] ||= { published: 0, inSitemap: 0 };
    byCategory[cat].published++;
    if (sitemapSet.has(urlFromPath(row.path))) byCategory[cat].inSitemap++;
  }
  let observed = null;
  if (gscPages !== null) {
    if (!Array.isArray(gscPages)) throw new Error('GSC page-performance export must be a JSON array');
    observed = gscPages.filter(row => row.page).map(row => {
      const candidate = canonicalCandidate(row.page);
      return {
        reportedUrl: row.page, canonicalCandidate: candidate,
        isDirectoryIndexAlias: candidate !== row.page,
        rawUrlInSitemap: sitemapSet.has(row.page),
        candidateInSitemap: sitemapSet.has(candidate),
        clicks: Number(row.clicks || 0),
        impressions: Number(row.impressions || 0),
        position: row.position ?? null
      };
    }).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  }
  const categories = Object.keys(byCategory).sort();
  const categorySamples = categories.map(cat => {
    const row = published.find(r => r.category === cat);
    return { id: row.id, category: cat, url: urlFromPath(row.path) };
  });
  const recentSamples = published.slice(-8).map(row => ({ id: row.id, category: row.category, url: urlFromPath(row.path) }));
  const errors = [];
  const fail = (when, message) => { if (when) errors.push(message); };
  fail(expectedRows !== null && rows.length !== expectedRows, 'unexpected matrix row count');
  fail(sitemap.length === 0, 'empty sitemap');
  fail(sitemap.length !== sitemapSet.size, 'duplicate sitemap URLs');
  fail(publishedUrls.length !== publishedSet.size, 'duplicate published article URLs');
  fail(published.length !== matrixPublishedIds.size, 'duplicate published article IDs');
  fail(missingPublished.length > 0, 'PUBLISHED URLs missing from sitemap: ' + missingPublished.length);
  fail(missingManifest.length > 0, 'PUBLISHED IDs missing from manifest: ' + missingManifest.length);
  fail(manifestNotPublished.length > 0, 'manifest IDs not marked PUBLISHED: ' + manifestNotPublished.length);
  fail(invalidPaths.length > 0, 'invalid article output paths: ' + invalidPaths.length);
  fail(foreignUrls.length > 0, 'foreign or invalid sitemap URLs: ' + foreignUrls.length);
  return {
    tool: 'tools/seo-index-coverage.mjs', site: base,
    pass: errors.length === 0, errors,
    counts: {
      matrix: rows.length, statuses, published: published.length,
      sitemap: sitemap.length, uniqueSitemap: sitemapSet.size,
      publishedInSitemap: published.length - missingPublished.length,
      otherSitemapUrls: sitemap.filter(u => !publishedSet.has(u)).length,
      manifestIds: manifestIds.size,
      gscPerformancePageRows: observed === null ? null : observed.length
    },
    byCategory,
    missingPublished: missingPublished.slice(0, 50),
    missingManifest: missingManifest.slice(0, 50),
    manifestNotPublished: manifestNotPublished.slice(0, 50),
    inspectSamples: { categorySamples, recentSamples },
    googleSearchPerformance: observed === null
      ? { status: 'NOT_CONNECTED_IN_GITHUB_ACTIONS', note: 'Optional --gsc-pages exported JSON; no automatic GSC API credentials' }
      : {
          status: 'PERFORMANCE_ONLY_NOT_INDEX_COVERAGE',
          rows: observed.slice(0, 60),
          directoryIndexAliases: observed.filter(r => r.isDirectoryIndexAlias).slice(0, 30),
          offSitemap: observed.filter(r => !r.candidateInSitemap).slice(0, 30)
        },
    limitations: [
      'PUBLISHED, listed in sitemap, crawled and indexed are different states.',
      'Search impressions and page performance are not Google URL Inspection.',
      'For Google-selected canonical, actual index counts and exclusion reasons use GSC Page indexing and URL Inspection.'
    ]
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const pos = process.argv.indexOf('--gsc-pages');
    const gscPages = pos !== -1
      ? JSON.parse(readFileSync(process.argv[pos + 1], 'utf8')) : null;
    const report = reconcileIndexCoverage({
      matrixCsv: readFileSync(join(ROOT, 'data/blog/content-matrix.csv'), 'utf8'),
      sitemapXml: readFileSync(join(ROOT, 'sitemap.xml'), 'utf8'),
      publishedManifest: JSON.parse(readFileSync(join(ROOT, 'data/blog/published.json'), 'utf8')),
      gscPages
    });
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else console.log(JSON.stringify({ pass: report.pass, errors: report.errors, counts: report.counts }, null, 2));
    if (!report.pass) process.exitCode = 1;
  } catch (err) { console.error(err); process.exitCode = 1; }
}
