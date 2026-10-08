import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSite, createSiteIo, resolveInternal } from '../../tools/site-audit.mjs';
import { scoreRepo } from '../../tools/seo-score.mjs';
import { SITE } from '../../src/config/site.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const io = createSiteIo(ROOT);
const changed = (path, transform) => ({ ...io, read: (p) => p === path ? transform(io.read(p)) : io.read(p) });

test('custom-domain gate checks all generated pages and keeps 2000-topic factory intact', () => {
  const r = auditSite(io);
  assert.equal(r.origin, 'https://chatbot.thuexemaynguyentu.com/');
  assert.equal(r.pass, true, r.issues.join('\n'));
  assert.equal(r.legacy_project_paths, 0);
  assert.equal(r.legacy_github_urls, 0);
  assert.equal(r.broken_internal_links, 0);
  assert.equal(r.sitemap_urls, r.generated_pages);
  assert.ok(r.checked_internal_urls > r.published_articles);
});

test('root and same-origin absolute links resolve; external hosts and fragments stay external', () => {
  assert.equal(resolveInternal('blog/app/demo/index.html', '/gia-thue/?from=blog#prices'), 'gia-thue/index.html');
  assert.equal(resolveInternal('blog/app/demo/index.html', `${SITE}assets/js/main.js?v=66`), 'assets/js/main.js');
  assert.equal(resolveInternal('blog/app/demo/index.html', '../'), 'blog/app/index.html');
  assert.equal(resolveInternal('index.html', '//chatbot.thuexemaynguyentu.com/blog/'), 'blog/index.html');
  assert.equal(resolveInternal('index.html', 'https://example.com/blog/'), null);
  assert.equal(resolveInternal('index.html', '#section'), null);
});

for (const path of ['index.html', 'assets/js/app-shell.js', 'blog/search-index.json', 'data/blog/knowledge-index.json', 'manifest.webmanifest', 'service-worker.js']) {
  test(`migration fails closed on legacy project path in ${path}`, () => {
    const r = auditSite(changed(path, (s) => /\.(json|webmanifest)$/.test(path)
      ? JSON.stringify({ ...JSON.parse(s), audit_fixture: '/aichatbot/obsolete' })
      : s + '\n/aichatbot/obsolete'));
    assert.equal(r.pass, false);
    assert.ok(r.legacy_project_paths > 0);
    assert.ok(r.issues.some((i) => i.startsWith(path + ': legacy URL')));
  });
}

test('old GitHub origin makes SEO FAIL with zero total, even when metadata remains valid', () => {
  const r = scoreRepo(changed('assets/js/app-shell.js', (s) => s + '\n// https://thuexemayhanoi.github.io/aichatbot/'));
  assert.equal(r.pass, false);
  assert.equal(r.total, 0);
  assert.ok(r.migration.legacy_github_urls > 0);
});

test('escaped legacy paths in JSON are detected', () => {
  const r = auditSite(changed('blog/search-index.json', (s) => JSON.stringify({ ...JSON.parse(s), audit_fixture: '/aichatbot/obsolete' }).replace('/aichatbot/', '\\/aichatbot\\/')));
  assert.equal(r.pass, false);
  assert.ok(r.legacy_project_paths > 0);
});

test('broken root links, same-origin absolute links and assets cannot bypass the gate', () => {
  const r = auditSite(changed('index.html', (s) => s + `<a href="/missing/">Missing</a><img src="${SITE}assets/missing.png">`));
  assert.equal(r.pass, false);
  assert.equal(r.broken_internal_links, 2);
});

test('wrong sitemap origin and mismatched OG/schema are critical migration failures', () => {
  assert.equal(auditSite(changed('sitemap.xml', (s) => s.replace(SITE, 'https://example.com/'))).pass, false);
  assert.equal(auditSite(changed('index.html', (s) => s.replace(`property="og:url" content="${SITE}"`, 'property="og:url" content="https://example.com/"'))).pass, false);
  assert.equal(auditSite(changed('index.html', (s) => s.replace(`"url": "${SITE}"`, '"url": "https://example.com/"'))).pass, false);
});
