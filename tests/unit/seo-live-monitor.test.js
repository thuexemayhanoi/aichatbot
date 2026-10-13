import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sitemapLocations, inspectHtml, inspectIndexHeaders } from '../../tools/seo-live-monitor.mjs';

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

test('canonical attributes may appear in either order, but duplicate tags fail', () => {
  const head = '<html lang="vi"><head><link href="' + SITE + '" rel="alternate canonical">' +
    '<script type="application/ld+json">{"@type":"WebApplication"}</script></head>' +
    '<body><h1>MotoAI</h1></body></html>';
  assert.deepEqual(inspectHtml(head, SITE).issues, []);
  const duplicated = head.replace('</head>', '<link rel="canonical" href="' + SITE + '"></head>');
  assert.match(inspectHtml(duplicated, SITE).issues.join('|'), /exactly one canonical/);
});

test('robots meta rejects noindex even when content attribute comes first', () => {
  const html = '<html lang="vi"><link rel="canonical" href="' + SITE + '">' +
    '<meta content="index, noindex, follow" name="robots">' +
    '<script type="application/ld+json">{"@type":"WebApplication"}</script>' +
    '<body><h1>MotoAI</h1></body></html>';
  assert.match(inspectHtml(html, SITE).issues.join('|'), /noindex meta/);
  assert.match(inspectHtml(html.replace('noindex', 'none'), SITE).issues.join('|'), /noindex meta/);
});

test('X-Robots-Tag and non-HTML responses fail indexability checks', () => {
  assert.deepEqual(inspectIndexHeaders({ contentType: 'text/html; charset=utf-8', xRobotsTag: '' }), []);
  assert.match(inspectIndexHeaders({ contentType: 'text/html', xRobotsTag: 'googlebot: noindex' }).join('|'), /X-Robots-Tag/);
  assert.match(inspectIndexHeaders({ contentType: 'text/plain', xRobotsTag: '' }).join('|'), /content type/);
});
