import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { externalLinks, collectLinks, verdict, checkLinks, movedAway } from '../../tools/external-links.mjs';
import { SITE } from '../../src/config/site.js';

test('externalLinks keeps absolute http(s) hrefs, decodes &amp; and skips the own site and relative links', () => {
  const html = `<p><a href="https://vbpl.vn/a?ItemID=1&amp;x=2">a</a> <a href="/blog/">b</a>
    <a href='http://csgt.vn/'>c</a> <a href="${SITE}gia-thue/">d</a> <a href="mailto:x@y.z">e</a></p>`;
  assert.deepEqual(externalLinks(html), ['https://vbpl.vn/a?ItemID=1&x=2', 'http://csgt.vn/']);
});

test('collectLinks groups each URL with every body that cites it', () => {
  const root = mkdtempSync(join(tmpdir(), 'motoai-ext-'));
  mkdirSync(join(root, 'data/blog/articles'), { recursive: true });
  writeFileSync(join(root, 'data/blog/articles/b.body.html'), '<a href="https://x.gov.vn/1">x</a>');
  writeFileSync(join(root, 'data/blog/articles/a.body.html'), '<a href="https://x.gov.vn/1">x</a><a href="https://y.vn/">y</a>');
  assert.deepEqual([...collectLinks(root)], [
    ['https://x.gov.vn/1', ['data/blog/articles/a.body.html', 'data/blog/articles/b.body.html']],
    ['https://y.vn/', ['data/blog/articles/a.body.html']]
  ]);
});

test('only 404/410 count as broken; timeouts and other errors are inconclusive', async () => {
  assert.equal(verdict({ status: 200 }), 'OK');
  assert.equal(verdict({ status: 301 }), 'OK');
  assert.equal(verdict({ status: 404 }), 'BROKEN');
  assert.equal(verdict({ status: 410 }), 'BROKEN');
  assert.equal(verdict({ status: 403 }), 'UNREACHABLE');
  assert.equal(verdict({ status: 503 }), 'UNREACHABLE');
  assert.equal(verdict({ error: 'timeout 20s' }), 'UNREACHABLE');
  const byUrl = new Map([['https://a/', ['s1']], ['https://b/', ['s2']], ['https://c/', ['s3']], ['https://d/x/y', ['s4']]]);
  const fake = async (u) => ({ 'https://a/': { status: 200 }, 'https://b/': { status: 404 }, 'https://c/': { error: 'ECONNRESET' },
    'https://d/x/y': { status: 200, final: 'https://d/' } })[u];
  const r = await checkLinks(byUrl, fake);
  assert.deepEqual([r.checked, r.ok, r.broken, r.moved, r.unreachable], [4, 1, 1, 1, 1]);
  assert.deepEqual(r.results.map((x) => [x.url, x.verdict, x.sources]), [
    ['https://a/', 'OK', ['s1']], ['https://b/', 'BROKEN', ['s2']], ['https://c/', 'UNREACHABLE', ['s3']], ['https://d/x/y', 'MOVED', ['s4']]
  ]);
});

test('a deep link redirected to a home page or listing is MOVED; same-depth and trivial redirects are not', () => {
  // Both observed 2026-10-29 through an external fetch of the cited sources.
  assert.ok(movedAway('https://vbpl.vn/bocongan/Pages/vbpq-luocdo.aspx?ItemID=170620', 'https://vbpl.vn/'));
  assert.ok(movedAway('https://congan.thainguyen.gov.vn/thu-tuc-hanh-chinh/detail/Cap-giay-phep-lai-xe-quoc-te-380/',
    'https://congan.thainguyen.gov.vn/index.php/thu-tuc-hanh-chinh/'));
  assert.ok(!movedAway('https://vbpl.vn', 'https://vbpl.vn/'));
  assert.ok(!movedAway('http://x.vn/a/b', 'https://www.x.vn/a/b/'));
  assert.ok(!movedAway('https://x.vn/a/b', 'https://x.vn/c/d'));
  assert.ok(!movedAway('https://x.vn/a/b', null));
  assert.equal(verdict({ url: 'https://x.vn/a/b', status: 200, final: 'https://x.vn/' }), 'MOVED');
});
