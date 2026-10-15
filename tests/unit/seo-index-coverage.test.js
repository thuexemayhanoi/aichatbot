import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, sitemapLocs, canonicalCandidate, reconcileIndexCoverage } from '../../tools/seo-index-coverage.mjs';
import { MATRIX_ROWS } from '../../tools/matrix-size.mjs';

const SITE = 'https://chatbot.thuexemaynguyentu.com/';
const matrix = [
  'article_id,category,status,output_path',
  'BA-0001,APP,PUBLISHED,blog/app/topic-1/index.html',
  'BA-0002,RENT,PUBLISHED,blog/thue-xe/topic-2/index.html',
  'BA-0003,SAFE,PLANNED,blog/an-toan/topic-3/index.html'
].join('\n');
const sitemap = '<urlset><url><loc>' + SITE + '</loc></url>' +
  '<url><loc>' + SITE + 'blog/app/topic-1/</loc></url>' +
  '<url><loc>' + SITE + 'blog/thue-xe/topic-2/</loc></url></urlset>';
const manifest = { articles: [{ article_id: 'BA-0001' }, { article_id: 'BA-0002' }] };
const audit = (overrides = {}) => reconcileIndexCoverage({
  matrixCsv: matrix, sitemapXml: sitemap, publishedManifest: manifest,
  expectedRows: 3, ...overrides
});

test('CSV parser understands quoted commas, quotes and line breaks', () => {
  assert.deepEqual(parseCsv('a,b\n"one,two","a ""quoted"" word"\n'),
    [['a', 'b'], ['one,two', 'a "quoted" word']]);
  assert.deepEqual(parseCsv('a,b\r\n"first\nsecond",ok'), [['a', 'b'], ['first\nsecond', 'ok']]);
});

test('sitemap parser retains URL characters and rejects no claims', () => {
  assert.deepEqual(sitemapLocs('<loc>' + SITE + 'blog/?x=1&amp;y=2</loc>'),
    [SITE + 'blog/?x=1&y=2']);
});

test('all published articles map to sitemap and manifest once', () => {
  const report = audit();
  assert.equal(report.pass, true);
  assert.deepEqual(report.errors, []);
  assert.equal(report.counts.matrix, 3);
  assert.equal(report.counts.published, 2);
  assert.equal(report.counts.publishedInSitemap, 2);
  assert.equal(report.counts.otherSitemapUrls, 1);
  assert.equal(report.counts.gscPerformancePageRows, null);
  assert.equal(report.googleSearchPerformance.status, 'NOT_CONNECTED_IN_GITHUB_ACTIONS');
  assert.equal(report.inspectSamples.categorySamples.length, 2);
});

test('missing published URL or manifest ID fails; planned pages do not count as published', () => {
  const report = audit({
    sitemapXml: '<loc>' + SITE + 'blog/app/topic-1/</loc>',
    publishedManifest: { articles: [{ article_id: 'BA-0001' }] }
  });
  assert.equal(report.pass, false);
  assert.ok(report.errors.some(x => x.includes('missing from sitemap')));
  assert.ok(report.errors.some(x => x.includes('missing from manifest')));
  assert.equal(report.counts.published, 2);
  assert.equal(report.counts.publishedInSitemap, 1);
});

test('same published canonical cannot appear twice', () => {
  const duplicated = matrix.replace('BA-0003,SAFE,PLANNED,blog/an-toan/topic-3/index.html',
    'BA-0003,APP,PUBLISHED,blog/app/topic-1/index.html');
  const result = audit({ matrixCsv: duplicated, publishedManifest: { articles: [
    { article_id: 'BA-0001' }, { article_id: 'BA-0002' }, { article_id: 'BA-0003' }
  ] } });
  assert.equal(result.pass, false);
  assert.ok(result.errors.some(x => x.includes('duplicate published article URLs')));
});

test('GSC page data is performance evidence, not an index inspection report', () => {
  const result = audit({ gscPages: [
    { page: SITE + 'blog/app/topic-1/index.html', impressions: 5, clicks: 1, position: 8 },
    { page: SITE + 'blog/unknown/', impressions: 2, clicks: 0 }
  ] });
  assert.equal(result.pass, true);
  assert.equal(result.googleSearchPerformance.status, 'PERFORMANCE_ONLY_NOT_INDEX_COVERAGE');
  assert.equal(result.googleSearchPerformance.directoryIndexAliases.length, 1);
  assert.equal(result.googleSearchPerformance.directoryIndexAliases[0].candidateInSitemap, true);
  assert.equal(result.googleSearchPerformance.offSitemap.length, 1);
  assert.equal(canonicalCandidate(SITE + 'blog/app/topic-1/index.html'), SITE + 'blog/app/topic-1/');
});


test('real repository CLI report passes publication coverage with zero manifest drift', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const output = execFileSync(process.execPath, [join(root, 'tools/seo-index-coverage.mjs'), '--json'], {
    encoding: 'utf8', timeout: 120000
  });
  const report = JSON.parse(output);
  assert.equal(report.pass, true, report.errors.join('; '));
  assert.equal(report.counts.matrix, MATRIX_ROWS);
  assert.equal(report.counts.publishedInSitemap, report.counts.published);
  assert.equal(report.counts.uniqueSitemap, report.counts.sitemap);
  assert.equal(report.counts.manifestIds, report.counts.published);
});
