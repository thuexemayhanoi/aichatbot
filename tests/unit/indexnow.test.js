/**
 * v71 IndexNow: key file published at the site root, URL list taken from the
 * sitemap (lastmod window), host-checked payloads, and nothing is submitted
 * until the key file is live. No network: fetch is stubbed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIndexNow, sitemapEntries, payloads, keyFileExists, main } from '../../tools/indexnow.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cfg = loadIndexNow(ROOT);
const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');

test('key file is published at the site root and matches config', () => {
  assert.match(cfg.key, /^[a-f0-9]{32}$/);
  assert.equal(cfg.host, 'chatbot.thuexemaynguyentu.com');
  assert.equal(cfg.keyLocation, `https://${cfg.host}/${cfg.key}.txt`);
  assert.ok(keyFileExists(ROOT), `${cfg.key}.txt at the repository root contains exactly the key`);
});

test('sitemap entries: every URL, or only those updated since a date', () => {
  const all = sitemapEntries(sitemap);
  assert.equal(all.length, (sitemap.match(/<url>/g) ?? []).length);
  assert.ok(all.every((e) => new URL(e.loc).host === cfg.host));
  const dated = all.filter((e) => e.lastmod).map((e) => e.lastmod.slice(0, 10)).sort();
  const since = dated[Math.floor(dated.length / 2)];
  const recent = sitemapEntries(sitemap, since);
  assert.ok(recent.length > 0 && recent.length < all.length);
  assert.ok(recent.every((e) => e.lastmod.slice(0, 10) >= since));
});

test('payloads drop foreign hosts, dedupe and chunk', () => {
  const urls = [`https://${cfg.host}/a/`, `https://${cfg.host}/a/`, `https://${cfg.host}/b/`, 'https://example.com/x/'];
  const out = payloads(urls, { ...cfg, maxUrlsPerRequest: 1 });
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((p) => p.urlList[0]), [`https://${cfg.host}/a/`, `https://${cfg.host}/b/`]);
  assert.deepEqual(Object.keys(out[0]).sort(), ['host', 'key', 'keyLocation', 'urlList']);
});

function fakeFetch({ keyBody = cfg.key, post = 202 } = {}) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.endsWith('/sitemap.xml')) return { ok: true, status: 200, text: async () => sitemap };
    if (url === cfg.keyLocation) return { ok: true, status: 200, text: async () => keyBody };
    return { ok: post < 300, status: post, text: async () => 'error' };
  };
  return { fn, calls };
}

test('submits only after the live key file matches; reports failures', async () => {
  const quiet = console.log; console.log = () => {};
  const warn = console.warn; console.warn = () => {};
  try {
    const notLive = fakeFetch({ keyBody: 'stale' });
    assert.equal(await main(['--all'], { root: ROOT, fetchImpl: notLive.fn }), 0);
    assert.ok(!notLive.calls.some((c) => c.opts.method === 'POST'), 'nothing submitted before the key is live');

    const ok = fakeFetch();
    assert.equal(await main(['--all'], { root: ROOT, fetchImpl: ok.fn }), 0);
    const post = ok.calls.find((c) => c.opts.method === 'POST');
    assert.equal(post.url, cfg.endpoint);
    const body = JSON.parse(post.opts.body);
    assert.equal(body.key, cfg.key);
    assert.equal(body.urlList.length, sitemapEntries(sitemap).length);

    const bad = fakeFetch({ post: 403 });
    assert.equal(await main(['--all'], { root: ROOT, fetchImpl: bad.fn }), 1);
  } finally { console.log = quiet; console.warn = warn; }
});
