#!/usr/bin/env node
/**
 * Read-only external link check (MT-P4-08) for article bodies and static
 * page bodies. Never edits content and never blocks publishing: the SEO
 * monitor turns findings into workflow warnings so a human fixes the source
 * link through the body review process.
 *
 * Verdicts:
 *   OK           2xx/3xx after redirects
 *   BROKEN       404 / 410 — the page is gone, replace the citation
 *   MOVED        a deep link now redirects to a shallower page (site home,
 *                section listing): the cited document is gone (soft 404)
 *   UNREACHABLE  other status, timeout or network error — inconclusive
 *                (Vietnamese government hosts often time out or geo-block
 *                foreign runners), re-check before acting
 *
 * Usage: node tools/external-links.mjs [--json]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/config/site.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = ['data/blog/articles', 'data/site'];
const TIMEOUT_MS = 20000;
const CONCURRENCY = 4;
const OWN_HOST = new URL(SITE).host;

/** External http(s) hrefs of one HTML fragment, entity-decoded, own site excluded. */
export function externalLinks(html) {
  return [...String(html).matchAll(/\bhref\s*=\s*(["'])(https?:\/\/.*?)\1/gi)]
    .map((m) => m[2].replace(/&amp;/g, '&').trim())
    .filter((u) => { try { return new URL(u).host !== OWN_HOST; } catch { return false; } });
}

/** url → sorted list of source files citing it. */
export function collectLinks(root = ROOT) {
  const byUrl = new Map();
  for (const dir of SOURCES) {
    if (!existsSync(join(root, dir))) continue;
    for (const name of readdirSync(join(root, dir)).filter((n) => n.endsWith('.html')).sort()) {
      for (const url of externalLinks(readFileSync(join(root, dir, name), 'utf8'))) {
        if (!byUrl.has(url)) byUrl.set(url, new Set());
        byUrl.get(url).add(`${dir}/${name}`);
      }
    }
  }
  return new Map([...byUrl].sort(([a], [b]) => a.localeCompare(b)).map(([u, s]) => [u, [...s].sort()]));
}

const pathSegments = (u) => {
  const { pathname } = new URL(u);
  return pathname.replace(/\/index\.(php|html?)(?=\/|$)/i, '').split('/').filter(Boolean);
};

/** A redirect from a deep link to a shallower path (home page, listing). */
export function movedAway(url, final) {
  if (!final) return false;
  try { return pathSegments(final).length < pathSegments(url).length; } catch { return false; }
}

export function verdict({ url = null, status = null, final = null } = {}) {
  if (status === 404 || status === 410) return 'BROKEN';
  if (status >= 200 && status < 400) return movedAway(url, final) ? 'MOVED' : 'OK';
  return 'UNREACHABLE';
}

async function probe(url) {
  const opts = (method) => ({ method, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; MotoAI-linkcheck; +' + SITE + ')' } });
  try {
    let res = await fetch(url, opts('HEAD'));
    // Many servers reject or mishandle HEAD; confirm with GET before judging.
    if (res.status >= 400) res = await fetch(url, opts('GET'));
    return { status: res.status, final: res.url !== url ? res.url : null };
  } catch (e) {
    return { error: e.name === 'TimeoutError' ? `timeout ${TIMEOUT_MS / 1000}s` : (e.cause?.code ?? e.message) };
  }
}

export async function checkLinks(byUrl, fetcher = probe) {
  const urls = [...byUrl.keys()];
  const results = new Array(urls.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
    while (next < urls.length) {
      const i = next++;
      const r = await fetcher(urls[i]);
      results[i] = { url: urls[i], ...r, verdict: verdict({ url: urls[i], ...r }), sources: byUrl.get(urls[i]) };
    }
  }));
  const count = (v) => results.filter((r) => r.verdict === v).length;
  return { checked: results.length, ok: count('OK'), broken: count('BROKEN'), moved: count('MOVED'), unreachable: count('UNREACHABLE'), results };
}

const isCli = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (isCli) {
  const report = await checkLinks(collectLinks());
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const r of report.results) {
      console.log(`${r.verdict.padEnd(11)} ${r.status ?? r.error} ${r.url}${r.final ? ` → ${r.final}` : ''} (${r.sources.join(', ')})`);
    }
    console.log(`external links: ${report.checked} checked, ${report.ok} OK, ${report.broken} BROKEN, ${report.moved} MOVED, ${report.unreachable} UNREACHABLE`);
  }
}
