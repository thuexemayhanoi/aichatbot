#!/usr/bin/env node
/**
 * INDEXNOW SUBMITTER (v71 zero-data SEO) — tells IndexNow search engines
 * (Bing, Yandex, Seznam, Naver…) which public URLs are new or updated, with
 * no account and no paid API. Google does not use IndexNow; it discovers the
 * site through sitemap.xml declared in robots.txt.
 *
 * The URL list is read from the LIVE sitemap (so only deployed pages are
 * sent) and filtered by <lastmod> (articles carry their publish/review date).
 * The key is verified at its public keyLocation before anything is sent.
 *
 * Usage:
 *   node tools/indexnow.mjs --days 2        # URLs with lastmod in the last 2 days (daily job)
 *   node tools/indexnow.mjs --all           # every sitemap URL (first submission)
 *   node tools/indexnow.mjs --days 2 --dry-run --local   # print the payload from ./sitemap.xml
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_PATH = 'config/indexnow.json';

export function loadIndexNow(root = ROOT) {
  const cfg = JSON.parse(readFileSync(join(root, CONFIG_PATH), 'utf8'));
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(cfg.key)) throw new Error('IndexNow key must be 8-128 letters, digits or dashes');
  if (new URL(cfg.keyLocation).host !== cfg.host) throw new Error('keyLocation must be on the submitted host');
  return cfg;
}

/** [{loc, lastmod}] from a sitemap; optionally only lastmod >= since (YYYY-MM-DD). */
export function sitemapEntries(xml, since = null) {
  const out = [];
  for (const m of String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(m[1])?.[1]?.replace(/&amp;/g, '&');
    const lastmod = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(m[1])?.[1] ?? null;
    if (!loc) continue;
    if (since && !(lastmod && lastmod.slice(0, 10) >= since)) continue;
    out.push({ loc, lastmod });
  }
  return out;
}

/** IndexNow JSON bodies (one per maxUrlsPerRequest chunk), host-checked. */
export function payloads(urls, cfg) {
  const own = [...new Set(urls)].filter((u) => new URL(u).host === cfg.host).sort();
  const max = cfg.maxUrlsPerRequest ?? 10000;
  const out = [];
  for (let i = 0; i < own.length; i += max) out.push({ host: cfg.host, key: cfg.key, keyLocation: cfg.keyLocation, urlList: own.slice(i, i + max) });
  return out;
}

/** The verification file <key>.txt sits at the site root with the key as its only content. */
export const keyFileExists = (root = ROOT) => {
  const cfg = loadIndexNow(root);
  return existsSync(join(root, `${cfg.key}.txt`)) && readFileSync(join(root, `${cfg.key}.txt`), 'utf8').trim() === cfg.key;
};

const isoDaysAgo = (days, now = new Date()) => new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);

export async function main(argv = process.argv.slice(2), { root = ROOT, fetchImpl = globalThis.fetch } = {}) {
  const cfg = loadIndexNow(root);
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const all = argv.includes('--all');
  const days = Number(arg('--days') ?? 2);
  const since = all ? null : isoDaysAgo(days);
  const dry = argv.includes('--dry-run');

  let xml;
  if (argv.includes('--local')) xml = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  else {
    const res = await fetchImpl(`https://${cfg.host}/sitemap.xml`, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) throw new Error(`live sitemap HTTP ${res.status}`);
    xml = await res.text();
  }
  const urls = sitemapEntries(xml, since).map((e) => e.loc);
  const bodies = payloads(urls, cfg);
  console.log(`IndexNow: ${urls.length} URL(s) ${all ? '(all sitemap URLs)' : `with lastmod >= ${since}`}, ${bodies.length} request(s)`);
  if (!urls.length) return 0;
  if (dry) { console.log(JSON.stringify(bodies[0], null, 1).slice(0, 2000)); return 0; }

  const keyRes = await fetchImpl(cfg.keyLocation, { headers: { 'cache-control': 'no-cache' } });
  const keyText = keyRes.ok ? (await keyRes.text()).trim() : '';
  if (keyText !== cfg.key) {
    console.warn(`::warning::IndexNow key file not live yet at ${cfg.keyLocation} (HTTP ${keyRes.status}); nothing submitted`);
    return 0;
  }
  let failed = 0;
  for (const body of bodies) {
    const res = await fetchImpl(cfg.endpoint, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
    const ok = res.status === 200 || res.status === 202;
    const text = ok ? '' : String(await res.text());
    console.log(`IndexNow POST ${body.urlList.length} URL(s): HTTP ${res.status}${ok ? '' : ` ${text.slice(0, 300)}`}`);
    // A new key is verified asynchronously after its first use: not an error, retry on the next run.
    if (res.status === 403 && /SiteVerificationNotCompleted/i.test(text)) {
      console.warn('::warning::IndexNow site verification is still pending for this key; nothing was accepted yet — retry later');
      continue;
    }
    if (!ok && res.status !== 429) failed++;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().then((code) => { process.exitCode = code; }, (e) => { console.error(e.message); process.exitCode = 1; });
}
