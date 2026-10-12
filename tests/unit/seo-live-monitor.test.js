import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sitemapLocations, inspectHtml } from '../../tools/seo-live-monitor.mjs';

const SITE = 'https://chatbot.thuexemaynguyentu.com/';

test('sitemap parser extracts absolute URLs without mutating query values', () => {
  const xml = '<urlset><url><loc>' + SITE + '</loc></url><url><loc>' +
    SITE + 'blog/?a=1&amp;b=2</loc></url></urlset>';
  assert.deepEqual(sitemapLocations(xml), [SITE, SITE + 'blog/?a=1&b=2']);
});

test('valid canonical HTML and schema pass basic live checks', () => {
  const html = '<html lang="vi"><head><link rel="canonical" href="' + SITE +
    '"><script type="application/ld+json">{"@type":"WebApplication"}</script>' +
    '</head><body><h1>Ứng dụng thuê xe máy</h1></body></html>';
  assert.deepEqual(inspectHtml(html, SITE).issues, []);
});

test('mismatched canonical, noindex and malformed JSON-LD are failures', () => {
  const html = '<html lang="en"><link rel="canonical" href="https://example.com/">' +
    '<meta name="robots" content="noindex,follow">' +
    '<script type="application/ld+json">{bad}</script><h1>One</h1><h1>Two</h1></html>';
  const issues = inspectHtml(html, SITE).issues.join(' | ');
  assert.match(issues, /canonical/);
  assert.match(issues, /noindex/);
  assert.match(issues, /language/);
  assert.match(issues, /H1/);
  assert.match(issues, /JSON-LD/);
});
